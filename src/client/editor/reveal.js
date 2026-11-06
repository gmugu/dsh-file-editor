/**
 * Reveal a source line in the CodeMirror surface: center it in the scrollport
 * and band it briefly, then let the band fade out.
 *
 * This mirrors what the official text preview does for the same navigation
 * (`scrollToLine` + `markLine` in ui-sidebar-documentpreview) without reusing
 * its hashed CSS-module class: the band here is a CodeMirror line decoration,
 * so it costs no DOM node, survives nothing but its own timer, and paints with
 * the host's theme tokens.
 *
 * The decoration is never mapped through document changes, on purpose: a line
 * decoration must start at a line start, and a mapped position can fall in the
 * middle of a line. Editing during the flash simply drops the band.
 */
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { clampLine } from '../reveal.js'

/** How long the band stays before it fades out (the CSS transition owns the fade). */
const FLASH_MS = 1600

/** Class carrying the highlight while a line is revealed. */
const MARK_CLASS = 'dsh-file-editor-reveal'

/** Set or clear the current reveal band (`null` clears). */
export const setRevealMark = StateEffect.define()

/** The one band the editor shows; a second reveal replaces the first. */
export const revealMarkField = StateField.define({
  create: () => Decoration.none,
  update(mark, transaction) {
    // A document change drops the band (its position would otherwise stop
    // being a line start); an explicit effect in the same transaction wins, as
    // long as its position still starts a line in the resulting document.
    let next = transaction.docChanged ? Decoration.none : mark
    for (const effect of transaction.effects) {
      if (!effect.is(setRevealMark)) continue
      if (effect.value === null) {
        next = Decoration.none
        continue
      }
      // A line decoration must start a line in the state that renders it; a
      // reveal racing an edit that moved the lines is stale, so it is dropped.
      next = transaction.state.doc.lineAt(effect.value.from).from === effect.value.from
        ? Decoration.set([effect.value])
        : Decoration.none
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

/**
 * Token-driven band, plus the transition that fades it.
 *
 * The transition lives on `.cm-line` rather than on the highlighted class: the
 * class is removed when the flash ends, so a transition declared by that same
 * class would vanish with it and the band would snap off instead of fading.
 */
export const revealTheme = EditorView.theme({
  '.cm-line': { transition: 'background-color 420ms ease-out' },
  [`.cm-line.${MARK_CLASS}`]: {
    backgroundColor: 'var(--dsw-alias-interactive-bg-active, rgba(125, 135, 155, 0.18))',
  },
})

/** Pending fade timers, one per live view. */
const timers = new WeakMap()

/**
 * Reveal one 1-based line in a live view.
 * @param view - the editor view to scroll.
 * @param line - the requested 1-based source line (clamped to the document).
 * @returns whether a line was revealed.
 */
export function revealLine(view, line) {
  const target = clampLine(line, view.state.doc.lines)
  if (target === undefined) return false
  const position = view.state.doc.line(target).from
  view.dispatch({
    effects: [
      EditorView.scrollIntoView(position, { y: 'center' }),
      setRevealMark.of(Decoration.line({ class: MARK_CLASS }).range(position)),
    ],
  })
  const previous = timers.get(view)
  if (previous !== undefined) clearTimeout(previous)
  timers.set(view, setTimeout(() => {
    timers.delete(view)
    // The view may have been destroyed while the band was showing.
    if (!view.dom.isConnected) return
    view.dispatch({ effects: setRevealMark.of(null) })
  }, FLASH_MS))
  return true
}

/**
 * Drop a pending fade for a view that is going away (the caller destroys it
 * right after), so the timer cannot dispatch into a destroyed view.
 * @param view - the editor view being torn down.
 */
export function cancelReveal(view) {
  const pending = timers.get(view)
  if (pending !== undefined) clearTimeout(pending)
  timers.delete(view)
}
