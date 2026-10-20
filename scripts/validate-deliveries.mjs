import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runDeliveryChecks} from "../tests/deliveries-e2e.mjs";\nimport {runPurchaseChecks} from "../tests/purchase-notifications-e2e.mjs";\n' +
  source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runPurchaseChecks({db,browser,admin,employee,login,check});\n  await runDeliveryChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
if (!source.includes("await runDeliveryChecks"))
  throw Error("Missing test hook");
writeFileSync(".setup/runner-deliveries.mjs", source);
const result = spawnSync(process.execPath, [".setup/runner-deliveries.mjs"], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
