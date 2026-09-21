/**
 * Lazy chunk route: serves the client bundle's chunk scripts
 * (/file-editor/bundle/<name>.js).
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/bundle-route.ts, narrowed to this plugin's one chunk name and its own
 * URL prefix. The official /plugins/<id>/client.js route cannot serve
 * arbitrary file names, so the plugin serves its own split bundle
 * (lib/client-editor.js) here; the client injects the script on first use of
 * the editor (see src/client/chunk-loader.js).
 *
 * Caching contract: every response carries `cache-control: no-cache` plus an
 * ETag (content hash, memoized per file by mtime/size) and honors
 * If-None-Match — so a page refresh revalidates the multi-MB chunk instead of
 * re-downloading it. Same browser-trust fence as the API routes; only
 * allowlisted chunk names are servable (no path traversal).
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The chunk names the client may request (mirror of src/client/chunk-loader.js). */
export const CHUNK_NAMES = ['editor']

/** URL prefix of this plugin's chunk route. */
export const BUNDLE_PREFIX = '/file-editor/bundle'

/** Directory of this host-half module (lib/ — the chunk scripts live next to it). */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** sha1 content hash shortened to 12 hex chars (same shape as the client-modules rev). */
function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

/** ETag memo: recompute the content hash only when the file's stat changed. */
const etags = new Map()

/**
 * The chunk file's ETag (quoted hash), or undefined when the file is
 * missing. Hash is recomputed only when mtime/size changed (hashing a
 * multi-MB chunk per request is wasteful).
 */
async function etagOf(name, chunkDir) {
  const path = join(chunkDir, `client-${name}.js`)
  const key = `${chunkDir}:${name}`
  try {
    const info = await stat(path)
    const memo = etags.get(key)
    if (memo !== undefined && memo.mtimeMs === info.mtimeMs && memo.size === info.size) {
      return memo.etag
    }
    const etag = `"${shortHash(await readFile(path))}"`
    etags.set(key, { mtimeMs: info.mtimeMs, size: info.size, etag })
    return etag
  } catch {
    return undefined
  }
}

/**
 * Build the /file-editor/bundle route handler. `fence` is the shared
 * browser-trust check every route applies; `chunkDir` is the directory the
 * chunk scripts live in (overridable for tests).
 */
export function createBundleRouteHandler(fence, chunkDir = LIB_DIR) {
  return async (req, res) => {
    if (!fence(req)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const match = /^\/file-editor\/bundle\/([a-z0-9-]+)\.js$/.exec(pathname)
    const name = match?.[1]
    if (name === undefined || !CHUNK_NAMES.includes(name)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const etag = await etagOf(name, chunkDir)
    if (etag === undefined) {
      // Registered name but unreadable (bundle not built yet): loud 404.
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (req.headers['if-none-match'] === etag) {
      // Revalidation hit: unchanged chunk, no body.
      res.writeHead(304, { 'cache-control': 'no-cache', etag })
      res.end()
      return
    }
    try {
      const body = await readFile(join(chunkDir, `client-${name}.js`))
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
        etag,
      })
      res.end(body)
    } catch {
      // Read raced a delete/rebuild between the stat and the read.
      res.writeHead(404)
      res.end('not found')
    }
  }
}

/** Register the /file-editor/bundle route (disposed with the fiber). */
export function registerBundleRoute(ctx, fence) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BUNDLE_PREFIX,
    handler: createBundleRouteHandler(fence),
  })
}