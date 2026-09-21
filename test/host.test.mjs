/**
 * Host-half verification: the real /file-editor/api and /file-editor/bundle
 * handlers are driven with synthetic requests, so the checks run without HTTP
 * and without the deployment's login gate (dsh-login-gate wraps every
 * registered route, so an unauthenticated HTTP call never reaches a plugin).
 *
 * Everything a request would exercise is exercised: the dispatch and its
 * guards, the browser-trust fence, session cwd resolution (header first, then
 * the documented client fallback), path absolutization, the workspace fence
 * through realpath, bounded text reads with binary detection, and the atomic
 * write.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApiHandler } from '../lib/index.js'
import { createBundleRouteHandler } from '../lib/bundle-route.js'
import { isWithin } from '../lib/fs-tree.js'
import { resolveSessionPath } from '../lib/session-path.js'
import { isTrustedApiRequest } from '../lib/trust-fence.js'

const SESSION = 'session-1'
const READ_LIMIT = 2 << 20

let workspace
let outsideFile

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'dsh-file-editor-'))
  outsideFile = join(tmpdir(), `dsh-file-editor-outside-${Date.now()}.txt`)
  await writeFile(outsideFile, 'outside\n', 'utf8')
})

after(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(outsideFile, { force: true })
})

/** A request as the plugin handler sees it (async-iterable body included). */
function makeReq({ method = 'POST', url = '/file-editor/api/fs.read', host = '127.0.0.1:3080', headers = {}, body } = {}) {
  const chunks = body === undefined
    ? []
    : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')]
  return {
    method,
    url,
    // `host: null` means "send no Host header at all" (undefined would take the default).
    headers: { ...(host === null ? {} : { host }), ...headers },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** A response recorder. */
function makeRes() {
  const res = { statusCode: 0, headers: undefined, body: '' }
  res.writeHead = (statusCode, headers) => {
    res.statusCode = statusCode
    res.headers = headers
  }
  res.end = (chunk) => {
    if (chunk === undefined) return
    res.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  }
  return res
}

/** Drive one handler to completion; JSON bodies are unwrapped, scripts are not. */
async function call(handler, req) {
  const res = makeRes()
  await handler(req, res)
  const isJson = String(res.headers?.['content-type'] ?? '').startsWith('application/json')
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    json: isJson && res.body !== '' ? JSON.parse(res.body) : undefined,
  }
}

/** A host context whose session header carries `cwd` (or no session at all). */
function makeCtx({ cwd, sessionId = SESSION, trustedHosts = [] } = {}) {
  return {
    sessions: {
      get: (id) => (cwd !== undefined && id === sessionId ? { header: { cwd } } : undefined),
    },
    webRuntime: { trustedHosts },
  }
}

/** POST one API method against a handler built for `ctx`. */
function post(ctx, method, payload, extra) {
  return call(createApiHandler(ctx), makeReq({
    url: `/file-editor/api/${method}`,
    body: JSON.stringify(payload),
    ...extra,
  }))
}

test('write then read returns the identical bytes (unicode and CRLF included)', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const content = '第一行\r\nsecond line\n{"json":true}\n'
  const written = await post(ctx, 'fs.write', { sessionId: SESSION, path: 'notes/round-trip.txt', content })
  assert.equal(written.status, 200)
  assert.deepEqual(written.json, { ok: true, value: { ok: true, size: Buffer.byteLength(content, 'utf8') } })
  // The parent directory was created on demand, relative to the session cwd.
  assert.equal(await stat(join(workspace, 'notes', 'round-trip.txt')).then(() => true), true)

  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'notes/round-trip.txt' })
  assert.equal(read.status, 200)
  assert.deepEqual(read.json.value, {
    kind: 'text',
    content,
    truncated: false,
    size: Buffer.byteLength(content, 'utf8'),
  })
})

test('an empty file is writable (fs.write must not reject empty content)', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const written = await post(ctx, 'fs.write', { sessionId: SESSION, path: 'empty.txt', content: '' })
  assert.equal(written.status, 200)
  assert.equal(written.json.value.size, 0)
  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'empty.txt' })
  assert.deepEqual(read.json.value, { kind: 'text', content: '', truncated: false, size: 0 })
})

