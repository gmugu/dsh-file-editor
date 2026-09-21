/**
 * Live color-scheme access for the editor's concrete (non-token) colors.
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/theme.ts, trimmed to the scheme reads: CodeMirror's syntax
 * extensions need concrete values, and the app's scheme flips at runtime
 * (ui-layout's ThemePresenter projects prefers-color-scheme and the user's
 * choice onto `body[data-ds-dark-theme]` and `html { color-scheme }`), so the
 * editor re-themes in place instead of freezing in the scheme it was created
 * under. The token reads (`tokenValue`, `effectiveTokenValue`) are not carried
 * over: the surface colors here are CSS variables, which the browser re-resolves
 * on a scheme flip by itself.
 */

/**
 * Whether the app shell resolved to the dark scheme.
 *
 * The presenter sets `html { color-scheme }` together with the body palette
 * attribute, so a set color-scheme means the decision is authoritative (an
 * absent attribute is then LIGHT even when the OS prefers dark — the user
 * chose light). Before the presenter has run, fall back to the OS media query.
 */
export function isDarkScheme() {
  if (typeof document === 'undefined') return true
  const decided = document.documentElement.style.colorScheme !== ''
  if (decided) return document.body.hasAttribute('data-ds-dark-theme')
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Subscribe to color-scheme flips (the presenter toggles the body attribute).
 * The callback fires after the attribute changed; re-read the scheme inside it.
 * @returns the disposer.
 */
export function subscribeScheme(callback) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(() => { callback() })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => { observer.disconnect() }
}