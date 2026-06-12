Deno.test("CLI --version prints version without error", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "src/main.ts", "--version"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, success } = await cmd.output();
  const out = new TextDecoder().decode(stdout).trim();
  const err = new TextDecoder().decode(stderr).trim();
  if (!success) throw new Error(`CLI failed. stderr: ${err}`);
  if (!out.startsWith("PugPage v")) throw new Error(`Expected "PugPage v...", got: ${out}`);
});
