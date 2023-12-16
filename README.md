# nostr-wasm

Nostr signature stuff in WASM based on libsecp256k1.

## Install

```sh
yarn install
```

## Usage

First, choose which import method suites your needs:

#### Default

Import with the WASM binary preloaded and uncompressed. No need to perform `fetch`, but bundle will be larger (+332 KiB).

```ts
import {initWasmSecp256k1} from '@solar-republic/wasm-secp256k1'
const secp256k1 = await initWasmSecp256k1()
```

#### Compressed

Import with the WASM binary preloaded and gzipped (requires access to `globalThis.DecompressionSteam`). No need to perform `fetch`, but bundle will be still be a bit larger (+175 KiB).

```ts
import {initWasmSecp256k1} from '@solar-republic/wasm-secp256k1/gzipped'
const secp256k1 = await initWasmSecp256k1()
```

#### Headless

Import without the WASM binary. Produces the smallest bundle size but requires fetching the binary yourself.

```ts
import {WasmSecp256k1} from '@solar-republic/wasm-secp256k1/headless'

// provide the binary (the constructor also accepts raw bytes)
const secp256k1 = await WasmSecp256k1(await fetch('secp256k1.wasm'))
```

### Using the instance:

```ts
// generate a random private key
const sk = secp256k1.gen_sk()

// get its corresponding public key
const pk = secp256k1.sk_to_pk(sk)

// sign a message hash (caller is responsible for actually hashing the message and providing entropy)
const signed = secp256k1.sign(sk, messageHash, entropy)

// verify a given message hash is signed by some public key
const verified = secp256k1.verify(signed, messageHash, pk)

// derive a shared secret with some other's public key
const shared = secp256k1.ecdh(sk, otherPk)

// zero out private key
sk.fill(0, 0, 32)
```

Caller is responsible for zero-ing out private keys in the Typed Arrays it passes. Library only zeroes out the bytes in the copies it makes.

## API

```ts
/**
 * Creates a new instance of the secp256k1 WASM and returns its ES wrapper
 * @param z_src - a Response containing the WASM binary, a Promise that resolves to one,
 * 	or the raw bytes to the WASM binary as a {@link BufferSource}
 * @returns the wrapper API
 */
export declare const WasmSecp256k1 = (dp_res: Promisable<Response> | BufferSource): Promise<Secp256k1>;

/**
 * Wrapper instance providing operations backed by libsecp256k1 WASM module
 */
interface Secp256k1 {

}
```

## Is libsecp256k1 modified?

No, the library is imported as a git submodule directly from upstream.

## Building from source

Prerequisites:

- [Podman](https://podman.io/)
- [Bun](https://bun.sh/) - a drop-in replacement for Node.js with native support for executing TypeScript

```sh
git clone --recurse-submodules https://github.com/fiatjaf/nostr-wasm
cd nostr-wasm
bun install
bun run build
```

The WASM binary will be output to `public/out/secp256k1.wasm`.

The Emscripten-generated js file at `public/out/secp256k1.js` is not needed for production if you are using the provided wrapper.

## See also

[hash-wasm](https://github.com/Daninet/hash-wasm/tree/master) is a great library that provides performant hashing using optimized WASM binaries. Though its API is asynchronous, it also provides an undocumented synchronous API.
