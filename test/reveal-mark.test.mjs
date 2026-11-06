/**
 * The CodeMirror side of a reveal: one banded line, replaceable, cleared on
 * request, and dropped by any document change.
 *
 * `revealLine` needs a live view (it dispatches a scroll effect), so the field
 * is driven through plain states here — the same transactions a view would
 * create. A line decoration must start at a line start, which is why a document
 * change drops the band instead of mapping it into the middle of a line.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EditorState } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { revealMarkField, setRevealMark } from '../src/client/editor/reveal.js'

/** Build a state with the reveal field and return it plus a band helper. */
function makeState() {
  const state = EditorState.create({ doc: 'alpha\nbeta\ngamma', extensions: [revealMarkField] })
  const band = (lineNumber) => Decoration.line({ class: 'dsh-file-editor-reveal' }).range(state.doc.line(lineNumber).from)
  return { state, band }
}

/** Collect the field's current decoration ranges. */
function ranges(state) {
  const decorated = []
  for (const cursor = state.field(revealMarkField).iter(); cursor.value !== null; cursor.next()) {
    decorated.push(cursor.from)
  }
  return decorated
}

test('a reveal sets exactly one band at the requested line', () => {
  const { state, band } = makeState()
  assert.deepEqual(ranges(state), [])

  const revealed = state.update({ effects: setRevealMark.of(band(2)) }).state
  assert.deepEqual(ranges(revealed), [state.doc.line(2).from])
})

test('a second reveal replaces the first, and null clears it', () => {
  const { state, band } = makeState()
  const first = state.update({ effects: setRevealMark.of(band(1)) }).state
  const second = first.update({ effects: setRevealMark.of(band(3)) }).state
  assert.deepEqual(ranges(second), [state.doc.line(3).from])

  const cleared = second.update({ effects: setRevealMark.of(null) }).state
  assert.deepEqual(ranges(cleared), [])
})

test('editing the document drops the band instead of mapping it', () => {
  const { state, band } = makeState()
  const revealed = state.update({ effects: setRevealMark.of(band(2)) }).state
  const edited = revealed.update({ changes: { from: 0, insert: 'x' } }).state
  assert.deepEqual(ranges(edited), [])
})

test('a stale reveal is dropped when a concurrent edit moves the lines', () => {
  const { state, band } = makeState()
  // The band's position was computed on the old document; the insert at 0
  // shifts line 2, so that position no longer starts a line.
  const both = state.update({
    changes: { from: 0, insert: 'x' },
    effects: setRevealMark.of(band(2)),
  }).state
  assert.deepEqual(ranges(both), [])
})

test('a reveal survives a concurrent edit that leaves its line start alone', () => {
  const { state, band } = makeState()
  const both = state.update({
    changes: { from: state.doc.length, insert: '\ndelta' },
    effects: setRevealMark.of(band(2)),
  }).state
  assert.deepEqual(ranges(both), [both.doc.line(2).from])
})
