// Reuse the existing isolated PostgreSQL E2E suite, adding mobile/PWA checks without changing business tests.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const source = readFileSync("scripts/validate-e2e.mjs", "utf8").replace(/\r\n/g, "\n");
const marker = '  mkdirSync(".setup/screenshots", { recursive: true });';
const finalMarker = '  writeFileSync(\n    ".setup/qa-results.json",';
if (!source.includes(marker) || !source.includes(finalMarker))
  throw new Error(
    "A suíte E2E mudou: revise os pontos de integração mobile antes de continuar.",
  );
const helper = pathToFileURL(resolve("tests/mobile-browser-checks.mjs")).href;
const output =
  `import {runMobileChecks,runLogoutOfflineChecks} from ${JSON.stringify(helper)};\n` +
  source
    .replace(
      marker,
      marker +
        "\n  await runMobileChecks({page:e,adminPage:a,context,adminContext,check});",
    )
    .replace(
      finalMarker,
      "  await runLogoutOfflineChecks({page:e,context,check});\n" + finalMarker,
    );
mkdirSync(".setup", { recursive: true });
writeFileSync(".setup/runner-mobile-e2e.mjs", output);
const result = spawnSync(process.execPath, [".setup/runner-mobile-e2e.mjs"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(".setup/browsers") },
});
process.exit(result.status ?? 1);
