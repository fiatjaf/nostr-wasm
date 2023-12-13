#!/bin/bash

# clean
emmake make clean

# expose sha256 from libsecp256k1
sed -i 's/static \(void secp256k1_sha256_\(initialize\|write\|finalize\)\)/\1/' src/hash_impl.h
sed -i 's/static \(void secp256k1_sha256_\(initialize\|write\|finalize\)\)/extern \1/' src/hash.h

# workaround for <https://github.com/emscripten-core/emscripten/issues/13551>
echo '{"type":"commonjs"}' > package.json

# autogen
./autogen.sh

# configure
emconfigure ./configure \
  --enable-module-schnorrsig=yes\
  --enable-module-extrakeys=yes \
  --with-ecmult-window=4 \
  --with-ecmult-gen-precision=2 \
  --disable-shared \
  CFLAGS="-fdata-sections -ffunction-sections -O2" \
  LDFLAGS="-Wl,--gc-sections"

# make
emmake make FORMAT=wasm
emmake make src/precompute_ecmult-precompute_ecmult FORMAT=wasm

# reset output dir
rm -rf out
mkdir -p out

# compile
emcc src/precompute_ecmult-precompute_ecmult.o \
  src/libsecp256k1_precomputed_la-precomputed_ecmult.o \
  src/libsecp256k1_precomputed_la-precomputed_ecmult_gen.o \
  src/libsecp256k1_la-secp256k1.o \
  -O3 \
  -s WASM=1 \
  -s TOTAL_MEMORY=$(( 64 * 1024 * 3 )) \
  -s "BINARYEN_METHOD='native-wasm'" \
  -s DETERMINISTIC=1 \
  -s EXPORTED_FUNCTIONS="@/app/exported_functions" \
  -s MINIMAL_RUNTIME=1 \
  -s NO_EXIT_RUNTIME=1 \
  -o out/secp256k1.js

# verify
ls -la out/
