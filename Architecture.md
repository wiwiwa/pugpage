# PugPage Architectural Design

## Overview

PugPage is a command-line tool and runtime for developing, bundling, and serving Pug-based web applications. Pug templates compile to virtual DOM functions (snabbdom) at build time. The runtime patches the DOM incrementally via `init/patch` instead of replacing `innerHTML`.

---

## 1. System Components

### CLI Tool (`pugpage`)

`pugpage` is a Deno script:
- **init**: Initializes a new PugPage project with sample files.
- **dev**: Starts a development server with SSE live reload.
- **dist**: Builds for production with minification (Terser) and content-hash filenames.
- **test**: Runs declarative YAML test files via Playwright.
- **install / update**: Downloads the latest `pugpage.sh` wrapper from GitHub releases.

### Development Server (`src/dev.ts`)
- `/index.html`: HTML shell that loads the bundle via `<script type="module" src="/dist.js">`
- `/dist.js`: Combined compiler output + runtime. Recompiled on `.pug` file changes.
- `/__livereload`: SSE endpoint. Pushes `"reload"` events to connected browsers.
- Static assets served from the root directory.
- 404 + `Accept: text/html` → serves `/index.html` (SPA fallback).

### Dist Builder (`src/dist.ts`)
- `dist.<hash>.js`: Minified bundle (compiler output + runtime). `<hash>` is SHA-256 of content.
- `index.html`: Loads the hashed JS file.
- `bundleJS()`: Concatenates `compileDirectory()` output + `src/render/render.js`.

### PugPage Compiler (`src/compiler.ts` + `src/compiler/`)

`compileDirectory(dirPath, opts)`:
- Walk `dirPath` for all `.pug` files; collect url paths
- `findLayouts(dirPath)`: walk for `layout.pug` files, build `Map<dir, absPath>`
- For each `.pug` file:
  - `compileModule(source, absPath, base, pagePaths)`:
    - `pug-lexer` → `pug-parser` → extract `extends` path → strip `Extends` node from AST
    - `pug-load` (resolves `include`/`extends`) → `pug-linker` → linked AST
    - `generateCode(ast, urlPath)` → `{ code, hasScopedStyles }`
    - If `hasScopedStyles`: `wrapWithScope(code, scopeId)` — wraps `return` expr in IIFE that injects `data-scope` attr
  - Layout resolution:
    - If component file (hyphenated filename): no layout
    - Else if `extends NONE`: no layout
    - Else if `extends "path"`: `resolveExtendsLayout()` — resolve relative to file dir
    - Else: `resolveLayout()` — walk current → parent dirs for nearest `layout.pug`
    - Layout files → `layoutChain[url] = target`; page files → `layoutMap[url] = target`
- `bundleModules(modules, layoutMap, layoutChain, renderUrl)`:
  - Each module → `case '/path': return new Function("data","__s","__v", "with(data){...}")`
  - Emit: `pug_layout_map`, `pug_layout_chain`, `__s()` (null-safe stringify), `__v()` (ReferenceError-safe eval), `pug_pages()` switch/case with `__cache`, `pug_pages.__paths[]`, then `import renderUrl`

**Codegen**

`generateCode(ast, urlPath)` → `{ code, hasScopedStyles }`:
- `generateBlock(ast)`: walk AST nodes, accumulate `exprs[]` (vnode expressions) and `stmts[]` (JS statements)
  - `Text` → inline string concatenation
  - `Code` (buffered) → `__s(__v(function(){ return expr }))` (escaped) or `rawHtmlSpan` (unescaped)
  - `Code` (unbuffered) → stmt
  - `Tag` → `generateTag(node)`
  - `InterpolatedTag` → `generateInterpolatedTag(node)`
  - `Conditional` → `generateConditional(node)` (ternary chain)
  - `Each` / `EachOf` → loop expression
  - `Case` / `While` → switch/loop expression
  - `Mixin` / `MixinBlock` → mixin definition or call
  - `NamedBlock` → recurse `generateBlock`
  - `YieldBlock` → `__content`
  - `Comment` / `BlockComment` / `Literal` → skip or raw
- Return: preamble (stmts) + `return expr`

