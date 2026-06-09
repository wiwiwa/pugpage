# PugPage Architecture

## Overview

PugPage is a Deno CLI and browser runtime for serving and bundling Pug-based applications. Pug templates compile to snabbdom VDOM functions at build time. The browser runtime owns routing, scope lifetime, reactive rendering, forms, components, REST data, and document title updates.

This document describes the target architecture. It is intentionally concise: enough to guide an implementation plan and point to key source locations, without duplicating every implementation branch.

### How To Read This Document

Read the sections in order:

1. **Mental Model** - the system shape.
2. **Core Contracts** - the runtime/compiler data contracts.
3. **Main Workflows** - how requests, renders, forms, and titles move through the system.
4. **Implementation Map** - key functions and ownership boundaries for source navigation.

## Mental Model

PugPage has two halves:

- **Compiler**: walks a project directory, compiles `.pug` files into JavaScript template records, and emits one browser bundle.
- **Runtime**: loads template records, resolves the current URL to a page, builds the layout chain, creates scopes, and patches snabbdom VDOM into host elements.

A rendered route is a tree of runtime hosts:

```text
<pug-router>
  <pug-page> outer layout scope
    <pug-page> inner layout scope
      <pug-page> route page scope
        <form> optional form body scope
        <my-component> optional component scope
```

Each host owns one `Scope`. Reusing a host reuses its scope. Replacing a host disposes its scope and descendants.

Host tags are real browser DOM elements, but they are not required to be registered custom elements. PugPage lifecycle is owned by snabbdom VDOM hooks, not by `customElements.define()`, `connectedCallback`, or `disconnectedCallback`.

### Unidirectional Data Flow

Runtime state flows in one direction: `scope state -> renderFn(scope) -> VDOM -> DOM`
Rules:
- parent render output is the source of truth for child host metadata
- child hosts receive `$parentScope`, route metadata, attrs, and form metadata through VDOM data
- snabbdom hooks are lifecycle effects of VDOM patching, not a reverse data channel
- hooks may create, update, register, or dispose scopes, but must not read the DOM to discover ownership
- scope disposal is driven by VDOM destroy hooks, not custom element lifecycle callbacks
- post-patch DOM inspection must not own data flow or scope ownership

## Core Contracts

### Template Record

`pug_pages(path)` and `pug_components(name)` return template records:
```ts
type TemplateRecord = {
  renderFn: Function;
  initFn: Function | null;
  layout: string | null;
};
```

- `renderFn` renders a compiled template into snabbdom VDOM.
- `initFn` runs once for the scope lifetime.
- `layout` points to the parent layout template path.
- `layout: null` means the template has no parent layout.

Example:
```js
pug_pages("/admin/users/show") === {
  renderFn,
  initFn,
  layout: "/admin/layout"
};

pug_pages("/layout") === {
  renderFn,
  initFn,
  layout: null
};
```

### Scope

`Scope` is the runtime state object for one host element. It may be implemented as a plain object, proxy target, or class; the architecture only requires the behavior below. It owns:
- application data copied from initial/template data
- runtime fields and methods using `$*` or `$_*`
- `$renderFn`
- `$element`
- `$parentScope`
- `$deps`
- local title state
- optional `$rest`

`Scope` scheduling:
- assigning application state marks the scope dirty
- dirty scopes render once in a queued microtask
- the queued task skips disposed or clean scopes
- rerendering reuses the same scope and does not rerun `:init`

Reserved names:
- application data must not overwrite `$*`
- REST merge skips keys whose names start with `$`
- runtime-only internals should use `$_*`

### Scope Proxies

`createRenderScope(element, templateKey, renderFn, initFn, initial)` creates the scope target and returns the scope proxy used by templates.

