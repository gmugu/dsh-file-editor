/**
 * Unsaved-edit registry, keyed by resource ADDRESS.
 *
 * A document tab's body unmounts when the reader switches tabs, collapses the
 * right sidebar, or picks the official preview from the viewer menu. Keeping
 * the draft here — outside React — means an unsaved edit survives all of
 * those and comes back with the file. Keying by address is exactly right
 * because the address IS the tab's content identity: the same address is the
 * same file in the same session.
 *
 * Two rules keep this registry honest (both enforced by the body, not here):
 *
 *  - **Only dirty content is stored.** A file that was merely opened is not a
 *    draft: writing one for it would retain a full copy of the file (up to the
 *    2 MiB read cap) for the lifetime of the page, and the read is cheap.
 *  - **A draft records the source `version` it was written at.** A draft
 *    outlives its tab, so on the next mount the body reports THAT version to
 *    the owner rather than the current one — otherwise a file changed while the
 *    tab was closed would be silently overwritten by the stale draft, with the
 *    owner's "changed on disk" warning suppressed.
 *
 * The record shape is `{ text, savedText, encoding, size, truncated, version }`.
 */

const drafts = new Map()

/** The draft for one address, or undefined when the editor never ran here. */
export function peekDraft(address) {
  return drafts.get(address)
}

/** Replace one address's draft with the current editor state. */
export function putDraft(address, draft) {
  drafts.set(address, draft)
}

/** Forget one address's draft (a successful save of nothing, or a reload). */
export function dropDraft(address) {
  drafts.delete(address)
}

/** Every address holding unsaved text (diagnostics / future close prompts). */
export function draftAddresses() {
  return [...drafts.keys()]
}