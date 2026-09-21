/**
 * Wire helpers for the /file-editor JSON API: bounded body reading, response
 * writing, and the shared error envelope.
 *
 * Ported from dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/wire.ts. Differences from upstream, both deliberate:
 *  - the error-code union is narrowed to the codes this plugin can produce;
 *  - MAX_BODY_BYTES is raised from 1 MiB to 8 MiB, because fs.write carries the
 *    whole file as JSON and upstream's 1 MiB cap made any larger file
 *    unsaveable.
 *
 * Every API method returns `{ok: true, value}` on success and
 * `{ok: false, error: {code, message}}` (HTTP 4xx/5xx matching the code) on
 * failure.
 */

/** Machine-readable error codes of the file-editor API. */
export const ERROR_CODES = [
  'bad-request',
  'not-found',
  'forbidden',
  'method-error',
  'too-large',
  'fs-error',
  'internal',
]

/** One API failure with its wire code and HTTP status. */
export class FileEditorError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'FileEditorError'
    this.code = code
    this.status = status
  }
}

/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 8 << 20

/** Read and parse the JSON request body (bounded; malformed → bad-request). */
export async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new FileEditorError('bad-request', 'request body too large')
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new FileEditorError('bad-request', 'request body is not valid JSON')
  }
}

/** Write a JSON response with the given status. */
export function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Write the success envelope. */
export function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value })
}

/** Write the failure envelope for any thrown value (unknown → internal 500). */
export function writeError(res, error) {
  if (error instanceof FileEditorError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}

/** Narrow an unknown payload value to a non-empty string, else throw bad-request. */
export function requireString(payload, key) {
  const value = payload?.[key]
  if (typeof value !== 'string' || value === '') {
    throw new FileEditorError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}

/**
 * Narrow an unknown payload value to a string, accepting the EMPTY string.
 * File content may legitimately be empty, so fs.write cannot use
 * {@link requireString}.
 */
export function requireText(payload, key) {
  const value = payload?.[key]
  if (typeof value !== 'string') {
    throw new FileEditorError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}