There are three proxy modes:
- **render proxy**: passed to compiled templates by `makeRenderFn(element, tplFn)`; tracks render dependencies and marks the scope dirty on application writes
- **init proxy**: passed to `initFn`; initializes scope state without tracking render dependencies or scheduling rerenders
- **handler proxy**: wraps the scope for form body rendering and event handlers via `__handlerScope(scope)`; resolves scope locals and exposes `$user`/`$page`/`window` without dependency tracking or `$*` write rejection — form bodies write `$title` and other fields directly through the underlying render proxy's set handler

The render proxy:
- prevents assignment leakage from `with(data) { ... }`
- resolves application locals from the scope
- exposes runtime values such as `$user`, `$page`, `$args`, and `$params`
- tracks `$user`, `$page`, `$titles` dependencies
- rejects application writes to reserved `$*` names except runtime-controlled title assignment
- the `has()` trap returns `false` for `$$`-prefixed properties so that compiler-generated temporaries (e.g. `$$title`) fall through to local `var` declarations instead of being intercepted

Bare globals that must bypass scope lookup are listed in `SCOPE_GLOBALS`.

**`$_target` runtime backdoor**: the proxy rejects `$*` writes from templates, but the runtime itself must write to fields like `$dirty`, `$scheduled`, `$rest`, `$renderFn`, and `$definingInputs`. Every runtime write to a reserved field uses `scope.$_target` — the backing target object stored on the target before the proxy is created. This bypasses the proxy's set handler entirely. Templates must never access `$_target`.

### Host Scope Lifecycle

Parent render output drives child host lifecycle. Scope reuse is determined by DOM element identity: `element.__scope` holds the current scope, and `createOrReuseScope` checks it against the template key and defining inputs.

Snabbdom hook data on `<pug-page>`, scoped `<form>`, and component vnodes manages scope creation, update, and disposal:
- host tags remain visible in the DOM, for example `<pug-page>` and `<user-card>`
- host tags are inert DOM elements (unregistered, no `customElements.define`); snabbdom `insert` hook triggers initial mount and scope creation
- create hook sets template metadata on the element; insert hook creates or reuses the scope via `element.__scope`
- destroy hook calls `scopeDisposal(scope)` — snabbdom fires destroy per removed VNode, so each scope cleans up independently
- no DOM scan or post-patch reconciliation owns scope lifecycle

### Form Contract

Scoped forms are forms with child template content.
```pug
form(rest action="/api/user/1" method="PATCH" href="/user/1")
```

Rules:
- `action` is required for scoped forms.
- absent `rest` means no initial fetch.
- empty `rest` means initial `GET action`.
- non-empty `rest` means initial `GET rest`.
- submit sends form data to `action` using the form method.
- `href` navigates only after a successful submit.
- initial fetch and submit both update the form scope `$rest`.
- plain object response data shallow-merges non-`$*` plain-object fields into the form scope.

### REST State

`$rest` is always an object:
```js
{ status: number | null, data: unknown, loading: boolean, headers: object }
```

REST responses update `$rest`. Successful plain-object response data is also shallow-merged into the owning scope, skipping `$*` keys. REST merges only non-`$*` plain-object fields.

### Title Contract

`title` tags do not emit DOM. The compiler generates `$$title = <expression>` as a local variable, then `$title = $$title` assigns it to the scope.

Title propagation is scope-based:
- each scope has `$title` (singular) — its own local title set via `$$title → $title`
- each scope has `$titles` (plural) — the descendant title chain, not including own `$title`
- when `$title` changes on a scope, the runtime walks up through `$parentScope`
- at each ancestor, `$titles` is set to the child's chain: `[child.$title, ...child.$titles]`
- each ancestor scope that reads `$titles` (tracked in `$deps`) is dirtied and re-rendered
- when a scope is destroyed, its title entry is removed from its ancestor's `$titles` and title propagation is triggered for the parent path
- when the walk reaches the root scope, `document.title` is recalculated from `[root.$title, ...root.$titles]`
- `document.titleFn(newLabel, accumulatedTitle)` is an optional custom fold function that defaults to `newLabel + " | " + accumulatedTitle`

## Main Workflows

