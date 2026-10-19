import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runProductPhotoChecks} from "../tests/product-photo-e2e.mjs";\n' +
  source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runProductPhotoChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
if (!source.includes("await runProductPhotoChecks"))
  throw new Error("Product photo test hook missing");
writeFileSync(".setup/runner-product-photo.mjs", source);
const result = spawnSync(
  process.execPath,
  [".setup/runner-product-photo.mjs"],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
process.exitCode = result.status ?? 1;
