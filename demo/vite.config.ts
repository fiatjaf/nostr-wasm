import {defineConfig} from 'vite'
import {svelte} from '@sveltejs/vite-plugin-svelte'
import {copy} from 'vite-plugin-copy'

export default defineConfig({
  plugins: [
    svelte(),
    copy([
      {
        src: '../public/out/secp256k1.wasm',
        dest: './public/'
      }
    ])
  ]
})
