import { join, basename, resolve } from "@std/path";
import { exists, ensureDir } from "@std/fs";

export async function initProject(targetDir: string) {
  const projectRoot = Deno.cwd();
  const absTargetDir = resolve(targetDir);
  const projectName = basename(projectRoot) || "pugpage-app";

  const isRoot = absTargetDir === projectRoot;
  const rootFlag = isRoot ? "" : ` --root ${targetDir}`;

  const relDenoJson = "deno.json";
  const relIndex = join(targetDir, "index.pug");
  const relLayout = join(targetDir, "layout.pug");
  const relTest = join(targetDir, `${projectName}.test.yaml`);

  console.log(`
Initializing PugPage project...
Planned actions:
  - Ensure directory exists: ${targetDir}
  - Generate/update tasks: ${relDenoJson}
  - Generate (if missing): ${relIndex}
  - Generate (if missing): ${relLayout}
  - Generate (if missing): ${relTest}
`);

  if (Deno.stdin.isTerminal()) {
    if (!confirm("Proceed? ")) {
      console.log("Cancelled.");
      return;
    }
  }

  await ensureDir(absTargetDir);

  // 1. deno.json (Always in project root)
  const denoJsonPath = join(projectRoot, "deno.json");
  let denoJson: any = {};
  let denoJsonStr = "";
  if (await exists(denoJsonPath)) {
    try {
      denoJsonStr = await Deno.readTextFile(denoJsonPath);
      denoJson = JSON.parse(denoJsonStr);
    } catch (e) {
      console.error(`
[Error] Failed to parse existing deno.json. It might contain comments (JSONC), which this script cannot currently merge automatically.
Please manually add these tasks to your deno.json:

  "dev": "deno x jsr:@wiwiwa/pugpage dev${rootFlag}"
  "dist": "deno x jsr:@wiwiwa/pugpage dist${rootFlag}"
  "test": "deno x jsr:@wiwiwa/pugpage test${rootFlag} *.test.yaml"
`);
      return;
    }
  }
  
  denoJson.tasks = denoJson.tasks || {};
  let updatedDenoJson = false;
  
  if (!denoJson.tasks.dev) {
    denoJson.tasks.dev = `deno x jsr:@wiwiwa/pugpage dev${rootFlag}`;
    updatedDenoJson = true;
  }
  if (!denoJson.tasks.dist) {
    denoJson.tasks.dist = `deno x jsr:@wiwiwa/pugpage dist${rootFlag}`;
    updatedDenoJson = true;
  }
  if (!denoJson.tasks.test) {
    denoJson.tasks.test = `deno x jsr:@wiwiwa/pugpage test${rootFlag}`;
    updatedDenoJson = true;
  }

  if (updatedDenoJson) {
    await Deno.writeTextFile(denoJsonPath, JSON.stringify(denoJson, null, 2) + "\n");
    console.log("  [+] Updated deno.json with PugPage tasks.");
  } else {
    console.log("  [-] deno.json already has PugPage tasks. Skipped.");
  }

  // 2. index.pug
  const indexPugPath = join(absTargetDir, "index.pug");
  if (!(await exists(indexPugPath))) {
    const indexContent = `h1 Welcome to PugPage\np This project was scaffolded securely with deno x.\n`;
    await Deno.writeTextFile(indexPugPath, indexContent);
    console.log("  [+] Created index.pug");
  } else {
    console.log("  [-] index.pug already exists. Skipped.");
  }

  // 3. layout.pug
  const layoutPugPath = join(absTargetDir, "layout.pug");
  if (!(await exists(layoutPugPath))) {
    const layoutContent = `doctype html\nhtml\n  head\n    meta(charset="utf-8")\n    meta(name="viewport" content="width=device-width, initial-scale=1")\n    title PugPage App\n    style.\n      body { font-family: system-ui, sans-serif; padding: 2rem; }\n  body\n    slot\n`;
    await Deno.writeTextFile(layoutPugPath, layoutContent);
    console.log("  [+] Created layout.pug");
  } else {
    console.log("  [-] layout.pug already exists. Skipped.");
  }

  // 4. Test file
  const testFilePath = join(absTargetDir, `${projectName}.test.yaml`);
  if (!(await exists(testFilePath))) {
    const testContent = `index:\n  render successfully:\n    - goto: /\n      has:\n        h1: Welcome to PugPage\n`;
    await Deno.writeTextFile(testFilePath, testContent);
    console.log(`  [+] Created ${projectName}.test.yaml`);
  } else {
    console.log(`  [-] ${projectName}.test.yaml already exists. Skipped.`);
  }

  console.log(`\nDone! Run \`deno task dev\` to start your server.\n`);
}
