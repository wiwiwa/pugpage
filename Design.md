# PugPage Architectural Design

## Overview

PugPage is a command-line tool and runtime for developing, bundling, and serving Pug-based web applications. Pug templates compile to virtual DOM functions (snabbdom, inlined in the bundle) at build time. The runtime patches the DOM incrementally via `init/patch` instead of replacing `innerHTML`.

---

## 1. System Components

### CLI Tool (`pugpage`)

`pugpage` is a Deno script:
- **init**: Initializes a new PugPage project with sample files.
- **dev**: Starts a development server with SSE live reload.
- **dist**: Builds for production with minification (Terser) and content-hash filenames.

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

### PugPage Runtime (`src/render/render.js`)
- Bundle provides: `__patch` (snabbdom patch), `pug_pages` (page registry), `h` (snabbdom h function), `pug_layout_map`, `pug_layout_chain`.
- **Mount/Patch**: First render creates a container div and mounts into it. Subsequent renders diff + patch the existing vdom tree.
- **pug-page custom element**: Fetches REST JSON data from `rest` attribute, resolves page function via `pug_pages(src)`, renders as vdom subtree. No Shadow DOM.
- **Routing** (`onUrlChange`): Resolves pages using the URL fallback algorithm (exact → /show → segment peel). Injects `$user`, `$page`, applies layout composition via `composeWithLayout()`.
- **Form handling**: Intercepts `submit` on `<form>`, posts JSON to `action`, redirects to `href` on success.
- **Event listeners**: `popstate`, `pushstate`, `replacestate` (monkey-patched), `<a>` click interception, `document.body` submit listener.

### PugPage Compiler (`src/compiler.ts`)
- **Pipeline** (`compileDirectory`): For each `.pug` file: read → apply layout/source transforms → lex (pug-lexer) → parse (pug-parser) → load (pug-load, resolves includes/extends) → link (pug-linker) → codegen.
- **Codegen** (`src/compiler/codegen.ts`): Walks the linked pug AST and emits snabbdom `h()` calls. Handles 19 post-linkage node types: Block, Tag, Text, Code, Conditional, Each, EachOf, Case, When, While, Mixin, MixinBlock, YieldBlock, NamedBlock, Doctype, Comment, Literal, InterpolatedTag. Extends/Include/Filter are resolved by the pug pipeline before codegen.
- **Source transforms** (`src/compiler/transforms.ts`): `$role` and `$lang` attributes are converted to conditional `if` directives before compilation.
- **Layout auto-application** (`src/compiler/layouts.ts`): Finds nearest `layout.pug` in current/parent directories. Layouts use `slot` (handled at AST level in codegen as `__content`). Supports `extends NONE` to opt out and layout chaining (parent layouts).
- **CSS scoping** (`src/compiler/css-scope.ts`): Extracts `<style>` content, prefixes selectors with `[data-scope="<hash>"]` based on file path.
- **Bundle emission** (`bundleModules`): Inlines snabbdom source (~31KB) at build time (no runtime import). Emits: inlined snabbdom → `__patch = init([...])` → layout maps → scoped CSS → `pug_pages()` switch/case registry.
- **Module stripping** (`stripModuleWrapper`): Removes `import`/`export` from individual page modules since `h` is a global provided by the inlined snabbdom.
