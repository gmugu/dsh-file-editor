/**
 * CodeMirror 6 theme pieces for the editor.
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/cm-themes.ts. The editor surface (background, caret, gutter)
 * rides the DSH theme tokens so it blends with the right sidebar in both
 * schemes; only the syntax token colors need concrete values, and those come
 * from the designed one-dark / one-light families (one-dark-palette.js). The
 * scheme flip reconfigures these through a compartment, so the document, undo
 * history and scroll survive re-theming.
 */
import { Compartment } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'
import { ONE_DARK, ONE_LIGHT } from './one-dark-palette.js'

/** Token-driven surface shared by both schemes (pure CSS values). */
export const cmSurfaceTheme = EditorView.theme({
  '&': {
    height: '100%',
    // Match the official CODE preview, which renders the primitives' CodeBlock:
    // its `.block :where(pre)` rule is `font: var(--dsl-code-block-content-font)`
    // and that variable is `var(--dsw-font-markdown-code-block)` —
    //   --dsw-font-markdown-code-block: 11px/19px var(--ds-font-family-code)
    // (defined on `body{}` in ui-theme's base.css, alongside its per-property
    // forms used here). This is a FIXED design-system code style: unlike the
    // plain-text `.body` viewer it does NOT follow the host's font-size
    // preference, which is precisely why the editor reads THESE tokens — the
    // preference-derived one belongs to that other viewer.
    fontSize: 'var(--dsw-font-markdown-code-block-font-size, 11px)',
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--dsw-font-markdown-code-block-font-family, var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace))',
  },
  '.cm-content': {
    caretColor: 'var(--dsw-alias-label-primary)',
    // The code block's 19px line box (CodeMirror's own base theme is 1.4).
    lineHeight: 'var(--dsw-font-markdown-code-block-line-height, 19px)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
    border: 'none',
    // Keeps line numbers on the same baseline grid as the content above.
    lineHeight: 'var(--dsw-font-markdown-code-block-line-height, 19px)',
  },
})

/** Scheme-specific surface tints (selection, active line). */
function cmSurfaceTint(dark) {
  return EditorView.theme({
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    },
  })
}

/** one-dark syntax rules (mirrors @codemirror/theme-one-dark; hues from one-dark-palette.js). */
const HIGHLIGHTS_DARK = [
  { tag: tags.comment, color: ONE_DARK.faintGray, fontStyle: 'italic' },
  { tag: tags.keyword, color: ONE_DARK.magenta },
  { tag: tags.string, color: ONE_DARK.green },
  { tag: tags.number, color: ONE_DARK.orange },
  { tag: tags.bool, color: ONE_DARK.orange },
  { tag: tags.atom, color: ONE_DARK.orange },
  { tag: tags.typeName, color: ONE_DARK.yellow },
  { tag: tags.className, color: ONE_DARK.yellow },
  { tag: tags.propertyName, color: ONE_DARK.red },
  { tag: tags.function(tags.variableName), color: ONE_DARK.blue },
  { tag: tags.variableName, color: ONE_DARK.red },
  { tag: tags.operator, color: ONE_DARK.cyan },
  { tag: tags.tagName, color: ONE_DARK.red },
  { tag: tags.attributeName, color: ONE_DARK.orange },
  { tag: tags.heading, color: ONE_DARK.red, fontStyle: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontStyle: 'bold' },
  { tag: tags.link, color: ONE_DARK.blue, fontStyle: 'underline' },
  { tag: tags.meta, color: ONE_DARK.yellow },
  { tag: tags.invalid, color: ONE_DARK.white, fontStyle: 'bold' },
]

/** one-light syntax rules (the light counterpart; hues from one-dark-palette.js). */
const HIGHLIGHTS_LIGHT = [
  { tag: tags.comment, color: ONE_LIGHT.gray, fontStyle: 'italic' },
  { tag: tags.keyword, color: ONE_LIGHT.magenta },
  { tag: tags.string, color: ONE_LIGHT.green },
  { tag: tags.number, color: ONE_LIGHT.orange },
  { tag: tags.bool, color: ONE_LIGHT.blue },
  { tag: tags.atom, color: ONE_LIGHT.blue },
  { tag: tags.typeName, color: ONE_LIGHT.yellow },
  { tag: tags.className, color: ONE_LIGHT.yellow },
  { tag: tags.propertyName, color: ONE_LIGHT.red },
  { tag: tags.function(tags.variableName), color: ONE_LIGHT.yellow },
  { tag: tags.variableName, color: ONE_LIGHT.red },
  { tag: tags.operator, color: ONE_LIGHT.black },
  { tag: tags.tagName, color: ONE_LIGHT.red },
  { tag: tags.attributeName, color: ONE_LIGHT.orange },
  { tag: tags.heading, color: ONE_LIGHT.red, fontStyle: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontStyle: 'bold' },
  { tag: tags.link, color: ONE_LIGHT.link, fontStyle: 'underline' },
  { tag: tags.meta, color: ONE_LIGHT.yellow },
  { tag: tags.invalid, color: ONE_LIGHT.white, fontStyle: 'bold' },
]

/** The scheme-dependent extension pair (surface tint + syntax highlight). */
function cmThemeExtensions(dark) {
  return [
    cmSurfaceTint(dark),
    syntaxHighlighting(HighlightStyle.define(dark ? HIGHLIGHTS_DARK : HIGHLIGHTS_LIGHT)),
  ]
}

/**
 * A Compartment holding the two scheme-dependent extensions. Created once per
 * editor view; a scheme flip dispatches `reconfigure(dark)` on it, so the
 * document, undo history, scroll and keymaps survive re-theming.
 */
export class CmThemeCompartment {
  constructor() {
    this.compartment = new Compartment()
  }

  /** `of(...)` payload for EditorState.create. */
  of(dark) {
    return this.compartment.of(cmThemeExtensions(dark))
  }

  /** Reconfigure for a new scheme. */
  reconfigure(dark) {
    return this.compartment.reconfigure(cmThemeExtensions(dark))
  }
}