### Build

Key source entry points:
- `compileDirectory(dirPath, opts)`
- `compileModule(source, absPath, base, pagePaths)`
- `resolveLayout(pageAbsPath, layouts, baseDir)`
- `resolveExtendsLayout(pageAbsPath, extendsPath, baseDir)`
- `bundleModules(pageModules, componentModules, renderUrl)`

Flow:
```text
pugpage dev/dist
  -> compileDirectory(root)
  -> compile every .pug file
  -> split pages from components
  -> emit page/component template records
  -> append/import browser runtime
```

Compiler responsibilities:
- compile each template into a `TemplateRecord`
- include `renderFn`, `initFn`, and `layout`
- place URL-reachable page records in the page registry
- place hyphenated component records in the component registry
- emit known page/component paths for lookup and registration

Layout handling:
- compiler resolves both explicit and convention layouts
- `findLayouts(dirPath)` indexes `layout.pug` files by directory
- explicit `extends "path"` uses `resolveExtendsLayout(...)`
- no explicit `extends` uses `resolveLayout(...)` to find the nearest `layout.pug` in the template directory or an ancestor directory
- the resolved layout path becomes `TemplateRecord.layout`
- when no explicit or convention layout exists, `TemplateRecord.layout = null`
- runtime only follows `TemplateRecord.layout`; it does not perform convention-based layout discovery

### Template Codegen

Key source entry points:
- `generateCode(ast, urlPath)`
- `generateBlock(ast)`
- `generateTag(node)`
- `compileScopedFormBody(node)`
- `emitCustomTagData(node, dataParts, blockResult)`
- `scopeCss(cssSource, filePath)`

Compiler output should use explicit `window.*` access for runtime helpers such as `window.$h`, `window.$s`, `window.$v`, and `window.renderSlot`.

Codegen responsibilities:
- convert Pug AST nodes into snabbdom VDOM expressions
- extract `:init` blocks into `initFn`
- compile title tags into `$$title = <expression>; $title = $$title` assignments
- compile scoped form bodies into lexical child render functions
- compile component tags into host VNodes with attrs/content metadata
- compile scoped CSS by adding stable `data-scope` selectors and attributes

### Route Render

Key source entry points:
- `navigateTo(url)`
- `handlePopstate(event)`
- `handleUrlChange(location, reason)`
- `resolveRoute(location)`
- `resolveLayoutChain(templatePath)`
- `buildRouteEntry(route)`
- `routerRender(route)`
- `renderSlot(scope)`

Flow:
```text
URL change
  -> resolveRoute(location)
  -> update window.$page
  -> dirty scopes that read page data
  -> resolve layout chain from TemplateRecord.layout
  -> patch <pug-router>
  -> keyed <pug-page> hosts create/reuse/dispose scopes
```

Route chain: `outer layout -> inner layout -> page`

`renderSlot(scope)` renders the next entry in the route chain as a child `<pug-page>` host and passes `$parentScope`, `$routeChain`, and `$routeIndex`.

### Scope Render

Key source entry points:
- `createRenderScope(element, templateKey, renderFn, initFn, initial)`
- `makeRenderFn(element, tplFn)`
- `markDirty(scope)`
- `renderFn(scope)`
- `childHostHooks(parentScope)`
- `scopeDisposal(scope)`

Flow:
```text
scope marked dirty
  -> queue one microtask
  -> skip if clean or disposed
  -> renderFn(scope)
  -> compiled template receives the render proxy
  -> compiled template returns VDOM
  -> snabbdom patches host DOM
  -> host hooks create/update/destroy child scopes
  -> title propagation updates if needed
```

`:init` lifetime:
- runs once when a scope is created
- does not run on rerender of the same scope
- runs again only when the host is replaced or defining inputs change

### Data And REST

Key source entry points:
- `markDirty(scope)`
- `window.updatePage()`
- `fetchIntoScope(restUrl, scope, fetchOpts)`

