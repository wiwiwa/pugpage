import { exists } from "jsr:@std/fs/exists";
import { ensureDir } from "jsr:@std/fs/ensure-dir";

const samplePug = `
h1 Hello, PugPage!
`;

const gitignore = `
.*
pugpage
dist/
`
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
    "tests"
  ];

  for (const dir of dirs)
    if (!(await exists(dir))) {
      await ensureDir(dir);
      console.log(`Created directory: ${dir}`);
    }

  // Create sample files
  await writeFile("index.pug", samplePug);
  await writeFile(".gitignore", gitignore);

  console.log("Project files created.");
}

async function writeFile(path: string, content: string) {
  if(await exists(path))
    return console.log(`Skipping creation of ${path} as it already exists.`);
  await Deno.writeTextFile(path, content);
  console.log(`Created file: ${path}`);
}
