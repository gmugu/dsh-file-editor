/**
 * The registration invariant this plugin's whole design rests on.
 *
 * The official preview owner (ui-sidebar-documentpreview's TextPreview) builds
 * its viewer menu from this exact ranking, and auto-selects `candidates[0]`:
 *
 *   rank   = priority === 'builtin' ? 0 : 1
 *   sort   = rank DESC, matched-suffix length DESC, registration order ASC
 *   filter = matched-suffix length > 0   (`name.endsWith('.' + suffix)`)
 *   then   = the plain-text fallback is APPENDED last, outside the ranking
 *
 * Two invariants are pinned here:
 *  1. on every OFFICIAL suffix the editor is never `candidates[0]` — the
 *     official read-only preview stays the default;
 *  2. on every EXTRA suffix (declared only because no official viewer declares
 *     it) the editor IS first and the official plain-text view is second — the
 *     documented exception, and the only way those files can have a menu at all.
 *
 * The functions below mirror that formula (lib/client.js of
 * @deepseek-ai/dsh-client-ui-sidebar-documentpreview). They are a specification
 * mirror, not the shipped code: the runtime check is the menu the user sees.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODE_EXTENSIONS, EDITOR_EXTENSIONS, EDITOR_ID, EXTRA_EXTENSIONS } from '../src/client/definition.js'

const PLAIN_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text'
const CODE_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code'
const MARKDOWN_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown'
const PDF_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf'
const IMAGE_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/image'
const EXCEL_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/excel'

/**
 * Suffixes the official definitions treat as binary or rich — captured from the
 * shipped bundle (@deepseek-ai/dsh 0.1.7-alpha.2): `BINARY_IMAGE_EXTENSIONS`
 * (bitmaps; `svg` is deliberately NOT one of them) plus
 * `UNVIEWABLE_BINARY_EXTENSIONS` (audio/video, archives, Office documents,
 * executables, fonts, disk images, databases, design files) plus `pdf`, plus
 * the spreadsheet viewer's suffixes (`xlsx` `xls` and the text-readable
 * `csv` `tsv` — new in 0.1.7-alpha.x; the editor no longer declares those).
 * Declaring any of these for the editor would make it the only candidate for
 * those files and strand the reader in a read-only "binary file" pane, so the
 * guard below forbids it.
 */
const OFFICIAL_RICH_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v',
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus',
  'zip', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'tar', 'jar',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'pages', 'numbers',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'class', 'pyc', 'wasm',
  'ttf', 'otf', 'woff', 'woff2', 'eot', 'dmg', 'iso', 'img',
  'sqlite', 'db', 'psd', 'ai', 'sketch', 'pdf',
  'csv', 'tsv',
])

/** The official definitions in their registration order, plus ours last. */
const DEFINITIONS = [
  { id: PLAIN_ID, extensions: [], priority: 'builtin', loading: 'text-pages' },
  { id: MARKDOWN_ID, extensions: ['md', 'markdown'], priority: 'builtin', loading: 'text-pages' },
  { id: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/html', extensions: ['html', 'htm'], priority: 'builtin', loading: 'text-pages' },
  { id: IMAGE_ID, extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'], priority: 'builtin', binaryExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'] },
  { id: PDF_ID, extensions: ['pdf'], priority: 'builtin', binaryExtensions: ['pdf'] },
  { id: EXCEL_ID, extensions: ['xlsx', 'xls', 'csv', 'tsv'], priority: 'builtin', binaryExtensions: ['xlsx', 'xls'] },
  { id: CODE_ID, extensions: CODE_EXTENSIONS, priority: 'builtin', loading: 'text-pages' },
  { id: EDITOR_ID, extensions: EDITOR_EXTENSIONS, priority: 'builtin', loading: 'renderer' },
]

function fileNameOf(path) {
  return path.replaceAll('\\', '/').split('/').pop().toLowerCase()
}

/**
 * The shipped matcher is `name.endsWith('.' + suffix)` — a LITERAL dot is
 * required, so a dot-less filename (Dockerfile, Makefile, LICENSE) can never be
 * matched by any implementation, whatever it declares.
 */
function matchedSuffixLength(name, extensions) {
  let best = 0
  for (const raw of extensions) {
    const extension = raw.toLowerCase().replace(/^\./, '')
    if (extension !== '' && name.endsWith(`.${extension}`) && extension.length > best) best = extension.length
  }
  return best
}

function matchingDefinitions(definitions, path) {
  const name = fileNameOf(path)
  return definitions
    .map((definition, order) => ({
      definition,
      order,
      rank: definition.priority === 'builtin' ? 0 : 1,
      length: matchedSuffixLength(name, definition.extensions),
    }))
    .filter(candidate => candidate.length > 0)
    .sort((left, right) => right.rank - left.rank || right.length - left.length || left.order - right.order)
    .map(candidate => candidate.definition)
}

function hasBinarySuffix(definitions, path) {
  const name = fileNameOf(path)
  return definitions.some(definition => matchedSuffixLength(name, definition.binaryExtensions ?? []) > 0)
}

/** The owner's candidate list, in menu order. */
function viewerMenu(path) {
  const matched = matchingDefinitions(DEFINITIONS, path)
  if (matched.length > 0 && hasBinarySuffix(DEFINITIONS, path)) return matched
  const fallback = DEFINITIONS.find(definition => definition.id === PLAIN_ID)
  return fallback === undefined ? matched : [...matched, fallback]
}