Rules:
- `$page` is replaced as a whole object on route changes.
- `$page` reads track the `page` dependency.
- `$user` reads track the `user` dependency.
- `window.updatePage()` dirties scopes that read `$user`.
- REST merges only non-`$*` plain-object fields into scope.

### Forms

Key source entry points:
- `compileScopedFormBody(node)`
- `initScopedForms(scope)`
- `initFormScope(form)`

Flow:
```text
parent render emits <form action ...>
   -> form hook stores form body metadata
   -> initScopedForms discovers unscoped forms
   -> initFormScope(form) creates the form scope
   -> optional initial GET from rest/action
   -> submit handler
    -> update $rest and non-`$*` scope fields
   -> navigate to href after successful submit
```

Scope reuse:
- keep the form scope when `action` and resolved rest URL are unchanged
- recreate the form scope when any of those defining inputs change

### Components

Key source entry points:
- `pug_components(name)`
- `emitCustomTagData(node, dataParts, blockResult)`

Rules:
- hyphenated `.pug` files become component templates
- component templates are not URL reachable
- component tags remain hyphenated DOM elements such as `<user-card>`
- all hyphenated tags render children to DOM normally; children are also captured as `$content` for component templates that use `slot`
- if no component template is registered for a tag, it behaves as a plain DOM element with children rendered normally
- component hosts use snabbdom `insert` hooks for scope creation and rendering (no `customElements.define`)
- component hosts preserve their scope across attr updates
- attr updates rerender the existing scope without rerunning `:init`

### Titles

Key source entry points:
- `generateBlock()` (title tag compilation, inlined)
- `propagateTitleChange(scope)`
- `documentTitle(titles)`

### Internationalization (i18n)

Key source entry points:
- `generateBlock()` (`:i18n` filter compilation)
- `compileI18nBlock(node)` — parses `:i18n` YAML into translation map
- `window.$T(key, scopeI18n, scope)` function — reads `$user.lang`, resolves from scope `$i18n` prototype chain → key text fallback, interpolates `#{expr}` using scope
- `T` scope proxy — returns translated strings on property access, throws on assignment, tracks `$user` dependency automatically
- `pug_i18n` global registry — loaded from `<root>/i18n.yaml` at build time

Rules:
- `$T.key` and `$T["key #{var}"]` are normal scope property access; the `$T` proxy handles translation at runtime
- `$T` proxy reads `scope.$user` on every access, which triggers `$deps.add("$user")` through the scope proxy; no compiler-emitted dependency tracking needed
- `:i18n` filter block is parsed at compile time into a scope-level translation map (all languages)
- `i18n.yaml` at project root is compiled into a global `pug_i18n` registry
- interpolation: `$T["Hello #{name}"]` passes `"Hello #{name}"` as key to proxy; `$T()` finds translation then replaces `#{name}` with `scope["name"]`
- `$i18n` uses prototype chain for cascading: `component → page → layout → pug_i18n`
- `renderSlot()` passes `$i18n_parent` via VNode data; `create` hook stores on element; scope creation uses `Object.create($i18n_parent)`
- per-language resolution: exact tag (`zh_HK`) → base tag (`zh`) → `$user.lang_default` (defaults to `en`) → key text

## Implementation Map

Compiler ownership:
- `src/compiler.ts`
- `src/compiler/`
- template record emission
- layout field resolution
- Pug AST codegen
- scoped CSS codegen
- `:i18n` block parsing and `T` expression compilation

Runtime ownership:
- `src/render/render.js`
- registries: `pug_pages()` and `pug_components()`
- route resolution and router patching
- `Scope` and scope proxy behavior
- child host hooks and disposal
- REST fetch/merge
- scoped forms
- components
- title propagation
- `$T` scope proxy, `window.$T()` translation lookup, and `pug_i18n` global registry

Release artifact ownership:
- `release/render.min.js` is updated only for runtime release builds.
- Do not regenerate `release/render.min.js` for compiler-only changes.
