# Layout Reactive Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reactive scope to layout templates so event handlers in layouts can mutate state and trigger re-render, using a `div#__pug_layout__` wrapper element with `__scope`/`__tpl`.

**Architecture:** The layout wrapper (`div#__pug_layout__`) follows the exact same pattern as `<pug-page>` and `<form>` — `createScope()` for scope proxy, `__tpl` for template function, `renderScope()` for rendering. `composeWithLayout()` is bypassed; `onUrlChange()` calls `renderScope()` directly. Same-layout navigation patches content in-place without recreating the layout scope.

**Tech Stack:** JavaScript (browser runtime in `src/render/render.js`), Deno test runner with Playwright.

**Spec:** `docs/superpowers/specs/2026-05-11-layout-reactive-scope-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/render/render.js` | All runtime changes: layout wrapper creation, scope init, same-layout optimization |
| `test/pages/layout.pug` | Test fixture with reactive layout elements (already exists, has `a.test` + `div.name`) |
| `test/pugpage.test.yaml` | Test assertions for layout reactivity (already exists, currently failing at home [4]) |
| `release/render.min.js` | Regenerated from render.js after changes |

---

## Chunk 1: Layout Wrapper and Reactive Scope

### Task 1: Add layout scope state variables

**Files:**
- Modify: `src/render/render.js:16-17` (module-level state)

Add two module-level variables to track the layout scope state, alongside the existing `__container` and `__currentLayout`:

- [ ] **Step 1: Add variables after existing layout state**

After the existing `__layout_map` and `__layout_chain` declarations (~line 17), add:

```js
var __layoutWrapper = null;
var __layoutScopeTracker = null;
```

These track the single layout wrapper element and its scope across navigations.

---

### Task 2: Rewrite the `onUrlChange()` full-render path

**Files:**
- Modify: `src/render/render.js:322-338`

This is the core change. Replace the same-layout optimization block and the full-render block with layout-scope-aware logic.

- [ ] **Step 1: Run the existing failing test to confirm baseline**

Run: `deno run --allow-all ./src/main.ts test --root ./test/pages test/pugpage.test.yaml`
Expected: login tests pass, `home` fails at step 4 (`expected "div" to exist`)

- [ ] **Step 2: Replace the render path in `onUrlChange()`**

Replace the block at lines 322-338 (from `if (targetLayout && targetLayout === __currentLayout)` through `__initScopedForms(document.body)`) with:

```js
  if (targetLayout && targetLayout === __currentLayout && __layoutWrapper && __layoutScopeTracker) {
    // Same-layout optimization: update content in existing layout scope
    __layoutScopeTracker.scope.__content = pageFn(pageArgs);
    __layoutScopeTracker.clearDirty();
    renderScope(__layoutWrapper, __layoutWrapper.__tpl, __layoutScopeTracker);
    __initScopedForms(document.body);
    return;
  }

  __currentLayout = targetLayout;

  if (targetLayout) {
    // Layout path: create/reuse wrapper + scope, render via renderScope
    var layoutFn = pug_pages(targetLayout);
    if (layoutFn) {
      if (!__layoutWrapper) {
        __layoutWrapper = document.createElement("div");
        __layoutWrapper.id = "__pug_layout__";
        document.body.appendChild(__layoutWrapper);
      }
      var layoutFnDirect = layoutFn;
      __layoutScopeTracker = createScope({ $user: window.$user, $page: pageArgs.$page || {}, __content: pageFn(pageArgs) });
      __layoutWrapper.__tpl = function(scope) { return layoutFnDirect(scope); };
      __layoutWrapper.__scope = __layoutScopeTracker;
      renderScope(__layoutWrapper, __layoutWrapper.__tpl, __layoutScopeTracker);
      __initScopedForms(document.body);
      return;
    }
  }

  // No layout path: use renderPage as before
  var pageHtml = pageFn(pageArgs);
  renderPage(pageHtml);
  __initScopedForms(document.body);
```

**Key details:**
- Same-layout check: verifies `__layoutWrapper` and `__layoutScopeTracker` exist AND layout hasn't changed
- Layout wrapper created once, reused across same-layout navigations
- `__tpl` wraps `layoutFnDirect` to avoid stale closure issues
- Scope gets `{ $user, $page, __content: pageVnode }` — `__content` replaces the old `{ __content: contentVnode }` plain object
- `renderScope()` patches into `__layoutWrapper` using snabbdom, same as `<pug-page>` does
- Pages with no layout fall through to the existing `renderPage()` path

