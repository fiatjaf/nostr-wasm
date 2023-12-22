FROM emscripten/emsdk

RUN apt-get update \
  && apt-get install -y \
  autoconf \
  libtool \
  build-essential

COPY submodules/libsecp256k1 /app

WORKDIR /app

# expose sha256 from libsecp256k1
RUN sed -i 's/static \(void secp256k1_sha256_\(initialize\|write\|finalize\)\)/\1/' src/hash_impl.h
RUN sed -i 's/static \(void secp256k1_sha256_\(initialize\|write\|finalize\)\)/extern \1/' src/hash.h

# workaround for <https://github.com/emscripten-core/emscripten/issues/13551>
RUN echo '{"type":"commonjs"}' > package.json

# autogen
RUN ./autogen.sh

# configure
RUN emconfigure ./configure \
  --enable-module-schnorrsig=yes\
  --enable-module-extrakeys=yes \
  --with-ecmult-window=4 \
  --with-ecmult-gen-precision=2 \
  --disable-shared \
  CFLAGS="-fdata-sections -ffunction-sections -O2" \
  LDFLAGS="-Wl,--gc-sections"

# make
RUN emmake make FORMAT=wasm
RUN emmake make src/precompute_ecmult-precompute_ecmult FORMAT=wasm

# reset output dir
RUN rm -rf out
RUN mkdir -p out

# compile
RUN emcc src/precompute_ecmult-precompute_ecmult.o \
  src/libsecp256k1_precomputed_la-precomputed_ecmult.o \
  src/libsecp256k1_precomputed_la-precomputed_ecmult_gen.o \
  src/libsecp256k1_la-secp256k1.o \
  -O3 \
  -s WASM=1 \
  -s TOTAL_MEMORY=1mb \
  -s BINARYEN_METHOD='native-wasm' \
  -s DETERMINISTIC=1 \
  -s EXPORTED_FUNCTIONS='[ "_malloc", "_free", "_secp256k1_context_create", "_secp256k1_keypair_create", "_secp256k1_keypair_xonly_pub", "_secp256k1_xonly_pubkey_parse", "_secp256k1_xonly_pubkey_serialize", "_secp256k1_schnorrsig_sign32", "_secp256k1_schnorrsig_verify", "_secp256k1_sha256_initialize", "_secp256k1_sha256_write", "_secp256k1_sha256_finalize" ]' \
  -s MINIMAL_RUNTIME=1 \
  -s NO_EXIT_RUNTIME=1 \
  -o out/secp256k1.js

# verify
RUN ls -la out/

# copy outputs to mounted volume
CMD ["cp", "-r", "/app/out", "/out"]
