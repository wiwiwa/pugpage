# Repository Guidelines

## Project Structure & Module Organization

PugPage is a Deno-based CLI and browser runtime for serving and bundling Pug pages. Core TypeScript lives in `src/`: `main.ts` handles CLI dispatch, `dev.ts` runs the development server, `dist.ts` builds production output, and `compiler.ts` plus `src/compiler/` implement Pug compilation, layout handling, and CSS scoping. Browser-side rendering code is in `src/render/render.js`, with the minified release artifact in `release/render.min.js`. Tests and fixtures live under `test/`; `test/compiler.test.ts` drives Playwright against sample pages in `test/pages/`.

## Build, Test, and Development Commands

- `deno test --allow-all`: runs the full test suite, including Playwright browser checks.
- `deno run --allow-all ./src/main.ts test --root ./test/pages test/pugpage.test.yaml`: runs declarative YAML tests via Playwright.
- `deno run --allow-all ./src/main.ts dev --root ./test/pages`: starts the dev server against fixture pages.
- `deno run --allow-all ./src/main.ts dist --root ./test/pages --out ./test/pages/dist`: builds a production bundle for a sample project.
- `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`: regenerates the browser runtime release file before a release.

Use Deno imports from `deno.json`; avoid adding npm scripts unless the project intentionally changes tooling.

## Architecture

The browser runtime exposes:
- `window.$user` — public auth API with fields (`name`, `roles`, `lang`, `loginUrl`), `setAuthHeader(value, persistent)`, and `logout()`
- Reactive scope — shared by `<pug-page>`, `<form>`, layout templates, and component tags:
  - Proxy-based object with dirty-bit tracking; scope changes trigger VDOM re-render
  - Each element has its own isolated scope (`$rest`, `$user`, `$page` + fetched data)
  - Scope isolation: the `createScope` proxy has `has() { return true; }` so `with(scope)` never falls through to the enclosing closure scope — only own properties and `window` globals are accessible
  - Codegen skips outer `with(data)` in `__tpl` when stmts exist (the IIFE path already uses `with(window.__handlerScope(__d))` for isolation; outer `with(data)` would shadow the `data` parameter)
  - `$rest` is `null` initially, set to `{ status, data }` after fetch
  - On 200: response data also merges into scope; on non-200: only `$rest` available
  - Layout scope: `div#__pug_layout__` wrapper element with `__scope`/`__tpl`, initialized with `{ $user, $page, __content }`; `composeWithLayout()` is bypassed, `renderScope()` called directly; same-layout navigation updates `__content` without recreating scope; `let`/`var` declarations in layout templates create block-scoped bindings that shadow the scope proxy — use bare assignments (e.g. `- name="xxx"`) to initialize variables on the scope
  - Component scope: `__createComponentClass._render()` creates scope via `createScope()` with `{ $user, $page, __attrs..., __content }`; stores `__tpl` and `__scope` on the element; calls `renderScope()` and `__initScopedForms()` — event handlers inside components find scope via `__findScopeProxy()` DOM walk, same as pug-page/form
- `<pug-page rest=...>` — fetches data on connect, re-renders children with scope
- `<form>` — two modes:
  - `rest="..."` — fetches initial data on connect, re-renders children
  - `action="..." href="..."` — submit → fetch → re-render → navigate to `href`
  - Both can coexist: `rest` for initial load, `action` for submit
- Templates handle success/error via `- if($rest)` — no inline `<script>` needed
- Codegen compiles form children into `__tpl` functions (same as `pug-page`)
- Reactive event handlers — `on*` attributes compile to snabbdom `on` listeners with scope access:
  - Codegen strips string quotes from static `on*` values and emits `on: { eventName: function($event){...} }`
  - Handler runs inside `with(window.__handlerScope(scope))` — a proxy with `has(){return true}` so assignments like `editing = true` are captured by the scope proxy
  - `this` in snabbdom handlers is the vnode, not the DOM element; codegen uses `this.elm||this` to get the actual element
  - `window.__findScopeProxy(elm)` walks up the DOM from the clicked element to find the nearest scope proxy
  - `window.__rerenderOnEvent(elm)` triggers a re-render of the owning scoped region; always re-renders (nested mutations like `$page.editing = true` bypass the dirty flag)
  - `__rerendering` flag prevents template re-initialization (e.g., `editing = false`) from overwriting event-handler-set values during re-render
  - `<a>` tags without `href` get `href=""` auto-added; empty `href` clicks are intercepted without navigation
