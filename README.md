PugPage is a command-line tool for bundling and serving Pug files, enabling rapid development of Pug-based web applications.

# Features

- **Custom Element `pug-page`**
  - Usage: `pug-page(src='user.pug' rest='/api/user/1000')`
  - `src`: Pug template to render
  - `rest`: RESTful JSON resource for rendering
- **Variables**
  - `$user`: Current logged-in user object.
    - `roles`: Array of roles (strings).
    - `lang`: User language (default: null).
  - `$page`: Current page object.
    - `path`: Page path.
    - `args`: Array of arguments (see URL handling).
    - `params`: Query parameters (e.g., `/user/?id=1` returns `{id: '1'}`).
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
  - Submitting a `<form>` expects a JSON response and updates the URL to the `href` attribute.
    - Example: `form(action='/api/user/1' href='/user/1')` posts to `/api/user/1` and redirects to `/user/1`.
  - Anti Page Reloading: It is expected the server hosts the production JS file to return `/index.html` when 404 page should be returned.
- **Web Component Support**
  - Third-party web components work in pug templates. Unknown tags pass through to the DOM as-is.
- **Scoped CSS**
  - By default, `style` elements are scoped to their parent template.

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
pugpage dev [--root=.] [--port=8000] [--api=http://localhost:8080] [--static=./assets]
                                      Start dev server with live reload and API proxy
                                      --static: additional directory to serve static files from
pugpage dist [--root=.] [--out=$root/dist]
                                      Build for production
pugpage install                       Install pugpage to ./pugpage
pugpage update                        Update pugpage to latest version
```

## Example Directory Structure

```
/project-root
  index.pug             # entry page
  index.html            # HTML shell (auto-created by dev server)
  layout.pug            # default layout
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

# Development

```bash
# Run tests
$ deno test --allow-all

# Start dev server against test pages
$ deno run --allow-all ./src/main.ts dev --root ./test/pages
```

### Release new version
- build minified version by
  `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`
- add built render.min.js to git by amending last commit
- tag new version by increase major, minor or patch version
- push after double confirm
