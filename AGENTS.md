# Repository Guidelines

## Project Structure & Module Organization

PugPage is a Deno-based CLI and browser runtime for serving and bundling Pug pages. Core TypeScript lives in `src/`: `main.ts` handles CLI dispatch, `dev.ts` runs the development server, `dist.ts` builds production output, and `compiler.ts` plus `src/compiler/` implement Pug compilation, layout handling, and CSS scoping. Browser-side rendering code is in `src/render/render.js`, with the minified release artifact in `release/render.min.js`. Tests and fixtures live under `test/`; `test/compiler.test.ts` drives Playwright against sample pages in `test/pages/`.

## Build, Test, and Development Commands

- `deno test --allow-all`: runs the full test suite, including Playwright browser checks.
- `deno run --allow-all ./src/main.ts test --root ./test/pages test/pugpage.test.yaml`: runs declarative YAML tests via Playwright.
- `deno run --allow-all ./src/main.ts dev --root ./test/pages`: starts the dev server against fixture pages.
- `deno run --allow-all ./src/main.ts dist --root ./test/pages --out ./test/pages/dist`: builds a production bundle for a sample project.
- `deno bundle --minify -o ./release/render.min.js ./src/render/render.js`: regenerates the browser runtime release file before a release.

Use Deno imports from `deno.json`; avoid adding npm scripts unless the project intentionally changes tooling.

## Architecture

See [Architecture.md](./Architecture.md) for full system design. Key ownership rules:
- Compiler behavior belongs in `src/compiler.ts` and `src/compiler/`
- Browser behavior belongs in `src/render/render.js`; update `release/render.min.js` only when runtime code changes
- Do not regenerate `release/render.min.js` for compiler-only changes

## Documentation Style

Architecture.md uses **spec-prose** — prose-shaped but spec-precise documentation designed to be code-generable:

- **Function-first**: every block starts with `functionName(args):` as the lead line, followed by nested bullets
- **Nested bullets show call graph**: `fn(args)` → inner steps → inner calls, indented under the caller
- **No prose filler**: no "it does this by...", just `step → step → step`
- **Branching is explicit**: "if X → ...; else if Y → ..."
- **Emit/output is concrete**: shows exact JS strings, objects, or data shapes produced
- **Section labels are bold text**, not headings: `**Label**` followed by a list, not `#### Label` — avoids heading noise when the section is a sublist

Use TypeScript for CLI/server/compiler code and plain JavaScript for browser runtime code already under `src/render/`. Follow the existing two-space indentation style. Prefer named exports for shared functions and keep file names lowercase with hyphenated names where needed, such as `css-scope.ts`. Keep Pug fixture names aligned with routes, for example `show.pug`, `layout.pug`, and `index.pug`.

## Testing Guidelines

Tests use Deno's test runner with Playwright assertions. Add or update fixtures under `test/pages/` when behavior depends on routing, layouts, forms, or scoped CSS. Always close browsers and shut down test servers to avoid hanging `deno test`.
Declarative test runner (`src/test.ts`):
  - `pugpage test <test.yaml>` runs a single YAML test file
  - YAML is a test tree: map values are groups, and list values are named test cases
  - Each test case contains one or more action groups with actions (`goto`, `fill`, `select`, `click`, `wait`) and assertions (`has`, `no`, `url`, `status`)
  - `wait`, `has`, `no` accept unified selector targets: string (CSS selector), object (selector + required text), or array of mixed
  - Use `body: "text"` for whole-page text checks; replaces removed `text` and `waitText` keys
  - If `goto` is omitted, the action group continues from the current page state
  - Fail-fast: stops on first failure; exits `0` on pass, `1` on any failure
  - `test/E2E.test.ts` is a thin wrapper that calls `runTests()` from `src/test.ts`

## Documentation Checklist

After implementing a feature or bug fix:
- Update `README.md` when end-user behavior, CLI usage, or public template/runtime features change. This document is enduser focus.
- Update `AGENTS.md` when architecture, workflow, ownership boundaries, or notable technical decisions change. This document is developer or agent focus

## Commit & Pull Request Guidelines

Always create ONE commit for a single requirement or bug fix — combine runtime, tests, docs, and release artifact changes into a single atomic commit.
Recent commits use scoped, imperative messages such as `dev: fix: auto-inject livereload script` and `render: fix: forms should be summitted with urlencoded, by default`. Keep the first segment tied to the affected area (`dev`, `render`, `compiler`, `dist`) and state the behavior change clearly.

Pull requests should include a short description, the commands run, and any relevant fixture or screenshot notes for browser-visible changes. Link related issues when available and call out release artifact updates to `release/render.min.js`.

## Release Procedure

0. **Verify state before starting**:
   - `git checkout master` — ensure on master, not detached HEAD
   - `git merge --ff-only <commit>` if needed to bring master to the fix commit
   - `git tag -l` — check existing tag naming convention (no `v` prefix: `1.9.6` not `v1.9.6`)
   - Working tree must be clean
1. Build minified runtime: `deno bundle --minify -o ./release/render.min.js ./src/render/render.js` (skip if compiler-only change — `render.min.js` must not change)
2. Update `version` in `deno.json`
3. Update `VERSION` in `pugpage.sh` to match
4. Run verification: `deno test --allow-all --no-check` and `deno publish --dry-run`
5. Amend previous commit with version bump: `git add deno.json pugpage.sh release/render.min.js && git commit --amend --no-edit` — preserves the original commit message
6. Tag new version — **must come after amend** (amend rewrites commit hash). Match existing convention: plain semver, no `v` prefix
7. Double confirm before pushing
8. Push branch and tag; `.github/workflows/publish-jsr.yml` publishes to JSR from the tag using GitHub OIDC
9. Confirm the GitHub Actions publish job succeeds
