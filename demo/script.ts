import {
  buffer_to_hex,
  hex_to_buffer,
  sha256,
  text_to_buffer
} from '@blake.regalia/belt'

import {WasmSecp256k1} from '../src/api/secp256k1'

const elem = <d_type extends HTMLElement = HTMLElement>(si_id: string) =>
  document.getElementById(si_id) as d_type

const dm_sk = elem<HTMLInputElement>('sk')
const dm_pk = elem<HTMLInputElement>('pk')
const dm_msg = elem<HTMLInputElement>('msg')
const dm_hash = elem<HTMLTextAreaElement>('hash')
const dm_sig = elem<HTMLInputElement>('sig')
const dm_verified = elem<HTMLInputElement>('verified')

;(async function load() {
  const d_res = await fetch('../../public/out/secp256k1.wasm')
  const k_secp = await WasmSecp256k1(d_res)

  let atu8_sk: Uint8Array
  let atu8_pk: Uint8Array
  let atu8_hash: Uint8Array
  let atu8_sig: Uint8Array

  function sk_err(s_msg: string) {
    dm_pk.value = s_msg
  }

  const is_hex = (sb16: string) => /^[a-f0-9]+$/i.test(sb16)

  function reload_sk() {
    const sb16_sk = dm_sk.value
    if (sb16_sk.length < 64) {
      return sk_err('private key too short')
    } else if (sb16_sk.length > 64) {
      return sk_err('private key too long')
    } else if (!is_hex(sb16_sk)) {
      return sk_err('not hexadecimal')
    }

    atu8_sk = hex_to_buffer(sb16_sk)

    try {
      atu8_pk = k_secp.get_public_key(atu8_sk)
    } catch (e_convert) {
      return sk_err((e_convert as Error).message)
    }

    dm_pk.value = buffer_to_hex(atu8_pk)

    void reload_sig()
  }

  async function reload_sig() {
    atu8_hash = await sha256(text_to_buffer(dm_msg.value))

    dm_hash.value = buffer_to_hex(atu8_hash)

    try {
      atu8_sig = k_secp.sign(atu8_sk, atu8_hash)
    } catch (e_convert) {
      return (dm_sig.value = (e_convert as Error).message)
    }

    dm_sig.value = buffer_to_hex(atu8_sig)

    let v: Boolean
    try {
      v = k_secp.verify(atu8_sig, atu8_hash, atu8_pk)
    } catch (e_verify) {
      return (dm_verified.value = (e_verify as Error).message)
    }

    dm_verified.value = v ? 'yes' : 'no'
  }

  // generate random private key
  atu8_sk = k_secp.gen_secret_key()

  // set value in UI
  dm_sk.value = buffer_to_hex(atu8_sk)

  // bind to input events
  dm_sk.addEventListener('input', reload_sk)
  dm_msg.addEventListener('input', reload_sig)

  // init
  reload_sk()
})()
