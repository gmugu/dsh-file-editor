/**
 * End-to-end HTTP verification for dsh-file-editor, against a RUNNING DSH.
 *
 * Drives the real routes over loopback — no browser, no mocking: the plugin's
 * client bundle is fetched, its lazy chunk is fetched and revalidated, and the
 * JSON API is exercised for a read/write round trip, the CRLF round trip, the
 * workspace fence, the method/route guards and the browser-trust fence.
 *
 * IMPORTANT: this deployment fronts every route with dsh-login-gate, which
 * answers unauthenticated requests with 302 (GET) or 401 (POST) before they
 * reach any plugin. Supply the session cookie your signed-in browser uses:
 *
 *   $env:DSH_COOKIE = 'dsh_session=...'        # PowerShell
 *   node scripts/e2e-http.mjs
 *
 * Optional overrides: DSH_BASE (default http://127.0.0.1:3080),
 * DSH_SESSION (default: an unknown id, which exercises the documented
 * client-cwd fallback), TEST_WORKSPACE (default: the current directory).
 *
 * Without a cookie the script reports the gate and exits 2 — it does not try to
 * obtain credentials. The host half's logic is covered hermetically by
 * test/host.test.mjs, which drives the same handlers without HTTP.
 */
import { request } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = new URL(process.env.DSH_BASE ?? 'http://127.0.0.1:3080')
const WORKSPACE = process.env.TEST_WORKSPACE ?? process.cwd()
const SESSION = process.env.DSH_SESSION ?? 'e2e-placeholder-session'
const COOKIE = process.env.DSH_COOKIE
const TEMP_FILE = join(WORKSPACE, '.e2e-roundtrip.txt').replace(/\\/g, '/')
const TEMP_CRLF = join(WORKSPACE, '.e2e-crlf.txt').replace(/\\/g, '/')

/** One request with full control over the Host header. */
function send(pathname, { method = 'GET', body, host, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(body, 'utf8')
    const req = request({
      host: host ?? BASE.hostname,
      port: BASE.port,
      path: pathname,
      method,
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': payload.length }),
        ...(COOKIE === undefined ? {} : { cookie: COOKIE }),
        ...headers,
      },
      setHost: host === undefined,
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

const post = (method, payload, extra = {}) => send(`/file-editor/api/${method}`, {
  method: 'POST',
  body: JSON.stringify({ sessionId: SESSION, cwd: WORKSPACE, ...payload }),
  ...extra,
})

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: condition === true, detail })
  if (condition !== true) process.exitCode = 1
}

