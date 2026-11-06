/**
 * Line targeting for the document preview's file navigation.
 *
 * Since @deepseek-ai/dsh 0.2.2 a file tab carries its opener's navigation in
 * `SidebarRightTabInfo.tab.navigation` — `{address, params, revision}` — and the
 * `file` protocol's params are `WorkspaceFileParams` (`{line?}`, 1-based,
 * "scroll into view on open or navigation"). `revision` increments on EVERY
 * navigation to the tab, even when `params` repeat, which is what lets a second
 * click on the same `notes.txt:42` link reveal that line again.
 *
 * The official text preview consumes this through its own `useTabInfo` reader
 * plus `scrollToLine`/`markLine` (see ui-sidebar-documentpreview). The editor
 * body is a `loading: 'renderer'` implementation and gets the same
 * `useTabInfo` prop from the slot's declared `inject.hooks.tabInfo`, so it can
 * reveal the line itself — which is what this module normalizes.
 *
 * Deliberately DOM- and CodeMirror-free: the tab shape is host data at runtime
 * (the prop may be absent, `params` may be anything), so the parsing rules are
 * pinned by unit tests rather than discovered in the browser.
 */

/**
 * Read a 1-based line number out of a navigation result.
 * @param value - the raw value; only a positive safe integer counts, so a
 *   string, a float, `0` and a negative number all mean "no line".
 * @returns the 1-based line, or undefined when the value names none.
 */
export function parseRevealLine(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return undefined
  return value
}

/**
 * Clamp a requested line onto the document's actual line count.
 * @param line - the 1-based line a navigation asked for.
 * @param totalLines - the line count of the document that is now on screen.
 * @returns the line to reveal, or undefined when either side is unusable.
 */
export function clampLine(line, totalLines) {
  const requested = parseRevealLine(line)
  if (requested === undefined) return undefined
  if (typeof totalLines !== 'number' || !Number.isFinite(totalLines) || totalLines < 1) return undefined
  return Math.min(requested, Math.trunc(totalLines))
}

/**
 * What one navigation asks the editor to reveal, plus the token that changes
 * whenever the request must fire again.
 *
 * The token folds in the tab address and the navigation revision, so a
 * re-navigation to the very same line (the same `params` under a new revision)
 * still produces a different token — that is exactly the case a plain
 * `line` prop would swallow.
 * @param navigation - `tab.navigation` from the tab-info hook, when present.
 * @returns `{line, token}`; both undefined/empty when nothing is targeted.
 */
export function navigationReveal(navigation) {
  if (typeof navigation !== 'object' || navigation === null) return { line: undefined, token: '' }
  const line = parseRevealLine(navigation.params?.line)
  const address = typeof navigation.address === 'string' ? navigation.address : ''
  const revision = Number.isFinite(navigation.revision) ? navigation.revision : 0
  if (line === undefined) return { line: undefined, token: '' }
  return { line, token: `${address}\u0000${revision}\u0000${line}` }
}
