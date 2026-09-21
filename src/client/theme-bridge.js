/**
 * One bridge rule that makes the official preview's PLAIN-TEXT rendering use the
 * same code font as this editor.
 *
 * Two different official surfaces exist, and they get their fonts differently:
 *
 *  - the CODE viewer renders the primitives' `CodeBlock`, whose
 *    `.block :where(pre)` rule is `font: var(--dsl-code-block-content-font)` and
 *    that variable resolves to `--dsw-font-markdown-code-block`
 *    (`11px/19px var(--ds-font-family-code)`). The editor therefore reads those
 *    same code-block tokens in cm-themes.js — no bridge is needed for that
 *    surface, and nothing here affects it;
 *
 *  - the shared text body (`.dhJKeW_body`, used by the plain-text viewer, and the
 *    ancestor of every preview body) instead reads
 *      `font-family: var(--dsw-font-mono, ui-monospace, monospace)`
 *    and NO DSH package defines `--dsw-font-mono` — a recursive scan of 1221
 *    client bundles finds three readers (this preview, the agent-preset UI, the
 *    jobs UI) and zero definitions — so plain-text previews fell back to a
 *    generic monospace stack while this editor uses the designed code font.
 *
 * This rule supplies that one missing variable for the preview body ONLY, so the
 * plain-text view matches the editor's family without touching the other two
 * readers. A root-level definition would leak to them, which is why the selector
 * is deliberately narrow and removed again with the plugin.
 */

/** The official preview's own body hook (its scrollable text/code area). */
export const PREVIEW_BODY_SELECTOR = '[data-textpreview-body]'

/**
 * The injected rule. Deliberately scoped to {@link PREVIEW_BODY_SELECTOR}: the
 * other two readers of `--dsw-font-mono` are none of this plugin's business.
 */
export const CODE_FONT_TOKEN_CSS = `${PREVIEW_BODY_SELECTOR}{`
  + '--dsw-font-mono:var(--dsw-font-markdown-code-block-font-family,var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace))'
  + '}'