# PugPage Architectural Design

## Overview

PugPage is a command-line tool and runtime for developing, bundling, and serving Pug-based web applications. It provides a streamlined workflow for rapid development, live reloading, and production builds, while supporting advanced Pug features, RESTful data integration, scoped CSS, and web component interoperability.

---

## 1. System Components

### CLI Tool (`pugpage`)

`pubpage` is a Deno script:
- **init**: Initializes a new PugPage project with a recommended directory structure and sample files.
- **dev**: Starts a development server with live reload, serving Pug files and assets.
- **test**: Runs tests using Jest and jsdom.
  - Watch for file changes, re-run test when file changes
- **dist**: Builds the application for production, bundling Pug, JS, CSS, and assets.

### Development Server
* Development server provide the following url
  * `/index.html`: provided by PugPage render
    * `XXXXXX` is the hash of JS content
  * `/pugpage.js`: See design of PugPage Render
    * In addition, it receive Server Sent Event (SSE) to reload browser
  * `/livereload`: Compile pug pages, and return Server Sent Event (SSE) when files change
  * Other static asset
  * Handles 404 to serve `/index.html`

### Dist Builder
Dist builder outputs `index.html` and `dist.XXXXXX.js`.
* `index.html`: load `dist.XXXXXX.js`. See design of PugPage render
* `/dist.XXXXXX.js`: is bundle of `/pugpage.js`
  * `XXXXXX` is hash of JS content

### PugPage Render
* `index.html`: loads `pugpage.js` (or `/dist.XXXXXX.js`)
* `pugpage.js`
  * Import `pug_pages()` provided by Pugpage compiler. When called with pug file path, it returns the pugpage function. See PugPage compiler.
  * Register HTML custom element `pug-page`, which
    * Fetch restful JSON data defined by attribute `rest` from server
    * Find PugPage function by calling `pug_pages()` with  attribute value `src`
    * Render shadowRoot by calling PugPage function with restful data
  * PugPage routing
    * Parse target PugPage to load from url
    * Load the PugPage
      - Try different PugPage path as described by README.md
    * Render PugPage with data:
      * Global variables:
        - `$user`: Injected empty object.
        - `$page`: Page context (path, args, params).

### PugPage Compiler
- Each Pug file is compiled to a PugPage function
  - When a tag has `$role` or `$lang` attributes, `if` directive is inserted to test the condition
  - `layout.pug` files in current directory of file and parent directories are applied by inserting `Extends` and `Block`
- All PugPage functions are combine into a single function `pug_pages()` in `compiled.pug.js`, when called with Pug file path, it returns the PugPage function
