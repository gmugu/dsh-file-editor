/**
 * Lazy chunk loader for the editor bundle.
 *
 * Ported and narrowed from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/chunk-loader.ts: one chunk instead of four, this plugin's own
 * page globals instead of upstream's, and no HMR revalidation (a page refresh is
 * the reset). The mechanism is unchanged:
 *
 *   globalThis.__dshFileEditorChunks__['editor'] = (require) => { …exports }
 *
 * The chunk script registers its factory on a plugin-owned global registry —
 * NOT through `window.__ModuleLoader__.load`, because the module loader's
 * import() only resolves seed words, shell-own modules, registered factories
 * and boot-graph rows; a chunk id is none of those. Materialization is
 * plugin-owned:
 *
 * 1. inject `<script src="/file-editor/bundle/editor.js">` (a classic
 *    same-origin script; the official /plugins/<id>/client.js route cannot
 *    serve arbitrary file names, so the plugin's own host route serves it),
 * 2. read the factory from the global registry,
 * 3. call it with a `require` that resolves the platform externals through the
 *    injected client module system's `import(spec)` (the `ctx.modules`
 *    service) — the seed-word branch, the one part of the module system that
 *    is stable across versions.
 *
 * Caching: one in-flight promise, memoized until it settles; a failure removes
 * the entry so the next attempt re-injects the script (whose re-execution
 * overwrites the registry slot by assignment, never by registration).
 */

/** The one chunk this plugin ships. */
const CHUNK_NAME = 'editor'

/** Chunk script endpoint served by the plugin host half (lib/bundle-route.js). */
const CHUNK_URL = `/file-editor/bundle/${CHUNK_NAME}.js`

/**
 * The platform externals the editor chunk may require (mirror of the build's
 * `--external` list in build/build.mjs). Everything the chunk needs beyond
 * these — all of CodeMirror and @lezer — is bundled into the chunk itself.
 */
const CHUNK_EXTERNALS = ['react', 'react/jsx-runtime']

/**
 * Plugin-owned page global carrying the injected module system, so a chunk
 * script (or a second copy of the core bundle) can still find it.
 */
const MODULE_SYSTEM_GLOBAL = '__dshFileEditorModuleSystem__'

/** The plugin-owned chunk factory registry the chunk script populates. */
const CHUNK_REGISTRY_GLOBAL = '__dshFileEditorChunks__'

/** The module system injected by the client half at activation. */
let injectedModuleSystem

/**
 * Inject the client module system the chunk externals resolve through.
 * Called by the client half's apply() with `ctx.modules`; pass undefined to
 * clear. Survives a chunk-cache reset — the module system is shell state.
 */
export function setChunkModuleSystem(system) {
  injectedModuleSystem = system
  const global = globalThis
  if (system === undefined) delete global[MODULE_SYSTEM_GLOBAL]
  else global[MODULE_SYSTEM_GLOBAL] = system
}

/** The shell-installed module system (injected, then the shared global). */
function moduleSystem() {
  return injectedModuleSystem ?? globalThis[MODULE_SYSTEM_GLOBAL]
}

/** The plugin-owned chunk factory registry. */
function chunkRegistry() {
  const global = globalThis
  if (global[CHUNK_REGISTRY_GLOBAL] === undefined) global[CHUNK_REGISTRY_GLOBAL] = {}
  return global[CHUNK_REGISTRY_GLOBAL]
}

/** Inject one chunk script and await its load. */
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script')
    element.async = true
    element.src = src
    element.addEventListener('load', () => {
      element.remove()
      resolve()
    }, { once: true })
    element.addEventListener('error', () => {
      element.remove()
      reject(new Error(`[dsh-file-editor] chunk script ${src} failed to load`))
    }, { once: true })
    document.head.append(element)
  })
}

/** Memoized externals require, resolved once per page from the seed table. */
let externalsRequire

async function buildExternalsRequire(modules) {
  if (externalsRequire !== undefined) return externalsRequire
  // Per-spec tolerance: a spec the running DSH version cannot resolve stays
  // unresolved until the chunk actually requires it — only then it is a loud
  // error, and the failure clears the chunk cache so a retry can rebuild.
  const entries = await Promise.all(CHUNK_EXTERNALS.map(async (spec) => {
    try {
      return [spec, await modules.import(spec)]
    } catch {
      return [spec, undefined]
    }
  }))
  const table = new Map(entries)
  externalsRequire = (spec) => {
    if (!table.has(spec)) {
      throw new Error(`[dsh-file-editor] chunk require('${spec}') missed the module table`)
    }
    return table.get(spec)
  }
  return externalsRequire
}

/** In-flight/memoized chunk load; a failure removes its entry so a retry re-fetches. */
let cache

/**
 * Load (once) and materialize the editor chunk, returning its module exports.
 * Concurrent callers share one in-flight load; a failure clears the cache entry
 * so the next call retries from scratch.
 * @returns the chunk's exports (`{ TextEditor }`).
 */
export async function loadEditorChunk() {
  if (cache !== undefined) return cache
  const task = (async () => {
    const modules = moduleSystem()
    if (modules === undefined) {
      throw new Error('[dsh-file-editor] editor chunk: client module system unavailable')
    }
    await injectScript(CHUNK_URL)
    const factory = chunkRegistry()[CHUNK_NAME]
    if (typeof factory !== 'function') {
      throw new Error('[dsh-file-editor] editor chunk script did not register its factory')
    }
    const require = await buildExternalsRequire(modules)
    return factory(require)
  })()
  cache = task
  task.catch(() => {
    if (cache === task) cache = undefined
  })
  return task
}

/** Drop the memoized load (a manual retry after a failed chunk load). */
export function resetEditorChunk() {
  cache = undefined
  externalsRequire = undefined
}