/**
 * The CodeMirror 6 editor surface.
 *
 * Adapted from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/TextEditor.tsx: the CodeMirror setup is kept faithful
 * (line wrapping, line numbers, history, tab size 2, no spellcheck, the
 * token-driven surface theme with a scheme compartment, the extension-keyed
 * language, and the dirty-tracking update listener with `Mod-s` bound to save),
 * while everything upstream couples to its own plugin framework is dropped:
 * the props store, the markdown/HTML preview pane, the "add to conversation"
 * selection popup, the host-merged toolbar plumbing and the CSS-module classes.
 * The toolbar is the body's business (see EditorBody.jsx).
 *
 * The view owns the document. React never re-renders it per keystroke: the
 * parent hands a `resetKey` that changes only when the document must be
 * replaced (a fresh read), and receives every change through `onChange`.
 */
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { languageForPath } from './lang.js'
import { cmSurfaceTheme, CmThemeCompartment } from './cm-themes.js'

/**
 * Mirror the host's code-block typography onto the editor as INLINE styles.
 *
 * The theme reads the same tokens, so this is belt-and-braces: a variable that
 * fails to resolve inside the injected CodeMirror subtree paints the same number
 * as one that resolves to its fallback, and inline styles also outrank
 * CodeMirror's own base theme (`monospace` on `.cm-scroller`). The values come
 * from where they are DEFINED (`body{}` in ui-theme's base.css).
 *
 * The tokens are the design-system code-block ones, which the official code
 * preview gets through the primitives' CodeBlock:
 *   --dsw-font-markdown-code-block-font-size   11px
 *   --dsw-font-markdown-code-block-line-height 19px
 *   --dsw-font-markdown-code-block-font-family var(--ds-font-family-code)
 */
function applyHostTypography(view) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const readVar = (el, name) => {
    try { return getComputedStyle(el).getPropertyValue(name).trim() } catch { return '' }
  }
  const read = (name) => readVar(document.body, name) || readVar(document.documentElement, name)
  const size = read('--dsw-font-markdown-code-block-font-size')
  const lineHeight = read('--dsw-font-markdown-code-block-line-height')
  const family = read('--dsw-font-markdown-code-block-font-family') || read('--ds-font-family-code')
  if (size !== '') view.dom.style.fontSize = size
  if (family !== '') view.scrollDOM.style.fontFamily = family
  if (lineHeight !== '') {
    view.contentDOM.style.lineHeight = lineHeight
    const gutters = view.dom.querySelector('.cm-gutters')
    if (gutters !== null) gutters.style.lineHeight = lineHeight
  }
}

/**
 * @param props.value - the document to load (read only when `resetKey` changes).
 * @param props.path - the file path, for language selection.
 * @param props.resetKey - changes to force a fresh document.
 * @param props.readOnly - whether typing is refused (a truncated read). It is
 *   decided by the read and cannot change without a new document, so it is
 *   applied at view creation rather than through a compartment.
 * @param props.dark - host color scheme at mount; flips reconfigure in place.
 * @param props.onChange - called with the full document text on every change.
 * @param props.onSave - invoked by `Mod-s` (and the toolbar's save button).
 * @param props.onScrollport - registers the editor's scroller with the document
 *   owner so the sidebar's scroll memory keeps working (`null` on unmount).
 */
export function TextEditor({ value, path, resetKey, readOnly, dark, onChange, onSave, onScrollport }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const themeRef = useRef(null)
  const latest = useRef({ onChange, onSave })
  // Latest-ref pattern: event handlers and effects read these, so the view is
  // never rebuilt just because a callback identity changed.
  latest.current = { onChange, onSave }
  const initialValueRef = useRef(value)
  initialValueRef.current = value

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    const themeComp = new CmThemeCompartment()
    themeRef.current = themeComp
    const language = languageForPath(path)
    const state = EditorState.create({
      doc: initialValueRef.current ?? '',
      extensions: [
        EditorView.lineWrapping,
        lineNumbers(),
        history(),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({ spellcheck: 'false' }),
        EditorState.readOnly.of(readOnly === true),
        cmSurfaceTheme,
        themeComp.of(dark === true),
        ...(language !== null ? [language] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange?.(update.state.doc.toString())
        }),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              latest.current.onSave?.()
              return true
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    applyHostTypography(view)
    onScrollport?.(view.scrollDOM)
    return () => {
      onScrollport?.(null)
      view.destroy()
      viewRef.current = null
      themeRef.current = null
    }
    // A new document, not a new keystroke: `value` is read through the latest
    // ref so typing never recreates the view (and never drops undo history).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, resetKey])

  // Scheme flip: re-theme in place (only the scheme-dependent extensions move).
  useEffect(() => {
    const view = viewRef.current
    const themeComp = themeRef.current
    if (view === null || themeComp === null) return
    view.dispatch({ effects: themeComp.reconfigure(dark === true) })
  }, [dark])

  return <div ref={hostRef} style={{ height: '100%', minHeight: 0 }} data-file-editor-surface="" />
}