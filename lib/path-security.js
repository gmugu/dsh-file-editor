/**
 * Filesystem path guards shared by the file-editor APIs that access a session
 * workspace.
 *
 * Verbatim port of dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/path-security.ts; `SidebarError` is spelled `FileEditorError` here.
 */
import { realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isWithin, requireAbsolute } from './fs-tree.js'
import { resolveSessionPath } from './session-path.js'
import { FileEditorError } from './wire.js'

/** Resolve a path and convert filesystem resolution failures to an API error. */
async function resolveRealPath(path, label) {
  try {
    return await realpath(path)
  } catch (error) {
    throw new FileEditorError('fs-error', `cannot resolve ${label} "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
  }
}

/** Reject a resolved path whose real filesystem target escapes the workspace. */
function assertWithinWorkspace(workspace, target) {
  if (!isWithin(workspace, target)) {
    throw new FileEditorError('forbidden', `path "${target}" is outside workspace`, 403)
  }
}

/**
 * Resolve an existing workspace path through symlinks and (unless disarmed)
 * enforce containment.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute path in the session's namespace.
 * @param fence - Whether containment is enforced. Even when false the paths are
 * still resolved through symlinks so callers always receive the canonical
 * target. This plugin always passes true (upstream's `workspaceFence` setting
 * has no equivalent here).
 * @returns The canonical absolute path used for the filesystem operation.
 */
export async function ensureWorkspacePath(cwd, target, fence = true) {
  const absolute = requireAbsolute(resolveSessionPath(cwd, target))
  const [realCwd, realTarget] = await Promise.all([
    resolveRealPath(cwd, 'workspace'),
    resolveRealPath(absolute, 'target'),
  ])
  if (fence) assertWithinWorkspace(realCwd, realTarget)
  return realTarget
}

/**
 * Validate a write destination, including destinations that do not exist yet.
 * Existing targets are resolved to catch symlinks; missing targets are checked
 * against the nearest existing ancestor before the caller creates or renames.
 * The returned path is rebuilt from that canonical ancestor, so an existing
 * symlink is never left in the path passed to the write operation.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute destination path in the session's namespace.
 * @param fence - Whether containment is enforced.
 * @returns A canonical path for an existing target or its nearest existing ancestor.
 */
export async function ensureWorkspaceWritePath(cwd, target, fence = true) {
  const absolute = requireAbsolute(resolveSessionPath(cwd, target))
  const realCwd = await resolveRealPath(cwd, 'workspace')
  let existingPath = absolute
  const missingSegments = []

  for (;;) {
    try {
      const realTarget = await realpath(existingPath)
      if (fence) assertWithinWorkspace(realCwd, realTarget)
      return missingSegments.reduce((path, segment) => join(path, segment), realTarget)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        if (error instanceof FileEditorError) throw error
        throw new FileEditorError('fs-error', `cannot resolve target "${existingPath}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      const parent = dirname(existingPath)
      if (parent === existingPath) {
        throw new FileEditorError('fs-error', `cannot resolve target "${absolute}"`, 400)
      }
      missingSegments.unshift(basename(existingPath))
      existingPath = parent
    }
  }
}