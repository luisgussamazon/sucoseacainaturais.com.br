import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runWalletChecks} from "../tests/wallet-design-e2e.mjs";\n' + source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runWalletChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
if (!source.includes("await runWalletChecks"))
  throw new Error("Wallet test hook missing");
writeFileSync(".setup/runner-wallet-validation.mjs", source);
const result = spawnSync(
  process.execPath,
  [".setup/runner-wallet-validation.mjs"],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
process.exitCode = result.status ?? 1;