`generateTag(node)`:
- Build `selector` from tag name + static `class`/`id` attrs
- Collect attrs into categories:
  - `$role` → `buildRoleCondition()` (roles array check)
  - `$lang` → `buildLangCondition()` (string match)
  - `class` → static → selector dots; `{obj}` → spread; dynamic → `[{expr}: true]`
  - `id` → static → selector hash; dynamic → attr
  - `on*` → `on: { eventName: function($event){ ... __findScopeProxy ... __rerenderOnEvent } }`
  - others → static: literal attr; dynamic: `__v(function(){ return expr })`
- `<a>` without `href` → inject `href: ""`
- Build `childrenExpr` from block:
  - exprs only → single expr or `[exprs]`
  - with stmts → IIFE with `with(window.__handlerScope(__d))`
- `needsTpl` (`<pug-page rest>` or `<form rest|action+href>` with children):
  - Wrap children in `__tpl: function(data){ ... }`, emit `create` hook to set `elm.__tpl` and `elm.__needsScope`, clear `childrenExpr`
- `isHyphenated(tag)` (custom component tag):
  - Emit `__attrs: { ... }` (non-role/lang/class/id attrs)
  - Emit `__content: <childrenExpr>` (if children exist), clear `childrenExpr`
  - Emit `hook: { create: fn, update: fn }` where `fn` syncs `__attrs`/`__content` from vnode data to DOM element
- Assemble `h("selector", data, children)`, wrap in `$role`/`$lang` ternary guard if present

`<style>` handling:
- `extractTextBlock(node)` → raw CSS string
- `isScopedStyle(node)` → `true` unless `scoped="false"`
- `makeStyleExpr(css, scoped)` → `h("style", { key, attrs: {"data-pugpage-style"} }, scopedCss|css)`
- `:sass` / `:scss` filter nodes → `sass.compileString()` before scoping

**CSS Scoping**

`scopeCss(cssSource, filePath)`:
- `hashString(filePath)` → 6-char hex scope ID
- Walk CSS at depth 0; prefix each selector with `[data-scope="<scopeId>"]`
- Skip `@` at-rules, keyframe percentages (`from`/`to`/`X%`)
- Split comma-separated selectors; prefix each individually

**Layout Resolution**

`findLayouts(dirPath)`:
- Walk `dirPath` for files ending `layout.pug`
- Return `Map<directory, absPath>`

`resolveLayout(pageAbsPath, layouts, baseDir)`:
- Start at `dirname(pageAbsPath)`, walk up to `baseDir`
- At each dir: if layout exists and is not the page itself → return it

`resolveExtendsLayout(pageAbsPath, extendsPath, baseDir)`:
- Resolve `extendsPath` relative to page's directory, add `.pug` if missing
- Return if file exists, else null

`isComponentFile(filePath)`: filename (without `.pug`) contains `-`
`isLayoutFile(filePath)`: filename ends with `layout.pug`

---

## 2. Runtime Architecture (`src/render/render.js`)

### Routing

Routing triggering:
- **Initial page load** — call `onUrlChange()` directly
- **`<a>` click** —
  - skips `#`, empty href, `_blank`, modifiers, cross-origin
  - `navigateTo(href)`
- **Form submit** — 
  - fetch initial data at `rest`, if exists
  - submit form data to `action` URL
    - on success: data merges into scope, `navigateTo(href)`.
    - on error: `$rest` updated, template re-renders.
- **Browser back/forward** — `popstate` pushstate` fires

**`navigateTo(url)`** 
- public API
- replace `window.location` and return, if `url` is not same origin
- call `pushState()` then `onUrlChange()` directly

**`popstate` event handler**: `onUrlChange()`

### Page Rendering

`onUrlChange()` triggers this flow:
1. **resovlePage()**:
   look up page function via URL fallback: exact match → `/show` → segment peel → `/404`
2. **Build args** — `$page` (path, args, params), query params
3. **Build VDOM** — call `pageFn(args)` → produces VDOM. Each scoped element has its own reactive scope (proxy with dirty-bit tracking):
   - **page root**: `{ $user, $page, __content }`
   - **pug-page**: fetches data from `rest` URL, re-renders children
   - **form**: `rest` for initial data fetch, `action` for submit, or both
   - **component**: `{ $user, $page, __attrs..., __content }`
4. **applyLayout(pageVdom, layoutPath)**
   - Search the cache stack for `layoutPath`
    - If found: clear the stack above the found entry, return the cached result
    - Find parent layout from `pug_layout_chain`
    - If parent exists: `content = applyLayout(pageVdom, parentLayout)` (recurse)
    - Else: `content = pageVdom`
    - Render `layoutFn({ __content: content })`, push result onto the stack
    - Return result
5. **Patch DOM** — `renderScope()` patches the result into one root element (`div#__pug_page__`)
6. **Scoped elements render** — `<pug-page rest="...">` and `<form rest="...">` fetch data from their `rest` URL, create scope, and render children. `$rest` is `null` initially, set to `{ status, data }` after fetch.

