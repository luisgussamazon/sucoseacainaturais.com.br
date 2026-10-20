import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".setup", { recursive: true });
let s = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
s = s.replace(
  '  authMethod: "scram-sha-256",',
  '  authMethod: "scram-sha-256",\n  initdbFlags:["--encoding=UTF8","--locale=C"],',
);
s = s.replace(
  '  assert.equal(\n    await e.getByRole("button", { name: "Saldo insuficiente" }).count(),',
  '  await e.getByRole("button", { name: "Saldo insuficiente" }).waitFor();\n  assert.equal(\n    await e.getByRole("button", { name: "Saldo insuficiente" }).count(),',
);
s = 'import {runProfileChecks} from "../tests/profile-photo-e2e.mjs";\n' + s;
const hook = '  writeFileSync(\n    ".setup/qa-results.json",';
if (!s.includes(hook)) throw Error("Test hook missing");
s = s.replace(
  hook,
  "  await runProfileChecks({db,browser,admin,employee,login,check});\n" + hook,
);
writeFileSync(".setup/runner-profile.mjs", s);
const r = spawnSync(process.execPath, [".setup/runner-profile.mjs"], {
  stdio: "inherit",
  windowsHide: true,
  env: process.env,
});
process.exitCode = r.status ?? 1;
