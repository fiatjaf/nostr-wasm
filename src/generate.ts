/* eslint-disable @typescript-eslint/no-loop-func */
import {readFileSync} from 'fs'

import {oderac, type Dict, __UNDEFINED} from '@blake.regalia/belt'

import * as acorn from 'acorn'

const sr_file = process.argv[2]

if (!sr_file) {
  console.error('Usage: generate.ts <WASM_JS_FILE>')
  process.exit(1)
}

const sx_js = readFileSync(sr_file, 'utf-8')

const yn_root = acorn.parse(sx_js, {
  ecmaVersion: 'latest'
})

const ident = (yn: acorn.Node) => (yn as acorn.Identifier).name

const litval = <w_type extends acorn.Literal['value']>(yn: acorn.Node) =>
  (yn as acorn.Literal).value as w_type

let si_import_key = ''
let si_init_key = ''
let xc_fd_close = 0
let xc_fd_seek = 0

const h_types: Dict<string> = {}
const h_imports: Dict<[string, string]> = {}
const h_exports: Dict<string> = {}

const H_TYPES: Dict = {
  _abort: `() => void`,
  _emscripten_memcpy_js: `(ip_dst: Pointer, ip_src: Pointer, nb_size: ByteSize) => Uint8Array`,
  _emscripten_resize_heap: `(nb_size: ByteSize) => void`,
  _fd_close: `() => FileDescriptor`,
  _fd_seek: `(i_fd: FileDescriptor, ib_off_lo: ByteOffset, ib_off_hi: ByteOffset, xc_whence: SeekWhence, ib_off_new: ByteOffset) => FileDescriptor`,
  _fd_write: `(i_fd: FileDescriptor, ip_iov: Pointer, nl_iovs: number, ip_written: Pointer) => 0`
}

const H_RENAME_IMPORTS: Dict = {
  _abort: 'abort',
  _emscripten_memcpy_js: 'memcpy',
  _emscripten_resize_heap: 'resize',
  _fd_write: 'write'
}

const H_KNOWN_EXPORT_TYPES: Dict = {
  _malloc: '(nb_size: ByteSize) => Pointer',
  _free: '(ip_ptr: Pointer) => void',
  _sbrk: '(nb_change: ByteDelta) => Pointer',
  wasmMemory: 'WebAssembly.Memory'
}

const rename_export = (si_func: string) =>
  si_func.replace(/^_(?:secp256k1_)?/, '').replace('wasmMemory', 'memory')

const export_type = (si_func: string) =>
  H_KNOWN_EXPORT_TYPES[si_func] || 'Function'

