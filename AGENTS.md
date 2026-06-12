# Repository Guidelines

## Project Structure & Module Organization

PugPage is a Deno-based CLI and browser runtime for serving and bundling Pug pages. Core TypeScript lives in `src/`: `main.ts` handles CLI dispatch, `dev.ts` runs the development server, `dist.ts` builds production output, and `compiler.ts` plus `src/compiler/` implement Pug compilation, layout handling, and CSS scoping. Browser-side rendering code is in `src/render/render.js`, with the minified release artifact in `release/render.min.js`. Tests and fixtures live under `test/`; `test/compiler.test.ts` drives Playwright against sample pages in `test/pages/`.

## Build, Test, and Development Commands

- `deno test --allow-all`: runs the full test suite, including Playwright browser checks.
- `deno run --allow-all ./src/main.ts test --root ./test/pages -v test/pugpage.test.yaml`: runs declarative YAML tests via Playwright with browser console output.
- `deno task dev`: starts the dev server against fixture pages on port 8081.
- `deno run --allow-all ./src/main.ts dev --root ./test/pages`: starts the dev server against fixture pages (default port).
- `deno run --allow-all ./src/main.ts dist --root ./test/pages --out ./test/pages/dist`: builds a production bundle for a sample project.
- `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`: regenerates the browser runtime release file before a release.

Use Deno imports from `deno.json`; avoid adding npm scripts unless the project intentionally changes tooling.

## Architecture

See [Architecture.md](./Architecture.md) for full system design. Key ownership rules:
- Compiler behavior belongs in `src/compiler.ts` and `src/compiler/`
- Browser behavior belongs in `src/render/render.js`; update `release/render.min.js` only when runtime code changes
- Do not regenerate `release/render.min.js` for compiler-only changes
- Do not regenerate `release/render.min.js` during development iterations — only regenerate when performing a release

## Documentation Style

Architecture.md uses **spec-prose** — prose-shaped but spec-precise documentation designed to be code-generable:

- **Function-first**: every block starts with `functionName(args):` as the lead line, followed by nested bullets
- **Nested bullets show call graph**: `fn(args)` → inner steps → inner calls, indented under the caller
- **No prose filler**: no "it does this by...", just `step → step → step`
- **Branching is explicit**: "if X → ...; else if Y → ..."
- **Conditional delegation**: guard as a bullet (`if guard`), delegated function call indented under it with its own nested steps — shows both the control flow and the call graph in one structure
- **Inline single-use helpers**: if a function is called from only one place and its body is short (≤3 bullets), nest its steps under the call site instead of documenting it as a standalone block. Keep standalone only if the function is reused or the section would nest too deep (≥4 levels)
- **Emit/output is concrete**: shows exact JS strings, objects, or data shapes produced
- **Section labels are bold text**, not headings: `**Label**` followed by a list, not `#### Label` — avoids heading noise when the section is a sublist

Use TypeScript for CLI/server/compiler code and plain JavaScript for browser runtime code already under `src/render/`. Follow the existing two-space indentation style. Prefer named exports for shared functions and keep file names lowercase with hyphenated names where needed, such as `css-scope.ts`. Keep Pug fixture names aligned with routes, for example `show.pug`, `layout.pug`, and `index.pug`.

## Testing Guidelines

Tests use Deno's test runner with Playwright assertions. Add or update fixtures under `test/pages/` when behavior depends on routing, layouts, forms, or scoped CSS. Always close browsers and shut down test servers to avoid hanging `deno test`.
Declarative test runner (`src/test.ts`):
  - `pugpage test <test.yaml>` runs a single YAML test file
  - YAML is a test tree: map values are groups, and list values are named test cases
  - Each test case contains one or more action groups with actions (`goto`, `fill`, `select`, `click`, `wait`, `js`) and assertions (`has`, `no`, `url`, `status`)
  - `wait`, `has`, `no` accept unified selector targets: string (CSS selector), object (selector + required text), or array of mixed
  - `js: expression` evaluates a JavaScript expression in the browser and prints the result; jQuery is auto-injected if not already loaded
  - Use `body: "text"` for whole-page text checks; replaces removed `text` and `waitText` keys
  - If `goto` is omitted, the action group continues from the current page state
  - Fail-fast: stops on first failure; exits `0` on pass, `1` on any failure
  - `test/E2E.test.ts` is a thin wrapper that calls `runTests()` from `src/test.ts`

## Debugging Test Failures

When a YAML test fails with minimal output (e.g. "expected X to exist"), debug with a temporary Playwright script in **headless mode by default**. Only use `--headed` or `{ headless: false }` when you need visual inspection from the user.
```typescript
import { chromium } from "npm:playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", msg => console.log("BROWSER:", msg.type(), msg.text()));
page.on("pageerror", err => console.log("ERROR:", err.message));
await page.goto("http://localhost:8000/render-test");
const html = await page.content();
console.log(html);
await browser.close();
```
- Start the dev server first: `deno run --allow-all ./src/main.ts dev --root ./test/pages`
- Capture browser console logs and JS errors to diagnose render failures
- Check for component registration failures, undefined references, scope issues
- For the YAML test runner: add `--headed` only if user needs to see the browser

## Documentation Checklist

After implementing a feature or bug fix:
- Update `README.md` when end-user behavior, CLI usage, or public template/runtime features change. This document is enduser focus.
- Update `AGENTS.md` when architecture, workflow, ownership boundaries, or notable technical decisions change. This document is developer or agent focus

## Commit & Pull Request Guidelines

**NEVER auto-commit or auto-release.** Always ask the user for confirmation before running `git commit`, `git tag`, or `git push`. Present the changes and wait for explicit approval.

Always create ONE commit for a single requirement or bug fix — combine runtime, tests, docs, and release artifact changes into a single atomic commit.
Recent commits use scoped, imperative messages such as `dev: fix: auto-inject livereload script` and `render: fix: forms should be summitted with urlencoded, by default`. Keep the first segment tied to the affected area (`dev`, `render`, `compiler`, `dist`) and state the behavior change clearly.

Pull requests should include a short description, the commands run, and any relevant fixture or screenshot notes for browser-visible changes. Link related issues when available and call out release artifact updates to `release/render.min.js`.

## Release Procedure

Use the `release` skill when releasing. Key constraints:
- Working tree must be clean before releasing — all changes must already be committed
- Do NOT create new commits during release — only amend the existing commit if needed
- Tag convention: plain semver, no `v` prefix (`1.9.8` not `v1.9.8`)
- Regenerate `release/render.min.js`, only if `render.js` changed
  - Amend the last commit with render.min.js: `git add release/render.min.js && git commit --amend --no-edit`
- `deno.json` version is auto-set from the git tag by the publish workflow — no manual bump needed

**Build**: `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`
**Verify**: `deno test --allow-all --no-check`
**Tag + Push**: `git tag X.Y.Z && git push origin master && git push origin X.Y.Z`
**Publish**: `.github/workflows/publish-jsr.yml` auto-sets version from tag and publishes to JSR via GitHub OIDC
