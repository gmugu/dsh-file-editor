/**
 * dsh-file-editor — client half.
 *
 * Registers one document-preview implementation and its body with the official
 * right-sidebar preview package, and nothing else. It deliberately does NOT:
 * register a right-Sidebar tab type, claim any `dsh-resource://` address, touch
 * the sidebar's store or layout, or alter the official read-only preview — a
 * file opens exactly as it does today, and "Editor" is one more entry in the
 * preview's viewer menu (see definition.js for why the official preview stays
 * the default and why the editor is registered last among the viewers).
 */
import { EditorBody } from './EditorBody.jsx'
import { setChunkModuleSystem } from './chunk-loader.js'
import { EDITOR_EXTENSIONS, EDITOR_ID, LOCALE_NS } from './definition.js'
import { CODE_FONT_TOKEN_CSS } from './theme-bridge.js'

/** Client services this plugin cannot work without. */
export const inject = ['slots', 'locale', 'modules', 'documentPreviews', 'sessions']

/** Chinese copy for every string the body renders. */
const zh = {
  viewerName: '编辑器',
  save: '保存',
  saving: '正在保存…',
  saved: '已保存',
  saveFailed: '保存失败',
  unsaved: '有未保存的修改',
  loading: '正在读取…',
  retry: '重试',
  readFailed: '读取失败：',
  editorUnavailable: '编辑器加载失败：',
  binary: '这是二进制文件，请在查看器下拉里切回官方预览。',
  truncation: '文件过大，只读',
  truncationHint: '只读取了文件的前 2 MiB，为避免破坏文件已禁止保存。',
  unresolved: '无法解析该文件的地址。',
  reloadedOnDisk: '磁盘内容已重新读取，你有未保存的修改。',
  keepMine: '保留我的修改',
  discardMine: '放弃并重新加载',
}

/** English copy, key-for-key with the Chinese dictionary. */
const en = {
  viewerName: 'Editor',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Save failed',
  unsaved: 'Unsaved changes',
  loading: 'Reading…',
  retry: 'Retry',
  readFailed: 'Read failed: ',
  editorUnavailable: 'Editor failed to load: ',
  binary: 'This is a binary file — pick the official preview in the viewer menu.',
  truncation: 'Too large, read-only',
  truncationHint: 'Only the first 2 MiB was read; saving is disabled so the file cannot be truncated.',
  unresolved: 'This file address cannot be resolved.',
  reloadedOnDisk: 'The file changed on disk and you have unsaved changes.',
  keepMine: 'Keep my changes',
  discardMine: 'Discard and reload',
}

/**
 * Client plugin body.
 * @param ctx - client context carrying slots, locale, the client module system
 *   and the document-preview registry.
 */
export function apply(ctx) {
  // The lazy editor chunk resolves its platform externals through this.
  setChunkModuleSystem(ctx.modules)

  // Make the OFFICIAL preview's code font match this editor's (see
  // theme-bridge.js): its body reads `var(--dsw-font-mono, …)`, a token no DSH
  // package defines, so it fell back to a generic monospace stack while this
  // editor uses the designed `--ds-font-family-code`. The rule is scoped to the
  // preview body, so the other two readers of that token are untouched.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const style = document.createElement('style')
    style.dataset.dshFileEditor = 'code-font-token'
    style.textContent = CODE_FONT_TOKEN_CSS
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-file-editor: preview code-font token')

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-file-editor: locale')
  const t = ctx.locale.bind(LOCALE_NS)

  ctx.effect(() => ctx.documentPreviews.register({
    id: EDITOR_ID,
    // The official code viewer's suffixes (so the official preview stays the
    // default there) PLUS the documented plain-text extras (`txt`, `log`,
    // `.env`, `.gitignore`, …) that no official viewer declares and that would
    // otherwise have no editor entry at all. See definition.js.
    extensions: EDITOR_EXTENSIONS,
    // NOT 'extension': this plugin must never outrank the shipped preview.
    priority: 'builtin',
    // The viewer menu's label and the menu button's text while selected.
    title: () => t('viewerName'),
    // We own the read (through our own host route) and the write.
    loading: 'renderer',
    // The preview's own wrap toggle does not apply to a CodeMirror surface.
    wrap: false,
  }), 'dsh-file-editor: editor viewer')

  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document',
    key: EDITOR_ID,
    locale: LOCALE_NS,
    // The host prefers the SESSION HEADER's working directory and only falls
    // back to this one, so sending the client's idea of it is always safe — and
    // it restores the fallback upstream had (which additionally consulted the
    // session-persistence index; that part is not carried over). A shape this
    // build does not expose degrades to `undefined`, which leaves the host's
    // header-only behaviour intact.
    inject: (sessionId) => ({
      sessionCwd: () => ctx.sessions?.list?.getSnapshot()?.byId?.[sessionId]?.cwd,
    }),
  }, EditorBody)), 'dsh-file-editor: editor body')
}