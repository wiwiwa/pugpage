import { runTests } from "../src/test.ts";

Deno.test("End2End Test", async () => {
  await runTests({
    root: "test/pages",
    testFile: "test/pugpage.test.yaml",
  })
} );
