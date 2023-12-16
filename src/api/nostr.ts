import type {
  PointerKeypair,
  PointerSig,
  PointerXOnlyKey,
  PointerSha256,
  Secp256k1WasmCore
} from './types.js'

import {emsimp} from './emsimp.js'
import {BinaryResult, ByteLens, Flags} from './types.js'
import {map_wasm_exports, map_wasm_imports} from '../gen/wasm.js'

type Event = {
  id: string
  pubkey: string
  sig: string
  content: string
  kind: number
  created_at: number
  tags: string[][]
}

export interface Nostr {
  /**
   * Generates a new private key using crypto secure random bytes and without modulo bias
   * @returns a new private key (32 bytes)
   */
  generateSecretKey(): Uint8Array

  /**
   * Computes the public key for a given private key
   * @param seckey - the private key (32 bytes)
   * @returns the public key (32 bytes)
   */
  getPublicKey(seckey: Uint8Array): Uint8Array

  /**
   * Fills in an event object with pubkey, id and sig.
   * @param event - the Nostr event object
   * @param seckey - the private key
   * @param entropy - optional entropy to use
   */
  finalizeEvent(event: Event, seckey: Uint8Array, ent?: Uint8Array): void

  /**
   * Verifies if an event's .id property is correct and that the .sig is valid
   * @param event - the Nostr event object
   * @throws an error with a .message if the event is not valid for any reason
   */
  verifyEvent(event: Event): void
}

/**
 * Creates a new instance of the secp256k1 WASM and returns the Nostr wrapper
 * @param z_src - a Response containing the WASM binary, a Promise that resolves to one,
 * 	or the raw bytes to the WASM binary as a {@link BufferSource}
 * @returns the wrapper API
 */