async function main() {
  // The deployment's login gate answers before any plugin route runs. Detect it
  // and say so plainly instead of reporting a cascade of plugin failures.
  const probe = await send('/file-editor/bundle/editor.js')
  if (probe.status === 302 || probe.status === 401) {
    console.error(`Blocked by the login gate (HTTP ${probe.status} on the chunk route).`)
    console.error('Set DSH_COOKIE to your signed-in session cookie and re-run; the host half is')
    console.error('already covered hermetically by `npm test` (test/host.test.mjs).')
    process.exitCode = 2
    return
  }

  // 1. the client half is served by the module system
  const client = await send('/plugins/dsh-file-editor/client.js')
  check('GET /plugins/dsh-file-editor/client.js → 200', client.status === 200, `status ${client.status}`)
  check('client bundle carries the module-loader envelope',
    client.text.includes('window.__ModuleLoader__.load') && client.text.includes('"dsh-file-editor"'))

  // 2. the lazy editor chunk + ETag revalidation
  check('GET /file-editor/bundle/editor.js → 200', probe.status === 200, `status ${probe.status}`)
  check('chunk registers the chunk factory global', probe.text.includes('__dshFileEditorChunks__'))
  check('chunk carries CodeMirror', probe.text.includes('cm-content') || probe.text.includes('CodeMirror'))
  const etag = probe.headers.etag
  check('chunk serves an ETag', typeof etag === 'string' && etag.length > 2, String(etag))
  if (typeof etag === 'string') {
    const revalidated = await send('/file-editor/bundle/editor.js', { headers: { 'if-none-match': etag } })
    check('If-None-Match revalidates with 304', revalidated.status === 304, `status ${revalidated.status}`)
  }

  // 3. write → read round trip
  const content = `line one\nline two\n${new Date().toISOString()}\n`
  const written = await post('fs.write', { path: TEMP_FILE, content })
  const writeOk = written.status === 200 && JSON.parse(written.text).ok === true
  check('POST fs.write → ok:true', writeOk, written.text.slice(0, 200))
  if (writeOk) {
    const onDisk = await readFile(TEMP_FILE, 'utf8').catch(() => undefined)
    check('the bytes actually landed on disk', onDisk === content)
    const read = await post('fs.read', { path: TEMP_FILE })
    const value = read.status === 200 ? JSON.parse(read.text).value : undefined
    check('POST fs.read → text with identical content', value?.kind === 'text' && value.content === content,
      JSON.stringify(value)?.slice(0, 200))
    check('fs.read reports the file size', value?.size === Buffer.byteLength(content, 'utf8'), String(value?.size))
  }

  // 4. an empty file is writable (the reason fs.write cannot reuse requireString)
  const empty = await post('fs.write', { path: TEMP_FILE, content: '' })
  check('POST fs.write accepts empty content', empty.status === 200 && JSON.parse(empty.text).ok === true)

  // 5. CRLF survives a read/write round trip byte for byte
  const crlf = 'alpha\r\nbeta\r\n'
  await post('fs.write', { path: TEMP_CRLF, content: crlf })
  const crlfRead = await post('fs.read', { path: TEMP_CRLF })
  const crlfValue = JSON.parse(crlfRead.text).value
  check('CRLF round trip is byte-identical', crlfValue?.content === crlf, JSON.stringify(crlfValue?.content))

  // 6. the workspace fence
  const outside = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/hostname'
  const outsideRead = await post('fs.read', { path: outside })
  check('read outside the workspace → 403 forbidden',
    outsideRead.status === 403 && JSON.parse(outsideRead.text).error?.code === 'forbidden', outsideRead.text.slice(0, 200))
  const outsideWrite = await post('fs.write', { path: `${outside}.dsh-file-editor-should-not-exist`, content: 'x' })
  check('write outside the workspace → 403 forbidden', outsideWrite.status === 403, outsideWrite.text.slice(0, 200))

  // 7. request guards
  const wrongMethod = await send('/file-editor/api/fs.read', { method: 'GET' })
  check('GET on the API → 405', wrongMethod.status === 405, `status ${wrongMethod.status}`)
  const unknown = await post('nope', {})
  check('unknown method → 404', unknown.status === 404, `status ${unknown.status}`)
  const nested = await send('/file-editor/api/fs/read', { method: 'POST', body: '{}' })
  check('nested method path → 404', nested.status === 404, `status ${nested.status}`)
  const badJson = await send('/file-editor/api/fs.read', { method: 'POST', body: '{not json' })
  check('malformed body → 400 bad-request', badJson.status === 400, `status ${badJson.status}`)

  // 8. the browser-trust fence
  const foreignApi = await send('/file-editor/api/fs.read', {
    method: 'POST', body: JSON.stringify({ sessionId: SESSION, cwd: WORKSPACE, path: TEMP_FILE }), host: 'evil.example',
  })
  check('foreign Host on the API → 403', foreignApi.status === 403, `status ${foreignApi.status}`)
  const foreignChunk = await send('/file-editor/bundle/editor.js', { host: 'evil.example' })
  check('foreign Host on the chunk route → 403', foreignChunk.status === 403, `status ${foreignChunk.status}`)
  const unknownChunk = await send('/file-editor/bundle/other.js')
  check('unlisted chunk name → 404', unknownChunk.status === 404, `status ${unknownChunk.status}`)

  // cleanup
  await rm(TEMP_FILE, { force: true })
  await rm(TEMP_CRLF, { force: true })
  check('temporary files cleaned up', !(await readFile(TEMP_FILE).then(() => true).catch(() => false)))

  const failed = results.filter(entry => !entry.ok)
  for (const entry of results) {
    console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ok ? '' : `  ← ${entry.detail}`}`)
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
}

main().catch((error) => {
  console.error('e2e run failed:', error)
  process.exitCode = 1
})