for (const yn_top of yn_root.body) {
  if ('ExpressionStatement' === yn_top.type) {
    for (const yn_arg of (yn_top.expression as acorn.CallExpression)
      .arguments) {
      if ('ArrowFunctionExpression' === yn_arg.type) {
        const a_stmts = (yn_arg.body as acorn.BlockStatement).body

        for (const yn_stmt of a_stmts) {
          if ('ExpressionStatement' === yn_stmt.type) {
            const yn_expr = yn_stmt.expression

            if ('AssignmentExpression' === yn_expr.type) {
              const si_func = ident(yn_expr.left)

              const yn_right = yn_expr.right
              if ('MemberExpression' === yn_right.type) {
                const si_symbol = litval<string>(yn_right.property)

                h_exports[si_func] = `${rename_export(
                  si_func
                )}: g_exports['${si_symbol}']` // as ${export_type(si_func)}`;
              }
            }
          }
        }
      }
    }
  } else if ('VariableDeclaration' === yn_top.type) {
    for (const yn_decl of yn_top.declarations) {
      if ('VariableDeclarator' === yn_decl.type) {
        const yn_init = yn_decl.init

        ;(
          ({
            wasmImports() {
              if ('ObjectExpression' === yn_init?.type) {
                for (const yn_prop of yn_init.properties as acorn.Property[]) {
                  const si_key = ident(yn_prop.key)
                  const si_value = ident(yn_prop.value)

                  // h_types[si_value] = `${H_TYPES[si_value] || 'unknown'}`;
                  if (!(si_value in H_TYPES)) h_types[si_value] = 'unknown'

                  h_imports[si_value] = [
                    si_key,
                    `g_imports.${H_RENAME_IMPORTS[si_value]}`
                  ]
                }
              }
            },

            imports() {
              if ('ObjectExpression' === yn_init?.type) {
                for (const yn_prop of yn_init.properties as acorn.Property[]) {
                  if ('wasmImports' === ident(yn_prop.value)) {
                    si_import_key = litval<string>(yn_prop.key)
                  }
                }
              }
            },

            _fd_close() {
              if ('ArrowFunctionExpression' === yn_init?.type) {
                xc_fd_close = litval(yn_init.body)
              }
            }
          }) as Dict<VoidFunction>
        )[ident(yn_decl.id)]?.()
      }
    }
  } else if ('FunctionDeclaration' === yn_top.type) {
    const yn_block = yn_top.body
    const a_body = yn_block.body

    ;(
      ({
        _fd_seek() {
          for (const yn_stmt of a_body) {
            if ('ReturnStatement' === yn_stmt.type) {
              xc_fd_seek = litval<number>(yn_stmt.argument!)
            }
          }
        },

        initRuntime() {
          for (const yn_stmt of a_body) {
            if ('ExpressionStatement' === yn_stmt.type) {
              const yn_call = yn_stmt.expression

              if ('CallExpression' === yn_call.type) {
                const yn_callee = yn_call.callee

                if ('MemberExpression' === yn_callee.type) {
                  if ('wasmExports' === ident(yn_callee.object)) {
                    si_init_key = litval<string>(yn_callee.property)
                  }
                }
              }
            }
          }
        }
      }) as Dict<VoidFunction>
    )[ident(yn_top.id)]?.()
  }
}

// omit seek and close from imports
delete h_types['_fd_seek']
delete h_types['_fd_close']

// set seek and close
h_imports['_fd_seek'][1] = `() => ${xc_fd_seek},  // _fd_seek`
h_imports['_fd_close'][1] = `() => ${xc_fd_close},  // _fd_close`

// eslint-disable-next-line no-console
console.log(`
/*
* ================================
*     GENERATED FILE WARNING
* Do not edit this file manually.
* ================================
*/

/* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports, no-trailing-spaces */

import type {
	Pointer,
	ByteSize,
	ByteDelta,
	ByteOffset,
	FileDescriptor,
	SeekWhence,
	WasmImports,
	WasmExports,
} from '../types.js';

export interface WasmImportsExtension extends WasmImports {
	${oderac(
    h_types,
    (si_key, sx_value) => `${H_RENAME_IMPORTS[si_key] || si_key}: ${sx_value};`
  ).join('\n\t')}
}

export interface WasmExportsExtension extends WasmExports {
	${oderac(h_exports, si_func =>
    si_func in H_KNOWN_EXPORT_TYPES
      ? __UNDEFINED
      : `${rename_export(si_func)}: Function;`
  ).join('\n\t')}
}

export const map_wasm_imports = (g_imports: WasmImportsExtension) => ({
	${si_import_key}: {
		${oderac(
      h_imports,
      (si_export, [si_symbol, sx_value]) => `${si_symbol}: ${sx_value},`
    ).join('\n\t\t')}
	},
});

export const map_wasm_exports = <
	g_extension extends WasmExportsExtension=WasmExportsExtension,
>(g_exports: WebAssembly.Exports): g_extension => ({
	${oderac(h_exports, (si_func, sx_value) => sx_value + ',').join('\n\t')}

	init: () => (g_exports['${si_init_key}'] as VoidFunction)(),
} as g_extension);
`)

// export const init_wasm = (g_exports: WebAssembly.Exports) => (g_exports['${si_init_key}'] as VoidFunction)();
