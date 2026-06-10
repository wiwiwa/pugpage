import { runTests } from "../src/test.ts";

Deno.test("End2End Test", async () => {
  await runTests({
    root: "test/pages",
    testFiles: ["test/pages/pugpage.test.yaml"],
  })
} );
