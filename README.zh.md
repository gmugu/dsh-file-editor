# dsh-file-editor

**在 DSH Web 右侧栏的官方文件预览里增加一个「编辑器」选项** —— 打开文件的行为基本不变：默认仍是官方只读预览，只有你从查看器下拉里主动选「编辑器」，同一标签才切换成 CodeMirror 6 编辑器，可改、可存。**唯一例外是一份明确的短名单后缀**（`.txt` / `.log` / `.env` / `.gitignore` 等，官方没有任何查看器声明它们），它们默认打开为编辑器，官方纯文本预览退为下拉第二项 —— 原因与边界见下方第 3 条。

功能提取自 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（MIT）的 `fs.read` / `fs.write` 与 `TextEditor`，重写为一个独立、可与之共存的插件（`dsh-sidebar-git` 的同类做法）。

## 它做什么（以及不做什么）

- 打开任意文件 → **与安装前一致**，官方预览（代码 / Markdown / HTML / 图片 / PDF / Office）仍是默认项。
- 预览标题栏的「打开方式」下拉里多出一项 **编辑器**，排在官方预览之后、纯文本回退之前：

  | 文件 | 下拉顺序 | 默认项 |
  | --- | --- | --- |
  | `src/a.ts` | 代码 → **编辑器** → 纯文本 | 代码（官方只读预览） |
  | `docs/a.md` | Markdown → 代码 → **编辑器** → 纯文本 | Markdown（官方渲染预览） |
  | `a.png` / `a.pdf` | 图片 / PDF | 官方预览（编辑器不出现在候选里） |
  | `notes.txt`、`.env`、`.gitignore`（短名单） | **编辑器** → 纯文本 | 编辑器（见约束 3 的例外） |
  | `Dockerfile`、`Makefile`、`LICENSE` | 纯文本 | 纯文本（**结构性**不可匹配，见约束 3） |

- 编辑器能力：按扩展名语法高亮（约 60 种语言，含 `@codemirror/legacy-modes` 家族）、行号、撤销历史、`Ctrl/Cmd+S` 保存、脏标记、保存状态、文件大小；首次选中编辑器时才懒加载约 1.8 MB 的 CodeMirror chunk。
- 保存会**保留文件原有的换行风格与 BOM**（CRLF 文件不会被改写成 LF）。
- **打开文件不会误报「文件已更新」**：正文只回传**已知**的 version（元数据迟到时补报一次），并且**吸收自己保存造成的版本变化**；因此官方的「重新载入」横幅只在**真正的外部改动**时出现（策略是纯函数 `src/client/version-report.js`，有独立单测）。
- 超过 2 MiB 的文件只读显示并禁用保存；二进制文件提示切回官方预览。

### 四条刻意的设计约束

1. **绝不取代官方预览。** 实现以 `priority: 'builtin'` 注册，官方已认识的 56 个后缀**原样照抄**，同时 `dsh.client.inject` 声明依赖官方包以确保官方先注册 —— 因此「档位相同 + 后缀长度相同 + 注册更晚」使官方实现永远是 `candidates[0]`（默认项）。
2. **「编辑器放最后」的可达含义是「最后一个查看器实现」。** 官方 owner 会把纯文本回退强制追加到候选列表末尾（`PLAIN_BODY_ID` 的 `extensions` 为空，永远匹配不上），任何外部实现都排不到它后面。唯一的办法是把后缀声明成 `binaryExtensions`（会让官方「纯文本」选项对用户消失），本项目**不采用**。
3. **短名单后缀是「默认官方预览」的明确例外，而且是数学上的例外。** 官方匹配要求 `文件名.endsWith('.' + 后缀)`，纯文本回退声明 `extensions: []` 因此永远进不了候选排序、只能被追加到末尾；下拉又只在候选 ≥ 2 时渲染。所以对「官方没有任何查看器声明」的后缀，**要么我们成为 `candidates[0]`（默认可编辑）**，要么**没有下拉、没有编辑器入口** —— 二者必居其一，不存在第三种。本插件选择前者，范围落在 156 项、按类别分组的可审计清单（`src/client/definition.js` 的 `EXTRA_EXTENSIONS`）：通用文本与分隔数据（`txt` `text` `log` `psv`）、文本化数据格式（`json5` `ipynb` `lock` `geojson` `gpx` …）、配置与点文件（`conf` `env` `plist` `gitignore` `editorconfig` `bashrc` `clang-format` …）、构建文件（`cmake` `mk` `gradle` `dockerfile` `proto`）、脚本（`bat` `cmd` `fish` `ps1` …）、标记与文档（`rst` `adoc` `org` `tex` `diff` `patch` …）、模板（`hbs` `ejs` `jinja` …）、官方代码查看器未收录的源码（`vue` `svelte` `r` `hs` `clj` `dart` `scala` `zig` `sol` `graphql` …）、文本证书（`pem` `crt` `csr`）、字幕/歌单/日程（`srt` `vtt` `m3u` `ics` `vcf`）。这些文件打开即可编辑，官方纯文本预览在下拉第二项（一键可切，且每个标签的选择会被记住）。
   两条护栏由测试强制：① 与官方 56 个后缀**互斥**（撞上只会多一个入口、默认项不变）；② **不得**撞上官方声明为二进制/富媒体的后缀（图片、音视频、压缩包、Office、可执行文件、字体、磁盘镜像、数据库、设计文件）—— 否则那些文件会以只读「二进制文件」死路收场，`test/ranking.test.mjs` 的 `OFFICIAL_RICH_EXTENSIONS` 就是这道闸。
   两个刻意点名的取舍：`csv`/`tsv` 已为 @deepseek-ai/dsh 0.1.7-alpha.x 移除 —— 新版官方预览内置了表格查看器，声明 `xlsx` `xls` `csv` `tsv`，这些后缀的默认保持官方表格预览，按设计编辑器不进入它们的候选；`psv` 仍保留（官方没有任何查看器声明它）；`svg` 被官方图片查看器明确排除在二进制集之外（源码注释：SVG 的 XML 源码值得阅读），收录它只**多一个「编辑器」入口，默认仍是图片预览**（独立测试钉住）。
