# PugPage Test YAML Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `pugpage test` from route-list YAML to scenario/group/test-case YAML where each test case contains one or more ordered action groups.

**Architecture:** Keep Playwright execution in `src/test.ts`, but split parsing/flattening from action execution. YAML maps become nested scenario/group nodes until a list is found; each list is a test case and each item is an action group run in order on the same page. CLI behavior stays the same except the YAML format changes.

**Tech Stack:** Deno, TypeScript, `@std/yaml`, Playwright, existing `startDevServer()`.

---

## Gap Analysis

- Current `test/pugpage.test.yaml` is a top-level list keyed by route; the design requires top-level scenario keys and nested test case names.
- Current `src/test.ts` models one route entry as `Record<string, TestStep>`; the design needs recursive flattening into `{ name, groups }`.
- Current navigation uses the route key; the design uses `goto` inside action groups and allows later groups to continue from current page state.
- Current action model still includes `check` and `uncheck`; the design removes them and uses `click` plus `:checked` CSS assertions.
- Current output prints only route labels; the design needs full names like `auth > wrong then correct password`.
- Current README and AGENTS mention the older route-list format; both need updates because this is end-user behavior and workflow documentation.
- Existing E2E coverage can stay functionally equivalent, but the YAML fixture must be rewritten to cover redirect, login, user route, and style output using scenario syntax.

## File Responsibilities

- Modify `src/test.ts`: Define the new YAML schema types, flatten nested scenarios into executable test cases, execute action groups, and report full test names.
- Modify `test/pugpage.test.yaml`: Convert fixture tests to scenario/test-case/action-group format.
- Modify `test/E2E.test.ts`: Keep as thin `runTests()` wrapper; update the test name only if desired.
- Modify `README.md`: Document the new end-user YAML format, action groups, supported keys, examples, and exit behavior.
- Modify `AGENTS.md`: Update declarative runner architecture notes from route-list format to scenario/action-group format.

## Task 1: Add Failing Scenario YAML Fixture

**Files:**
- Modify: `test/pugpage.test.yaml`
- Test: `test/E2E.test.ts`

- [ ] **Step 1: Replace the fixture with scenario YAML**

```yaml
auth:
  redirect anonymous user:
    - goto: /
      waitText: Login
      url: /login
      has: "button[type=submit]"

  login successfully:
    - goto: /login
      fill:
        - "input[name=password]": demo
      click: "button[type=submit]"
      wait: a.logout
      url: /
      text: Logout
      has: a.logout

user:
  show user:
    - goto: /user/1000
      wait: li
      text: demo
      has: [li, style]
```

- [ ] **Step 2: Run the current E2E test and verify it fails**

Run:

```sh
deno test --allow-all --no-check test/E2E.test.ts
```

Expected: FAIL because `src/test.ts` still expects the top-level YAML value to be an array of route entries.

- [ ] **Step 3: Do not change production code in this task**

Commit after failure is observed:

```sh
git add test/pugpage.test.yaml
git commit -m "test: convert fixture to scenario yaml"
```

## Task 2: Parse And Flatten Scenario YAML

**Files:**
- Modify: `src/test.ts`
- Test: `test/E2E.test.ts`

- [ ] **Step 1: Add schema types**

Replace the old `TestStep`/`TestEntry` model with these names:

```ts
interface ActionGroup {
  goto?: string;
  url?: string;
  text?: string | string[];
  has?: string | string[];
  no?: string | string[];
  fill?: Record<string, string>[];
  select?: Record<string, string>[];
  click?: string | string[];
  wait?: string | string[];
  waitText?: string | string[];
  timeout?: number;
  status?: number;
}

interface TestCase {
  name: string;
  groups: ActionGroup[];
}

type ScenarioNode = Record<string, unknown>;
```

- [ ] **Step 2: Add runtime shape helpers**

