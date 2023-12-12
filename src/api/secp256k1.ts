import type {
  PointerKeypair,
  PointerSeed,
  PointerSig,
  Secp256k1WasmCore,
  PointerXOnlyKey
} from './secp256k1-types.js'

import {emsimp} from './emsimp.js'
import {BinaryResult, ByteLens, Flags} from './secp256k1-types.js'
import {map_wasm_exports, map_wasm_imports} from '../gen/wasm.js'

const S_TAG_BIP340_VERIFY = 'BIP340 verify: '

const S_REASON_INVALID_SK = 'Invalid private key'
const S_REASON_INVALID_PK = 'Invalid public key'

const random_32 = () => crypto.getRandomValues(new Uint8Array(32))

/**
 * Wrapper instance providing operations backed by libsecp256k1 WASM module
 */
export interface Secp256k1 {
  /**
   * Generates a new private key using crypto secure random bytes and without modulo bias
   * @returns a new private key (32 bytes)
   */
  gen_secret_key(): Uint8Array

  /**
   * Computes the public key for a given private key
   * @param sk - the private key (32 bytes)
   * @returns the public key (32 bytes)
   */
  get_public_key(sk: Uint8Array): Uint8Array

  /**
   * Signs the given message hash using the given private key.
   * @param sk - the private key
   * @param hash - the message hash (32 bytes)
   * @param entropy - optional entropy to use
   * @returns compact signature (64 bytes)`
   */
  sign(sk: Uint8Array, hash: Uint8Array, ent?: Uint8Array): Uint8Array

  /**
   * Verifies the signature is valid for the given message hash and public key
   * @param signature - compact signature (64 bytes)
   * @param msg - the message hash (32 bytes)
   * @param pk - the public key
   */
  verify(signature: Uint8Array, hash: Uint8Array, pk: Uint8Array): boolean
}

/**
 * Creates a new instance of the secp256k1 WASM and returns its ES wrapper
 * @param z_src - a Response containing the WASM binary, a Promise that resolves to one,
 * 	or the raw bytes to the WASM binary as a {@link BufferSource}
 * @returns the wrapper API
 */
