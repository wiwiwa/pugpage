# PugPage Architectural Design

## Overview

PugPage is a command-line tool and runtime for developing, bundling, and serving Pug-based web applications. It provides a streamlined workflow for rapid development, live reloading, and production builds, while supporting advanced Pug features, RESTful data integration, scoped CSS, and web component interoperability.

---

## 1. System Components

### 1.1 CLI Tool (`pugpage`)

`pubpage` is a Deno script:
- **init**: Initializes a new PugPage project with a recommended directory structure and sample files.
- **dev**: Starts a development server with live reload, serving Pug files and assets.
- **test**: Runs tests using Jest and jsdom.
  - Watch for file changes, re-run test when file changes
- **dist**: Builds the application for production, bundling Pug, JS, CSS, and assets.

### 1.2 PugPage Compiler
- Extends Pug with custom filters (`:pug`, `:less`), variable injection, and tag attribute controls.
- Handles layout inheritance via `layout.pug`.
- Integrates RESTful data sources for dynamic rendering.

### 1.3 Development Server
- **livereload**: Integrates `livereload` to automatically refresh the browser when file changes.
  - Serves compiled Pug pages and static assets.
  - Compile `.pug` file when file changes
  - Handles 404 to serve `/index.html`

### 1.4 Production Bundler
- Compiles and bundles Pug templates, JS, and CSS.
- Ensures all routes resolve to `/index.html` for SPA navigation.
- Optimizes assets for deployment.

---

## 2. Key Features & Architecture

### PugPage Compiler
* **Builtin Filters**
  - **`:pug`**: Include other Pug file
  - **`:less`**: Compiles LESS to CSS, scoped to the parent element.
* **Tag Attribute**
  - Compile attribute `$role` and `$lang` attributes to `if` directive
* **Layout Inheritance**
  - On page compiling, searches for `layout.pug` in the current or parent directories and applies it via Pug's `extends`.
* Scoped CSS
  - When compiling `style` tags:
    - Apply a radom class name to parent element
    - Constrain rule in style with random class name
* List of bundled file

### PugPage Render

At runtime, PugPage render page:
* Render context passed in:
  - `$user`: Runtime: Injected empty object.
  - `$page`: Runtime: Page context (path, args, params).
* URL Routing Algorithm
  * Monitor url change event of browser
    - Find url path in compiled file list using a fallback algorithm
    - Populating `$page.args` as needed.
  - Handles event of `<a>` and `<form>` elements, updating the browser URL and page state without reloads.
* RESTful Data Integration
  - Fetches JSON data from REST endpoints for use in Pug templates.
  - Replace child nodes when rest data is ready
