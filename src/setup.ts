const REPO = "wiwiwa/pugpage";

function getWrapperPath(command: string): string {
  if (command === "update") {
    const self = Deno.env.get("PUGPAGE_SELF");
    if (self) return self;
  }
  return "./pugpage";
}

async function getLatestVersion(): Promise<string> {
  const resp = await fetch(`https://api.github.com/repos/${REPO}/tags`);
  if (!resp.ok) throw new Error(`Failed to fetch latest version: ${resp.status}`);
  const tags: Array<{ name: string }> = await resp.json();
  if (!tags.length) throw new Error("No tags found in repository");
  return tags[0].name;
}

export async function installOrUpdate(command: "install" | "update") {
  const latest = await getLatestVersion();
  const wrapperPath = getWrapperPath(command);

  if (command === "update") {
    const content = await Deno.readTextFile(wrapperPath);
    const match = content.match(/VERSION="([^"]+)"/);
    const current = match ? match[1] : null;
    if (current === latest) {
      console.log(`Already up to date (v${current})`);
      return;
    }
    if (current) {
      console.log(`Current: v${current} → Latest: v${latest}`);
    }
  }

  if (Deno.stdin.isTerminal()) {
    const confirmed = confirm(`Install pugpage v${latest} to ${wrapperPath}?`);
    if (!confirmed) {
      console.log("Cancelled.");
      return;
    }
  } else {
    console.log(`Installing pugpage v${latest} to ${wrapperPath}...`);
  }

  const url = `https://raw.githubusercontent.com/${REPO}/${latest}/pugpage.sh`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status}`);
  const content = await resp.text();

  await Deno.writeTextFile(wrapperPath, content);
  await Deno.chmod(wrapperPath, 0o755);
  console.log(`Installed pugpage v${latest} to ${wrapperPath}`);
}
