import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let source = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
source =
  'import {runCommunityChecks} from "../tests/community-e2e.mjs";\n' + source;
source = source.replace(
  '  writeFileSync(\n    ".setup/qa-results.json",',
  '  await runCommunityChecks({db,browser,admin,employee,login,check});\n  writeFileSync(\n    ".setup/qa-results.json",',
);
source = source
  .replaceAll(
    'locator("input[name=quantity]")',
    'locator(".product-card:visible input[name=quantity]")',
  )
  .replaceAll('locator(".stock")', 'locator(".stock:visible")')
  .replaceAll(
    "locator('input[name=answer][value=\"1\"]')",
    "locator('input[name=answer][value=\"1\"]:visible')",
  )
  .replaceAll(
    "locator('input[name=answer][value=\"0\"]')",
    "locator('input[name=answer][value=\"0\"]:visible')",
  );
if (!source.includes("await runCommunityChecks({"))
  throw new Error("Community test hook not installed");
writeFileSync(".setup/runner-community-e2e.mjs", source);
const result = spawnSync(
  process.execPath,
  [".setup/runner-community-e2e.mjs"],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
process.exitCode = result.status ?? 1;
