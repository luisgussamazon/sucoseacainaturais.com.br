import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runRedemptionChecks} from "../tests/redemptions-e2e.mjs";\n' +
  source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runRedemptionChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
if (!source.includes("await runRedemptionChecks"))
  throw new Error("Redemption test hook missing");
source = source.replaceAll('locator("tr")', 'locator("tr:visible")');
writeFileSync(".setup/runner-redemptions.mjs", source);
const result = spawnSync(process.execPath, [".setup/runner-redemptions.mjs"], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
