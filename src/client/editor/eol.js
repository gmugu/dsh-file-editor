/**
 * Line-ending and byte-order-mark preservation for the editor.
 *
 * CodeMirror treats `\r\n`, `\r` and `\n` as line separators and stores a
 * document WITHOUT them, joining lines back with `\n`. Writing that string
 * straight to disk therefore rewrites every CRLF file as LF — a whole-file
 * diff for a one-line edit, and a real corruption on Windows checkouts with
 * `core.autocrlf=false`. So the file's own convention is detected on read and
 * restored on write.
 *
 * The functions are pure (no DOM, no CodeMirror) and unit-tested.
 */

const BOM = '\uFEFF'

/**
 * Detect a source text's byte-order mark and dominant line ending.
 * @param source - the file's text as read (BOM intact).
 * @returns the BOM flag, the line ending, and the text with the BOM removed
 *   (CodeMirror would otherwise render it as a zero-width character).
 */
export function decodeSource(source) {
  const bom = source.startsWith(BOM)
  const text = bom ? source.slice(1) : source
  return { bom, eol: detectLineEnding(text), text }
}

/**
 * The file's line ending: the first one encountered wins, so a mixed file is
 * rewritten with the convention its first line already used.
 */
export function detectLineEnding(text) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\n') return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n'
    if (char === '\r') return text[index + 1] === '\n' ? '\r\n' : '\r'
  }
  return '\n'
}

/**
 * Restore a document's original convention before writing it back.
 * The document's own separators are `\n` (CodeMirror's join), so only they are
 * translated; a lone `\r` inside the text stays where the user put it.
 * @param text - the editor document.
 * @param encoding - the convention recorded by {@link decodeSource}.
 * @returns the bytes-ready string for the host's fs.write.
 */
export function encodeSource(text, encoding) {
  const eol = encoding?.eol ?? '\n'
  const body = eol === '\n' ? text : text.replace(/\n/g, eol)
  return encoding?.bom === true ? BOM + body : body
}