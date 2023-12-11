import {readFileSync} from 'node:fs'
import path from 'node:path'
import {gzipSync} from 'node:zlib'

import {buffer_to_base64} from '@blake.regalia/belt'
import typescript from '@rollup/plugin-typescript'
import {defineConfig} from 'rollup'

const SI_WASM = '\0wasm'

const R_WASM = /\.wasm(\?gzip)?$/

export default defineConfig({
  input: ['src/main.ts', 'src/gzipped.ts'],
  output: {
    dir: 'dist',
    format: 'module',
    chunkFileNames: '[name].js'
  },
  plugins: [
    typescript({
      sourceMap: true,
      tsconfig: 'tsconfig.rollup.json'
    }),

    // simple plugin to load wasm binary
    {
      name: 'wasm',

      resolveId(si_specifier, p_importer) {
        if (R_WASM.test(si_specifier)) {
          // @ts-expect-error bc rollup plugin typescript is broken?!
          return SI_WASM + path.resolve(path.dirname(p_importer), si_specifier)
        }

        return null
      },

      load(p_file) {
        // ignore non-wasm files
        if (!R_WASM.test(p_file)) return null

        // prep export contents
        let sb64_contents

        p_file = p_file.slice(SI_WASM.length)

        // compress
        if (p_file.endsWith('?gzip')) {
          p_file = p_file.replace(/\?gzip$/, '')

          sb64_contents = buffer_to_base64(gzipSync(readFileSync(p_file)))
        } else {
          // raw
          // load wasm as base64-encoded string
          sb64_contents = readFileSync(p_file, 'base64')
        }

        // create module for rollup
        const sx_out = `
					const sb64_data = ${JSON.stringify(sb64_contents)};

					export default sb64_data;
				`

        return {
          code: sx_out
        }
      }
    }
  ]
})
