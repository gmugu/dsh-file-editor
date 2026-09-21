/**
 * Lazy chunk entry: the CodeMirror 6 editor and its language packages.
 *
 * Built as `lib/client-editor.js` and served by the host half at
 * /file-editor/bundle/editor.js — fetched only when the reader first picks the
 * editor in the viewer menu (see ../chunk-loader.js). Never import this module
 * from the core bundle: it pulls CodeMirror into the startup path.
 */
export { TextEditor } from './TextEditor.jsx'