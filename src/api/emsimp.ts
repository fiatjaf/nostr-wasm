import type {ImportMapper} from 'src/types'

import {buffer, buffer_to_text} from '@blake.regalia/belt'

export const emsimp = (f_map_imports: ImportMapper, s_tag: string) => {
  s_tag += ': '

  let AB_HEAP: ArrayBuffer
  let ATU8_HEAP: Uint8Array
  let ATU32_HEAP: Uint32Array

  // eslint-disable-next-line no-console
  const console_out = (
    s_channel: Extract<
      keyof Console,
      'debug' | 'info' | 'log' | 'warn' | 'error'
    >,
    s_out: string
  ) => console[s_channel](s_tag + s_out.replace(/\0/g, '\n'))

  let s_error = ''

  const h_fds: Record<number, (s_out: string) => void> = {
    // stdout
    1(s_out) {
      console_out('debug', s_out)
    },

    // stderr
    2(s_out) {
      console_out('error', (s_error = s_out))
    }
  }

  const g_imports = f_map_imports({
    abort() {
      throw Error(s_tag + (s_error || 'An unknown error occurred'))
    },

    memcpy: (ip_dst, ip_src, nb_size) =>
      ATU8_HEAP.copyWithin(ip_dst, ip_src, ip_src + nb_size),

    resize(_) {
      throw Error(s_tag + 'Out of memory')
    },

    write(i_fd, ip_iov, nl_iovs, ip_written) {
      // output string
      let s_out = ''

      // track number of bytes read from buffers
      let cb_read = 0

      // each pending iov
      for (let i_iov = 0; i_iov < nl_iovs; i_iov++) {
        // start of buffer in memory
        const ip_start = ATU32_HEAP[ip_iov >> 2]

        // size of buffer
        const nb_len = ATU32_HEAP[(ip_iov + 4) >> 2]

        // next iov
        ;(ip_iov as number) += 8

        // extract text from buffer
        s_out += buffer_to_text(ATU8_HEAP.subarray(ip_start, ip_start + nb_len))

        // update number of bytes read
        cb_read += nb_len
      }

      // route to fd
      if (h_fds[i_fd]) {
        h_fds[i_fd](s_out)
      } else {
        // no fd found
        throw new Error(
          `libsecp256k1 tried writing to non-open file descriptor: ${i_fd}\n${s_out}`
        )
      }

      // write bytes read
      ATU32_HEAP[ip_written >> 2] = cb_read

      // no error
      return 0
    }
  })

  return [
    g_imports,
    (d_memory: WebAssembly.Memory) =>
      [
        (AB_HEAP = d_memory.buffer),
        (ATU8_HEAP = buffer(AB_HEAP)),
        (ATU32_HEAP = new Uint32Array(AB_HEAP))
      ] as const
  ] as const
}
