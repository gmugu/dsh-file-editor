/**
 * The editor viewer's registration identity and the suffixes it offers on.
 *
 * TWO LISTS, on purpose — the split is the whole design:
 *
 * - `CODE_EXTENSIONS` is an exact copy of the official document preview's
 *   recognized source suffixes — since @deepseek-ai/dsh 0.2.0 that is
 *   `CODE_HIGHLIGHT_EXTENSIONS`, exported by
 *   `@deepseek-ai/dsh-util-code-language` and registered by the official code
 *   viewer (see test/ranking.test.mjs for the drift guard that keeps this copy
 *   in sync with the running installation). Because the copy is exact, the
 *   official implementation always matches those files at the same `builtin`
 *   band, and — registered earlier, since this plugin declares
 *   `dsh.client.inject: [...documentpreview]` — always precedes us. Those files
 *   therefore keep the official read-only preview as their DEFAULT, with the
 *   editor as the menu's second entry.
 *
 * - `EXTRA_EXTENSIONS` are plain-text suffixes that NO official viewer declares
 *   (`.txt`, `.psv`, `.gitignore`, …). They are the documented exception to
 *   "the official preview is the default", and it is a mathematical exception,
 *   not a preference: the viewer menu renders only with two or more candidates,
 *   the official plain-text fallback declares `extensions: []` (so it can never
 *   be one of the ranked candidates and is merely appended last), and
 *   `rank = builtin ? 0 : 1` sorts us first among the matches. With nothing
 *   official to beat us, the editor becomes `candidates[0]` — so such a file
 *   opens editable, the official plain-text view sits second in the menu (one
 *   click away, and the per-tab choice is remembered), and the alternative is
 *   not "official preview first" but "no menu at all". This list is the only
 *   way those files can be edited from the sidebar.
 *
 *   NOTE for upgrades: the official code-viewer table grows over time
 *   (0.2.0 alone absorbed ~50 of this plugin's historical extras — `log`,
 *   `env`, `tf`, `ps1`, `vue`, `graphql`, …). When a suffix appears in the
 *   official set, it must LEAVE the extras: the disjointness test fails loudly
 *   until it does, and its files then follow the CODE-set contract above
 *   (official read-only default, editor one click away).
 *
 * The two lists must stay DISJOINT (test-enforced): an extra suffix that an
 * official viewer also declares would silently keep the official default and
 * merely add a menu entry, which is harmless — but if one ever were added by
 * mistake while the official viewer dropped it, the intent would be unreadable.
 * Keeping them separate makes the exception auditable.
 *
 * Files whose name has NO DOT (`Dockerfile`, `Makefile`, `LICENSE`, `README`)
 * can never be claimed by any implementation: the official matcher is
 * `filename.endsWith('.' + suffix)`, so a dot-less name cannot match whatever a
 * definition declares. They keep their single plain-text viewer and no menu,
 * under every possible registration strategy. (The official table's
 * `makefile` suffix only ever matches a dotted `*.makefile`.)
 *
 * A dotfile like `.gitignore` IS matchable — its leading dot is the separator —
 * which is why the extras below can include `gitignore` and friends.
 */

/** This implementation's identity in the document-preview registry, and the key its body registers under. */
export const EDITOR_ID = 'dsh-file-editor:editor'

/**
 * The official document preview's recognized source suffixes (order
 * preserved). Verbatim copy of `CODE_HIGHLIGHT_EXTENSIONS` from
 * `@deepseek-ai/dsh-util-code-language` as shipped in @deepseek-ai/dsh
 * 0.2.0-rc.2; the ranking test pins this copy against the live table.
 */
export const CODE_EXTENSIONS = [
  'ts', 'tsx', 'mts', 'cts',
  'js', 'jsx', 'mjs', 'cjs',
  'sh', 'bash', 'zsh', 'fish',
  'json', 'jsonc', 'jsonl', 'ndjson', 'ipynb', 'csv',
  'py', 'pyw', 'pyi',
  'rb', 'rake', 'gemspec',
  'go', 'rs', 'java',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hh', 'hpp', 'hxx',
  'cs', 'kt', 'kts', 'swift', 'php',
  'yaml', 'yml', 'toml',
  'ini', 'conf', 'cfg', 'properties',
  'env', 'log',
  'diff', 'patch', 'http',
  'md', 'markdown', 'mdx', 'rst',
  'tex', 'sty', 'cls', 'bib', 'adoc',
  'html', 'htm', 'xhtml',
  'css', 'scss', 'less', 'sql',
  'xml', 'xsd', 'xsl', 'xslt', 'plist', 'svg',
  'lua',
  'bat', 'cmd',
  'ps1', 'psm1', 'psd1',
  'r', 'jl', 'dart', 'scala',
  'clj', 'cljs', 'edn',
  'erl', 'hrl', 'ex', 'exs',
  'hs', 'fs', 'fsi', 'fsx', 'vb',
  'pl', 'pm', 'v', 'sv', 'svh',
  'graphql', 'gql', 'proto',
  'tf', 'tfvars', 'hcl', 'nix',
  'vue', 'svelte',
  'makefile', 'mk', 'cmake', 'gradle', 'groovy',
]