Add helpers near `asArray()`:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionGroupList(value: unknown): value is ActionGroup[] {
  return Array.isArray(value) && value.every(isRecord);
}
```

- [ ] **Step 3: Add recursive flattening**

Add this function:

```ts
function flattenScenarioTests(node: unknown, path: string[] = []): TestCase[] {
  if (!isRecord(node)) {
    throw new Error(`Invalid test file: ${path.join(" > ") || "root"} must be an object`);
  }

  const cases: TestCase[] = [];
  for (const [name, value] of Object.entries(node)) {
    const nextPath = [...path, name];
    if (isActionGroupList(value)) {
      if (value.length === 0) {
        throw new Error(`Invalid test case ${nextPath.join(" > ")}: must contain at least one action group`);
      }
      cases.push({ name: nextPath.join(" > "), groups: value });
      continue;
    }
    if (isRecord(value)) {
      cases.push(...flattenScenarioTests(value, nextPath));
      continue;
    }
    throw new Error(`Invalid test node ${nextPath.join(" > ")}: expected object or action group list`);
  }
  return cases;
}
```

- [ ] **Step 4: Run the E2E test and verify it still fails later**

Run:

```sh
deno test --allow-all --no-check test/E2E.test.ts
```

Expected: FAIL until `runTests()` uses `flattenScenarioTests()` and action groups.

## Task 3: Execute Action Groups

**Files:**
- Modify: `src/test.ts`
- Test: `test/E2E.test.ts`

- [ ] **Step 1: Replace `runTestEntry()` with action-group execution**

Rename `runTestEntry()` to `runActionGroup()` and use `group.goto` for navigation:

```ts
async function runActionGroup(
  page: Page,
  baseUrl: string,
  label: string,
  group: ActionGroup,
): Promise<string | null> {
  const timeout = group.timeout ?? 5000;
  let response = null;

  if (group.goto) {
    const targetUrl = new URL(group.goto, baseUrl).href;
    response = await page.goto(targetUrl, { timeout, waitUntil: "load" });
  }

  if (group.status !== undefined && response?.status() !== group.status) {
    return `${label}: expected status ${group.status}, got ${response?.status()}`;
  }

  for (const entry of group.fill ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).fill(value);
  }

  for (const entry of group.select ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).selectOption(value);
  }

  for (const sel of asArray(group.click)) {
    await page.locator(sel).click();
  }

  for (const sel of asArray(group.wait)) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout });
    } catch {
      return `${label}: wait for "${sel}" timed out`;
    }
  }

  for (const text of asArray(group.waitText)) {
    try {
      await page.locator("body").filter({ hasText: text }).waitFor({ timeout });
    } catch {
      return `${label}: waitText "${text}" timed out`;
    }
  }

  if (group.url) {
    const expected = new URL(group.url, baseUrl).pathname;
    try {
      await page.waitForURL((url) => url.pathname === expected || url.pathname === expected.replace(/\/$/, ""), { timeout });
    } catch {
      const actual = new URL(page.url()).pathname;
      return `${label}: expected url ${expected}, got ${actual} (timed out)`;
    }
  }

  for (const text of asArray(group.text)) {
    try {
      await page.locator("body").filter({ hasText: text }).waitFor({ timeout });
    } catch {
      return `${label}: text "${text}" not found`;
    }
  }

  for (const sel of asArray(group.has)) {
    try {
      await page.locator(sel).first().waitFor({ state: "attached", timeout });
    } catch {
      return `${label}: expected "${sel}" to exist`;
    }
  }

  for (const sel of asArray(group.no)) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      return `${label}: expected "${sel}" not to exist, found ${count}`;
    }
  }

  return null;
}
```

- [ ] **Step 2: Add test-case execution**

Add:

```ts
async function runTestCase(page: Page, baseUrl: string, testCase: TestCase): Promise<string | null> {
  for (let i = 0; i < testCase.groups.length; i++) {
    const failure = await runActionGroup(page, baseUrl, `${testCase.name} [${i + 1}]`, testCase.groups[i]);
    if (failure) return failure;
  }
  return null;
}
```

- [ ] **Step 3: Update `runTests()` to use flattened cases**

Replace the old parse loop with:

```ts
const parsed = parse(await Deno.readTextFile(opts.testFile));
const testCases = flattenScenarioTests(parsed);
for (const testCase of testCases) {
  Deno.stdout.write(new TextEncoder().encode(`  ${testCase.name} ... `));

  const failure = await runTestCase(page, baseUrl, testCase);

  if (failure) {
    console.log("\x1b[31mFAILED\x1b[0m");
    console.log(`    ${opts.testFile}: ${failure}`);
    allPassed = false;
    break;
  } else {
    console.log("\x1b[32mok\x1b[0m");
  }
}
```

- [ ] **Step 4: Remove obsolete action keys**

Delete `check` and `uncheck` from types and execution code.

- [ ] **Step 5: Run E2E and verify pass**

Run:

```sh
deno test --allow-all --no-check test/E2E.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add src/test.ts test/pugpage.test.yaml test/E2E.test.ts
git commit -m "test: support scenario yaml action groups"
```

## Task 4: Cover Multi-Group Flow Explicitly

**Files:**
- Modify: `test/pugpage.test.yaml`
- Test: `test/E2E.test.ts`

- [ ] **Step 1: Add a multi-group test case**

Extend the `auth` scenario:

```yaml
  wrong then correct password:
    - goto: /login
      fill:
        - "input[name=password]": wrong
      click: "button[type=submit]"
      text: Invalid credentials
      has: p.error

    - fill:
        - "input[name=password]": demo
      click: "button[type=submit]"
      wait: a.logout
      url: /
      text: Logout
