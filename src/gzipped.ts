export * from './headless.js'

import {base64_to_buffer, concat} from '@blake.regalia/belt'

import {WasmSecp256k1, type Secp256k1} from './api/secp256k1.js'

import SB64_SECP256K1_WASM from '../public/out/secp256k1.wasm?gzip'

export const initWasmSecp256k1 = async (): Promise<Secp256k1> => {
  const d_gunzip = new DecompressionStream('gzip')

  const atu8_gzipped = base64_to_buffer(SB64_SECP256K1_WASM)

  const ds_src = new ReadableStream({
    start(d_ctrl) {
      d_ctrl.enqueue(atu8_gzipped)
      d_ctrl.close()
    }
  })

  const ds_dst = ds_src.pipeThrough(d_gunzip)

  const d_reader = ds_dst.getReader()
  const a_chunks: Uint8Array[] = []

  for (;;) {
    const {value: atu8_chunk, done: b_done} = await d_reader.read()

    if (b_done) break

    a_chunks.push(atu8_chunk)
  }

  const atu8_gunzipped = concat(a_chunks)

  return await WasmSecp256k1(atu8_gunzipped)
}
