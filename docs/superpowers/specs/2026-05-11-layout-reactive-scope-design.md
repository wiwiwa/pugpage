# Layout Reactive Scope Design

## Problem

Layout templates have no reactive scope. They render via a plain function call `layoutFn({ __content: vnode })` with `with(data)` — no scope proxy, no dirty tracking, no re-render capability. Event handlers in layout templates set values on `window` (the global fallback) but `__rerenderOnEvent()` finds no `__scope` on ancestor elements, so nothing re-renders.

## Solution

Wrap layout output in a `div#__pug_layout__` element that carries `__scope` (scope tracker) and `__tpl` (template function) — the same pattern used by `<pug-page>` and `<form>`. The existing `__findScopeProxy` / `__rerenderOnEvent` / `renderScope` pipeline works unchanged.

## Design

### Wrapper Element

A `div#__pug_layout__` DOM element wraps all layout output. This element receives:

- `__scope` — a `createScope()` tracker `{ scope, isDirty(), clearDirty() }`
- `__tpl` — the layout template function
- `_childVdom` — the snabbdom vnode for patching (set by `renderScope()`)

No compiler changes. The wrapper is created and managed entirely in `render.js`.

### Scope Creation and Initial Data

`onUrlChange()` creates a layout scope via `createScope()` with initial data:

```js
{ $user, $page, __content: pageVnode }
```

- `$user` and `$page` are the same global objects passed to page functions
- `__content` holds the rendered page vnode (same as today's `{ __content: contentVnode }`)

The layout function is stored as the wrapper element's `__tpl`. `renderScope(wrapperEl, layoutFn, scopeTracker)` handles both initial render and re-renders.

### Rendering Pipeline

**Current full-render path in `onUrlChange()`:**
```
pageFn(pageArgs) → composeWithLayout(vnode, layoutPath) → renderPage(vnode)
```

**New path:**
```
pageFn(pageArgs) → renderScope(layoutWrapper, layoutFn, layoutScopeTracker)
```

`composeWithLayout()` is bypassed for reactive layouts. Instead, `onUrlChange()` directly:
1. Creates the `div#__pug_layout__` wrapper element (once, reused across navigations)
2. Creates `layoutScopeTracker = createScope({ $user, $page, __content: pageVnode })`
3. Stores `layoutFn` as `layoutWrapper.__tpl`
4. Calls `renderScope(layoutWrapper, layoutFn, layoutScopeTracker)`

The layout function receives the scope proxy (with `$user`, `$page`, `__content`) instead of a plain `{ __content }` object. The `__content` in scope is the rendered page vnode — so `slot` in the layout template still works.

For pages with no layout, `renderPage()` is used as today.

For re-renders (layout-level events): `__rerenderOnEvent()` finds `__scope` + `__tpl` on the wrapper, calls `renderScope()` which re-invokes `layoutFn` with the current scope. Child `<pug-page>`/`<form>` elements are NOT re-rendered — they are DOM elements that persist across snabbdom patches, keeping their own `__scope`/`__tpl` intact. `__rerenderOnEvent` stops at the first scoped ancestor (the layout wrapper), never reaching nested scopes.

### Same-Layout Optimization

The existing same-layout code path at `render.js` lines 322-331 is updated to use `#__pug_layout__` instead of the non-existent `#__pug_content__`. When navigating between pages that share the same layout:

1. Update `layoutScopeTracker.scope.__content` with the new page vnode
2. Re-render the layout via `renderScope(layoutWrapper, layoutFn, layoutScopeTracker)`
3. `__initScopedForms()` discovers new forms in the updated content

This is a performance win: the layout scope and wrapper element persist, snabbdom efficiently patches only what changed.

### Event Handler Flow

No codegen changes. Existing event handlers work as-is:

1. Click fires → `__findScopeProxy(elm)` walks up DOM tree
2. Finds `div#__pug_layout__.__scope` → returns the scope proxy
3. Handler runs inside `with(window.__handlerScope(scope))` — assignments captured by proxy
4. `__rerenderOnEvent(elm)` walks up, finds `__scope` + `__tpl` on wrapper → calls `renderScope()`
5. Layout re-renders; `__rerendering` flag prevents template initialization code from overwriting handler-set values

### Nested Layouts

Each layout level gets its own scope and wrapper. The inner layout's `__content` is the outer layout's rendered output. `__findScopeProxy` naturally finds the nearest (innermost) layout scope first.

### What Does Not Change

- **Compiler (`codegen.ts`, `compiler.ts`)** — no changes needed
- **`createScope()`** — used as-is
- **`__findScopeProxy()`** — walks DOM, finds layout scope naturally
- **`__rerenderOnEvent()`** — finds `__scope` + `__tpl` on wrapper, re-renders
- **`renderScope()`** — same function, called with layout's wrapper element
- **pug-page / form scopes** — unaffected, nested inside the layout

## Files Changed

| File | Change |
|------|--------|
| `src/render/render.js` | `onUrlChange()` creates wrapper element + scope for layouts; `composeWithLayout()` integrates with scope; same-layout optimization activated |
| `release/render.min.js` | Regenerated from `render.js` (runtime change) |

No compiler changes. No test fixture changes (existing tests verify the reactive scope works).

## Risks

- **Wrapper `<div>`**: Adds a `div#__pug_layout__` around layout output. Could affect CSS selectors targeting direct children of `body`. Mitigated by using `display: contents` if needed.
- **Layout re-render scope**: When a layout-level handler fires, the layout re-renders but child `<pug-page>`/`<form>` elements are NOT re-rendered. `__rerenderOnEvent` stops at the first scoped ancestor (the layout wrapper). Child elements persist as DOM nodes through snabbdom patches, keeping their own scopes intact.
