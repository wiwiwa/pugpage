# PugPage Specification

## Custom Tags

### `pug-page`

```pug
pug-page(src='user.pug' rest='/api/user/1000')
```

- `src` — Pug template to render
- `rest` — RESTful JSON resource for rendering

### Custom Tags (Hyphenated `.pug` files)

Files named `*-*.pug` become custom tags. Resolved at the directory of the parent `.pug` file, or `/components/`.

```pug
my-tag
// equivalent to pug-page(src='my-tag.pug') or pug-page(src='/components/my-tag.pug')
```

### Page Title

The `title` tag sets a page's title. It renders nothing to the DOM.

```pug
title User #{$args[0]}
title(href="/") MyApp
title= someVariable
title(href=someUrl)= someVariable
```

All scopes participate in the title chain: pages, layouts, `pug-page`, forms, and custom components.

#### `title` Tag

- Text or expression value — the label
- Optional `href` attribute — URL for navigation (defaults to `null`)
- Multiple `title` tags in the same scope — last rendered wins, including an empty title
- Empty label (`""`, `null`, or `undefined`) — clears this scope's local title for the current render
- Multiple child scopes with titles — last rendered child scope with a non-empty title chain wins
- Nested element children are not supported in `title`; use text, interpolation, or `title= expression`

#### `$titles`

Array of `{label, href}` objects, ordered child to root. Reactive — updates when any scope's title changes.

```pug
// $titles = [{label: "User 1000", href: "/user/1000"}, {label: "Users", href: "/user"}, {label: "MyApp", href: "/"}]

nav
  each t in $titles
    if t.href
      a(href=t.href)= t.label
    else
      span= t.label
```

#### `document.titleFn`

Global function that merges title segments into `document.title`.

```js
// Default: child first
document.titleFn = (label, accumulated) => accumulated + " | " + label
```

Override to customize:

```js
// Parent first
document.titleFn = (label, accumulated) => label + " / " + accumulated

// Override with the current parent label only
document.titleFn = (label, accumulated) => label
```

`document.title` is updated when any scope's title changes.

#### Resolution

```
show.pug       →  title(href="/user/1000") "User 1000"
user/layout    →  title(href="/user") "Users"
layout.pug     →  title(href="/") "MyApp"

$titles = [{label: "User 1000", href: "/user/1000"}, {label: "Users", href: "/user"}, {label: "MyApp", href: "/"}]
document.title = "User 1000 | Users | MyApp"
```

`document.title` is resolved by folding `$titles` from child to root. The first non-empty label becomes the current title. For every following parent label, PugPage calls `document.titleFn(parentLabel, currentTitle)`.

---

## Form Handling

```pug
form(rest action='/api/user/1' href='/user/1')
```

- `action` — required URL for form submission
- `rest` — optional initial data fetch
  - absent — no initial fetch
  - present without a value — initial `GET action`
  - present with a value — initial `GET rest`
- `href` — redirect URL after successful submit

The initial `rest` request and the submit `action` response both update `$rest`. If response `data` is a plain object, PugPage also shallow-merges safe fields into the current scope.

---

## Reactivity

### Scope

Every scope (page, layout, `pug-page`, form, component) is reactive. Templates run through a scope proxy, and assigning a value triggers a microtask-batched re-render automatically.

### `:init` Block

Initialization code that runs once per scope lifetime. Use for setting default values.

```pug
:init
  count = 0
  items = []

button(onclick='count++') Clicked #{count} times
```

Template body only reads scope and produces VDOM — no value initialization in the template itself. This prevents re-renders from overwriting handler-set values.

Route page `:init` runs once per route path scope lifetime. Query-only changes update `$page.params` without recreating the route page scope. Layout `:init` runs once per layout scope lifetime; reused layouts do not rerun `:init` on navigation. `pug-page`, form, and custom component `:init` blocks run once per element/component scope lifetime.

### Event Handlers

Assign new values to local scope data, and DOM nodes are auto-updated via microtask-batched re-render. Direct assignment to `$user.*` mutates the shared user object but does not automatically re-render; use `$user` APIs or call `window.updatePage()` after direct `$user` mutation.

```pug
:init
  count = 0

button(onclick='count++') Clicked #{count} times
```

---

## Variables

### `$user`

Current logged-in user object. `$user` is shared and mutable, but direct field assignment does not automatically re-render the page. PugPage-owned APIs call `window.updatePage()` after mutating `$user`; application code that mutates `$user` directly should call `window.updatePage()` when UI must refresh.

- `name` — User display name
- `roles` — Array of roles (strings)
- `lang` — User language
- `loginUrl` — Login page URL (default: `"/login"`). Any 401 response redirects to this URL.
- `setAuthHeader(authData, persistent)` — Store an `Authorization` header value. When `persistent`, auth data persists across browser restarts.
- `logout()` — Clear login information, clear auth storage, then redirect to `$user.loginUrl`

### `$page`

Current page object. PugPage creates a fresh `$page` object on every route render. Reused layout scopes resolve `$page` dynamically so they read the current route instead of a captured old route.