```

- [ ] **Step 2: Ensure test order does not depend on prior auth state**

Keep this case before `user > show user`, so the user route remains authenticated after successful login.

- [ ] **Step 3: Run E2E**

Run:

```sh
deno test --allow-all --no-check test/E2E.test.ts
```

Expected: PASS, proving omitted `goto` continues from the current page state.

- [ ] **Step 4: Commit**

```sh
git add test/pugpage.test.yaml
git commit -m "test: cover multi-group yaml flow"
```

## Task 5: Update End-User Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update README testing section**

Replace the old route-list example and action docs with scenario YAML:

```md
## Testing

Write a `*.test.yaml` file and run:

```sh
pugpage test ./pugpage.test.yaml
```

Example:

```yaml
auth:
  login successfully:
    - goto: /login
      fill:
        - "input[name=password]": demo
      click: "button[type=submit]"
      wait: a.logout
      url: /
      text: Logout

user:
  show user:
    - goto: /user/1000
      text: demo
      has: li
```

Top-level keys are scenarios. Nested keys are group or test case names. A test case is a list of one or more action groups. Action groups run in list order; if `goto` is omitted, the group continues from the current page.
```

- [ ] **Step 2: Document supported keys in README**

Add concise bullets:

```md
Action group keys run in fixed order: `goto`, `fill`, `select`, `click`, `wait`, `waitText`, then assertions.

- `goto` — route or absolute URL to visit.
- `fill` — ordered list of one-selector maps, for example `- .password: demo`.
- `select` — ordered list of one-selector maps.
- `click` — selector string or selector array.
- `wait` — selector string or selector array.
- `waitText` — text string or text array.
- `url` — expected final route.
- `status` — expected main document status after `goto`.
- `text` — text string or text array that must appear.
- `has` — CSS selector string or selector array that must exist.
- `no` — CSS selector string or selector array that must not exist.
- `timeout` — action group timeout in milliseconds.
```

- [ ] **Step 3: Update AGENTS declarative test runner notes**

Change the architecture note to:

```md
Declarative test runner (`src/test.ts`):
  - `pugpage test <test.yaml>` runs a single YAML test file.
  - YAML top-level keys are scenarios; nested maps are groups; list values are named test cases.
  - Each test case contains one or more action groups with actions (`goto`, `fill`, `select`, `click`, `wait`, `waitText`) and assertions (`text`, `has`, `no`, `url`, `status`).
  - Fail-fast: stops on first failure; exits `0` on pass, `1` on any failure.
  - `test/E2E.test.ts` is a thin wrapper that calls `runTests()` from `src/test.ts`.
```

- [ ] **Step 4: Run full tests**

Run:

```sh
deno test --allow-all --no-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add README.md AGENTS.md
git commit -m "docs: document scenario yaml tests"
```

## Task 6: Release Patch Version

**Files:**
- Inspect/modify only if required by existing release workflow: `release/render.min.js`
- Inspect: `git status`

- [ ] **Step 1: Confirm runtime artifact requirement**

Because this feature changes TypeScript CLI/test code and docs, not `src/render/render.js`, do not rebuild `release/render.min.js` unless `src/render/render.js` changed during implementation.

- [ ] **Step 2: Run final verification**

Run:

```sh
deno test --allow-all --no-check
```

Expected: PASS.

- [ ] **Step 3: Inspect worktree**

Run:

```sh
git status --short
```

Expected: only intended committed changes are present, or the worktree is clean after commits.

- [ ] **Step 4: Determine patch tag**

Run:

```sh
git tag --sort=v:refname
```

Choose the next patch version after the latest existing semver tag. For example, if latest is `1.4.0`, release `1.4.1`.

- [ ] **Step 5: Create release commit if needed**

If any intended changes remain uncommitted, commit them:

```sh
git add src/test.ts test/pugpage.test.yaml test/E2E.test.ts README.md AGENTS.md docs/superpowers/plans/2026-05-08-pugpage-test-yaml-scenarios-implementation.md
git commit -m "test: support scenario yaml tests"
```

- [ ] **Step 6: Tag the patch release**

Replace `1.4.1` with the chosen patch version:

```sh
git tag 1.4.1
```

- [ ] **Step 7: Push release**

Run:

```sh
git push origin master
git push origin 1.4.1
```

Expected: branch and tag push successfully.

## Self-Review Checklist

- The design requirement “top level key is scenario” is covered by `flattenScenarioTests()`.
- The design requirement “second level key is test case name” is supported, while deeper nesting is also supported.
- The design requirement “test cases can be nested” is covered by recursive group flattening.
- The design requirement “test case contains list of action groups” is covered by `TestCase.groups`.
- The removal of `check`/`uncheck` is covered in code and docs.
- README and AGENTS updates are included because this changes end-user behavior and workflow documentation.
- Patch release is included as the final task.
