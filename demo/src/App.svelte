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
    tags: [] as string[][],
    pubkey: '',
    sig: ''
  }
  let signatureIsValid: boolean | null = null
  let idIsValid: boolean | null = null
  let loglines: string[][] = []
  let canAddNewItem = true

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
    event = event
    idIsValid = null
    signatureIsValid = null
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

  function newTag(ev: Event & {currentTarget: EventTarget & HTMLInputElement}) {
    canAddNewItem = false
    event.tags.push([ev.currentTarget.value])
    event = event
  }

  function newItem(
    tag: string[],
    ev: Event & {currentTarget: EventTarget & HTMLInputElement}
  ) {
    canAddNewItem = false
    tag.push(ev.currentTarget.value)
    event = event
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
  <div style="display: flex">
    <div>
      <div style="margin-bottom: 10px">
        <label>
          id: <input readonly value={event.id} />
          {idIsValid === null ? '?' : idIsValid ? 'valid' : 'invalid'}
        </label>
      </div>
      <div style="margin-bottom: 10px">
        <label>
          pubkey: <input bind:value={event.pubkey} on:input={reset} />
        </label>
      </div>
      <div style="margin-bottom: 10px">
        <label>
          created_at: <input
            type="datetime"
            bind:value={event.created_at}
            on:input={reset}
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
            on:input={reset}
          />
        </label>
      </div>
      <div style="margin-bottom: 10px">
        <label>
          content: <textarea bind:value={event.content} on:input={reset} />
        </label>
      </div>
      <div style="margin-bottom: 10px;">
        tags:
        <ul>
          {#each event.tags as tag}
            <li>
              {#each tag as item}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  bind:value={item}
                  autofocus
                  on:blur={() => {
                    canAddNewItem = true
                  }}
                />
              {/each}
              {#if canAddNewItem}
                <input on:input={newItem.bind(null, tag)} style="width: 20px" />
              {/if}
            </li>
          {/each}
          {#if canAddNewItem}
            <li>
              <input on:input={newTag} style="width: 20px" />
            </li>
          {/if}
        </ul>
      </div>
      <div style="margin-bottom: 10px">
        <label>
          sig: <input readonly value={event.sig} />
          {idIsValid === null ? '?' : idIsValid ? 'valid' : 'invalid'}
        </label>
        {#if (event.id === '' && event.sig === '') || idIsValid !== null}
          <button on:click={verify}>verify</button>
        {/if}
      </div>
    </div>

    <div
      style="font-family: monospace; white-space: pre-wrap; word-break: break-all;"
    >
      {JSON.stringify(event, null, 2)}
    </div>
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