4. **无点文件名在任何方案下都不可匹配。** `Dockerfile` / `Makefile` / `LICENSE` / `README` 没有点，而官方匹配器要求字面点，所以无论注册什么后缀都匹配不到它们；它们的候选永远只有纯文本，因此永远没有下拉。要覆盖这类文件只能换一层（另注册自己的 tab 类型，用 `patterns: ['dsh-resource://file/**']` + `canOpen` 谓词接管地址），本项目当前**不做**。

## 安装

当前 profile 里已经装好（bundle `dsh-file-editor`，row `file-editor`）：

```powershell
# 源码在工作区，profile 里是一个指向它的 junction（两层，均与 profile 同盘）
#   <your-home>\local\dsh-file-editor          →  <this checkout>
#   <profile>\node_modules\dsh-file-editor     →  <your-home>\local\dsh-file-editor
dsh plugin --profile web list
```

重新安装（例如换了目录）：

```powershell
npm install            # 工作区开发依赖（esbuild + @codemirror/*）
npm run build          # 生成 lib/client.js 与 lib/client-editor.js
```

然后用 `plugin_manager` 的 `install_bundle` 执行安装。**注意**：`install_bundle` 的 target 会被解析到 `$HOME`，且 pnpm 在这里创建的是**相对 junction**，跨盘符会解析失败（junction 会指向 `…\<profile>\D:\…` 这种不存在的路径）。因此中转目录必须与 profile 同盘——本仓库的做法是在 `$HOME` 下放一个 `<your-home>\local\dsh-file-editor` junction 指向实际工作区。

替换已安装的包后，需要一个 **profile 重启** 才会加载全新的 JS module generation；仅改 chunk（`lib/client-editor.js`）时刷新页面即可（chunk 走 ETag 重新校验）。

## 构建

```
src/client/**            # 客户端源码（ESM/JSX）
  index.jsx              #   ctx.documentPreviews 注册实现 + sidebar.right.tab.document 正文槽位 + 语言包
  EditorBody.jsx         #   正文：renderer 契约、读取/保存/只读/二进制/重载保护
  definition.js          #   EDITOR_ID 与照抄官方 CODE_EXTENSIONS 的后缀表
  drafts.js              #   按地址保存的未保存草稿表
  api.js / resource-address.js / chunk-loader.js
  editor/**              #   chunk.jsx(入口)、TextEditor.jsx、lang.js、cm-themes.js、one-dark-palette.js、eol.js、scheme.js
lib/**                   # 宿主半边：手写 ESM（上游逐字移植）+ 两个构建产物
build/build.mjs          # esbuild：核心包与 chunk 各包一层本机实测过的信封
```

- `lib/client.js` → `window.__ModuleLoader__.load({ id: "dsh-file-editor", factory })`
- `lib/client-editor.js` → `globalThis.__dshFileEditorChunks__["editor"] = (require) => …`，由 `/file-editor/bundle/editor.js`（带 ETag / 304）按需投递。

运行时**零依赖**：核心包只用平台 seed 表里的 React；CodeMirror 全部打进 chunk。`devDependencies` 里的 `@codemirror/*` 仅构建期需要。离线构建可用 `MODULE_PATHS=<现有 node_modules 目录>` 指向本机已有安装。

## 宿主接口

`POST /file-editor/api/<method>`，`{ok:true,value}` / `{ok:false,error:{code,message}}`：

| 方法 | 入参 | 出参 |
| --- | --- | --- |
| `fs.read` | `{sessionId, path, cwd?}` | `{kind:'text',content,truncated,size}` 或 `{kind:'binary',size,truncated,head}` |
| `fs.write` | `{sessionId, path, content, cwd?}` | `{ok:true,size}` |

