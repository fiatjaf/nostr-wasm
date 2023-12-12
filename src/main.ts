export * from './headless.js'

import {WasmSecp256k1, type Secp256k1} from './api/secp256k1.js'

import SB64_SECP256K1_WASM from '../public/out/secp256k1.wasm'

export const initWasmSecp256k1 = (): Promise<Secp256k1> =>
  WasmSecp256k1(
    new Uint8Array(
      atob(SB64_SECP256K1_WASM)
        .split('')
        .map(s => s.charCodeAt(0))
    )
  )