export const WasmSecp256k1 = async (
  z_src: Promise<Response> | Response | BufferSource
): Promise<Secp256k1> => {
  // prepare the runtime
  const [g_imports, f_bind_heap] = emsimp(map_wasm_imports, 'wasm-secp256k1')

  // prep the wasm module
  let d_wasm: WebAssembly.WebAssemblyInstantiatedSource

  // instantiate wasm binary by streaming the response bytes
  if (z_src instanceof Response || z_src instanceof Promise) {
    d_wasm = await WebAssembly.instantiateStreaming(
      z_src as Response,
      g_imports
    )
  } else {
    // instantiate using raw binary
    d_wasm = await WebAssembly.instantiate(z_src as BufferSource, g_imports)
  }

  // create the libsecp256k1 exports struct
  const g_wasm = map_wasm_exports<Secp256k1WasmCore>(d_wasm.instance.exports)

  // bind the heap and ref its view(s)
  const [, ATU8_HEAP] = f_bind_heap(g_wasm.memory)

  // call into the wasm module's init method
  g_wasm.init()

  const ip_sk = g_wasm.malloc(ByteLens.PRIVATE_KEY)
  const ip_ent = g_wasm.malloc(ByteLens.NONCE_ENTROPY)
  const ip_seed = g_wasm.malloc<PointerSeed>(ByteLens.RANDOM_SEED)
  const ip_msg_hash = g_wasm.malloc(ByteLens.MSG_HASH)

  // scratch spaces
  const ip_pubkey_scratch = g_wasm.malloc(ByteLens.XONLY_PUBKEY)
  const ip_sig_scratch = g_wasm.malloc<PointerSig>(ByteLens.BIP340_SIG)

  // library handle: secp256k1_keypair;
  const ip_keypair = g_wasm.malloc<PointerKeypair>(ByteLens.KEYPAIR_LIB)

  // library handle: secp256k1_xonly_pubkey;
  const ip_xonly_pubkey = g_wasm.malloc<PointerXOnlyKey>(ByteLens.XONLY_KEY_LIB)

  // create a reusable context
  const ip_ctx = g_wasm.context_create(
    Flags.CONTEXT_SIGN | Flags.CONTEXT_VERIFY
  )

  // an encoder for hashing strings
  const utf8 = new TextEncoder()

  /**
   * Randomizes the context for better protection against CPU side-channel attacks
   */
  const randomize_context = () => {
    // put random seed bytes into place
    ATU8_HEAP.set(random_32(), ip_seed)

    // randomize context
    if (BinaryResult.SUCCESS !== g_wasm.context_randomize(ip_ctx, ip_seed)) {
      throw Error('Failed to randomize context')
    }
  }

  /**
   * Puts the given private key into program memory, runs the given callback, then zeroes out the key
   * @param atu8_sk - the private key
   * @param f_use - callback to use the key
   * @returns whatever the callback returns
   */
  const with_keypair = <W>(atu8_sk: Uint8Array, f_use: () => W) => {
    // prep callback return
    let w_return: W

    // in case of any exception..
    try {
      // copy input bytes into place
      ATU8_HEAP.set(atu8_sk, ip_sk)

      // instantiate keypair
      g_wasm.keypair_create(ip_ctx, ip_keypair, ip_sk)

      // use private key
      w_return = f_use()
    } finally {
      // zero-out private key and keypair
      ATU8_HEAP.fill(1, ip_sk, ip_sk + ByteLens.PRIVATE_KEY)
      ATU8_HEAP.fill(2, ip_keypair, ip_keypair + ByteLens.KEYPAIR_LIB)
    }

    // forward result
    return w_return
  }

  return {
    gen_secret_key: () =>
      crypto.getRandomValues(new Uint8Array(ByteLens.PRIVATE_KEY)),

    get_public_key(atu8_sk) {
      // randomize context
      randomize_context()

      // while using the private key, compute its corresponding public key; from the docs:
      if (
        BinaryResult.SUCCESS !==
        with_keypair(atu8_sk, () =>
          g_wasm.keypair_xonly_pub(ip_ctx, ip_xonly_pubkey, null, ip_keypair)
        )
      ) {
        throw Error('sk_to_pk: ' + S_REASON_INVALID_SK)
      }

      // serialize the public key
      g_wasm.xonly_pubkey_serialize(ip_ctx, ip_pubkey_scratch, ip_xonly_pubkey)

      // extract result
      return ATU8_HEAP.slice(
        ip_pubkey_scratch,
        ip_pubkey_scratch + ByteLens.XONLY_PUBKEY
      )
    },

    sign(atu8_sk, atu8_hash, atu8_ent = random_32()) {
      // randomize context
      randomize_context()

      // copy message hash bytes into place
      ATU8_HEAP.set(atu8_hash, ip_msg_hash)

      // copy entropy bytes into place
      ATU8_HEAP.set(atu8_ent, ip_ent)

      // while using the private key, sign the given message hash
      if (
        BinaryResult.SUCCESS !==
        with_keypair(atu8_sk, () =>
          g_wasm.schnorrsig_sign32(
            ip_ctx,
            ip_sig_scratch,
            ip_msg_hash,
            ip_keypair,
            ip_ent
          )
        )
      ) {
        throw Error('BIP-340 sign: ' + S_REASON_INVALID_SK)
      }

      // return serialized signature
      return ATU8_HEAP.slice(
        ip_sig_scratch,
        ip_sig_scratch + ByteLens.BIP340_SIG
      )
    },

    verify(atu8_signature, atu8_hash, atu8_pk) {
      // copy signature bytes into place
      ATU8_HEAP.set(atu8_signature, ip_sig_scratch)

      // copy message hash bytes into place
      ATU8_HEAP.set(atu8_hash, ip_msg_hash)

      // copy pubkey bytes into place
      ATU8_HEAP.set(atu8_pk, ip_pubkey_scratch)

      // parse the public key
      if (
        BinaryResult.SUCCESS !==
        g_wasm.xonly_pubkey_parse(ip_ctx, ip_xonly_pubkey, ip_pubkey_scratch)
      ) {
        throw Error(S_TAG_BIP340_VERIFY + S_REASON_INVALID_PK)
      }

      // verify the signature
      return (
        BinaryResult.SUCCESS ===
        g_wasm.schnorrsig_verify(
          ip_ctx,
          ip_sig_scratch,
          ip_msg_hash,
          ByteLens.MSG_HASH,
          ip_xonly_pubkey
        )
      )
    }
  }
}