- 工作目录取自**会话 header**（`cwd` 只在会话尚未 hydrate 时作兜底），相对路径由宿主相对该目录解析，客户端无需知道 cwd；
- 所有路径经 `realpath` 围栏到会话工作区（越界 403），围栏**恒开**；
- 读取上限 2 MiB、请求体上限 8 MiB（上游 1 MiB 会让大于 1 MiB 的文件存不回去）；
- 写入为原子写（唯一名临时文件 + rename，失败清理，不留残档），空文件亦可写。

与上游的差异（同上，另加未移植项）：**未**移植 `fs.tree` / `fs.search` / `fs.rename` / `fs.remove` / 上传路由（v1 不做文件树，浏览交给官方 Files 标签）；错误码集合收敛为本插件会产生的 7 个。

## 验证

```powershell
npm test                 # 41 项：地址解析、EOL/BOM、语言映射、后缀不变量与护栏、排名不变量、version 回报策略、宿主处理器
node scripts/e2e-http.mjs  # 可选：对运行中的 DSH 走真实 HTTP（需 DSH_COOKIE，见下）
```

- `test/host.test.mjs` 直接驱动**真实的** `createApiHandler` / `createBundleRouteHandler`：读写往返、二进制嗅探、截断、原子性、越界 403、遍历 403、405/404/400、trust fence、chunk 200/304/403/404。
- `test/ranking.test.mjs` 复刻官方排序公式（含 `endsWith('.' + 后缀)` 的字面点语义），把两条不变量都钉住：官方 56 个后缀下「编辑器永远不是默认项」且「排在纯文本之前」；短名单后缀下「编辑器第一、官方纯文本第二」；`svg` 单独钉住「图片预览仍是默认、只多一个编辑器入口」；两条护栏 —— 与官方后缀互斥、且不撞官方二进制/富媒体集（`OFFICIAL_RICH_EXTENSIONS`）；`Dockerfile`/`Makefile`/`LICENSE`/`README` 无候选；`.eslintrc.json`/`prod.env.json` 这类复合名仍归官方默认。
- `scripts/e2e-http.mjs` 需要认证：本部署的 `dsh-login-gate` 会包装**所有**已注册路由（未登录 GET→302 / POST→401），所以它必须在 `DSH_COOKIE` 下运行，或部署未启用登录门时使用。

## 已知限制

- 默认项：官方 56 个后缀下永远是官方预览；短名单后缀（约束 3）下是编辑器（唯一例外是 `svg`：仍是图片预览默认，只是下拉里多了「编辑器」）；无点文件名没有编辑器入口（约束 4）。
- 会话中途切换明暗主题时，框架配色即时生效，但 CodeMirror 的**语法色**要重新选中编辑器才更新（挂载时读一次配色）。
- 打开后文件被外部删除再保存，会按上游语义重建该文件。
- 无磁盘冲突（mtime）硬校验：编辑器与磁盘各写各的；官方「刷新」或资源版本变化时，若草稿为脏则提示「保留我的修改 / 放弃并重新加载」，绝不静默丢弃。
- 草稿只在**有未保存修改**时保留（干净即释放，避免为「只是打开过」的文件长期占用整份文本），并记录它对应的磁盘 version；因此草稿跨标签关闭存活时，若文件在关闭期间被外部改动，官方「已变更」提示会照常出现，而不会让陈旧草稿静默覆盖磁盘。
- **未移植的上游能力**（上游有、这里没有，且不打算做）：选中文本后「添加到对话」的浮动按钮（上游 `selection-popup` + `appendToDraft`）、编辑器工具栏里的沙箱状态条（上游渲染 `<SandboxStatusBar>`）、Markdown/HTML 的渲染预览与 TOC/mermaid、文件树 / 搜索 / 重命名 / 删除 / 上传、编辑器偏好设置页。
- **编辑器 chunk 没有上游的 HMR 重校验**（上游 `revalidateChunksOnReactivate` 会按 ETag 决定是否重新拉取）：只改了 `lib/client-editor.js` 时需要刷新页面才生效；核心包变化随 HMR 更新。
- **会话 cwd 兜底**：宿主优先用会话 header 的 cwd，客户端会把已知的 cwd 一并作为兜底发送（上游还额外查 session-persistence 索引，这部分未移植）——因此在极端情况下（会话 header 无 cwd 且客户端也不知道）读取会以 400 结束，而上游可能仍能解析。

## 许可

MIT。宿主半边（`lib/wire.js`、`lib/fs-tree.js`、`lib/path-security.js`、`lib/session-path.js`、`lib/trust-fence.js`、`lib/bundle-route.js`、`lib/index.js` 的方法表）与编辑器主题/语言表移植自 `dsh-better-sidebar`（MIT, omdsh-dev/DSH-better-sidebar）；文件头的注释标明了每一处的来源与改动。