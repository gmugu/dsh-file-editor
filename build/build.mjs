/**
 * dsh-file-editor build.
 *
 * Emits the two client artifacts the DSH browser module system expects, from
 * ordinary ESM/JSX sources:
 *
 *   lib/client.js         the core bundle  → window.__ModuleLoader__.load({id, factory})
 *   lib/client-editor.js  the lazy editor chunk (CodeMirror 6 bundled in)
 *                                          → globalThis.__dshFileEditorChunks__['editor'] = (require) => …
 *
 * Both envelopes are the ones observed in this deployment (dsh-sidebar-git's
 * and dsh-better-sidebar's shipped bundles): esbuild emits CommonJS, the
 * wrapper supplies `module`/`exports` and hands back `module.exports`.
 *
 * Externals are resolved at runtime from the shell's frozen module table — the
 * core bundle's React, and the chunk's React — so nothing platform-owned is
 * duplicated into either artifact. CodeMirror and @lezer are NOT external: the
 * chunk carries them, which is the whole point of the split.
 *
 * Dependency resolution: esbuild resolves the CodeMirror packages from
 * node_modules, i.e. from this workspace's devDependencies. When the registry
 * is unreachable, point NODE_PATH (or the MODULE_PATHS env var below) at an
 * existing installation to build offline.
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'lib')
const CORE_ENTRY = join(ROOT, 'src/client/index.jsx')
const CHUNK_ENTRY = join(ROOT, 'src/client/editor/chunk.jsx')

/** Platform-owned modules the shell's module table answers. */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
]

/** Extra resolution roots (offline builds); `nodePaths` is esbuild's NODE_PATH. */
const nodePaths = (process.env.MODULE_PATHS ?? '')
  .split(/[;,]/)
  .map(entry => entry.trim())
  .filter(entry => entry !== '')

/** Bundle one entry to CommonJS text (no file written). */
async function bundle(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120'],
    jsx: 'automatic',
    external: PLATFORM_EXTERNALS,
    ...(nodePaths.length > 0 ? { nodePaths } : {}),
    logLevel: 'warning',
    charset: 'utf8',
  })
  const outputs = result.outputFiles
  if (outputs === undefined || outputs.length !== 1) {
    throw new Error(`expected exactly one output for ${entry}, got ${outputs?.length ?? 0}`)
  }
  return outputs[0].text
}

/** Wrap a core bundle as a module-loader factory (id = package name). */
function coreEnvelope(code) {
  return `window.__ModuleLoader__.load({
\tid: "dsh-file-editor",
\tfactory: function (require) {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${code}
\t\treturn module.exports;
\t}
});
`
}

/** Wrap the editor bundle as a lazily materialized chunk factory. */
function chunkEnvelope(code) {
  return `globalThis.__dshFileEditorChunks__ = globalThis.__dshFileEditorChunks__ || {};
globalThis.__dshFileEditorChunks__["editor"] = function (require) {
\tvar module = { exports: {} };
\tvar exports = module.exports;
${code}
\treturn module.exports;
};
`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const [core, chunk] = await Promise.all([bundle(CORE_ENTRY), bundle(CHUNK_ENTRY)])
  const coreFile = join(OUT_DIR, 'client.js')
  const chunkFile = join(OUT_DIR, 'client-editor.js')
  await writeFile(coreFile, coreEnvelope(core), 'utf8')
  await writeFile(chunkFile, chunkEnvelope(chunk), 'utf8')
  const kib = (value) => `${Math.round(value / 1024)} KiB`
  console.log(`[dsh-file-editor] lib/client.js        ${kib(Buffer.byteLength(core, 'utf8'))}`)
  console.log(`[dsh-file-editor] lib/client-editor.js ${kib(Buffer.byteLength(chunk, 'utf8'))}`)
}

main().catch((error) => {
  console.error('[dsh-file-editor] build failed:', error)
  process.exitCode = 1
})