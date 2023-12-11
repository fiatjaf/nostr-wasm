declare module '*.wasm' {
  const sb64_contents: string
  export default sb64_contents
}

declare module '*.wasm?gzip' {
  const sb64_data: string
  export default sb64_data
}
