export * from './headless.js'

import {NostrWasm, type Nostr} from './api/nostr.js'

import SB64_SECP256K1_WASM from '../public/out/secp256k1.wasm'

export const initNostrWasm = (): Promise<Nostr> =>
  NostrWasm(
    new Uint8Array(
      atob(SB64_SECP256K1_WASM)
        .split('')
        .map(s => s.charCodeAt(0))
    )
  )
