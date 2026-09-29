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
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
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

/** Chinese phrases for the search panel (@codemirror/search reads these). */
const SEARCH_PHRASES = EditorState.phrases.of({
  Find: '查找',
  Replace: '替换',
  next: '下一个',
  previous: '上一个',
  all: '全部',
  'match case': '区分大小写',
  'by word': '全字匹配',
  regexp: '正则',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配',
  'replaced $ matches': '已替换 $ 处',
  'replaced match on line $': '已在第 $ 行替换',
  'on line': '行',
})

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
 * @param props.controlsRef - a parent-owned ref this component fills with
 *   `{ undo(), redo() }` while the view lives (set to `null` on unmount), so
 *   the toolbar's buttons can drive the editor's own history.
 * @param props.onHistoryState - called with `{ canUndo, canRedo }` whenever
 *   the editor's undo history changes (including the initial document state).
 * @param props.onScrollport - registers the editor's scroller with the document
 *   owner so the sidebar's scroll memory keeps working (`null` on unmount).
 */
export function TextEditor({ value, path, resetKey, readOnly, dark, onChange, onSave, controlsRef, onHistoryState, onScrollport }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const themeRef = useRef(null)
  const latest = useRef({ onChange, onSave, onHistoryState })
  // Latest-ref pattern: event handlers and effects read these, so the view is
  // never rebuilt just because a callback identity changed.
  latest.current = { onChange, onSave, onHistoryState }
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
        SEARCH_PHRASES,
        search({ top: true }),
        cmSurfaceTheme,
        themeComp.of(dark === true),
        ...(language !== null ? [language] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange?.(update.state.doc.toString())
          if (update.docChanged || update.transactions.some((tr) => tr.effects.length > 0)) {
            latest.current.onHistoryState?.({
              canUndo: undoDepth(update.state) > 0,
              canRedo: redoDepth(update.state) > 0,
            })
          }
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
          ...searchKeymap,
        ]),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    if (controlsRef != null) {
      controlsRef.current = {
        undo: () => undo(view),
        redo: () => redo(view),
        openSearch: () => openSearchPanel(view),
      }
    }
    latest.current.onHistoryState?.({
      canUndo: undoDepth(view.state) > 0,
      canRedo: redoDepth(view.state) > 0,
    })
    applyHostTypography(view)
    onScrollport?.(view.scrollDOM)
    return () => {
      onScrollport?.(null)
      if (controlsRef != null) controlsRef.current = null
      latest.current.onHistoryState?.({ canUndo: false, canRedo: false })
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