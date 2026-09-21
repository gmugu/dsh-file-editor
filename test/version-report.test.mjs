/**
 * The document body's version-reporting policy.
 *
 * `versionReportAction` guards the owner's "file changed on disk" detection
 * (see the module comment of src/client/version-report.js): reporting an empty
 * or foreign version makes the official owner announce a change on every open
 * or after every save. Both failures are invisible to every other test — only
 * the banner in the UI showed them — so the policy is pinned here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { versionReportAction } from '../src/client/version-report.js'

test('an unknown version is never reported', () => {
  // The reported bug: a fast local read finished before the resource metadata
  // arrived, so the body reported '' and the owner announced a change on every
  // freshly opened file.
  for (const version of ['', undefined, null, 0, {}]) {
    assert.equal(versionReportAction({ reported: undefined, ownWrite: false, version }), 'skip', String(version))
  }
})

test('the first known version settles the report', () => {
  assert.equal(versionReportAction({ reported: undefined, ownWrite: false, version: 'v1' }), 'report')
  assert.equal(versionReportAction({ reported: undefined, ownWrite: true, version: 'v1' }), 'report')
})

test('a version is reported at most once', () => {
  assert.equal(versionReportAction({ reported: 'v1', ownWrite: false, version: 'v1' }), 'skip')
  assert.equal(versionReportAction({ reported: 'v1', ownWrite: true, version: 'v1' }), 'skip')
})

test('a foreign change stays unreported so the owner can flag it', () => {
  assert.equal(versionReportAction({ reported: 'v1', ownWrite: false, version: 'v2' }), 'skip')
})

test("our own save absorbs the version change it caused", () => {
  assert.equal(versionReportAction({ reported: 'v1', ownWrite: true, version: 'v2' }), 'report')
  // …and only once: a later foreign change is flagged again.
  assert.equal(versionReportAction({ reported: 'v2', ownWrite: false, version: 'v3' }), 'skip')
})

test('a draft with an unknown recorded version reports nothing and stays quiet', () => {
  // Hydrating a draft whose recorded version is '' (the metadata had not
  // arrived when it was written) must not claim the CURRENT version — that
  // would suppress a change banner for text we cannot compare — but it must
  // still absorb a later change caused by our own save.
  assert.equal(versionReportAction({ reported: '', ownWrite: false, version: 'v2' }), 'skip')
  assert.equal(versionReportAction({ reported: '', ownWrite: true, version: 'v2' }), 'report')
})