- `path` — Page path
- `args` — Array of arguments (see URL handling)
- `params` — Query parameters (e.g., `/user/?id=1` returns `{id: '1'}`)

### `$titles`

Array of `{label, href}` objects for the title chain. Set by `title` tags, readable by layouts for navigation. Reactive — updates when any scope's title changes.

### `$rest`

Fetch result for REST-backed pages and forms. `$rest` is always an object.

Before a `<pug-page rest>` request finishes:

```js
{ status: null, data: null, loading: true, headers: {} }
```

Before a form initial `rest` request or submit starts:

```js
{ status: null, data: null, loading: false, headers: {} }
```

During a form submit, `loading` becomes `true`. After any request finishes, PugPage sets `status`, `data`, `headers`, and `loading: false`.

---

## Tag Attributes

### `$role`

String or array. Renders tag only if `$user.roles` matches.

```pug
div($role='USER_ADMIN') Admin panel
```

### `$lang`

String or array. Renders tag only if `$user.lang` matches.

```pug
div($lang='CN') Chinese content
```

---

## Layout File `layout.pug`

When rendering a page, `layout.pug` in the current or parent directories is automatically applied. Tag `slot` renders the next page host in the resolved layout/page chain.

Use `extends my-layout` to specify a custom layout file (resolved relative to the page). Use `extends NONE` to disable layout auto-application.

---

## URL Handling

On browser URL change, PugPage searches for the appropriate page using the following algorithm:

For URL `/system/user/1/edit`:

1. `/system/user/1/edit.pug`
2. `/system/user/1/edit/show.pug` (if found, `$page.args = ['edit']`)
3. `/system/user/edit.pug` (if found, `$page.args = ['1']`)
4. `/system/user/1.pug` (if found, `$page.args = ['edit']`)
5. `/system/user.pug` (if found, `$page.args = ['1', 'edit']`)
6. `/system.pug` (if found, `$page.args = ['user', '1', 'edit']`)
7. `/404.pug` (if found, `$page.args = ['system', 'user', '1', 'edit']`)

Clicking a same-origin `<a>` tag updates the URL through SPA navigation unless the link has no `href`, an empty `href`, a hash-only `href`, `target="_blank"`, a modifier-key click, a cross-origin URL, or an earlier handler has already prevented default behavior.

Anti Page Reloading: the server should return `/index.html` for 404 responses to support SPA routing.

---

## Scoped CSS

By default, `style.`, `:scss`, and `:sass` blocks are scoped to their parent template. To emit global CSS:

```pug
style(scoped=false).
  .global { color: red; }
```

---

## Web Component Support

Third-party web components work in Pug templates. Unknown tags pass through to the DOM as-is.

---

## Testing

Write a `*.test.yaml` file and run:

```sh
pugpage test ./pugpage.test.yaml
```

Exits `0` when all tests pass, `1` on any failure.

### Test Structure

Every key is a group name or test case name. A key whose value is a list is an executable test case. A key whose value is a map is a group containing more tests. Top-level keys may be executable test cases. Nested group names are flattened into the displayed test name. Action groups run in list order; if `goto` is omitted, the group continues from the current page.

```yaml
login:
  login successfully:
    - goto: /login
      fill:
        "input[name=password]": demo
      click: "button[type=submit]"
      has: .logout
```

Within one action group, actions run in YAML key order. A list of action groups runs top-to-bottom. Repeated action names in the same action group are not reliable YAML; use separate action groups instead.

Invalid DSL shapes fail fast with the YAML path and expected shape, then exit `1`.

### Selector Targets

`has` and `no` accept the same value shapes:

**String** — CSS selector only:
```yaml
has: ".card"
```

**Object** — selector plus required text. Multi-key objects define multiple targets in YAML key order:
```yaml
has:
  ".card-title": Devices
  ".card-count": "10"
no:
  ".error": Invalid credentials
```

**List** — each item evaluated in order:
```yaml
has:
  - ".card"
  - ".card-title": Devices
  - li: demo
  - li: "User ID"
```

Text values are strings. Use multiple selector targets for multiple text checks. `body` is not a special key; use `body: "some text"` as a normal CSS selector target for whole-page text assertions.

- `has` — waits up to the action group timeout for selector targets to exist and match required text
- `no` — waits up to the action group timeout for selector targets not to exist or not to match required text

### Action Group Keys

- `goto` — route or absolute URL to visit
- `fill` — selector/value object or list of selector/value objects; values run in YAML order
- `select` — selector/value object or list of selector/value objects; value may be a string or array of strings
- `click` — single selector target; string selector or one selector/text object; auto-waits for element to be visible, stable, and enabled
- `url` — expected final pathname after navigation/redirects; origin and query string are ignored
- `has` — selector target; asserts elements exist
- `no` — selector target; asserts elements do not exist
- `js` — evaluates JavaScript in the browser and prints the result to stdout. Single-line values are expressions. Multi-line values run as an async function body and should `return` a value for output. jQuery is auto-injected only when `window.$` is missing.
- `timeout` — action group timeout in milliseconds (default: 5000)
