/**
 * dsh-file-editor — host half.
 *
 * The read/write half of the right-sidebar editor, extracted from
 * dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar): the `fs.read` and
 * `fs.write` methods of its fenced /sidebar/api JSON RPC, re-homed under this
 * plugin's own /file-editor/api prefix so the two plugins can coexist.
 * fs-tree.js, path-security.js, session-path.js, wire.js and trust-fence.js
 * are verbatim (or near-verbatim) ports of the upstream sources; only the
 * route dispatch and the path resolution below are new glue.
 *
 * Every operation runs inside the SESSION's workspace: the working directory
 * comes from the session header (never from the caller) unless the session is
 * still hydrating, the client-supplied path is resolved against that
 * directory, and the resolved target is fenced to the workspace through
 * realpath — so a caller can never read or write outside the session's own
 * tree.
 *
 * Deliberate differences from upstream (also recorded in README.md):
 *  - the request body cap is 8 MiB, not 1 MiB, so a file larger than 1 MiB can
 *    actually be saved back;
 *  - the workspace fence is always armed (upstream exposes a `workspaceFence`
 *    setting; this plugin has no settings page);
 *  - a path that is not absolute is resolved against the session cwd HERE,
 *    so the client never has to send a cwd at all (upstream trusts a
 *    client-supplied cwd);
 *  - `fs.tree`, `fs.search`, `fs.rename`, `fs.remove` and the upload route are
 *    not carried over: v1 edits files the official Files tab opens.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { requireAbsolute, messageOf } from './fs-tree.js'
import { ensureWorkspacePath, ensureWorkspaceWritePath } from './path-security.js'
import { registerBundleRoute } from './bundle-route.js'
import { resolveSessionPath } from './session-path.js'
import { isTrustedApiRequest } from './trust-fence.js'
import { FileEditorError, readJsonBody, requireString, requireText, writeError, writeOk } from './wire.js'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-file-editor'

/** Services required before mounting: the route table, session store, and web runtime's trusted hosts. */
export const inject = ['webServer', 'sessions', 'webRuntime']

/** Text read cap. A longer file is reported truncated and the editor refuses to save it. */
const READ_LIMIT = 2 << 20

/** How many leading bytes a binary read returns for client-side sniffing. */
const READ_HEAD_LIMIT = 4096

/** URL prefix of this plugin's JSON API. */
const API_PREFIX = '/file-editor/api'

/**
 * Resolve a session's working directory. The attached session header is
 * authoritative; while the session is still hydrating (the web client attaches
 * the current conversation a moment after page load) a caller-supplied cwd is
 * accepted as a fallback, and it is still absolutized and fenced like any
 * other path. Unlike upstream there is no session-persistence index fallback:
 * a session with neither degrades to a bad-request.
 */
function sessionCwdOf(ctx, sessionId, clientCwd) {
  const session = ctx.sessions.get(sessionId)
  const headerCwd = session?.header?.cwd
  if (typeof headerCwd === 'string' && headerCwd !== '') return headerCwd
  if (typeof clientCwd === 'string' && clientCwd !== '') {
    try {
      return requireAbsolute(clientCwd)
    } catch {
      throw new FileEditorError('bad-request', `invalid working directory "${clientCwd}"`)
    }
  }
  throw new FileEditorError('bad-request', `session "${sessionId}" has no working directory`)
}

/**
 * Resolve one API-supplied path to a host path: an absolute path is projected
 * into the session's namespace (WSL UNC), a relative one joins the session
 * cwd. Containment is decided later, through realpath, by the workspace guards.
 */
function absolutize(cwd, target) {
  const projected = resolveSessionPath(cwd, target)
  return isAbsolute(projected) ? projected : resolve(cwd, projected)
}

/**
 * Text/binary read of a file with the size cap; binary detection via a NUL
 * probe. Ported from upstream index.ts `readText`, which is itself the shape
 * the client's viewer switches on. Both branches carry the file's real `size`
 * and the `truncated` flag, so the editor can say what it is showing instead
 * of silently cutting the document.
 */