test('the session header supplies the workspace; the client cwd is only a fallback', async () => {
  const ctx = makeCtx({ cwd: workspace })
  // No cwd in the payload at all: the header is authoritative.
  const written = await post(ctx, 'fs.write', { sessionId: SESSION, path: 'header-cwd.txt', content: 'hi' })
  assert.equal(written.status, 200)
  assert.equal(await stat(join(workspace, 'header-cwd.txt')).then(() => true), true)

  // An unknown session falls back to the caller's cwd (documented hydration path).
  const fallbackCtx = makeCtx({})
  const fallback = await post(fallbackCtx, 'fs.write', {
    sessionId: 'unknown-session', cwd: workspace, path: 'fallback.txt', content: 'hi',
  })
  assert.equal(fallback.status, 200)
  assert.equal(await stat(join(workspace, 'fallback.txt')).then(() => true), true)

  // Neither: a loud bad-request, never a guess.
  const none = await post(fallbackCtx, 'fs.write', { sessionId: 'unknown-session', path: 'x.txt', content: 'hi' })
  assert.equal(none.status, 400)
  assert.equal(none.json.error.code, 'bad-request')

  // A relative cwd is not an absolute path: refused.
  const relative = await post(fallbackCtx, 'fs.write', {
    sessionId: 'unknown-session', cwd: 'relative/dir', path: 'x.txt', content: 'hi',
  })
  assert.equal(relative.status, 400)
  assert.equal(relative.json.error.code, 'bad-request')

  // A missing sessionId is a bad-request too.
  const noSession = await post(ctx, 'fs.read', { path: 'empty.txt' })
  assert.equal(noSession.status, 400)
})

test('the workspace fence refuses reads, writes and traversals outside the session root', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: outsideFile })
  assert.equal(read.status, 403)
  assert.equal(read.json.error.code, 'forbidden')

  const target = join(tmpdir(), `dsh-file-editor-escape-${Date.now()}.txt`)
  const write = await post(ctx, 'fs.write', { sessionId: SESSION, path: target, content: 'nope' })
  assert.equal(write.status, 403)
  assert.equal(write.json.error.code, 'forbidden')
  assert.equal(await stat(target).then(() => true).catch(() => false), false, 'nothing may be written outside')

  const traversal = await post(ctx, 'fs.read', { sessionId: SESSION, path: `../${basename(outsideFile)}` })
  assert.equal(traversal.status, 403)

  const traversalWrite = await post(ctx, 'fs.write', { sessionId: SESSION, path: '../escaped.txt', content: 'nope' })
  assert.equal(traversalWrite.status, 403)
})

test('a binary file is reported as binary with its leading bytes, never as text', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x41, 0x42])
  await writeFile(join(workspace, 'archive.bin'), bytes)
  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'archive.bin' })
  assert.equal(read.status, 200)
  assert.equal(read.json.value.kind, 'binary')
  assert.equal(read.json.value.size, bytes.length)
  assert.equal(read.json.value.truncated, false)
  assert.deepEqual(Buffer.from(read.json.value.head, 'base64'), bytes)
})

test('a file past the read cap is truncated and marked as such', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const size = READ_LIMIT + 512
  await writeFile(join(workspace, 'big.txt'), Buffer.alloc(size, 0x61))
  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'big.txt' })
  assert.equal(read.status, 200)
  assert.equal(read.json.value.kind, 'text')
  assert.equal(read.json.value.truncated, true)
  assert.equal(read.json.value.size, size)
  assert.equal(Buffer.byteLength(read.json.value.content, 'utf8'), READ_LIMIT)
})

test('unreadable targets fail as fs-error, not as a crash', async () => {
  const ctx = makeCtx({ cwd: workspace })
  await mkdir(join(workspace, 'a-directory'))
  const directory = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'a-directory' })
  assert.equal(directory.status, 400)
  assert.equal(directory.json.error.code, 'fs-error')

  const missing = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'not-there.txt' })
  assert.equal(missing.status, 400)
  assert.equal(missing.json.error.code, 'fs-error')

  const missingPath = await post(ctx, 'fs.read', { sessionId: SESSION, path: '' })
  assert.equal(missingPath.status, 400)
  assert.equal(missingPath.json.error.code, 'bad-request')
})

test('the write is atomic: no temp sibling is left behind', async () => {
  const ctx = makeCtx({ cwd: workspace })
  await post(ctx, 'fs.write', { sessionId: SESSION, path: 'atomic.txt', content: 'one' })
  await post(ctx, 'fs.write', { sessionId: SESSION, path: 'atomic.txt', content: 'two' })
  const entries = await readdir(workspace)
  assert.equal(entries.filter(name => name.includes('dsh-file-editor-tmp')).length, 0)
  const read = await post(ctx, 'fs.read', { sessionId: SESSION, path: 'atomic.txt' })
  assert.equal(read.json.value.content, 'two')
})

test('the dispatch guards method, route shape and body', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const get = await call(createApiHandler(ctx), makeReq({ method: 'GET', url: '/file-editor/api/fs.read' }))
  assert.equal(get.status, 405)

  const unknown = await post(ctx, 'nope', { sessionId: SESSION, path: 'x' })
  assert.equal(unknown.status, 404)

  const nested = await call(createApiHandler(ctx), makeReq({ url: '/file-editor/api/fs/read', body: '{}' }))
  assert.equal(nested.status, 404)

  const bare = await call(createApiHandler(ctx), makeReq({ url: '/file-editor/api', body: '{}' }))
  assert.equal(bare.status, 404)

  const malformed = await call(createApiHandler(ctx), makeReq({ url: '/file-editor/api/fs.read', body: '{nope' }))
  assert.equal(malformed.status, 400)
  assert.equal(malformed.json.error.code, 'bad-request')

  const noBody = await call(createApiHandler(ctx), makeReq({ url: '/file-editor/api/fs.read' }))
  assert.equal(noBody.status, 400)
})