- Component tags — hyphenated tags like `<my-card>` resolve to `.pug` files and render as browser custom elements:
  - Compiler emits `pug_pages.__paths` (map of page URL → module ID) in the bundle via `bundleModules()`
  - Codegen builds `__pagePaths` Set from `pug_pages.__paths`; `isHyphenated()`, `couldMatchComponent()`, and `HTML_TAGS` determine tag handling
  - Hyphenated tags matching a `.pug` file get `__attrs`/`__content` snabbdom create hooks (copies VDOM data to DOM element properties); `childrenExpr=""` after `__content` capture prevents snabbdom DOM corruption
  - Non-hyphenated tags matching a `.pug` file emit a compiler warning (not a component)
  - Runtime `__registerComponents()` registers custom elements via `__createComponentClass()` — light DOM only, no `attachShadow()`
  - Runtime `__resolveComponentTemplate()` resolves templates URL-relative first (`dir + compName`), then falls back to `/components/ + compName`
  - `customElements.get()` guard prevents double-registration with warning

Compiler and runtime ownership:
  - Compiler behavior belongs in `src/compiler.ts` and `src/compiler/`
  - Browser behavior belongs in `src/render/render.js`; update `release/render.min.js` only when runtime code changes
  - Do not regenerate `release/render.min.js` for compiler-only changes
Inline styles:
  - `style.`, `:scss`, `:sass` are emitted as inline VDOM `h("style", ...)` at their original template position
  - No bundle-level `document.head` injection — styles live inside the rendered page subtree
  - Each inline style gets a stable `key` and `data-pugpage-style` attribute for snabbdom patch identity
  - Duplicate identical blocks are not deduplicated — each can be removed independently by VDOM updates
  - Sass/SCSS support is compiler-only: `:scss` and `:sass` filters are compiled in `src/compiler/codegen.ts`

## Coding Style & Naming Conventions

Use TypeScript for CLI/server/compiler code and plain JavaScript for browser runtime code already under `src/render/`. Follow the existing two-space indentation style. Prefer named exports for shared functions and keep file names lowercase with hyphenated names where needed, such as `css-scope.ts`. Keep Pug fixture names aligned with routes, for example `show.pug`, `layout.pug`, and `index.pug`.

## Testing Guidelines

Tests use Deno's test runner with Playwright assertions. Add or update fixtures under `test/pages/` when behavior depends on routing, layouts, forms, or scoped CSS. Always close browsers and shut down test servers to avoid hanging `deno test`.
Declarative test runner (`src/test.ts`):
  - `pugpage test <test.yaml>` runs a single YAML test file
  - YAML is a test tree: map values are groups, and list values are named test cases
  - Each test case contains one or more action groups with actions (`goto`, `fill`, `select`, `click`, `wait`) and assertions (`has`, `no`, `url`, `status`)
  - `wait`, `has`, `no` accept unified selector targets: string (CSS selector), object (selector + required text), or array of mixed
  - Use `body: "text"` for whole-page text checks; replaces removed `text` and `waitText` keys
  - If `goto` is omitted, the action group continues from the current page state
  - Fail-fast: stops on first failure; exits `0` on pass, `1` on any failure
  - `test/E2E.test.ts` is a thin wrapper that calls `runTests()` from `src/test.ts`

## Documentation Checklist

After implementing a feature or bug fix:
- Update `README.md` when end-user behavior, CLI usage, or public template/runtime features change. This document is enduser focus.
- Update `AGENTS.md` when architecture, workflow, ownership boundaries, or notable technical decisions change. This document is developer or agent focus

## Commit & Pull Request Guidelines

Always create ONE commit for a single requirement or bug fix — combine runtime, tests, docs, and release artifact changes into a single atomic commit.
Recent commits use scoped, imperative messages such as `dev: fix: auto-inject livereload script` and `render: fix: forms should be summitted with urlencoded, by default`. Keep the first segment tied to the affected area (`dev`, `render`, `compiler`, `dist`) and state the behavior change clearly.

Pull requests should include a short description, the commands run, and any relevant fixture or screenshot notes for browser-visible changes. Link related issues when available and call out release artifact updates to `release/render.min.js`.

## Release Procedure

1. Build minified runtime: `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`
2. Update `version` in `deno.json`
3. Update `VERSION` in `pugpage.sh` to match
4. Run verification: `deno test --allow-all --no-check` and `deno publish --dry-run`
5. Amend previous commit with version bump: `git add deno.json pugpage.sh && git commit --amend --no-edit`
6. Tag new version by increasing major, minor, or patch version
7. Double confirm before pushing
8. Push branch and tag; `.github/workflows/publish-jsr.yml` publishes to JSR from the tag using GitHub OIDC
9. Confirm the GitHub Actions publish job succeeds
