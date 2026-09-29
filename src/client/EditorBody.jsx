/**
 * The editor document body: the `dsh-file-editor:editor` implementation the
 * official document preview dispatches `sidebar.right.tab.document` to.
 *
 * The owner (ui-sidebar-documentpreview's TextPreview) keeps the tab, its
 * header, the viewer menu, the wrap toggle, the reload button and the file's
 * metadata; this component owns the content of one file while the reader has
 * picked "Editor" from that menu. Because the implementation declares
 * `loading: 'renderer'`, the owner does NOT read the bytes: it hands over a
 * `content = {kind:'renderer', revision, reload, loaded}` contract and expects
 * the body to load its own revision and report it back with `loaded(version)`.
 * That is exactly what an editor needs — one owner of the read, and the same
 * route reused for the write.
 *
 * Design choices worth stating:
 *  - the draft lives in the plugin-owned registry keyed by resource address
 *    (see drafts.js), so unmounting the tab cannot lose unsaved text;
 *  - a truncated read (> 2 MiB) is READ-ONLY: saving a capped buffer back
 *    would silently destroy the file's tail (upstream let it through);
 *  - the file's CRLF/BOM convention is restored on save (see editor/eol.js),
 *    so an edit never rewrites every line of a Windows file;
 *  - a disk revision arriving while the draft is dirty is announced, never
 *    applied under the reader.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, isAbortError, messageOf } from './api.js'
import { loadEditorChunk, resetEditorChunk } from './chunk-loader.js'
import { peekDraft, putDraft, dropDraft } from './drafts.js'
import { decodeSource, encodeSource } from './editor/eol.js'
import { isDarkScheme, subscribeScheme } from './editor/scheme.js'
import { parseFileAddress } from './resource-address.js'
import { versionReportAction } from './version-report.js'

/** Fallback for a bundle that does not deliver the standard resource hook. */
const NO_RESOURCE_HOOK = () => undefined

/** Keep the hook identity stable: the standard prop never changes mid-mount,
 *  and a hook must be called unconditionally on every render. */
function useStableResourceHook(candidate) {
  const ref = useRef(typeof candidate === 'function' ? candidate : NO_RESOURCE_HOOK)
  return ref.current
}

/** The shared style vocabulary: host theme tokens, no stylesheet of our own. */
const STYLE = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: '12px' },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    minHeight: '28px',
    borderBottom: '1px solid var(--dsw-alias-border-l4)',
    color: 'var(--dsw-alias-label-secondary)',
    flex: '0 0 auto',
  },
  save: {
    border: '1px solid var(--dsw-alias-border-l4)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    borderRadius: '4px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  dirtyDot: { color: 'var(--dsw-alias-label-primary)', lineHeight: 1 },
  notice: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--dsw-alias-border-l4)',
    color: 'var(--dsw-alias-label-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '0 0 auto',
  },
  fill: { flex: '1 1 auto', minHeight: 0, overflow: 'hidden' },
  status: {
    padding: '10px 12px',
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.6,
  },
  spacer: { flex: '1 1 auto' },
}

/**
 * @param props.resourceAddress - the `dsh-resource://file/...` address (the tab's content identity).
 * @param props.content - the owner's renderer contract.
 * @param props.scrollportRef - the owner's ref callback for scroll memory.
 * @param props.useResource - the standard hook giving the file's metadata version.
 * @param props.sessionCwd - the session's working directory as the client knows
 *   it, sent as the host's fallback for a session whose header carries none
 *   (upstream had this AND a session-persistence fallback; the host prefers the
 *   header, so sending it is always safe).
 * @param props.t - the body's locale-bound translate.
 */
