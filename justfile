export PATH := "./node_modules/.bin:" + env_var('PATH')

build:
  bun run ./src/generate.ts public/out/secp256k1.js > ./src/gen/wasm.ts
  podman build -f secp256k1.Dockerfile . -t wasm-secp256k1 && podman run --rm -v $(pwd)/public:/out wasm-secp256k1
  rollup -c rollup.config.js --configPlugin typescript

demo: build
  vite build ./demo