### Reactive Event Handlers

`on*` attributes compile to snabbdom `on` listeners with scope access:

- Codegen emits `on: { eventName: function($event){...} }`
- Handler runs inside `with(window.__handlerScope(scope))` — proxy with `has(){return true}` captures assignments like `editing = true` into the scope
- `this` in handlers is the vnode; codegen uses `this.elm||this` to get the DOM element
- `window.__findScopeProxy(elm)` walks up DOM to find nearest scope proxy
- `window.__rerenderOnEvent(elm)` triggers re-render (always re-renders; nested mutations bypass dirty flag)
  - call `renderScope()` for udpating DOM
  - `__rerendering` flag prevents template re-init from overwriting event-handler-set values

### Component Tags

Hyphenated tags like `<my-card>` resolve to `.pug` files and render as browser custom elements:

**Compile time**

- Codegen `isHyphenated(tag)`: tag name contains `-` and is not `pug-page`
- For matching tags, emit vnode data:
  - `__attrs: { name: val, ... }` — all attrs except `$role`, `$lang`, `class`, `id`
  - `__content: <childrenExpr>` — child vdom expression (if children exist)
  - `hook: { create: fn, update: fn }` — `fn` copies `vn.data.__attrs` → `elm.__pugpage_attrs` and `vn.data.__content` → `elm.__pugpage_content` on both create and patch
- `pug_pages.__paths[]` includes all component paths for runtime registration
- Component `.pug` files (hyphenated filenames) automatically skip layout wrapping

**Runtime**

`__registerComponents()`:
- For each path in `pug_pages.__paths[]`:
  - If filename contains `-` and not already registered → `customElements.define(name, __createComponentClass(name))`

`__createComponentClass(compName)`:
- `constructor()`: set `_childVdom = null`, `_rendered = false`
- `connectedCallback()`: if `!_rendered` → `_rendered = true`, `_render()`
- `_render()`:
  - `__resolveComponentTemplate(compName)`:
    - Try `currentDir + compName` via `pug_pages()`
    - Fallback: `/components/ + compName`
  - Build initial scope: `{ $user, $page, ...__pugpage_attrs, __content: __pugpage_content || null }`
  - `createScope(initial)` → reactive proxy
  - `renderScope(this, tplFn, scope)` → snabbdom patch into element
  - `__initScopedForms(this)`

`__resolveComponentTemplate(compName)`:
- Resolve `currentDir + compName` via `pug_pages()` first (URL-relative)
- Fallback: `/components/ + compName` via `pug_pages()`

### Public API

- `window.$user` — auth API: `name`, `roles`, `lang`, `loginUrl`, `setAuthHeader(value, persistent)`, `logout()`
- `window.navigateTo(url)` — SPA navigation (pushState)

### Event Listeners

`popstate` (browser back/forward), `<a>` click interception (skips `#`, empty href, `_blank`, modifiers, cross-origin), `document.body` submit listener.

### Inline Styles

- `style.`, `:scss`, `:sass` emitted as inline VDOM `h("style", ...)` at template position
- No `document.head` injection — styles live inside the rendered page subtree
- Each style gets stable `key` and `data-pugpage-style` attribute for snabbdom patch identity
- Sass/SCSS support is compiler-only

---

## 3. Compiler and Runtime Ownership

- Compiler behavior: `src/compiler.ts` and `src/compiler/`
- Browser behavior: `src/render/render.js`; update `release/render.min.js` only when runtime code changes
- Do not regenerate `release/render.min.js` for compiler-only changes
