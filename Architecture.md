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

### PugPage Compiler (`src/compiler.ts`)
- **Pipeline** (`compileDirectory`): For each `.pug` file: read → layout transforms → lex (pug-lexer) → parse (pug-parser) → load (pug-load, resolves includes/extends) → link (pug-linker) → codegen.
- **Codegen** (`src/compiler/codegen.ts`): Walks the linked pug AST and emits snabbdom `h()` calls. Handles 19 post-linkage node types.
- **Source transforms** (`src/compiler/transforms.ts`): `$role` and `$lang` attributes are converted to conditional `if` directives before compilation.
- **Layout auto-application** (`src/compiler/layouts.ts`): Finds nearest `layout.pug` in current/parent directories. Supports `extends NONE` to opt out and layout chaining (parent layouts). Component `.pug` files (hyphenated filenames) automatically skip layout — no `extends NONE` needed.
- **CSS scoping** (`src/compiler/css-scope.ts`): Extracts `<style>` content, prefixes selectors with `[data-scope="<hash>"]` based on file path.
- **Bundle emission** (`bundleModules`): Inlines snabbdom source at build time. Emits: inlined snabbdom → `__patch = init([...])` → layout maps → `pug_pages()` switch/case registry.

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

- Compiler emits `pug_pages.__paths` in the bundle
- Codegen: `isHyphenated()` check, hyphenated tags matching a `.pug` file get `__attrs`/`__content` snabbdom create hooks
- Runtime `__registerComponents()` registers custom elements via `__createComponentClass()` — light DOM only, no `attachShadow()`
- Runtime `__resolveComponentTemplate()` resolves URL-relative first, then falls back to `/components/`
- Component `.pug` files (hyphenated filenames) automatically skip layout wrapping

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
