/**
 * Shared filesystem path guards.
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/fs-tree.ts, TRIMMED to the three helpers this plugin uses:
 * `requireAbsolute`, `isWithin`, `messageOf`. Upstream's single-level
 * directory listing (`listDirectory`, `compareEntries`, `probeSymlinkTargets`,
 * `rootLabel`, `parentOf`) belongs to its explorer and is not carried over —
 * v1 has no file tree (the official Files tab browses).
 */
import { isAbsolute, resolve } from 'node:path'
import { FileEditorError } from './wire.js'

/**
 * Normalize a caller-supplied path to an absolute, resolved path or throw
 * fs-error. `path.isAbsolute()` is the OS's own notion of absolute: POSIX
 * roots (`/...`), Windows drive letters (`C:\...`) and — on win32 — UNC
 * network shares (`\\server\share\...`); drive-relative forms (`C:foo`)
 * stay rejected.
 */
export function requireAbsolute(path) {
  if (!isAbsolute(path)) {
    throw new FileEditorError('fs-error', `"${path}" is not an absolute path`, 400)
  }
  return resolve(path)
}

/**
 * Whether `target` lies under `base` (or equals it), tolerant of separator
 * style and — on Windows, where the filesystem is case-insensitive — of
 * letter case.
 * @param platform - filesystem semantics; injectable so both branches are
 * unit-testable on any host.
 */
export function isWithin(base, target, platform = process.platform) {
  const norm = (value) => value.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  const b = norm(base)
  const t = norm(target)
  if (platform === 'win32') {
    const lb = b.toLowerCase()
    const lt = t.toLowerCase()
    return lt === lb || lt.startsWith(`${lb}/`)
  }
  return t === b || t.startsWith(`${b}/`)
}

/** Message text of an unknown thrown value. */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}