async function readText(path, readLimit) {
  const info = await stat(path).catch((error) => {
    throw new FileEditorError('fs-error', `cannot read "${path}": ${messageOf(error)}`, 400)
  })
  if (info.isDirectory()) {
    throw new FileEditorError('fs-error', `"${path}" is a directory`, 400)
  }
  const size = info.size
  const truncated = size > readLimit
  const handle = await open(path, 'r').catch((error) => {
    throw new FileEditorError('fs-error', `cannot read "${path}": ${messageOf(error)}`, 400)
  })
  try {
    const buffer = Buffer.alloc(Math.min(size, readLimit))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const slice = buffer.subarray(0, bytesRead)
    if (slice.includes(0)) {
      return {
        kind: 'binary',
        size,
        truncated,
        head: slice.subarray(0, Math.min(slice.length, READ_HEAD_LIMIT)).toString('base64'),
      }
    }
    return { kind: 'text', content: slice.toString('utf8'), truncated, size }
  } finally {
    await handle.close()
  }
}

/**
 * Atomic text write: a uniquely named temp sibling receives the bytes, then is
 * renamed over the target, so a failed or interrupted write never leaves a
 * partial file at the target path. The parent directory is created on demand.
 * Ported from upstream's `fs.write`, with a per-call unique temp name instead
 * of upstream's pid-only name (two concurrent saves of one file must not
 * collide).
 */
async function writeText(path, content) {
  const tmp = `${path}.dsh-file-editor-tmp-${process.pid}-${randomUUID().slice(0, 8)}`
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw new FileEditorError('fs-error', `cannot write "${path}": ${messageOf(error)}`, 400)
  }
  const info = await stat(path).catch(() => undefined)
  return { ok: true, size: info?.size ?? Buffer.byteLength(content, 'utf8') }
}

/** The API dispatch table. */
function buildApi(ctx) {
  /** Resolve one request's session scope: the workspace root every path is fenced to. */
  const scopeOf = (payload) => {
    const sessionId = requireString(payload, 'sessionId')
    const clientCwd = typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : undefined
    return { sessionId, cwd: sessionCwdOf(ctx, sessionId, clientCwd) }
  }
  return {
    'fs.read': async (payload) => {
      const { cwd } = scopeOf(payload)
      const path = await ensureWorkspacePath(cwd, absolutize(cwd, requireString(payload, 'path')), true)
      return readText(path, READ_LIMIT)
    },
    'fs.write': async (payload) => {
      const { cwd } = scopeOf(payload)
      const path = await ensureWorkspaceWritePath(cwd, absolutize(cwd, requireString(payload, 'path')), true)
      return writeText(path, requireText(payload, 'content'))
    },
  }
}

/**
 * Build the fenced /file-editor/api request handler.
 *
 * Exported so the host half can be verified by driving the real handler with
 * synthetic requests (test/host.test.mjs): in this deployment dsh-login-gate
 * wraps every registered route, so an unauthenticated HTTP call reaches the
 * gate (302/401) rather than the plugin.
 *
 * @param ctx - host plugin context (webServer, sessions, webRuntime).
 */
export function createApiHandler(ctx) {
  const fence = (req) => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)
  const api = buildApi(ctx)
  return async (req, res) => {
    if (!fence(req)) {
      writeError(res, new FileEditorError('forbidden', 'forbidden', 403))
      return
    }
    if (req.method !== 'POST') {
      writeError(res, new FileEditorError('method-error', 'method not allowed', 405))
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : undefined
    if (method === undefined || method.includes('/')) {
      writeError(res, new FileEditorError('not-found', 'unknown file-editor API method', 404))
      return
    }
    try {
      const payload = await readJsonBody(req)
      const handler = api[method]
      if (handler === undefined) {
        throw new FileEditorError('not-found', `unknown file-editor API method "${method}"`, 404)
      }
      writeOk(res, await handler(payload))
    } catch (error) {
      writeError(res, error)
    }
  }
}

/**
 * Plugin body: mount the fenced /file-editor/api and /file-editor/bundle routes.
 * @param ctx - host plugin context (webServer, sessions, webRuntime).
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: createApiHandler(ctx),
  }), 'dsh-file-editor: /file-editor/api routes')

  ctx.effect(() => registerBundleRoute(ctx, (req) => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)), 'dsh-file-editor: /file-editor/bundle route')
}