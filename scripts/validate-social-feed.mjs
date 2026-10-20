import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
let s = readFileSync("scripts/validate-e2e.mjs", "utf8").replaceAll(
  "\r\n",
  "\n",
);
s = s.replace(
  '  authMethod: "scram-sha-256",',
  '  authMethod: "scram-sha-256",\n  initdbFlags: ["--encoding=UTF8", "--locale=C"],',
);
s = s.replace(
  '  assert.equal(\n    await e.getByRole("button", { name: "Saldo insuficiente" }).count(),',
  '  await e.getByRole("button", { name: "Saldo insuficiente" }).waitFor();\n  assert.equal(\n    await e.getByRole("button", { name: "Saldo insuficiente" }).count(),',
);
s =
  'import {runMuralSocialChecks} from "../tests/mural-social-e2e.mjs";\nimport {runCommunityChecks} from "../tests/community-e2e.mjs";\nimport {runImprovementChecks} from "../tests/community-improvements-e2e.mjs";\nimport {runFeedChecks} from "../tests/social-feed-e2e.mjs";\n' +
  s;
const hook = '  writeFileSync(\n    ".setup/qa-results.json",';
if (!s.includes(hook)) throw Error("Missing test hook");
s = s.replace(
  hook,
  "  await runCommunityChecks({db,browser,admin,employee,login,check});\n  await runImprovementChecks({db,browser,admin,employee,login,check});\n  await runFeedChecks({db,browser,admin,employee,login,check});\n  await runMuralSocialChecks({db,browser,admin,login,check});\n" +
    hook,
);
writeFileSync(".setup/runner-social-feed.mjs", s);
const r = spawnSync(process.execPath, [".setup/runner-social-feed.mjs"], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
process.exitCode = r.status ?? 1;
