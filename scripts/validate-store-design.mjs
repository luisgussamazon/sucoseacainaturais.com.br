import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runProductPhotoChecks} from "../tests/product-photo-e2e.mjs";\nimport {runStoreDesignChecks} from "../tests/store-design-e2e.mjs";\n' +
  source;
source = source
  .replace(
    '  writeFileSync(\n    ".setup/qa-results.json",',
    '  await runProductPhotoChecks({db,browser,admin,employee,login,check});\n  await runStoreDesignChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
  )
  .replaceAll('locator("tr")', 'locator("tr:visible")');
if (!source.includes("await runStoreDesignChecks"))
  throw new Error("Test hook missing");
writeFileSync(".setup/runner-store-design.mjs", source);
const result = spawnSync(process.execPath, [".setup/runner-store-design.mjs"], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
