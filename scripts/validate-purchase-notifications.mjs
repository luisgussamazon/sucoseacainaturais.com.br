import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runPurchaseChecks} from "../tests/purchase-notifications-e2e.mjs";\nimport {runRedemptionChecks} from "../tests/redemptions-e2e.mjs";\n' +
  source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runPurchaseChecks({db,browser,admin,employee,login,check});\n  await runRedemptionChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
if (!source.includes("await runPurchaseChecks"))
  throw Error("Missing purchase tests");
writeFileSync(".setup/runner-purchase-notifications.mjs", source);
const result = spawnSync(
  process.execPath,
  [".setup/runner-purchase-notifications.mjs"],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
process.exitCode = result.status ?? 1;
