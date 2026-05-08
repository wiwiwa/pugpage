PugPage is a command-line tool for bundling and serving Pug files, enabling rapid development of Pug-based web applications.

# Features

- **Custom Element `pug-page`**
  - Usage: `pug-page(src='user.pug' rest='/api/user/1000')`
  - `src`: Pug template to render
  - `rest`: RESTful JSON resource for rendering
- **Form Handling**
  - Usage `form(rest='/api/profile' action='/api/user/1' href='/user/1')` — fetches initial data from `rest`, submit to `action`, redirect to `href`.
    - both `rest` and `action` updates scope data
- **Reactive Event Handler**
  - Typical we just assign new values to data in scope, and DOM nodes are auto updated
- **Variables**
  - `$user`: Current logged-in user object.
    - `name`: User display name
    - `roles`: Array of roles (strings).
    - `lang`: User language
    - `loginUrl`: Login page URL (default: `"/login"`).
      - Any 401 response redirects to this URL.
    - `setAuthHeader(authData, persistent)`: Store an `Authorization` header value. When persistent, auth data is persist across browser restart
    - `logout()`: Clear login information
  - `$page`: Current page object.
    - `path`: Page path.
    - `args`: Array of arguments (see URL handling).
    - `params`: Query parameters (e.g., `/user/?id=1` returns `{id: '1'}`).
  - `$rest`: Fetch result of url `rest` — `null` before fetch, `{ status, data }` after.
- **Tag Attributes**
  - `$role`: String or array. Renders tag only if `$user.roles` matches.
    - Example: `div($role='USER_ADMIN')` renders only for users with the `USER_ADMIN` role.
  - `$lang`: String or array. Renders tag only if `$user.lang` matches.
    - Example: `div($lang='CN')` renders only for users with language `CN`.
- **Layout File `layout.pug`**
  - When rendering a page, `layout.pug` in the current or parent directories is automatically applied. Tag `slot` is replaced by rendered content of sub-layout or final page.
  - Use `extends my-layout` to specify a custom layout file (resolved relative to the page).
    - `extends NONE` disable layout auto-application.
- **URL Handling**
  - On browser URL change, PugPage searches for the appropriate page using the following algorithm:
    - For URL `/system/user/1/edit`:
      1. `/system/user/1/edit.pug`
      2. `/system/user/1/edit/show.pug` (if found, `$page.args = ['edit']`)
      3. `/system/user/edit.pug` (if found, `$page.args = ['1']`)
      4. `/system/user/1.pug` (if found, `$page.args = ['edit']`)
      5. `/system/user.pug` (if found, `$page.args = ['1', 'edit']`)
      6. `/system.pug` (if found, `$page.args = ['user', '1', 'edit']`)
      7. `/404.pug` (if found, `$page.args = ['system', 'user', '1', 'edit']`)
  - Clicking an `<a>` tag updates the URL.
  - Anti Page Reloading: It is expected the server hosts the production JS file to return `/index.html` when 404 page should be returned.
- **Web Component Support**
  - Third-party web components work in pug templates. Unknown tags pass through to the DOM as-is.
- **Scoped CSS**
  - By default, `style.`, `:scss`, and `:sass` blocks are scoped to their parent template.
  - To emit global CSS, use `style(scoped=false).`, `:scss(scoped=false)`, or `:sass(scoped=false)`.

# Usage

1. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/)
2. Install: `curl -sL https://raw.githubusercontent.com/wiwiwa/pugpage/master/pugpage.sh | sh`
3. Start the dev server: `./pugpage dev`
   - The dev server watches `.pug` files for changes and reloads the browser automatically.
   - Creates `index.html` in the project root if it doesn't exist.
4. Build for production: `./pugpage dist`
5. Update to latest: `./pugpage update`

## CLI Reference

```
pugpage dev [--root=.] [--port=8000] [--api=URL] [--static=DIR]
                                      Start dev server with live reload and API proxy
pugpage dist [--root=.] [--out=DIR]
                                      Build for production
pugpage test [--root=.] [--api=URL] [--static=DIR] <test.yaml>
                                      Run declarative browser tests in headless mode
pugpage install                       Install pugpage to ./pugpage
pugpage update                        Update pugpage to latest version
```

## Testing

Write a `*.test.yaml` file and run:

```sh
pugpage test ./pugpage.test.yaml
```

Exits `0` when all tests pass, `1` on any failure.

Example (see `test/pugpage.test.yaml` for a full example):

```yaml
login:
  login successfully:
    - goto: /login
      fill:
        "input[name=password]": demo
      click: "button[type=submit]"
      has: .logout
```

Every key is a group name or test case name. A key whose value is a list is an executable test case. A key whose value is a map is a group containing more tests. Action groups run in list order; if `goto` is omitted, the group continues from the current page.

### Selector targets

`wait`, `has`, and `no` accept the same value shapes:

```yaml
has: ".card"
no: ".error"
wait: ".dashboard"
```

```yaml
has:
  ".card-title": Devices
no:
  ".error": Invalid credentials
wait:
  body: Login
```

```yaml
has:
  - ".card"
  - ".card-title": Devices
  - li: [demo, User ID]
```

- String: CSS selector only
- Object: selector plus required text. Value is a string or array of strings — each text must appear somewhere under that selector
- List: each item is evaluated in order
- Use `body: "some text"` for whole-page text assertions or waits
- `wait` waits for selector targets to become visible
- `has` asserts selector targets exist
- `no` asserts selector targets do not exist

### Action group keys

- `goto` — route or absolute URL to visit
- `fill` — map of `{selector: value}`
- `select` — map of `{selector: value}`
- `click` — selector string or array; auto-waits for element to be visible, stable, and enabled
- `wait` — selector target (see above); waits for visible elements
- `url` — expected final route after navigation/redirects
- `status` — expected main document status after `goto`
- `has` — selector target (see above); asserts elements exist
- `no` — selector target (see above); asserts elements do not exist
- `timeout` — action group timeout in milliseconds (default: 5000)

## Example Directory Structure

```
/project-root
  index.pug             # entry page
  index.html            # HTML shell (auto-created by dev server)
  layout.pug            # default layout
  login.pug             # login page with reactive form
  /system
    layout.pug          # layout for /system/*
    /user
      index.pug         # /system/user/
      show.pug          # /system/user/1000
      edit.pug          # /system/user/1000/edit
  /public
    styles.css
    /image
      user.jpg
```
