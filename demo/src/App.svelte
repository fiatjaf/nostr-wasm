<script lang="ts">
  import {onMount} from 'svelte'
  import {NostrWasm, type Nostr} from '../../src/api/nostr'

  function toHex(bytes: Uint8Array): string {
    return bytes.reduce(
      (hex, byte) => hex + byte.toString(16).padStart(2, '0'),
      ''
    )
  }

  function fromHex(hex: string): Uint8Array {
    return new Uint8Array(hex.length / 2).map((_, i) =>
      parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    )
  }

  let sec = ''
  let event = {
    id: '',
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    content: 'hello world',
    tags: [],
    pubkey: '',
    sig: ''
  }
  let signatureIsValid = false
  let idIsValid = false
  let loglines: string[][] = []

  let nw: Nostr
  onMount(async () => {
    log('loading wasm')
    nw = await NostrWasm(await fetch('/secp256k1.wasm'))
    log('wasm loaded successfully')
  })

  function log(str: string) {
    loglines.push([
      new Date().toISOString().split('.')[0].split('T').join(' '),
      str
    ])
    loglines = loglines
  }

  function generate() {
    sec = toHex(nw.generateSecretKey())
    log(`generated secret key ${sec}`)
  }

  function finalize() {
    nw.finalizeEvent(event, fromHex(sec))
    log(`finalized ${JSON.stringify(event)} with secret key ${sec}`)
    event = event
  }

  function reset() {
    event.id = ''
    event.sig = ''
  }

  function verify() {
    log(`verifying ${JSON.stringify(event)}`)
    try {
      nw.verifyEvent(event)
      signatureIsValid = true
      idIsValid = true
      log(`valid`)
    } catch (err) {
      log(`invalid: ${err}`)
      signatureIsValid = false
      if (String(err).includes('id ')) {
        idIsValid = false
      }
    }
  }
</script>

<main>
  <h1>nostr wasm demo</h1>
  <div style="margin-bottom: 10px">
    <label>
      secret key: <input bind:value={sec} />
    </label>
    <button disabled={!nw} on:click={generate}>generate</button>
  </div>
  <hr />
  <div style="margin-bottom: 10px">
    <label>
      id: <input readonly value={event.id} />
      {idIsValid ? 'valid' : 'invalid'}
    </label>
  </div>
  <div style="margin-bottom: 10px">
    <label>
      pubkey: <input bind:value={event.pubkey} on:change={reset} />
    </label>
  </div>
  <div style="margin-bottom: 10px">
    <label>
      created_at: <input
        type="datetime"
        bind:value={event.created_at}
        on:change={reset}
      />
    </label>
  </div>
  <div style="margin-bottom: 10px">
    <label>
      kind: <input
        type="number"
        min="0"
        max="65535"
        step="1"
        bind:value={event.kind}
        on:change={reset}
      />
    </label>
  </div>
  <div style="margin-bottom: 10px">
    <label>
      content: <textarea bind:value={event.content} on:change={reset} />
    </label>
  </div>
  <div style="margin-bottom: 10px">tags:</div>
  <div style="margin-bottom: 10px">
    <label>
      sig: <input readonly value={event.sig} />
      {signatureIsValid ? 'valid' : 'invalid'}
    </label>
    <button disabled={event.id === '' && event.sig === ''} on:click={verify}
      >verify</button
    >
  </div>

  <hr />
  <div>
    <button disabled={sec === ''} on:click={finalize}>finalize</button>
    (compute id, pubkey and signature using secret key)
  </div>

  <hr />
  <div style="display: flex; flex-direction: column-reverse">
    {#each loglines as line}
      <div
        style="font-family: monospace; font-size: 0.9em; white-space: pre-wrap; word-break: break-all;"
      >
        <span style="padding: 3px; background-color: black; color: white"
          >{line[0]}</span
        >
        {line[1]}
      </div>
    {/each}
  </div>
</main>
