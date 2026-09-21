/**
 * The version-reporting policy for the document body.
 *
 * The official document owner flags "the file changed on disk" when the
 * resource's CURRENT version differs BOTH from what the body reported and from
 * the version it observed when its load started
 * (`client.js:818` of @deepseek-ai/dsh-client-ui-sidebar-documentpreview:
 * `observedVersion !== current.version && observedVersion !== current.observedVersion`).
 *
 * Two facts make that easy to trip:
 *  - the owner starts the content load as soon as the resource stops reporting
 *    `none`, which can be BEFORE the metadata value (and therefore its version
 *    token) has arrived — so a body must never report an empty token, or the
 *    owner compares '' against the real version and announces a change on every
 *    freshly opened file;
 *  - a SAVE changes the file's version too, and that change is the body's own,
 *    so it must be absorbed rather than announced.
 *
 * Anything else (a version that moved without a report and without our own
 * write) is a foreign edit and must stay unreported — that is exactly what
 * raises the banner.
 *
 * Pure and unit-tested because the failure it prevents is otherwise invisible:
 * no test could see the banner, only the user could.
 */

/**
 * Decide what to do about a source version.
 *
 * @param input.reported - the version already reported for this revision
 *   (`undefined` while nothing has been reported yet).
 * @param input.ownWrite - whether the next version change is this body's own
 *   save (consumed by a report).
 * @param input.version - the resource's current version token, as read now.
 * @returns `'report'` to pass it to the owner's `content.loaded(version)`,
 *   `'skip'` to leave the owner's change detection alone.
 */
export function versionReportAction({ reported, ownWrite, version }) {
  // An unknown version is never reportable: '' would read to the owner as a
  // version distinct from the real one.
  if (typeof version !== 'string' || version === '') return 'skip'
  // Idempotent: one report per version per revision.
  if (reported === version) return 'skip'
  // Nothing reported yet: this is the settle-after-a-late-metadata case.
  if (reported === undefined) return 'report'
  // A version moved after we reported one: only our own save may absorb it.
  return ownWrite === true ? 'report' : 'skip'
}