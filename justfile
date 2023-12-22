export PATH := "./node_modules/.bin:" + env_var('PATH')

build:
  podman build -f Containerfile . -t secp256-wasm && podman run --rm -v $(pwd)/public:/out secp256-wasm
  bun run ./src/generate.ts public/out/secp256k1.js > ./src/gen/wasm.ts
  rollup -c rollup.config.js --configPlugin typescript

demo: build
  cd demo && ./node_modules/.bin/vite build --sourcemap=inline --debug

demo-watch: build
  cd demo && ./node_modules/.bin/vite build --watch --mode=development --minify=false --sourcemap=inline --debug

init:
  bun install
  cd demo && bun install

publish: build
  npm publish