test('a TypeScript file defaults to the official code preview and lists the editor second', () => {
  const menu = viewerMenu('src/a.ts')
  assert.deepEqual(menu.map(entry => entry.id), [CODE_ID, EDITOR_ID, PLAIN_ID])
  assert.equal(menu[0].id, CODE_ID, 'the default stays the official read-only preview')
})

test('a Markdown file defaults to the rendered Markdown preview, editor third', () => {
  const menu = viewerMenu('docs/readme.md')
  assert.deepEqual(menu.map(entry => entry.id), [MARKDOWN_ID, CODE_ID, EDITOR_ID, PLAIN_ID])
  assert.equal(menu[0].id, MARKDOWN_ID)
})

test('binary files never offer the editor (their matched list drops the plain fallback)', () => {
  assert.deepEqual(viewerMenu('shot.png').map(entry => entry.id), [IMAGE_ID])
  assert.deepEqual(viewerMenu('doc.pdf').map(entry => entry.id), [PDF_ID])
})

test('a dot-less filename has no viewer menu under any registration strategy', () => {
  // Every match requires a literal '.' (`name.endsWith('.' + suffix)`), so no
  // `extensions` declaration can ever claim these. Their single plain-text
  // candidate is why no menu renders — structural, not a policy choice.
  for (const dotless of ['Dockerfile', 'Makefile', 'LICENSE', 'README']) {
    assert.deepEqual(viewerMenu(dotless).map(entry => entry.id), [PLAIN_ID], dotless)
  }
  // A dotfile IS matchable — its leading dot is the separator.
  assert.equal(matchedSuffixLength('.gitignore', ['gitignore']), 9)
})

test('an extra suffix is the documented exception: editor first, official plain text second', () => {
  for (const extension of EXTRA_EXTENSIONS) {
    // `svg` is the one deliberate exception AMONG the extras: an official viewer
    // already claims it (and keeps it out of its binary set), so declaring it
    // adds a menu entry without changing any default — pinned separately below.
    if (extension === 'svg') continue
    assert.deepEqual(viewerMenu(`src/sample.${extension}`).map(entry => entry.id), [EDITOR_ID, PLAIN_ID], `.${extension}`)
  }
  // The dotfile shapes the extras really exist for.
  assert.deepEqual(viewerMenu('.env').map(entry => entry.id), [EDITOR_ID, PLAIN_ID])
  assert.deepEqual(viewerMenu('.gitignore').map(entry => entry.id), [EDITOR_ID, PLAIN_ID])
})

test('svg keeps the official image preview as its default and gains the editor', () => {
  // The official image definition declares svg but leaves it OUT of its binary
  // set on purpose ("SVG's XML source is worth reading"), so this extra is pure
  // gain: the image preview stays candidates[0] and the menu gains an editor.
  const menu = viewerMenu('assets/icon.svg').map(entry => entry.id)
  assert.deepEqual(menu, [IMAGE_ID, EDITOR_ID, PLAIN_ID])
  assert.equal(menu[0], IMAGE_ID, 'the image preview stays the default')
})

test('no extra suffix collides with an official suffix set', () => {
  const official = new Set(CODE_EXTENSIONS)
  for (const extension of EXTRA_EXTENSIONS) {
    assert.ok(!official.has(extension), `"${extension}" duplicates an official suffix`)
    assert.ok(!OFFICIAL_RICH_EXTENSIONS.has(extension), `"${extension}" is binary/rich for an official viewer`)
    assert.ok(matchedSuffixLength(`sample.${extension}`, [extension]) > 0, `"${extension}" must be matchable`)
  }
  assert.equal(new Set(EXTRA_EXTENSIONS).size, EXTRA_EXTENSIONS.length, 'no duplicate extras')
  // The interaction that keeps the exception narrow: a name carrying BOTH an
  // official suffix and an extra one still defaults to the official viewer,
  // because both are `builtin` and the official one registered first.
  assert.deepEqual(viewerMenu('.eslintrc.json').map(entry => entry.id), [CODE_ID, EDITOR_ID, PLAIN_ID])
  assert.deepEqual(viewerMenu('config/prod.env.json').map(entry => entry.id), [CODE_ID, EDITOR_ID, PLAIN_ID])
})

test('for every declared suffix the editor is present, never first, and before the plain fallback', () => {
  for (const extension of CODE_EXTENSIONS) {
    const menu = viewerMenu(`src/sample.${extension}`)
    const ids = menu.map(entry => entry.id)
    const editorIndex = ids.indexOf(EDITOR_ID)
    assert.ok(editorIndex > 0, `editor must exist and not be the default for .${extension} (got ${ids.join(', ')})`)
    assert.notEqual(ids[0], EDITOR_ID, `.${extension} must default to an official implementation`)
    assert.equal(ids[ids.length - 1], PLAIN_ID, `.${extension}: the plain fallback is last`)
    assert.ok(editorIndex < ids.length - 1, `.${extension}: the editor precedes the plain fallback`)
    for (let index = 0; index < editorIndex; index += 1) {
      assert.notEqual(ids[index], EDITOR_ID)
    }
  }
})