- [ ] **Step 3: Handle nested layouts**

The current `composeWithLayout` handles parent layouts via `__layout_chain`. For nested layouts, the approach is:
- Check `__layout_chain[targetLayout]` for a parent layout
- If parent exists, the outer layout's scope `__content` should be the inner layout's rendered output
- For the initial implementation, support single-level layouts first (most common case). Nested layouts can be addressed in a follow-up if needed.

In the layout block from Step 2, add parent layout handling after `__layoutScopeTracker` creation:

```js
      var parentLayoutPath = __layout_chain[targetLayout] || null;
      if (parentLayoutPath) {
        // For nested layouts: wrap the inner layout output in the outer layout
        var innerContent = __layoutScopeTracker.scope.__content;
        // Render inner layout first, then wrap in outer
        // This is handled by the scope __content chain
      }
```

Note: If the project only uses single-level layouts (check `__layout_chain` in test fixtures), this can be deferred. The test fixtures only have one level of layout nesting (`test/pages/layout.pug` and `test/pages/user/layout.pug`).

- [ ] **Step 4: Clear wrapper on no-layout pages**

When a page has no layout (`targetLayout` is null), clear the existing layout wrapper so it doesn't persist:

In the "No layout path" section, add before `renderPage`:

```js
  // Clean up layout wrapper when navigating to a page without layout
  if (__layoutWrapper) {
    __layoutWrapper.remove();
    __layoutWrapper = null;
    __layoutScopeTracker = null;
  }
```

- [ ] **Step 5: Run the test suite**

Run: `deno run --allow-all ./src/main.ts test --root ./test/pages test/pugpage.test.yaml`
Expected: ALL 7 tests pass, including `home [4]: has: div: changed`

If the home test passes, this confirms:
- Layout wrapper is created with scope
- `a.test` click sets `name='changed'` via scope proxy
- `__rerenderOnEvent` finds `__scope`+`__tpl` on wrapper, re-renders
- `div.name` shows "changed" after re-render
- Existing login/user tests still pass (no regression)

- [ ] **Step 6: Run full Deno test suite**

Run: `deno test --allow-all`
Expected: `1 passed | 0 failed`

---

### Task 3: Regenerate `release/render.min.js`

**Files:**
- Modify: `release/render.min.js`

- [ ] **Step 1: Bundle and minify**

Run: `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`
Expected: File updated, no errors

- [ ] **Step 2: Verify bundle is valid**

Run: `deno run --allow-all ./src/main.ts test --root ./test/pages test/pugpage.test.yaml`
Expected: ALL 7 tests pass (confirms the minified bundle works)

---

### Task 4: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add layout scope documentation**

In the Architecture section, after the existing Reactive scope documentation (around line 24, after the bullet about `$rest`), add:

```markdown
- Layout scope — layouts get their own reactive scope via a `div#__pug_layout__` wrapper element:
  - Wrapper element receives `__scope` (scope tracker) and `__tpl` (layout template function)
  - Scope initialized with `{ $user, $page, __content: pageVnode }` — `__content` is the rendered page content (replaces the old `{ __content }` plain object)
  - `composeWithLayout()` is bypassed; `onUrlChange()` calls `renderScope()` directly with the layout function and scope
  - Same-layout optimization: when navigating between pages with the same layout, only `__content` is updated and the layout re-renders via `renderScope()` — no scope recreation
  - Event handlers in layout templates find the layout scope via `__findScopeProxy()` DOM walk, same as pug-page/form handlers
  - Child `<pug-page>`/`<form>` elements are NOT re-rendered on layout events — `__rerenderOnEvent` stops at the first scoped ancestor (the layout wrapper)
```

- [ ] **Step 2: Verify AGENTS.md renders correctly**

Read through the updated section to confirm formatting and accuracy.

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit runtime changes**

```bash
git add src/render/render.js release/render.min.js AGENTS.md
git commit -m "render: add reactive scope for layout templates"
```

- [ ] **Step 2: Verify clean state**

Run: `git status`
Expected: clean working tree (no uncommitted changes)
