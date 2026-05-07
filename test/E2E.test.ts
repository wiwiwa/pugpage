import { runTests } from "../src/test.ts";

Deno.test("End2End Test", async () => {
  const passed = await runTests({
    root: "test/pages",
    testFile: "test/pugpage.test.yaml",
  });
  if (!passed) throw new Error("Tests failed");
});
