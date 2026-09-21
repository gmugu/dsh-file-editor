/**
 * The extension → CodeMirror language mapping. This test imports the real
 * language table, so it needs the workspace devDependencies installed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extOf, languageForPath, languageKeyForExt, supportedLanguageKeys } from '../src/client/editor/lang.js'

test('extOf reads the last segment extension, lowercased', () => {
  assert.equal(extOf('a/b/c.TS'), 'ts')
  assert.equal(extOf('C:\\ws\\x.tsx'), 'tsx')
  assert.equal(extOf('dir.d/file'), '')
  assert.equal(extOf('noext'), '')
  assert.equal(extOf(''), '')
})

test('languageKeyForExt maps the families the editor documents', () => {
  const cases = {
    ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx',
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
    json: 'json', md: 'md', markdown: 'md',
    py: 'python', html: 'html', htm: 'html', css: 'css',
    xml: 'xml', xsl: 'xml', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', java: 'java', cs: 'csharp', kt: 'kotlin', kts: 'kotlin',
    c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', rs: 'rust', go: 'go', php: 'php',
    sh: 'shell', toml: 'toml', conf: 'nginx', env: 'properties', vue: 'vue',
    scss: 'scss', sass: 'sass', less: 'less', rb: 'ruby', lua: 'lua', ps1: 'powershell',
  }
  for (const [extension, key] of Object.entries(cases)) {
    assert.equal(languageKeyForExt(extension), key, `extension ${extension}`)
  }
})

test('ambiguous suffixes stay plain text on purpose', () => {
  // '.v' is Verilog/Coq/V and '.m' is Objective-C/MATLAB: a wrong highlight
  // misleads more than plain text does.
  assert.equal(languageKeyForExt('v'), null)
  assert.equal(languageKeyForExt('m'), null)
  assert.equal(languageKeyForExt(''), null)
  assert.equal(languageKeyForExt('nope'), null)
})

test('every mapped key is produced by a real factory', () => {
  const keys = new Set(supportedLanguageKeys())
  for (const extension of ['ts', 'js', 'md', 'py', 'html', 'css', 'xml', 'yaml', 'sql', 'java', 'cpp', 'rs', 'go', 'php', 'sh', 'toml', 'vue', 'scss', 'rb', 'lua', 'ps1', 'conf', 'env']) {
    const key = languageKeyForExt(extension)
    assert.ok(key !== null && keys.has(key), `no factory for ${extension} (${key})`)
  }
})

test('languageForPath builds a support object, or null for plain text', () => {
  assert.notEqual(languageForPath('src/a.ts'), null)
  assert.notEqual(languageForPath('notes.md'), null)
  assert.notEqual(languageForPath('conf/nginx.conf'), null)
  assert.equal(languageForPath('README'), null)
  assert.equal(languageForPath('data.unknownext'), null)
})