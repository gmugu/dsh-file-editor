/**
 * Unit tests for the dependency-free client modules: the resource-address
 * parser, the line-ending/BOM codec, the suffix table's invariants, and the
 * draft registry. Run with `npm test` (`node --test test/`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODE_EXTENSIONS, EDITOR_ID } from '../src/client/definition.js'
import { draftAddresses, dropDraft, peekDraft, putDraft } from '../src/client/drafts.js'
import { decodeSource, detectLineEnding, encodeSource } from '../src/client/editor/eol.js'
import { FILE_ADDRESS_PREFIX, parseFileAddress } from '../src/client/resource-address.js'
import { CODE_FONT_TOKEN_CSS, PREVIEW_BODY_SELECTOR } from '../src/client/theme-bridge.js'

test('parseFileAddress reads a session-scoped address', () => {
  const parsed = parseFileAddress(`${FILE_ADDRESS_PREFIX}session/s-1/src/a.ts`)
  assert.deepEqual(parsed, { scope: 'session', sessionId: 's-1', path: 'src/a.ts' })
})

test('parseFileAddress keeps an absolute path absolute inside the session scope', () => {
  const parsed = parseFileAddress(`${FILE_ADDRESS_PREFIX}session/s-1//outside/a.ts`)
  assert.deepEqual(parsed, { scope: 'session', sessionId: 's-1', path: '/outside/a.ts' })
})

test('parseFileAddress decodes encoded segments and survives #, ?, spaces', () => {
  const address = `${FILE_ADDRESS_PREFIX}session/s-1/dir%20with%20spaces/a%23b%3Fc.ts`
  const parsed = parseFileAddress(address)
  assert.deepEqual(parsed, { scope: 'session', sessionId: 's-1', path: 'dir with spaces/a#b?c.ts' })
})

test('parseFileAddress reads drive-letter and UNC absolute addresses', () => {
  assert.deepEqual(parseFileAddress(`${FILE_ADDRESS_PREFIX}absolute/C:/x/y.txt`), {
    scope: 'absolute',
    path: 'C:/x/y.txt',
  })
  assert.deepEqual(parseFileAddress(`${FILE_ADDRESS_PREFIX}absolute//server/share/x.txt`), {
    scope: 'absolute',
    path: '//server/share/x.txt',
  })
  assert.deepEqual(parseFileAddress(`${FILE_ADDRESS_PREFIX}absolute/home/me/x.txt`), {
    scope: 'absolute',
    path: '/home/me/x.txt',
  })
})

test('parseFileAddress rejects malformed addresses instead of throwing', () => {
  for (const bad of [
    '',
    'https://example.com/x',
    `${FILE_ADDRESS_PREFIX}`,
    `${FILE_ADDRESS_PREFIX}session/`,
    `${FILE_ADDRESS_PREFIX}session/s-1`,
    `${FILE_ADDRESS_PREFIX}absolute/`,
    `${FILE_ADDRESS_PREFIX}other/x`,
    `${FILE_ADDRESS_PREFIX}session/s-1/%E0%A4%A`,
  ]) {
    assert.equal(parseFileAddress(bad), undefined, `expected undefined for ${JSON.stringify(bad)}`)
  }
})

test('decodeSource strips a BOM and detects the line ending', () => {
  // Only the BOM is removed; the text itself is handed over untouched.
  assert.deepEqual(decodeSource('a\r\nb\r\n'), { bom: false, eol: '\r\n', text: 'a\r\nb\r\n' })
  assert.deepEqual(decodeSource('\uFEFFa\nb'), { bom: true, eol: '\n', text: 'a\nb' })
  assert.deepEqual(decodeSource('a\rb'), { bom: false, eol: '\r', text: 'a\rb' })
})

test('detectLineEnding uses the first separator, LF when there is none', () => {
  assert.equal(detectLineEnding('no separator'), '\n')
  assert.equal(detectLineEnding('a\r\nb\nc'), '\r\n')
  assert.equal(detectLineEnding('a\nb\r\nc'), '\n')
  assert.equal(detectLineEnding('\r\nfirst'), '\r\n')
})

test('encodeSource restores the file convention (LF stays byte-identical)', () => {
  assert.equal(encodeSource('a\nb\n', { bom: false, eol: '\n' }), 'a\nb\n')
  assert.equal(encodeSource('a\nb\n', { bom: false, eol: '\r\n' }), 'a\r\nb\r\n')
  assert.equal(encodeSource('a\nb\n', { bom: true, eol: '\r\n' }), '\uFEFFa\r\nb\r\n')
  assert.equal(encodeSource('a\nb\n', undefined), 'a\nb\n')
})

test('a CRLF document round-trips through decode/encode unchanged', () => {
  const source = 'line one\r\nline two\r\n'
  const decoded = decodeSource(source)
  // CodeMirror splits on \r\n and joins with \n, so this is what the editor
  // holds and what a save hands back to encodeSource.
  const editorDoc = decoded.text.replace(/\r\n/g, '\n')
  const edited = `${editorDoc}line three\n`
  assert.equal(encodeSource(edited, decoded), 'line one\r\nline two\r\nline three\r\n')
  // An unedited save of a CRLF file is byte-identical.
  assert.equal(encodeSource(editorDoc, decoded), source)
})

test('the suffix table is structurally sound', () => {
  // Since @deepseek-ai/dsh 0.2.0 the official code viewer registers
  // `CODE_HIGHLIGHT_EXTENSIONS` from @deepseek-ai/dsh-util-code-language, and
  // the authoritative equality check against the INSTALLED table is the live
  // drift guard in test/ranking.test.mjs ("CODE_EXTENSIONS stays in lockstep
  // with the installed official table"). Here we pin only the structural
  // invariants that hold regardless of the exact official contents.
  assert.equal(new Set(CODE_EXTENSIONS).size, CODE_EXTENSIONS.length, 'no duplicate suffixes')
  for (const extension of CODE_EXTENSIONS) {
    assert.match(extension, /^[a-z0-9]+$/, `"${extension}" must be a bare lowercase suffix`)
  }
  // Long-standing anchors of the official table — if these move, the copy was
  // edited by hand rather than resynchronized.
  for (const anchor of ['ts', 'js', 'py', 'md', 'fish', 'vue', 'nix', 'makefile']) {
    assert.ok(CODE_EXTENSIONS.includes(anchor), `"${anchor}" missing from the official copy`)
  }
  assert.equal(EDITOR_ID, 'dsh-file-editor:editor')
})

test('the draft registry keys by address, carries the source version, and stays replaceable', () => {
  const address = `${FILE_ADDRESS_PREFIX}session/s-1/src/a.ts`
  assert.equal(peekDraft(address), undefined)
  putDraft(address, { text: 'one', savedText: 'zero', encoding: { bom: false, eol: '\n' }, version: 'v1' })
  assert.equal(peekDraft(address).text, 'one')
  // The recorded version is what a later mount reports to the owner instead of
  // the current one, so an externally edited file still raises its banner.
  assert.equal(peekDraft(address).version, 'v1')
  putDraft(address, { text: 'two', savedText: 'zero', encoding: { bom: false, eol: '\n' }, version: 'v2' })
  assert.equal(peekDraft(address).text, 'two')
  assert.equal(peekDraft(address).version, 'v2')
  assert.deepEqual(draftAddresses(), [address])
  dropDraft(address)
  assert.equal(peekDraft(address), undefined)
  assert.deepEqual(draftAddresses(), [])
})

test('the preview code-font bridge derives the designed token and stays scoped', () => {
  // The official preview body reads `var(--dsw-font-mono, …)`, a token no DSH
  // package defines, so it fell back to a generic monospace stack. This rule
  // hands it the designed code font instead — and MUST stay scoped to the
  // preview body: the other two readers of that token (agent-preset, jobs) are
  // not this plugin's business.
  assert.equal(PREVIEW_BODY_SELECTOR, '[data-textpreview-body]')
  assert.ok(CODE_FONT_TOKEN_CSS.startsWith(`${PREVIEW_BODY_SELECTOR}{`))
  // Derived from the design code font (the code-block family token first, the
  // designed family as its fallback).
  assert.ok(CODE_FONT_TOKEN_CSS.includes('--dsw-font-mono:var(--dsw-font-markdown-code-block-font-family,var(--ds-font-family-code,'))
  assert.ok(!CODE_FONT_TOKEN_CSS.includes(':root'), 'a root-level definition would leak to other consumers')
})