test('the browser-trust fence is applied to the API', async () => {
  const ctx = makeCtx({ cwd: workspace })
  const payload = JSON.stringify({ sessionId: SESSION, path: 'empty.txt' })

  const foreign = await call(createApiHandler(ctx), makeReq({ body: payload, host: 'evil.example' }))
  assert.equal(foreign.status, 403)

  const noHost = await call(createApiHandler(ctx), makeReq({ body: payload, host: null }))
  assert.equal(noHost.status, 403)

  const crossSite = await call(createApiHandler(ctx), makeReq({ body: payload, headers: { 'sec-fetch-site': 'cross-site' } }))
  assert.equal(crossSite.status, 403)

  const crossOrigin = await call(createApiHandler(ctx), makeReq({ body: payload, headers: { origin: 'http://evil.example' } }))
  assert.equal(crossOrigin.status, 403)

  const loopback = await call(createApiHandler(ctx), makeReq({ body: payload }))
  assert.equal(loopback.status, 200)

  const trusted = await call(createApiHandler(makeCtx({ cwd: workspace, trustedHosts: ['nas.example:3080'] })), makeReq({
    body: payload,
    host: 'nas.example:3080',
  }))
  assert.equal(trusted.status, 200)
})

test('the bundle route serves the chunk, revalidates it, and fences it', async () => {
  const fence = (req) => isTrustedApiRequest(req, [])
  const handler = createBundleRouteHandler(fence)
  const request = (options) => makeReq({ method: 'GET', url: '/file-editor/bundle/editor.js', ...options })

  const first = await call(handler, request())
  assert.equal(first.status, 200)
  assert.equal(first.headers['content-type'], 'text/javascript; charset=utf-8')
  assert.equal(first.headers['cache-control'], 'no-cache')
  assert.match(first.headers.etag, /^"[0-9a-f]{12}"$/)
  assert.ok(first.body.includes('__dshFileEditorChunks__'), 'the served chunk is the built artifact')

  const revalidated = await call(handler, request({ headers: { 'if-none-match': first.headers.etag } }))
  assert.equal(revalidated.status, 304)
  assert.equal(revalidated.body, '')

  const stale = await call(handler, request({ headers: { 'if-none-match': '"000000000000"' } }))
  assert.equal(stale.status, 200)

  const foreign = await call(handler, request({ host: 'evil.example' }))
  assert.equal(foreign.status, 403)

  const other = await call(handler, makeReq({ method: 'GET', url: '/file-editor/bundle/terminal.js' }))
  assert.equal(other.status, 404)

  const traversal = await call(handler, makeReq({ method: 'GET', url: '/file-editor/bundle/..%2Fclient.js' }))
  assert.equal(traversal.status, 404)

  const wrongMethod = await call(handler, makeReq({ method: 'POST', url: '/file-editor/bundle/editor.js' }))
  assert.equal(wrongMethod.status, 405)

  const head = await call(handler, makeReq({ method: 'HEAD', url: '/file-editor/bundle/editor.js' }))
  assert.equal(head.status, 200)

  // A correctly named but unbuilt chunk is a loud 404, not an empty 200.
  const unbuilt = await call(createBundleRouteHandler(fence, tmpdir()), request())
  assert.equal(unbuilt.status, 404)
})

test('the ported path helpers keep their upstream semantics', () => {
  // isWithin: separator-tolerant, case-insensitive on Windows.
  assert.equal(isWithin('C:\\ws\\app', 'c:/WS/app/sub/file.ts', 'win32'), true)
  assert.equal(isWithin('C:\\ws\\app', 'C:\\ws\\application\\file.ts', 'win32'), false)
  assert.equal(isWithin('/srv/app', '/srv/app/sub', 'linux'), true)
  assert.equal(isWithin('/srv/app', '/srv/other', 'linux'), false)
  assert.equal(isWithin('/srv/app/', '/srv/app', 'linux'), true)

  // resolveSessionPath: only the unambiguous Windows-hosted WSL projection moves.
  assert.equal(resolveSessionPath('\\\\wsl.localhost\\Ubuntu\\home\\me', '/tmp/x', 'win32'), '\\\\wsl.localhost\\Ubuntu\\tmp\\x')
  assert.equal(resolveSessionPath('C:\\ws\\app', '/tmp/x', 'win32'), '/tmp/x')
  assert.equal(resolveSessionPath('C:\\ws\\app', 'C:\\ws\\app\\a.ts', 'win32'), 'C:\\ws\\app\\a.ts')
  assert.equal(resolveSessionPath('/srv/app', '/tmp/x', 'linux'), '/tmp/x')
})