/**
 * Plain-text suffixes no official viewer declares. Files carrying one of these
 * open in the editor by default (see the module comment) — an auditable list of
 * things that are plainly text and that the official plain-text fallback
 * handles poorly as a default (no editing at all).
 *
 * Hard rule, test-enforced: an entry must not collide with the official suffix
 * sets — neither `CODE_EXTENSIONS` (those keep the official preview as their
 * default) nor the suffixes official definitions treat as binary/rich (images
 * except `svg`, audio/video, archives, Office documents, executables, fonts,
 * disk images, databases, design files: see OFFICIAL_RICH_EXTENSIONS in
 * test/ranking.test.mjs). A binary suffix declared here would make the editor
 * the only candidate for those files and leave the reader in a read-only
 * "binary file" dead end.
 *
 * Pruned for @deepseek-ai/dsh 0.2.0: the official code viewer absorbed
 * `log env conf cfg properties ipynb plist tf tfvars hcl bat cmd fish
 * ps1 psm1 psd1 rst adoc tex sty cls bib diff patch vue svelte r pl pm hs
 * clj cljs edn erl hrl ex exs jl dart scala groovy vb graphql gql proto
 * svg mk cmake gradle` — each of those moved into the CODE contract above
 * (official read-only default, editor second), and the extras below keep only
 * what is still unclaimed.
 *
 * One deliberate inclusion worth naming: `psv` — the official preview has no
 * pipe-table viewer, so it is already rendered as raw plain text today;
 * editable is strictly better.
 */
export const EXTRA_EXTENSIONS = [
  // generic plain text and delimited data. csv/tsv are NOT here: the official
  // spreadsheet viewer declares xlsx/xls/csv/tsv, so those keep the official
  // table preview involved and this plugin follows them in CODE-set style.
  'txt', 'text', 'psv',

  // text-based data and interchange formats
  'jsonnet', 'lock', 'sum', 'mod', 'work',
  'geojson', 'gpx', 'kml',

  // configuration files that carry a suffix
  'cnf', 'config', 'rc',
  'desktop', 'reg', 'service',

  // dotfile-style configuration (matched after the leading dot)
  'gitignore', 'gitattributes', 'gitmodules', 'gitconfig', 'mailmap',
  'editorconfig', 'envrc', 'htaccess',
  'dockerignore', 'npmignore', 'eslintignore', 'prettierignore', 'helmignore',
  'npmrc', 'nvmrc', 'yarnrc', 'babelrc', 'eslintrc', 'prettierrc', 'stylelintrc', 'swcrc',
  'browserslistrc', 'pylintrc', 'flake8', 'gemrc',
  'bashrc', 'bash_profile', 'profile', 'zprofile', 'zshrc',
  'vimrc', 'gvimrc', 'nanorc', 'clang-format', 'clang-tidy',

  // build and project files
  'mak', 'dockerfile',

  // markup and documentation
  'asciidoc', 'org', 'textile',
  'ltx',

  // templating
  'tpl', 'tmpl', 'mustache', 'hbs', 'handlebars', 'ejs', 'pug',
  'njk', 'liquid', 'j2', 'jinja', 'jinja2',

  // source languages and dialects the official code viewer does not list
  'astro', 'phtml', 'csx', 'cshtml', 'aspx', 'jsp',
  'sass', 'styl',
  'rmd', 'tcl',
  'cljc', 'sc',
  'pas', 'pp', 'vhd', 'vhdl',
  'prisma', 'sol', 'zig', 'nim', 'f90', 'f95', 'for', 'asm',

  // certificate and key material that is text
  'pem', 'crt', 'csr',

  // subtitles, playlists, calendar and contact text
  'srt', 'vtt', 'ass', 'ssa', 'm3u', 'm3u8', 'ics', 'vcf',
]

/** What the editor registers on: the official set (unchanged defaults) plus the documented extras. */
export const EDITOR_EXTENSIONS = [...CODE_EXTENSIONS, ...EXTRA_EXTENSIONS]

/** Locale namespace owned by this plugin. */
export const LOCALE_NS = 'dshFileEditor'
