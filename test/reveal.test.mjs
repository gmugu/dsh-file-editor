/**
 * The line-targeting rules that turn a tab navigation into an editor reveal.
 *
 * The input is host data at runtime (`tab.navigation.params` is whatever the
 * opener passed), so the parsing survives junk; the token is the part that has
 * to be right, because it is the only thing that makes a SECOND click on the
 * same `file:42` link reveal the line again.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampLine, navigationReveal, parseRevealLine } from '../src/client/reveal.js'

test('a reveal line is a positive safe integer and nothing else', () => {
  assert.equal(parseRevealLine(1), 1)
  assert.equal(parseRevealLine(42), 42)
  assert.equal(parseRevealLine(0), undefined)
  assert.equal(parseRevealLine(-3), undefined)
  assert.equal(parseRevealLine(3.5), undefined)
  assert.equal(parseRevealLine('12'), undefined)
  assert.equal(parseRevealLine(undefined), undefined)
  assert.equal(parseRevealLine(null), undefined)
  assert.equal(parseRevealLine(Number.NaN), undefined)
  assert.equal(parseRevealLine(Number.POSITIVE_INFINITY), undefined)
})

test('a requested line is clamped onto the document that is on screen', () => {
  assert.equal(clampLine(10, 3), 3)
  assert.equal(clampLine(2, 10), 2)
  assert.equal(clampLine(1, 1), 1)
  assert.equal(clampLine(5, 0), undefined)
  assert.equal(clampLine(5, undefined), undefined)
  assert.equal(clampLine(undefined, 5), undefined)
  assert.equal(clampLine(5, 2.7), 2)
})

test('no navigation, no reveal', () => {
  assert.deepEqual(navigationReveal(undefined), { line: undefined, token: '' })
  assert.deepEqual(navigationReveal(null), { line: undefined, token: '' })
  assert.deepEqual(navigationReveal({}), { line: undefined, token: '' })
  assert.deepEqual(navigationReveal({ params: {} }), { line: undefined, token: '' })
  assert.deepEqual(navigationReveal({ params: { line: '7' } }), { line: undefined, token: '' })
  assert.deepEqual(navigationReveal({ params: { line: 0 } }), { line: undefined, token: '' })
})

test('a targeted navigation carries the line and a token over address, revision and line', () => {
  const view = navigationReveal({
    address: 'dsh-resource://file/session/session-1/notes.txt',
    params: { line: 7 },
    revision: 1,
  })
  assert.equal(view.line, 7)
  assert.match(view.token, /notes\.txt/)
  assert.match(view.token, /\u00001\u00007$/)

  // A repeat click on the same link: same address and line, new revision — the
  // token MUST change, otherwise the reveal never fires a second time.
  const again = navigationReveal({
    address: 'dsh-resource://file/session/session-1/notes.txt',
    params: { line: 7 },
    revision: 2,
  })
  assert.equal(again.line, 7)
  assert.notEqual(again.token, view.token)

  // Another file at the same line must not reuse the token either.
  const other = navigationReveal({
    address: 'dsh-resource://file/session/session-1/readme.txt',
    params: { line: 7 },
    revision: 1,
  })
  assert.notEqual(other.token, view.token)

  // Missing address or revision still yields a usable token.
  const bare = navigationReveal({ params: { line: 3 } })
  assert.equal(bare.line, 3)
  assert.equal(bare.token, `\u00000\u00003`)
})
