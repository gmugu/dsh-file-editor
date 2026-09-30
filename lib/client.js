window.__ModuleLoader__.load({
	id: "dsh-file-editor",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/EditorBody.jsx
var import_react = require("react");

// src/client/api.js
var ENDPOINT = "/file-editor/api";
var FileEditorApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FileEditorApiError";
    this.code = code;
  }
};
function scopePayload(scope, extra) {
  return {
    sessionId: scope.sessionId,
    ...scope.cwd !== void 0 && scope.cwd !== "" ? { cwd: scope.cwd } : {},
    ...extra
  };
}
async function call(method, payload, signal) {
  let response;
  try {
    response = await fetch(`${ENDPOINT}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });
  } catch (error) {
    if (typeof DOMException === "function" && error instanceof DOMException && error.name === "AbortError") throw error;
    throw new FileEditorApiError("network", error instanceof Error ? error.message : String(error));
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new FileEditorApiError("internal", `invalid response (${response.status})`);
  }
  if (body?.ok === true) return body.value;
  const code = typeof body?.error?.code === "string" ? body.error.code : "internal";
  const message = typeof body?.error?.message === "string" ? body.error.message : `request failed (${response.status})`;
  throw new FileEditorApiError(code, message);
}
function isAbortError(error) {
  return typeof DOMException === "function" && error instanceof DOMException && error.name === "AbortError";
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
var api = {
  /** Read one file: text (bounded) or a binary sniff. */
  read: (scope, signal) => call("fs.read", scopePayload(scope, { path: scope.path }), signal),
  /** Write one file atomically. */
  write: (scope) => call("fs.write", scopePayload(scope, { path: scope.path, content: scope.content }))
};

// src/client/chunk-loader.js
var CHUNK_NAME = "editor";
var CHUNK_URL = `/file-editor/bundle/${CHUNK_NAME}.js`;
var CHUNK_EXTERNALS = ["react", "react/jsx-runtime"];
var MODULE_SYSTEM_GLOBAL = "__dshFileEditorModuleSystem__";
var CHUNK_REGISTRY_GLOBAL = "__dshFileEditorChunks__";
var injectedModuleSystem;
function setChunkModuleSystem(system) {
  injectedModuleSystem = system;
  const global = globalThis;
  if (system === void 0) delete global[MODULE_SYSTEM_GLOBAL];
  else global[MODULE_SYSTEM_GLOBAL] = system;
}
function moduleSystem() {
  return injectedModuleSystem ?? globalThis[MODULE_SYSTEM_GLOBAL];
}
function chunkRegistry() {
  const global = globalThis;
  if (global[CHUNK_REGISTRY_GLOBAL] === void 0) global[CHUNK_REGISTRY_GLOBAL] = {};
  return global[CHUNK_REGISTRY_GLOBAL];
}
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.async = true;
    element.src = src;
    element.addEventListener("load", () => {
      element.remove();
      resolve();
    }, { once: true });
    element.addEventListener("error", () => {
      element.remove();
      reject(new Error(`[dsh-file-editor] chunk script ${src} failed to load`));
    }, { once: true });
    document.head.append(element);
  });
}
var externalsRequire;
async function buildExternalsRequire(modules) {
  if (externalsRequire !== void 0) return externalsRequire;
  const entries = await Promise.all(CHUNK_EXTERNALS.map(async (spec) => {
    try {
      return [spec, await modules.import(spec)];
    } catch {
      return [spec, void 0];
    }
  }));
  const table = new Map(entries);
  externalsRequire = (spec) => {
    if (!table.has(spec)) {
      throw new Error(`[dsh-file-editor] chunk require('${spec}') missed the module table`);
    }
    return table.get(spec);
  };
  return externalsRequire;
}
var cache;
async function loadEditorChunk() {
  if (cache !== void 0) return cache;
  const task = (async () => {
    const modules = moduleSystem();
    if (modules === void 0) {
      throw new Error("[dsh-file-editor] editor chunk: client module system unavailable");
    }
    await injectScript(CHUNK_URL);
    const factory = chunkRegistry()[CHUNK_NAME];
    if (typeof factory !== "function") {
      throw new Error("[dsh-file-editor] editor chunk script did not register its factory");
    }
    const require2 = await buildExternalsRequire(modules);
    return factory(require2);
  })();
  cache = task;
  task.catch(() => {
    if (cache === task) cache = void 0;
  });
  return task;
}
function resetEditorChunk() {
  cache = void 0;
  externalsRequire = void 0;
}

// src/client/drafts.js
var drafts = /* @__PURE__ */ new Map();
function peekDraft(address) {
  return drafts.get(address);
}
function putDraft(address, draft) {
  drafts.set(address, draft);
}
function dropDraft(address) {
  drafts.delete(address);
}

// src/client/editor/eol.js
var BOM = "\uFEFF";
function decodeSource(source) {
  const bom = source.startsWith(BOM);
  const text = bom ? source.slice(1) : source;
  return { bom, eol: detectLineEnding(text), text };
}
function detectLineEnding(text) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") return index > 0 && text[index - 1] === "\r" ? "\r\n" : "\n";
    if (char === "\r") return text[index + 1] === "\n" ? "\r\n" : "\r";
  }
  return "\n";
}
function encodeSource(text, encoding) {
  const eol = encoding?.eol ?? "\n";
  const body = eol === "\n" ? text : text.replace(/\n/g, eol);
  return encoding?.bom === true ? BOM + body : body;
}

// src/client/editor/scheme.js
function isDarkScheme() {
  if (typeof document === "undefined") return true;
  const decided = document.documentElement.style.colorScheme !== "";
  if (decided) return document.body.hasAttribute("data-ds-dark-theme");
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}
function subscribeScheme(callback) {
  if (typeof document === "undefined") return () => {
  };
  const observer = new MutationObserver(() => {
    callback();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
  return () => {
    observer.disconnect();
  };
}

// src/client/resource-address.js
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function isDriveSegment(segment) {
  return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
}
function parseFileAddress(address) {
  try {
    if (typeof address !== "string" || !address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
    const end = address.search(/[?#]/);
    const [scope, ...rest] = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? void 0 : end).split("/");
    if (scope === "session") {
      const [id, ...segments] = rest;
      if (id === void 0 || id === "" || segments.length === 0) return void 0;
      return {
        scope,
        sessionId: decodeURIComponent(id),
        path: segments.map(decodeURIComponent).join("/")
      };
    }
    if (scope === "absolute") {
      const unc = rest[0] === "" && rest.length > 1;
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
      if (segments.length === 0 || segments[0] === "") return void 0;
      if (unc) return { scope, path: `//${segments.join("/")}` };
      return { scope, path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}` };
    }
    return void 0;
  } catch {
    return void 0;
  }
}

// src/client/version-report.js
function versionReportAction({ reported, ownWrite, version }) {
  if (typeof version !== "string" || version === "") return "skip";
  if (reported === version) return "skip";
  if (reported === void 0) return "report";
  return ownWrite === true ? "report" : "skip";
}

// src/client/EditorBody.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var NO_RESOURCE_HOOK = () => void 0;
function useStableResourceHook(candidate) {
  const ref = (0, import_react.useRef)(typeof candidate === "function" ? candidate : NO_RESOURCE_HOOK);
  return ref.current;
}
var STYLE = {
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontSize: "12px" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    minHeight: "28px",
    borderBottom: "1px solid var(--dsw-alias-border-l4)",
    color: "var(--dsw-alias-label-secondary)",
    flex: "0 0 auto"
  },
  save: {
    border: "1px solid var(--dsw-alias-border-l4)",
    background: "transparent",
    color: "var(--dsw-alias-label-primary)",
    borderRadius: "4px",
    padding: "2px 8px",
    cursor: "pointer",
    fontSize: "12px"
  },
  dirtyDot: { color: "var(--dsw-alias-label-primary)", lineHeight: 1 },
  notice: {
    padding: "6px 8px",
    borderBottom: "1px solid var(--dsw-alias-border-l4)",
    color: "var(--dsw-alias-label-secondary)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: "0 0 auto"
  },
  fill: { flex: "1 1 auto", minHeight: 0, overflow: "hidden" },
  status: {
    padding: "10px 12px",
    color: "var(--dsw-alias-label-secondary)",
    lineHeight: 1.6
  },
  spacer: { flex: "1 1 auto" }
};
function EditorBody(props) {
  const { resourceAddress, content, scrollportRef, sessionCwd, t } = props;
  const useResource = useStableResourceHook(props.useResource);
  const meta = useResource(resourceAddress);
  const file = (0, import_react.useMemo)(() => parseFileAddress(resourceAddress), [resourceAddress]);
  const revision = content?.revision;
  const versionRef = (0, import_react.useRef)("");
  versionRef.current = meta?.value?.version ?? "";
  const contentRef = (0, import_react.useRef)(content);
  contentRef.current = content;
  const seed = (0, import_react.useMemo)(() => peekDraft(resourceAddress), [resourceAddress]);
  const [doc, setDoc] = (0, import_react.useState)(seed?.text ?? "");
  const [savedText, setSavedText] = (0, import_react.useState)(seed?.savedText ?? "");
  const [encoding, setEncoding] = (0, import_react.useState)(seed?.encoding ?? { bom: false, eol: "\n" });
  const [size, setSize] = (0, import_react.useState)(seed?.size ?? 0);
  const [truncated, setTruncated] = (0, import_react.useState)(seed?.truncated === true);
  const [status, setStatus] = (0, import_react.useState)(seed === void 0 ? "loading" : "ready");
  const [error, setError] = (0, import_react.useState)("");
  const [saveState, setSaveState] = (0, import_react.useState)("idle");
  const [docVersion, setDocVersion] = (0, import_react.useState)(0);
  const [reloadToken, setReloadToken] = (0, import_react.useState)(0);
  const [editorModule, setEditorModule] = (0, import_react.useState)(void 0);
  const [chunkError, setChunkError] = (0, import_react.useState)("");
  const [chunkAttempt, setChunkAttempt] = (0, import_react.useState)(0);
  const [displaced, setDisplaced] = (0, import_react.useState)(false);
  const [dark, setDark] = (0, import_react.useState)(() => isDarkScheme());
  const editorControls = (0, import_react.useRef)(null);
  const [historyState, setHistoryState] = (0, import_react.useState)({ canUndo: false, canRedo: false });
  const dirty = status === "ready" && doc !== savedText;
  const dirtyRef = (0, import_react.useRef)(dirty);
  dirtyRef.current = dirty;
  const docRef = (0, import_react.useRef)(doc);
  docRef.current = doc;
  const savedTextRef = (0, import_react.useRef)(savedText);
  savedTextRef.current = savedText;
  const encodingRef = (0, import_react.useRef)(encoding);
  encodingRef.current = encoding;
  const appliedRef = (0, import_react.useRef)(seed === void 0 ? void 0 : revision);
  const readVersionRef = (0, import_react.useRef)(seed?.version ?? "");
  const mountedRef = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => () => {
    mountedRef.current = false;
  }, []);
  const label = (0, import_react.useCallback)((key, fallback) => {
    if (typeof t !== "function") return fallback;
    const value = t(key);
    return typeof value === "string" && value !== "" ? value : fallback;
  }, [t]);
  const loadedVersionRef = (0, import_react.useRef)(void 0);
  const ownWriteRef = (0, import_react.useRef)(false);
  const skipNextReadRef = (0, import_react.useRef)(false);
  const reportVersion = (0, import_react.useCallback)(() => {
    const version = versionRef.current;
    const action = versionReportAction({
      reported: loadedVersionRef.current,
      ownWrite: ownWriteRef.current,
      version
    });
    if (action !== "report") return;
    ownWriteRef.current = false;
    loadedVersionRef.current = version;
    contentRef.current?.loaded?.(version);
  }, []);
  (0, import_react.useEffect)(() => {
    if (content === void 0) return void 0;
    if (file === void 0) {
      setStatus("unresolved");
      return void 0;
    }
    const first = appliedRef.current === void 0;
    appliedRef.current = revision;
    loadedVersionRef.current = void 0;
    if (first && seed !== void 0) {
      const draftVersion = typeof seed.version === "string" ? seed.version : "";
      loadedVersionRef.current = draftVersion;
      if (draftVersion !== "") contentRef.current?.loaded?.(draftVersion);
      return void 0;
    }
    if (!first && dirtyRef.current) {
      setDisplaced(true);
      return void 0;
    }
    if (!first && skipNextReadRef.current) {
      skipNextReadRef.current = false;
      readVersionRef.current = versionRef.current;
      return void 0;
    }
    const controller = new AbortController();
    let cancelled = false;
    const versionAtReadStart = versionRef.current;
    setStatus("loading");
    setError("");
    api.read({ sessionId: file.sessionId, path: file.path, cwd: sessionCwd?.() }, controller.signal).then((result) => {
      if (cancelled) return;
      if (result.kind === "binary") {
        setStatus("binary");
        setSize(typeof result.size === "number" ? result.size : 0);
        setTruncated(result.truncated === true);
        reportVersion();
        return;
      }
      const decoded = decodeSource(typeof result.content === "string" ? result.content : "");
      const nextEncoding = { bom: decoded.bom, eol: decoded.eol };
      const nextSize = typeof result.size === "number" ? result.size : 0;
      const nextTruncated = result.truncated === true;
      setDoc(decoded.text);
      setSavedText(decoded.text);
      setEncoding(nextEncoding);
      setSize(nextSize);
      setTruncated(nextTruncated);
      setStatus("ready");
      setError("");
      setDocVersion((value) => value + 1);
      readVersionRef.current = versionAtReadStart !== "" ? versionAtReadStart : versionRef.current;
      reportVersion();
    }).catch((thrown) => {
      if (cancelled || isAbortError(thrown)) return;
      setError(messageOf(thrown));
      setStatus("error");
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [revision, reloadToken, file, seed, resourceAddress]);
  const resourceVersion = meta?.value?.version;
  (0, import_react.useEffect)(() => {
    if (content === void 0) return;
    reportVersion();
  }, [resourceVersion, content, revision]);
  (0, import_react.useEffect)(() => {
    if (status !== "ready") return;
    if (doc === savedText) {
      dropDraft(resourceAddress);
      return;
    }
    putDraft(resourceAddress, {
      text: doc,
      savedText,
      encoding,
      size,
      truncated,
      // The disk version this text was read at: reported instead of the current
      // one if this draft outlives its tab (see drafts.js).
      version: readVersionRef.current
    });
  }, [resourceAddress, status, doc, savedText, encoding, size, truncated]);
  (0, import_react.useEffect)(() => {
    if (status !== "ready") return void 0;
    let cancelled = false;
    loadEditorChunk().then((module2) => {
      if (cancelled) return;
      setEditorModule(module2);
      setChunkError("");
    }).catch((thrown) => {
      if (cancelled) return;
      setChunkError(messageOf(thrown));
    });
    return () => {
      cancelled = true;
    };
  }, [status, chunkAttempt]);
  (0, import_react.useEffect)(() => subscribeScheme(() => setDark(isDarkScheme())), []);
  (0, import_react.useEffect)(() => {
    if (saveState !== "saved") return void 0;
    const timer = setTimeout(() => {
      if (mountedRef.current) setSaveState("idle");
    }, 2500);
    return () => clearTimeout(timer);
  }, [saveState]);
  const save = (0, import_react.useCallback)(() => {
    if (file === void 0 || status !== "ready" || truncated) return;
    if (docRef.current === savedTextRef.current) return;
    setSaveState("saving");
    setError("");
    api.write({
      sessionId: file.sessionId,
      path: file.path,
      cwd: sessionCwd?.(),
      content: encodeSource(docRef.current, encodingRef.current)
    }).then(() => {
      if (!mountedRef.current) return;
      ownWriteRef.current = true;
      skipNextReadRef.current = true;
      setSavedText(docRef.current);
      setSaveState("saved");
    }).catch((thrown) => {
      if (!mountedRef.current) return;
      setSaveState("failed");
      setError(messageOf(thrown));
    });
  }, [file, status, truncated]);
  const reloadFromDisk = (0, import_react.useCallback)(() => {
    dropDraft(resourceAddress);
    dirtyRef.current = false;
    skipNextReadRef.current = false;
    setDisplaced(false);
    setReloadToken((value) => value + 1);
  }, [resourceAddress]);
  const retryChunk = (0, import_react.useCallback)(() => {
    resetEditorChunk();
    setChunkError("");
    setChunkAttempt((value) => value + 1);
  }, []);
  const retryRead = (0, import_react.useCallback)(() => {
    setReloadToken((value) => value + 1);
  }, []);
  const saveLabel = saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存" : saveState === "failed" ? "保存失败" : "";
  let body;
  if (status === "unresolved") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: STYLE.status, "data-file-editor-state": "unresolved", children: label("unresolved", "无法解析该文件的地址。") });
  } else if (status === "loading") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: STYLE.status, "data-file-editor-state": "loading", children: label("loading", "正在读取…") });
  } else if (status === "error") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.status, "data-file-editor-state": "error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { margin: 0 }, children: [
        label("readFailed", "读取失败："),
        error
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...STYLE.save, marginTop: "8px" }, onClick: retryRead, children: label("retry", "重试") })
    ] });
  } else if (status === "binary") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: STYLE.status, "data-file-editor-state": "binary", children: [
      label("binary", "这是二进制文件，请在查看器下拉里切回官方预览。"),
      size > 0 ? ` (${size} B)` : ""
    ] });
  } else if (chunkError !== "") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.status, "data-file-editor-state": "chunk-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { margin: 0 }, children: [
        label("editorUnavailable", "编辑器加载失败："),
        chunkError
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...STYLE.save, marginTop: "8px" }, onClick: retryChunk, children: label("retry", "重试") })
    ] });
  } else if (editorModule === void 0) {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: STYLE.status, "data-file-editor-state": "loading-editor", children: label("loading", "正在读取…") });
  } else {
    const TextEditor = editorModule.TextEditor;
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      TextEditor,
      {
        value: doc,
        path: file?.path ?? "",
        resetKey: docVersion,
        readOnly: truncated,
        dark,
        onChange: setDoc,
        onSave: save,
        controlsRef: editorControls,
        onHistoryState: setHistoryState,
        onScrollport: scrollportRef
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-file-editor-root": "", "data-file-editor-status": status, style: STYLE.root, children: [
    displaced && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.notice, "data-file-editor-displaced": "", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label("reloadedOnDisk", "磁盘内容已重新读取，你有未保存的修改。") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.save, onClick: () => setDisplaced(false), children: label("keepMine", "保留我的修改") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.save, onClick: reloadFromDisk, children: label("discardMine", "放弃并重新加载") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.toolbar, "data-file-editor-toolbar": "", children: [
      dirty && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.dirtyDot, title: label("unsaved", "有未保存的修改"), "data-file-editor-dirty": "", children: "●" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: { ...STYLE.save, opacity: dirty && !truncated ? 1 : 0.5 },
          disabled: !dirty || truncated,
          onClick: save,
          title: "保存 (Ctrl/Cmd+S)",
          "data-file-editor-save": "",
          children: "保存"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: { ...STYLE.save, opacity: historyState.canUndo ? 1 : 0.5 },
          disabled: !historyState.canUndo,
          onClick: () => editorControls.current?.undo(),
          title: "撤销 (Ctrl/Cmd+Z)",
          "data-file-editor-undo": "",
          children: "撤销"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: { ...STYLE.save, opacity: historyState.canRedo ? 1 : 0.5 },
          disabled: !historyState.canRedo,
          onClick: () => editorControls.current?.redo(),
          title: "重做 (Ctrl/Cmd+Shift+Z)",
          "data-file-editor-redo": "",
          children: "重做"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: STYLE.save,
          onClick: () => editorControls.current?.openSearch(),
          title: "搜索 (Ctrl/Cmd+F)",
          "data-file-editor-search": "",
          children: "搜索"
        }
      ),
      saveLabel !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-file-editor-save-state": saveState, children: saveLabel }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.spacer }),
      truncated && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-file-editor-truncated": "", title: label("truncationHint", "只读取了文件的前 2 MiB，为避免破坏文件已禁止保存。"), children: label("truncation", "文件过大，只读") }),
      size > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        size,
        " B"
      ] })
    ] }),
    error !== "" && status === "ready" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.notice, "data-file-editor-error": "", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fill, children: body })
  ] });
}

// src/client/definition.js
var EDITOR_ID = "dsh-file-editor:editor";
var CODE_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "sh",
  "bash",
  "zsh",
  "fish",
  "json",
  "jsonc",
  "jsonl",
  "ndjson",
  "ipynb",
  "csv",
  "py",
  "pyw",
  "pyi",
  "rb",
  "rake",
  "gemspec",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cc",
  "cpp",
  "cxx",
  "hh",
  "hpp",
  "hxx",
  "cs",
  "kt",
  "kts",
  "swift",
  "php",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "properties",
  "env",
  "log",
  "diff",
  "patch",
  "http",
  "md",
  "markdown",
  "mdx",
  "rst",
  "tex",
  "sty",
  "cls",
  "bib",
  "adoc",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "less",
  "sql",
  "xml",
  "xsd",
  "xsl",
  "xslt",
  "plist",
  "svg",
  "lua",
  "bat",
  "cmd",
  "ps1",
  "psm1",
  "psd1",
  "r",
  "jl",
  "dart",
  "scala",
  "clj",
  "cljs",
  "edn",
  "erl",
  "hrl",
  "ex",
  "exs",
  "hs",
  "fs",
  "fsi",
  "fsx",
  "vb",
  "pl",
  "pm",
  "v",
  "sv",
  "svh",
  "graphql",
  "gql",
  "proto",
  "tf",
  "tfvars",
  "hcl",
  "nix",
  "vue",
  "svelte",
  "makefile",
  "mk",
  "cmake",
  "gradle",
  "groovy"
];
var EXTRA_EXTENSIONS = [
  // generic plain text and delimited data. csv/tsv are NOT here: the official
  // spreadsheet viewer declares xlsx/xls/csv/tsv, so those keep the official
  // table preview involved and this plugin follows them in CODE-set style.
  "txt",
  "text",
  "psv",
  // text-based data and interchange formats
  "jsonnet",
  "lock",
  "sum",
  "mod",
  "work",
  "geojson",
  "gpx",
  "kml",
  // configuration files that carry a suffix
  "cnf",
  "config",
  "rc",
  "desktop",
  "reg",
  "service",
  // dotfile-style configuration (matched after the leading dot)
  "gitignore",
  "gitattributes",
  "gitmodules",
  "gitconfig",
  "mailmap",
  "editorconfig",
  "envrc",
  "htaccess",
  "dockerignore",
  "npmignore",
  "eslintignore",
  "prettierignore",
  "helmignore",
  "npmrc",
  "nvmrc",
  "yarnrc",
  "babelrc",
  "eslintrc",
  "prettierrc",
  "stylelintrc",
  "swcrc",
  "browserslistrc",
  "pylintrc",
  "flake8",
  "gemrc",
  "bashrc",
  "bash_profile",
  "profile",
  "zprofile",
  "zshrc",
  "vimrc",
  "gvimrc",
  "nanorc",
  "clang-format",
  "clang-tidy",
  // build and project files
  "mak",
  "dockerfile",
  // markup and documentation
  "asciidoc",
  "org",
  "textile",
  "ltx",
  // templating
  "tpl",
  "tmpl",
  "mustache",
  "hbs",
  "handlebars",
  "ejs",
  "pug",
  "njk",
  "liquid",
  "j2",
  "jinja",
  "jinja2",
  // source languages and dialects the official code viewer does not list
  "astro",
  "phtml",
  "csx",
  "cshtml",
  "aspx",
  "jsp",
  "sass",
  "styl",
  "rmd",
  "tcl",
  "cljc",
  "sc",
  "pas",
  "pp",
  "vhd",
  "vhdl",
  "prisma",
  "sol",
  "zig",
  "nim",
  "f90",
  "f95",
  "for",
  "asm",
  // certificate and key material that is text
  "pem",
  "crt",
  "csr",
  // subtitles, playlists, calendar and contact text
  "srt",
  "vtt",
  "ass",
  "ssa",
  "m3u",
  "m3u8",
  "ics",
  "vcf"
];
var EDITOR_EXTENSIONS = [...CODE_EXTENSIONS, ...EXTRA_EXTENSIONS];
var LOCALE_NS = "dshFileEditor";

// src/client/theme-bridge.js
var PREVIEW_BODY_SELECTOR = "[data-textpreview-body]";
var CODE_FONT_TOKEN_CSS = `${PREVIEW_BODY_SELECTOR}{--dsw-font-mono:var(--dsw-font-markdown-code-block-font-family,var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace))}`;

// src/client/index.jsx
var inject = ["slots", "locale", "modules", "documentPreviews", "sessions"];
var zh = {
  viewerName: "编辑器",
  save: "保存",
  saving: "正在保存…",
  saved: "已保存",
  saveFailed: "保存失败",
  unsaved: "有未保存的修改",
  loading: "正在读取…",
  retry: "重试",
  readFailed: "读取失败：",
  editorUnavailable: "编辑器加载失败：",
  binary: "这是二进制文件，请在查看器下拉里切回官方预览。",
  truncation: "文件过大，只读",
  truncationHint: "只读取了文件的前 2 MiB，为避免破坏文件已禁止保存。",
  unresolved: "无法解析该文件的地址。",
  reloadedOnDisk: "磁盘内容已重新读取，你有未保存的修改。",
  keepMine: "保留我的修改",
  discardMine: "放弃并重新加载"
};
var en = {
  viewerName: "Editor",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  saveFailed: "Save failed",
  unsaved: "Unsaved changes",
  loading: "Reading…",
  retry: "Retry",
  readFailed: "Read failed: ",
  editorUnavailable: "Editor failed to load: ",
  binary: "This is a binary file — pick the official preview in the viewer menu.",
  truncation: "Too large, read-only",
  truncationHint: "Only the first 2 MiB was read; saving is disabled so the file cannot be truncated.",
  unresolved: "This file address cannot be resolved.",
  reloadedOnDisk: "The file changed on disk and you have unsaved changes.",
  keepMine: "Keep my changes",
  discardMine: "Discard and reload"
};
function apply(ctx) {
  setChunkModuleSystem(ctx.modules);
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {
    };
    const style = document.createElement("style");
    style.dataset.dshFileEditor = "code-font-token";
    style.textContent = CODE_FONT_TOKEN_CSS;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "dsh-file-editor: preview code-font token");
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "dsh-file-editor: locale");
  const t = ctx.locale.bind(LOCALE_NS);
  ctx.effect(() => ctx.documentPreviews.register({
    id: EDITOR_ID,
    // The official code viewer's suffixes (so the official preview stays the
    // default there) PLUS the documented plain-text extras (`txt`, `log`,
    // `.env`, `.gitignore`, …) that no official viewer declares and that would
    // otherwise have no editor entry at all. See definition.js.
    extensions: EDITOR_EXTENSIONS,
    // NOT 'extension': this plugin must never outrank the shipped preview.
    priority: "builtin",
    // The viewer menu's label and the menu button's text while selected.
    title: () => t("viewerName"),
    // We own the read (through our own host route) and the write.
    loading: "renderer",
    // The preview's own wrap toggle does not apply to a CodeMirror surface.
    wrap: false
  }), "dsh-file-editor: editor viewer");
  ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
    name: "sidebar.right.tab.document",
    key: EDITOR_ID,
    locale: LOCALE_NS,
    // The host prefers the SESSION HEADER's working directory and only falls
    // back to this one, so sending the client's idea of it is always safe — and
    // it restores the fallback upstream had (which additionally consulted the
    // session-persistence index; that part is not carried over). A shape this
    // build does not expose degrades to `undefined`, which leaves the host's
    // header-only behaviour intact.
    inject: (sessionId) => ({
      sessionCwd: () => ctx.sessions?.list?.getSnapshot()?.byId?.[sessionId]?.cwd
    })
  }, EditorBody)), "dsh-file-editor: editor body");
}

		return module.exports;
	}
});
