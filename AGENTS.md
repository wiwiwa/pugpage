# Repository Guidelines

## Project Structure & Module Organization

PugPage is a Deno-based CLI and browser runtime for serving and bundling Pug pages. Core TypeScript lives in `src/`: `main.ts` handles CLI dispatch, `dev.ts` runs the development server, `dist.ts` builds production output, and `compiler.ts` plus `src/compiler/` implement Pug compilation, layout handling, and CSS scoping. Browser-side rendering code is in `src/render/render.js`, with the minified release artifact in `release/render.min.js`. Tests and fixtures live under `test/`; `test/compiler.test.ts` drives Playwright against sample pages in `test/pages/`.

## Build, Test, and Development Commands

- `deno test --allow-all`: runs the full test suite, including Playwright browser checks.
- `deno run --allow-all ./src/main.ts dev --root ./test/pages`: starts the dev server against fixture pages.
- `deno run --allow-all ./src/main.ts dist --root ./test/pages --out ./test/pages/dist`: builds a production bundle for a sample project.
- `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`: regenerates the browser runtime release file before a release.

Use Deno imports from `deno.json`; avoid adding npm scripts unless the project intentionally changes tooling.

## Coding Style & Naming Conventions

Use TypeScript for CLI/server/compiler code and plain JavaScript for browser runtime code already under `src/render/`. Follow the existing two-space indentation style. Prefer named exports for shared functions and keep file names lowercase with hyphenated names where needed, such as `css-scope.ts`. Keep Pug fixture names aligned with routes, for example `show.pug`, `layout.pug`, and `index.pug`.

## Testing Guidelines

Tests use Deno's test runner with Playwright assertions. Add or update fixtures under `test/pages/` when behavior depends on routing, layouts, forms, or scoped CSS. Name tests by the feature or module under test, for example `compiler.compile`. Always close browsers and shut down test servers to avoid hanging `deno test`.

## Commit & Pull Request Guidelines

Recent commits use scoped, imperative messages such as `dev: fix: auto-inject livereload script` and `render: fix: forms should be summitted with urlencoded, by default`. Keep the first segment tied to the affected area (`dev`, `render`, `compiler`, `dist`) and state the behavior change clearly.

Pull requests should include a short description, the commands run, and any relevant fixture or screenshot notes for browser-visible changes. Link related issues when available and call out release artifact updates to `release/render.min.js`.