export function EditorBody(props) {
  const { resourceAddress, content, scrollportRef, sessionCwd, t } = props
  const useResource = useStableResourceHook(props.useResource)
  const meta = useResource(resourceAddress)
  const file = useMemo(() => parseFileAddress(resourceAddress), [resourceAddress])
  const revision = content?.revision

  const versionRef = useRef('')
  versionRef.current = meta?.value?.version ?? ''
  const contentRef = useRef(content)
  contentRef.current = content

  // A previous mount's unsaved draft wins over a fresh read: the tab was
  // unmounted (tab switch, collapsed sidebar, a look at the official preview),
  // not closed.
  const seed = useMemo(() => peekDraft(resourceAddress), [resourceAddress])
  const [doc, setDoc] = useState(seed?.text ?? '')
  const [savedText, setSavedText] = useState(seed?.savedText ?? '')
  const [encoding, setEncoding] = useState(seed?.encoding ?? { bom: false, eol: '\n' })
  const [size, setSize] = useState(seed?.size ?? 0)
  const [truncated, setTruncated] = useState(seed?.truncated === true)
  const [status, setStatus] = useState(seed === undefined ? 'loading' : 'ready')
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [docVersion, setDocVersion] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)
  const [editorModule, setEditorModule] = useState(undefined)
  const [chunkError, setChunkError] = useState('')
  const [chunkAttempt, setChunkAttempt] = useState(0)
  const [displaced, setDisplaced] = useState(false)
  const [dark, setDark] = useState(() => isDarkScheme())
  /** The live editor's undo/redo handles, set by TextEditor while it is mounted. */
  const editorControls = useRef(null)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })

  const dirty = status === 'ready' && doc !== savedText
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const docRef = useRef(doc)
  docRef.current = doc
  const savedTextRef = useRef(savedText)
  savedTextRef.current = savedText
  const encodingRef = useRef(encoding)
  encodingRef.current = encoding
  const appliedRef = useRef(seed === undefined ? undefined : revision)
  /**
   * The disk version the CURRENT document text descends from: the version
   * observed when the read started (or, when the metadata had not arrived yet,
   * the one observed right after the bytes did). A dirty draft records this, so
   * hydrating it later compares against the version the text actually came
   * from — not against whatever is newest.
   */
  const readVersionRef = useRef(seed?.version ?? '')
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const label = useCallback((key, fallback) => {
    if (typeof t !== 'function') return fallback
    const value = t(key)
    return typeof value === 'string' && value !== '' ? value : fallback
  }, [t])

  /**
   * Report the displayed content's source version to the owner, when the policy
   * in src/client/version-report.js says to (a late-arriving first version, or
   * the version change our own save caused — never an empty token and never a
   * foreign edit, both of which would show the owner's "changed on disk"
   * banner on every open or after every save).
   */
  const loadedVersionRef = useRef(undefined)
  /** Set by a successful save: the next version change is OURS, not a foreign edit. */
  const ownWriteRef = useRef(false)
  /** Set by a successful save: skip the re-read the owner's revision bump would
   *  otherwise cause — re-reading would rebuild the editor and drop its undo
   *  history, and the disk content is exactly the document we just saved. */
  const skipNextReadRef = useRef(false)
  const reportVersion = useCallback(() => {
    const version = versionRef.current
    const action = versionReportAction({
      reported: loadedVersionRef.current,
      ownWrite: ownWriteRef.current,
      version,
    })
    if (action !== 'report') return
    ownWriteRef.current = false
    loadedVersionRef.current = version
    contentRef.current?.loaded?.(version)
  }, [])

  // Load one document revision. Skipped when a draft from an earlier mount is
  // already in hand; announced (never applied) when the draft is dirty.
  useEffect(() => {
    if (content === undefined) return undefined
    if (file === undefined) {
      setStatus('unresolved')
      return undefined
    }
    const first = appliedRef.current === undefined
    appliedRef.current = revision
    // A new revision re-opens the version report: the settle effect below may
    // fire once for it.
    loadedVersionRef.current = undefined
    if (first && seed !== undefined) {
      // A draft is not a disk read. Report the version the draft was written at
      // (an unknown one reports nothing and keeps the settle effect out of the
      // way), so a file edited while the tab was closed still raises the
      // owner's change banner instead of the stale draft claiming the current
      // version.
      const draftVersion = typeof seed.version === 'string' ? seed.version : ''
      loadedVersionRef.current = draftVersion
      if (draftVersion !== '') contentRef.current?.loaded?.(draftVersion)
      return undefined
    }
    if (!first && dirtyRef.current) {
      setDisplaced(true)
      return undefined
    }
    // Our own save bumped the version (and the owner's revision with it): the
    // document on screen already IS the disk content, so keep the editor (and
    // its undo history) instead of re-reading and rebuilding the view.
    if (!first && skipNextReadRef.current) {
      skipNextReadRef.current = false
      readVersionRef.current = versionRef.current
      return undefined
    }
    const controller = new AbortController()
    let cancelled = false
    const versionAtReadStart = versionRef.current
    setStatus('loading')
    setError('')
    api.read({ sessionId: file.sessionId, path: file.path, cwd: sessionCwd?.() }, controller.signal)
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'binary') {
          setStatus('binary')
          setSize(typeof result.size === 'number' ? result.size : 0)
          setTruncated(result.truncated === true)
          reportVersion()
          return
        }
        const decoded = decodeSource(typeof result.content === 'string' ? result.content : '')
        const nextEncoding = { bom: decoded.bom, eol: decoded.eol }
        const nextSize = typeof result.size === 'number' ? result.size : 0
        const nextTruncated = result.truncated === true
        setDoc(decoded.text)
        setSavedText(decoded.text)
        setEncoding(nextEncoding)
        setSize(nextSize)
        setTruncated(nextTruncated)
        setStatus('ready')
        setError('')
        setDocVersion((value) => value + 1)
        readVersionRef.current = versionAtReadStart !== '' ? versionAtReadStart : versionRef.current
        reportVersion()
      })
      .catch((thrown) => {
        if (cancelled || isAbortError(thrown)) return
        setError(messageOf(thrown))
        setStatus('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
    // `content` is read through a ref: only the REVISION may trigger a read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, reloadToken, file, seed, resourceAddress])

  // Settle the version report whenever the resource version moves: the policy
  // (src/client/version-report.js) reports a late-arriving FIRST version and
  // absorbs our own save, while leaving a foreign edit unreported — which is
  // what makes the owner raise its "changed on disk" banner.
  const resourceVersion = meta?.value?.version
  useEffect(() => {
    if (content === undefined) return
    reportVersion()
    // `reportVersion` reads live refs; the version's arrival is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceVersion, content, revision])

  // Persist the draft — but ONLY while it is dirty. A merely opened file is not
  // a draft (keeping one would retain a full copy of it, up to the 2 MiB read
  // cap, for the lifetime of the page), and a clean state drops any draft the
  // previous mount left behind.
  useEffect(() => {
    if (status !== 'ready') return
    if (doc === savedText) {
      dropDraft(resourceAddress)
      return
    }
    putDraft(resourceAddress, {
      text: doc,
      savedText,
      encoding,
      size,
      truncated,
      // The disk version this text was read at: reported instead of the current
      // one if this draft outlives its tab (see drafts.js).
      version: readVersionRef.current,
    })
  }, [resourceAddress, status, doc, savedText, encoding, size, truncated])

  // The heavy editor (CodeMirror + its language packages) is fetched the first
  // time a reader actually picks this viewer.
  useEffect(() => {
    if (status !== 'ready') return undefined
    let cancelled = false
    loadEditorChunk()
      .then((module) => {
        if (cancelled) return
        setEditorModule(module)
        setChunkError('')
      })
      .catch((thrown) => {
        if (cancelled) return
        setChunkError(messageOf(thrown))
      })
    return () => { cancelled = true }
  }, [status, chunkAttempt])

  // Re-read the scheme when the app flips it.
  useEffect(() => subscribeScheme(() => setDark(isDarkScheme())), [])

  // Clear the transient "saved" line.
  useEffect(() => {
    if (saveState !== 'saved') return undefined
    const timer = setTimeout(() => {
      if (mountedRef.current) setSaveState('idle')
    }, 2500)
    return () => clearTimeout(timer)
  }, [saveState])

  const save = useCallback(() => {
    if (file === undefined || status !== 'ready' || truncated) return
    if (docRef.current === savedTextRef.current) return
    setSaveState('saving')
    setError('')
    api.write({
      sessionId: file.sessionId,
      path: file.path,
      cwd: sessionCwd?.(),
      content: encodeSource(docRef.current, encodingRef.current),
    })
      .then(() => {
        if (!mountedRef.current) return
        // The version is about to change because of THIS write.
        ownWriteRef.current = true
        skipNextReadRef.current = true
        setSavedText(docRef.current)
        setSaveState('saved')
      })
      .catch((thrown) => {
        if (!mountedRef.current) return
        setSaveState('failed')
        setError(messageOf(thrown))
      })
  }, [file, status, truncated])

  /** Re-read the current revision from disk, discarding the draft. */
  const reloadFromDisk = useCallback(() => {
    dropDraft(resourceAddress)
    dirtyRef.current = false
    skipNextReadRef.current = false
    setDisplaced(false)
    setReloadToken((value) => value + 1)
  }, [resourceAddress])

  /** Retry a failed chunk load without touching the draft. */
  const retryChunk = useCallback(() => {
    resetEditorChunk()
    setChunkError('')
    setChunkAttempt((value) => value + 1)
  }, [])

  const retryRead = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const saveLabel = saveState === 'saving'
    ? '正在保存…'
    : saveState === 'saved'
      ? '已保存'
      : saveState === 'failed'
        ? '保存失败'
        : ''

  let body
  if (status === 'unresolved') {
    body = <p style={STYLE.status} data-file-editor-state="unresolved">{label('unresolved', '无法解析该文件的地址。')}</p>
  } else if (status === 'loading') {
    body = <p style={STYLE.status} data-file-editor-state="loading">{label('loading', '正在读取…')}</p>
  } else if (status === 'error') {
    body = (
      <div style={STYLE.status} data-file-editor-state="error">
        <p style={{ margin: 0 }}>{label('readFailed', '读取失败：')}{error}</p>
        <button type="button" style={{ ...STYLE.save, marginTop: '8px' }} onClick={retryRead}>{label('retry', '重试')}</button>
      </div>
    )
  } else if (status === 'binary') {
    body = (
      <p style={STYLE.status} data-file-editor-state="binary">
        {label('binary', '这是二进制文件，请在查看器下拉里切回官方预览。')}
        {size > 0 ? ` (${size} B)` : ''}
      </p>
    )
  } else if (chunkError !== '') {
    body = (
      <div style={STYLE.status} data-file-editor-state="chunk-error">
        <p style={{ margin: 0 }}>{label('editorUnavailable', '编辑器加载失败：')}{chunkError}</p>
        <button type="button" style={{ ...STYLE.save, marginTop: '8px' }} onClick={retryChunk}>{label('retry', '重试')}</button>
      </div>
    )
  } else if (editorModule === undefined) {
    body = <p style={STYLE.status} data-file-editor-state="loading-editor">{label('loading', '正在读取…')}</p>
  } else {
    const TextEditor = editorModule.TextEditor
    body = (
      <TextEditor
        value={doc}
        path={file?.path ?? ''}
        resetKey={docVersion}
        readOnly={truncated}
        dark={dark}
        onChange={setDoc}
        onSave={save}
        controlsRef={editorControls}
        onHistoryState={setHistoryState}
        onScrollport={scrollportRef}
      />
    )
  }

  return (
    <div data-file-editor-root="" data-file-editor-status={status} style={STYLE.root}>
      {displaced && (
        <div style={STYLE.notice} data-file-editor-displaced="">
          <span>{label('reloadedOnDisk', '磁盘内容已重新读取，你有未保存的修改。')}</span>
          <button type="button" style={STYLE.save} onClick={() => setDisplaced(false)}>{label('keepMine', '保留我的修改')}</button>
          <button type="button" style={STYLE.save} onClick={reloadFromDisk}>{label('discardMine', '放弃并重新加载')}</button>
        </div>
      )}
      <div style={STYLE.toolbar} data-file-editor-toolbar="">
        {dirty && <span style={STYLE.dirtyDot} title={label('unsaved', '有未保存的修改')} data-file-editor-dirty="">●</span>}
        <button
          type="button"
          style={{ ...STYLE.save, opacity: dirty && !truncated ? 1 : 0.5 }}
          disabled={!dirty || truncated}
          onClick={save}
          title="保存 (Ctrl/Cmd+S)"
          data-file-editor-save=""
        >
          保存
        </button>
        <button
          type="button"
          style={{ ...STYLE.save, opacity: historyState.canUndo ? 1 : 0.5 }}
          disabled={!historyState.canUndo}
          onClick={() => editorControls.current?.undo()}
          title="撤销 (Ctrl/Cmd+Z)"
          data-file-editor-undo=""
        >
          撤销
        </button>
        <button
          type="button"
          style={{ ...STYLE.save, opacity: historyState.canRedo ? 1 : 0.5 }}
          disabled={!historyState.canRedo}
          onClick={() => editorControls.current?.redo()}
          title="重做 (Ctrl/Cmd+Shift+Z)"
          data-file-editor-redo=""
        >
          重做
        </button>
        <button
          type="button"
          style={STYLE.save}
          onClick={() => editorControls.current?.openSearch()}
          title="搜索 (Ctrl/Cmd+F)"
          data-file-editor-search=""
        >
          搜索
        </button>
        {saveLabel !== '' && <span data-file-editor-save-state={saveState}>{saveLabel}</span>}
        <span style={STYLE.spacer} />
        {truncated && (
          <span data-file-editor-truncated="" title={label('truncationHint', '只读取了文件的前 2 MiB，为避免破坏文件已禁止保存。')}>
            {label('truncation', '文件过大，只读')}
          </span>
        )}
        {size > 0 && <span>{size} B</span>}
      </div>
      {error !== '' && status === 'ready' && (
        <div style={STYLE.notice} data-file-editor-error="">{error}</div>
      )}
      <div style={STYLE.fill}>{body}</div>
    </div>
  )
}