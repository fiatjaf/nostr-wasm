export * from './headless.js'

import {WasmSecp256k1, type Secp256k1} from './api/secp256k1.js'

import SB64_SECP256K1_WASM from '../public/out/secp256k1.wasm?gzip'

export const initWasmSecp256k1 = async (): Promise<Secp256k1> => {
  // get bytes blob from base64
  const atu8_gzipped = new Uint8Array(
    atob(SB64_SECP256K1_WASM)
      .split('')
      .map(s => s.charCodeAt(0))
  )

  // read it as a gzip file
  const ds_src = new ReadableStream({
    start(d_ctrl) {
      d_ctrl.enqueue(atu8_gzipped)
      d_ctrl.close()
    }
  })

  // and decompress it
  const ds_dst = ds_src.pipeThrough(new DecompressionStream('gzip'))
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

function concat(a_buffers: Uint8Array[]) {
  let size = 0
  for (const atu8_each of a_buffers) {
    size += atu8_each.byteLength
  }

  const atu8_out = new Uint8Array(size)

  let index = 0
  for (const atu8_each of a_buffers) {
    atu8_out.set(atu8_each, index)
    index += atu8_each.byteLength
  }

  return atu8_out
}
