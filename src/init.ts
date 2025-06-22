import { exists } from "jsr:@std/fs/exists";
import { ensureDir } from "jsr:@std/fs/ensure-dir";

export async function initProject() {
  const confirmed = confirm("This will initialize a new PugPage project in the current directory. Continue?");
  if (!confirmed) {
      console.log("Initialization cancelled.");
      return;
  }
  console.log("Initializing new PugPage project...");

  // Define recommended structure
  const dirs = [
    "public",
    "src",
    "tests"
  ];

  for (const dir of dirs)
    if (!(await exists(dir))) {
      await ensureDir(dir);
      console.log(`Created directory: ${dir}`);
    }

  // Create sample files
  await Deno.writeTextFile("src/index.pug", samplePug);

  console.log("Project files created.");
}

function samplePug() {
  return `doctype html
html
  head
    title PugPage Sample
  body
    h1 Hello, PugPage!
`;
}
