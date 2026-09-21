/**
 * The editor's two host calls: fs.read and fs.write on /file-editor/api.
 *
 * The envelope and error mapping mirror dsh-better-sidebar's client
 * (src/client/api.ts): POST JSON, `{ok:true,value}` or
 * `{ok:false,error:{code,message}}`, with the host's code carried onto the
 * thrown error so the body can distinguish "outside workspace" from a plain
 * failure.
 */

const ENDPOINT = '/file-editor/api'

/** One API failure with the host's machine-readable code. */
export class FileEditorApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'FileEditorApiError'
    this.code = code
  }
}

/** Fold a request scope into a JSON payload ({cwd} only when present). */
function scopePayload(scope, extra) {
  return {
    sessionId: scope.sessionId,
    ...(scope.cwd !== undefined && scope.cwd !== '' ? { cwd: scope.cwd } : {}),
    ...extra,
  }
}

/** POST one API method and unwrap the envelope. */
async function call(method, payload, signal) {
  let response
  try {
    response = await fetch(`${ENDPOINT}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (typeof DOMException === 'function' && error instanceof DOMException && error.name === 'AbortError') throw error
    throw new FileEditorApiError('network', error instanceof Error ? error.message : String(error))
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new FileEditorApiError('internal', `invalid response (${response.status})`)
  }
  if (body?.ok === true) return body.value
  const code = typeof body?.error?.code === 'string' ? body.error.code : 'internal'
  const message = typeof body?.error?.message === 'string' ? body.error.message : `request failed (${response.status})`
  throw new FileEditorApiError(code, message)
}

/** Whether a thrown value is an abort (the tab/session went away mid-read). */
export function isAbortError(error) {
  return typeof DOMException === 'function' && error instanceof DOMException && error.name === 'AbortError'
}

/** One human-readable line for any thrown API value. */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export const api = {
  /** Read one file: text (bounded) or a binary sniff. */
  read: (scope, signal) => call('fs.read', scopePayload(scope, { path: scope.path }), signal),
  /** Write one file atomically. */
  write: (scope) => call('fs.write', scopePayload(scope, { path: scope.path, content: scope.content })),
}