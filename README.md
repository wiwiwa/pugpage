PugPage is a command-line tool for bundling and serving Pug files, enabling rapid development of Pug-based web applications.

# Features

- **Pug Extensions**
  - **Builtin Filter `:pug`**: to load sub-pugpage and render with restful JSON data
    - Usage: `:pug(src='user.pug' rest='/api/user/1000')`
    - `src`: PugPage to render.
    - `rest`: RESTful JSON resource for rendering.
      - If `src` is omitted, child content is re-rendered with data.
  - **Builtin Filter `:less`**
  - **Variables**
    - `$user`: Current logged-in user object.
      - `roles`: Array of roles (strings).
      - `lang`: User language (default: null).
    - `$page`: Current page object.
      - `path`: Page path.
      - `args`: Array of arguments (see URL handling).
      - `params`: Query parameters (e.g., `/user/?id=1` → `{id: '1'}`).
  - **Tag Attributes**
    - `$role`: String or array. Renders tag only if `$user.roles` matches.
      - Example: `div($role='USER_ADMIN')` renders only for users with the `USER_ADMIN` role.
    - `$lang`: String or array. Renders tag only if `$user.lang` matches.
      - Example: `div($lang='CN')` renders only for users with language `CN`.
- **Layout File `layout.pug`**
  - When rendering a PugPage, `layout.pug` in the current or parent directories is automatically applied via Pug `extends`.
- **URL Handling**
  - On browser URL change, PugPage searches for the appropriate page using the following algorithm:
    - For URL `/system/user/1/edit`:
      1. `/system/user/1/edit.pug`
      2. `/system/user/1/edit/show.pug` (if found, `$page.args = ['edit']`)
      3. `/system/user/edit.pug` (if found, `$page.args = ['1']`)
      4. `/system/user/1.pug` (if found, `$page.args = ['edit']`)
      5. `/system/user.pug` (if found, `$page.args = ['1', 'edit']`)
      6. `/system.pug` (if found, `$page.args = ['user', '1', 'edit']`)
  - Clicking an `<a>` tag updates the URL.
  - Submitting a `<form>` expects a JSON response and updates the URL to the `href` attribute.
    - Example: `form(action='/api/user/1' href='/user/1')` posts to `/api/user/1` and redirects to `/user/1`.
  - Anti Page Reloading: It is expected the server hosts the production JS file to return `/index.html` when 404 page should be returned
- **Web Component Support**
  - Any third party web component should be able to be used in pugpage
- **Scoped CSS**
  - By default, `style` element is scoped to its parent HTML tag

  # Usage

  * Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) first
  * Install `./pugpage`:
    * `curl -sL https://raw.githubusercontent.com/wiwiwa/pugpage/main/install.sh | sh`
  * To to init a pugpage project: `./pugpage init`
  * To start the development server: `./pugpage dev`
  * To run tests: `./pugpage test`
    * To run tests when file changes: `./pugpage test -w`
  * To build for production: `./pugpage dist`

  ## Example Directory Structure
  ```
  /project-root
    /src          # root of pug pages
      index.pug
      layout.pug    # default layout file
      /system
        layout.pug  # layout file for 
        /user
          index.pug # example url /system/user/
          show.pug  # example url /system/user/1000
          edit.pug  # example url /system/user/1000/edit
    /public
      styles.css
      /image
        user.jpg
    /test
      example.test.js
  ```

# Development

```bash
# Run tests automatically on code changes
$ deno test
# Run test page in browser with live reload
$ deno run --allow-all ./src/dev.ts --root ./test
# Build final output of compiled files
$ deno compile
```