export const NostrWasm = async (
  z_src: Promise<Response> | Response | BufferSource
): Promise<Nostr> => {
  // prepare the runtime
  const [g_imports, f_bind_heap] = emsimp(map_wasm_imports, 'nostr-wasm')

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

  // create the exports struct
  const g_wasm = map_wasm_exports<Secp256k1WasmCore>(d_wasm.instance.exports)

  // bind the heap and ref its view(s)
  const [, ATU8_HEAP] = f_bind_heap(g_wasm.memory)

  // call into the wasm module's init method
  g_wasm.init()

  const ip_sk = g_wasm.malloc(ByteLens.PRIVATE_KEY)
  const ip_ent = g_wasm.malloc(ByteLens.NONCE_ENTROPY)
  const ip_msg_hash = g_wasm.malloc(ByteLens.MSG_HASH)

  // scratch spaces
  const ip_pubkey_scratch = g_wasm.malloc(ByteLens.XONLY_PUBKEY)
  const ip_sig_scratch = g_wasm.malloc<PointerSig>(ByteLens.BIP340_SIG)

  // library handle: secp256k1_keypair;
  const ip_keypair = g_wasm.malloc<PointerKeypair>(ByteLens.KEYPAIR_LIB)

  // library handle: secp256k1_xonly_pubkey;
  const ip_xonly_pubkey = g_wasm.malloc<PointerXOnlyKey>(ByteLens.XONLY_KEY_LIB)

  // library handle: secp256k1_sha256;
  const ip_sha256 = g_wasm.malloc<PointerSha256>(ByteLens.SHA256_LIB)

  // create a reusable context
  const ip_ctx = g_wasm.context_create(
    Flags.CONTEXT_SIGN | Flags.CONTEXT_VERIFY
  )

  // an encoder for hashing strings
  const utf8 = new TextEncoder()

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

  const compute_event_id = (event: Event): Uint8Array => {
    const message = utf8.encode(
      `[0,"${event.pubkey}",${event.created_at},${event.kind},${JSON.stringify(
        event.tags
      )},${JSON.stringify(event.content)}]`
    )
    const ip_message = g_wasm.malloc(message.length)
    ATU8_HEAP.set(message, ip_message)
    g_wasm.sha256_initialize(ip_sha256)
    g_wasm.sha256_write(ip_sha256, ip_message, message.length)
    g_wasm.sha256_finalize(ip_sha256, ip_msg_hash)

    return ATU8_HEAP.slice(ip_msg_hash, ip_msg_hash + ByteLens.MSG_HASH)
  }

  return {
    generateSecretKey: () =>
      crypto.getRandomValues(new Uint8Array(ByteLens.PRIVATE_KEY)),

    getPublicKey(sk) {
      if (
        BinaryResult.SUCCESS !==
        with_keypair(sk, () =>
          g_wasm.keypair_xonly_pub(ip_ctx, ip_xonly_pubkey, null, ip_keypair)
        )
      ) {
        throw Error('failed to get pubkey from keypair')
      }

      // serialize the public key
      g_wasm.xonly_pubkey_serialize(ip_ctx, ip_pubkey_scratch, ip_xonly_pubkey)

      // extract result
      return ATU8_HEAP.slice(
        ip_pubkey_scratch,
        ip_pubkey_scratch + ByteLens.XONLY_PUBKEY
      )
    },

    finalizeEvent(event, seckey, ent) {
      with_keypair(seckey, () => {
        // get public key (as in getPublicKey function above)
        g_wasm.keypair_xonly_pub(ip_ctx, ip_xonly_pubkey, null, ip_keypair)
        g_wasm.xonly_pubkey_serialize(
          ip_ctx,
          ip_pubkey_scratch,
          ip_xonly_pubkey
        )
        const pubkey = ATU8_HEAP.slice(
          ip_pubkey_scratch,
          ip_pubkey_scratch + ByteLens.XONLY_PUBKEY
        )
        event.pubkey = toHex(pubkey)

        // compute event id
        event.id = toHex(compute_event_id(event))

        // copy entropy bytes into place, if they are provided
        if (!ent && crypto.getRandomValues) {
          ATU8_HEAP.set(crypto.getRandomValues(new Uint8Array(32)), ip_ent)
        }

        // perform signature (ip_msg_hash is already set from procedure above)
        if (
          BinaryResult.SUCCESS !==
          g_wasm.schnorrsig_sign32(
            ip_ctx,
            ip_sig_scratch,
            ip_msg_hash,
            ip_keypair,
            ip_ent
          )
        ) {
          throw Error('failed to sign')
        }
      })
      const sig = ATU8_HEAP.slice(
        ip_sig_scratch,
        ip_sig_scratch + ByteLens.BIP340_SIG
      )
      event.sig = toHex(sig)
    },

    verifyEvent(event: Event) {
      const id = fromHex(event.id)

      // check event hash
      const computed = compute_event_id(event)
      for (let i = 0; i < id.length; i++) {
        if (id[i] !== computed[i]) throw Error('id is invalid')
      }

      // copy event data into place
      ATU8_HEAP.set(fromHex(event.sig), ip_sig_scratch)
      ATU8_HEAP.set(fromHex(event.id), ip_msg_hash)
      ATU8_HEAP.set(fromHex(event.pubkey), ip_pubkey_scratch)

      // parse the public key
      if (
        BinaryResult.SUCCESS !==
        g_wasm.xonly_pubkey_parse(ip_ctx, ip_xonly_pubkey, ip_pubkey_scratch)
      ) {
        throw Error('pubkey is invalid')
      }

      // verify the signature
      if (
        BinaryResult.SUCCESS !==
        g_wasm.schnorrsig_verify(
          ip_ctx,
          ip_sig_scratch,
          ip_msg_hash,
          ByteLens.MSG_HASH,
          ip_xonly_pubkey
        )
      ) {
        throw Error('signature is invalid')
      }
    }
  }
}

function toHex(bytes: Uint8Array): string {
  return bytes.reduce(
    (hex, byte) => hex + byte.toString(16).padStart(2, '0'),
    ''
  )
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.length / 2).map((_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  )
}
