# dsh-file-editor

**An "Editor" entry inside the official file preview of the DSH Web right sidebar.** Opening a file behaves as before — the official read-only preview is still the default — and only when you pick *Editor* from the viewer menu does the same tab become a CodeMirror 6 editor you can type in and save. **The one exception is a short, explicit list of suffixes** (`.txt`, `.log`, `.env`, `.gitignore`, … — declared by no official viewer at all): those open in the editor by default, with the official plain-text preview as the menu's second entry. The reason and the exact boundary are constraint 3 below.

Extracted from [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT): its `fs.read` / `fs.write` and its `TextEditor`, rebuilt as a standalone plugin that coexists with it (the same extraction shape as `dsh-sidebar-git`).

## What it does (and does not do)

- Opening any file is **unchanged**: the official preview (code / Markdown / HTML / image / PDF / Office) stays the default.
- The preview's "open with" menu gains one entry, **Editor**, placed after the official preview and before the plain-text fallback:

  | File | Menu order | Default |
  | --- | --- | --- |
  | `src/a.ts` | Code → **Editor** → Plain text | Code (official read-only preview) |
  | `docs/a.md` | Markdown → Code → **Editor** → Plain text | Markdown (official rendered preview) |
  | `a.png` / `a.pdf` | Image / PDF | official preview (the editor is not a candidate) |
  | `notes.txt`, `.env`, `.gitignore` (the short list) | **Editor** → Plain text | the editor (constraint 3's exception) |
  | `Dockerfile`, `Makefile`, `LICENSE` | Plain text | plain text (**structurally** unmatchable — constraint 3) |

- Editor features: extension-keyed syntax highlighting (~60 languages, including the `@codemirror/legacy-modes` family), line numbers, undo history, `Ctrl/Cmd+S` save, a dirty marker, save state and file size. The ~1.8 MB CodeMirror chunk is fetched only when the editor is first selected.
- Saving **preserves the file's line ending and BOM** (a CRLF file is never rewritten as LF).
- **Opening a file never claims "changed on disk"**: the body reports only a KNOWN version (settling once when the metadata arrives late) and absorbs the version change its own save causes, so the owner's "reload" banner appears only for a genuine external edit. The policy is the pure, unit-tested `src/client/version-report.js`.
- Files over 2 MiB render read-only with saving disabled; binary files tell you to switch back to the official preview.

### Four deliberate design constraints

1. **The official preview is never replaced.** The implementation registers at `priority: 'builtin'` with the official viewer's 56 suffixes copied verbatim, and `dsh.client.inject` declares a dependency on the official package so it registers first. Equal band + equal suffix length + later registration keeps the official implementation at `candidates[0]` (the default).
2. **"Editor last" can only mean "last viewer implementation".** The official owner force-appends the plain-text fallback to the end of the candidate list (`PLAIN_BODY_ID` declares no suffixes, so it can never match and can only be appended); no external implementation can follow it. The only lever is declaring those suffixes as `binaryExtensions`, which would hide the official "Plain text" choice from users — **not done here**.
3. **The short list is an explicit, and mathematical, exception to "official preview first".** The official matcher is `filename.endsWith('.' + suffix)`, the plain-text fallback declares `extensions: []` (so it can never join the ranking and is merely appended last), and the menu renders only with two or more candidates. Therefore, for a suffix **no official viewer declares**, there are exactly two possible outcomes: **we become `candidates[0]`** (editable by default) or **there is no menu and no editor entry at all**. This plugin takes the first, over an auditable 158-entry list grouped by category (`EXTRA_EXTENSIONS` in `src/client/definition.js`): plain text and delimited data (`txt` `text` `log` `csv` `tsv` `psv`), text-based data formats (`json5` `ipynb` `lock` `geojson` `gpx` …), configuration and dotfiles (`conf` `env` `plist` `gitignore` `editorconfig` `bashrc` `clang-format` …), build files (`cmake` `mk` `gradle` `dockerfile` `proto`), scripts (`bat` `cmd` `fish` `ps1` …), markup and docs (`rst` `adoc` `org` `tex` `diff` `patch` …), templating (`hbs` `ejs` `jinja` …), source languages the official code viewer omits (`vue` `svelte` `r` `hs` `clj` `dart` `scala` `zig` `sol` `graphql` …), text certificates (`pem` `crt` `csr`) and subtitles/playlists/calendar text (`srt` `vtt` `m3u` `ics` `vcf`). Those files open editable, with the official plain-text preview second in the menu (one click away, remembered per tab).
   Two guards are test-enforced: ① the list stays **disjoint** from the 56 official suffixes (a collision would only add an entry and change no default); ② it must **never** collide with a suffix an official definition treats as binary/rich (images, audio/video, archives, Office, executables, fonts, disk images, databases, design files) — that would strand those files in a read-only "binary file" pane, and `OFFICIAL_RICH_EXTENSIONS` in `test/ranking.test.mjs` is the gate.
   Two choices worth naming: `csv`/`tsv`/`psv` were excluded earlier on a wrong assumption — the official preview has **no table viewer**, so these already render as raw text and editable is strictly better; `svg` is deliberately kept out of the official image viewer's *binary* set (its source comment: "SVG's XML source is worth reading"), so declaring it merely **adds an editor entry while the image preview stays the default** (pinned by its own test).
4. **A dot-less filename is unmatchable under every strategy.** `Dockerfile` / `Makefile` / `LICENSE` / `README` contain no dot, and the matcher requires a literal one, so no `extensions` declaration can ever claim them: their only candidate is plain text, hence no menu. Covering them requires a different layer entirely (registering an own right-sidebar tab type with `patterns: ['dsh-resource://file/**']` plus a `canOpen` predicate over the address) — **not done here**.

## Installation

Already installed in this profile (bundle `dsh-file-editor`, row `file-editor`):

```powershell
# The source lives in the workspace; the profile holds a junction to it:
#   C:\Users\admin\local\dsh-file-editor  →  D:\ws\dsh-file-editor
#   profiles\web\node_modules\dsh-file-editor  →  C:\Users\admin\local\dsh-file-editor
dsh plugin --profile web list
```

Reinstalling (e.g. from another directory):

```powershell
npm install            # workspace devDependencies (esbuild + @codemirror/*)
npm run build          # emits lib/client.js and lib/client-editor.js
```

then install through `plugin_manager`'s `install_bundle`. **Note:** its target is resolved against `$HOME`, and pnpm creates *relative* junctions here — a cross-drive target resolves to a non-existent path such as `…\web\D:\ws\…`. The source path must therefore share the profile's drive, which is why this repository routes through the `C:\Users\admin\local\dsh-file-editor` junction.

Replacing an installed package needs a **profile restart** to load a fresh JS module generation; a chunk-only change (`lib/client-editor.js`) only needs a page refresh (chunks revalidate by ETag).

## Build

```
src/client/**            # client sources (ESM/JSX)
  index.jsx              #   registers the documentPreviews implementation + the sidebar.right.tab.document body + locale
  EditorBody.jsx         #   the body: renderer contract, read/save/read-only/binary/reload protection
  definition.js          #   EDITOR_ID and the suffix table copied from the official CODE_EXTENSIONS
  drafts.js              #   unsaved drafts, keyed by resource address
  api.js / resource-address.js / chunk-loader.js
  editor/**              #   chunk.jsx (entry), TextEditor.jsx, lang.js, cm-themes.js, one-dark-palette.js, eol.js, scheme.js
lib/**                   # host half: hand-written ESM (verbatim upstream ports) + the two build outputs
build/build.mjs          # esbuild: wraps the core bundle and the chunk in the envelopes observed in this deployment
```

- `lib/client.js` → `window.__ModuleLoader__.load({ id: "dsh-file-editor", factory })`
- `lib/client-editor.js` → `globalThis.__dshFileEditorChunks__["editor"] = (require) => …`, delivered on demand by `/file-editor/bundle/editor.js` (ETag + 304).

There are **no runtime dependencies**: the core bundle uses only the platform seed table's React, and CodeMirror is bundled into the chunk. The `@codemirror/*` devDependencies are build-time only. For an offline build, point `MODULE_PATHS=<existing node_modules dir>` at an installation you already have.

## Host API

`POST /file-editor/api/<method>`, answering `{ok:true,value}` or `{ok:false,error:{code,message}}`:

| Method | Input | Output |
| --- | --- | --- |
| `fs.read` | `{sessionId, path, cwd?}` | `{kind:'text',content,truncated,size}` or `{kind:'binary',size,truncated,head}` |
| `fs.write` | `{sessionId, path, content, cwd?}` | `{ok:true,size}` |

- The working directory comes from the **session header** (`cwd` is only a fallback while a session is still hydrating); a relative path is resolved against it by the host, so the client never needs a cwd.
- Every path is fenced to the session workspace through `realpath` (403 outside); the fence is **always armed**.
- Read cap 2 MiB, request body cap 8 MiB (upstream's 1 MiB made any file larger than 1 MiB unsaveable).
- Writes are atomic (uniquely named temp sibling + rename, cleaned up on failure, no leftovers) and empty files are writable.

Differences from upstream also include what was **not** carried over: `fs.tree`, `fs.search`, `fs.rename`, `fs.remove` and the upload route (v1 has no file tree; the official Files tab browses), and the error-code union is narrowed to the seven codes this plugin produces.

## Verification

```powershell
npm test                   # 41 checks: address parsing, EOL/BOM, language map, suffix invariants and guards, ranking invariants, version-reporting policy, host handlers
node scripts/e2e-http.mjs  # optional: real HTTP against a running DSH (needs DSH_COOKIE, see below)
```

- `test/host.test.mjs` drives the **real** `createApiHandler` / `createBundleRouteHandler`: read/write round trip, binary sniffing, truncation, atomicity, outside-workspace 403, traversal 403, 405/404/400, the trust fence, and the chunk route's 200/304/403/404.
- `test/ranking.test.mjs` mirrors the official ranking formula (including the literal-dot `endsWith` semantics) and pins: on the 56 official suffixes the editor is never the default and always precedes the plain-text fallback; on a short-list suffix the editor is first and the official plain text second; `svg` separately keeps the image preview as its default and only adds the editor entry; two guards — the list is disjoint from the official suffixes and never collides with an official binary/rich suffix (`OFFICIAL_RICH_EXTENSIONS`); `Dockerfile`/`Makefile`/`LICENSE`/`README` have no candidate; and a compound name like `.eslintrc.json` still defaults to the official viewer.
- `scripts/e2e-http.mjs` needs authentication: this deployment's `dsh-login-gate` wraps **every** registered route (302 for GETs, 401 for POSTs when signed out), so it must run with `DSH_COOKIE` or against a gate-free deployment.

## Known limitations

- The default viewer: the official preview on the 56 official suffixes; the editor on the short list (constraint 3), with `svg` the one extra that keeps an official default (the image preview) and merely adds the editor entry; no editor entry for dot-less filenames (constraint 4).
- Switching the app's light/dark scheme mid-session re-themes the frame immediately, but CodeMirror's **syntax colors** update when the editor is re-selected (the scheme is read at mount).
- If a file is deleted externally after being opened, saving recreates it (upstream semantics).
- No hard mtime conflict check: when the official reload gesture or a resource version change arrives while the draft is dirty, the body offers *keep my changes* / *discard and reload* instead of silently dropping edits.
- A draft is kept only while it is **dirty** (a clean state releases it, so merely opening files never retains their text) and records the disk version it was read at; a draft that outlives its tab therefore still lets the owner raise its "changed on disk" notice instead of silently overwriting a file that changed meanwhile.
- **Upstream capabilities not carried over** (deliberately): the select-text → "add to conversation" floating button (upstream `selection-popup` + `appendToDraft`), the editor toolbar's sandbox status bar (upstream renders `<SandboxStatusBar>`), Markdown/HTML rendering with TOC/mermaid, the file tree / search / rename / delete / upload, and an editor preferences page.
- **The editor chunk has no upstream-style HMR revalidation** (upstream's `revalidateChunksOnReactivate` re-checks the chunk's ETag): a chunk-only rebuild needs a page refresh, while a core-bundle change follows HMR.
- **Session cwd fallback**: the host prefers the session header's working directory and the client now also sends the cwd it knows (upstream additionally consulted a session-persistence index, which is not carried over) — so in the extreme case of a session with no header cwd *and* an unknown client cwd, a read ends in 400 where upstream might still have resolved it.

## License

MIT. The host half (`lib/wire.js`, `lib/fs-tree.js`, `lib/path-security.js`, `lib/session-path.js`, `lib/trust-fence.js`, `lib/bundle-route.js`, and the method table in `lib/index.js`) and the editor's theme/language tables are ports from `dsh-better-sidebar` (MIT, omdsh-dev/DSH-better-sidebar); each file's header records its origin and what changed.