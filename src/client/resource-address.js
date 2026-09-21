/**
 * The DSH resource-address grammar for files (`dsh-resource://file/…`).
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/resource-address.ts, TRIMMED to the constant and the parser this
 * plugin needs (`FILE_ADDRESS_PREFIX`, `parseFileAddress`). Upstream's address
 * BUILDERS (`sessionFileAddress`, `absoluteFileAddress`, `fileAddressFor`) are
 * not carried over: this plugin never opens a tab, it only reads the address
 * the official document preview already opened.
 *
 * Upstream parses these addresses itself instead of importing
 * `@deepseek-ai/dsh-util-workspace-path`, because the client bundle's purity
 * gate forbids value-importing an unlisted `@deepseek-ai/*` package. The
 * same reason applies here.
 *
 * Two scopes exist:
 *  - `dsh-resource://file/session/<sessionId>/<path>` names a file by its path
 *    relative to that session's workspace root OR by its absolute path kept
 *    absolute inside the session scope;
 *  - `dsh-resource://file/absolute/<path>` names a file by its absolute path
 *    with the leading `/` dropped (`absolute/home/me/x.txt`; Windows
 *    `absolute/C:/x/y.txt`; a UNC path keeps an empty first segment). It
 *    carries no session.
 *
 * Every id and path segment is component-encoded, so a name carrying `#`, `?`
 * or a space survives the round trip; `:` stays literal so a drive letter
 * reads as written.
 */

/** The scheme and type every file address opens with. */
export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** Whether a decoded first path segment is a Windows drive (`C:`). */
function isDriveSegment(segment) {
  return segment !== undefined && /^[A-Za-z]:$/.test(segment)
}

/**
 * Read a file address back into its parts without resolving `.` or `..`.
 * Query and fragment suffixes are ignored; encoded path segments are decoded.
 * @param address - a candidate address.
 * @returns the parts, or `undefined` when the string is not a
 *   `dsh-resource://file/` URI in a known scope with a path, or a segment is
 *   not validly encoded.
 */
export function parseFileAddress(address) {
  try {
    if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    const end = address.search(/[?#]/)
    const [scope, ...rest] = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end).split('/')
    if (scope === 'session') {
      const [id, ...segments] = rest
      if (id === undefined || id === '' || segments.length === 0) return undefined
      return {
        scope,
        sessionId: decodeURIComponent(id),
        path: segments.map(decodeURIComponent).join('/'),
      }
    }
    if (scope === 'absolute') {
      // An empty first segment with more behind it is a UNC path's `//`; alone it is no path.
      const unc = rest[0] === '' && rest.length > 1
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
      if (segments.length === 0 || segments[0] === '') return undefined
      if (unc) return { scope, path: `//${segments.join('/')}` }
      return { scope, path: isDriveSegment(segments[0]) ? segments.join('/') : `/${segments.join('/')}` }
    }
    return undefined
  } catch {
    // `decodeURIComponent` throws URIError on a malformed escape.
    return undefined
  }
}