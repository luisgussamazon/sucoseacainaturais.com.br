import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const qa = createRequire(resolve(".setup/qa/package.json"));
const base = "http://localhost:3147";
const widths = [320, 375, 390, 430, 768];
async function ready(page, path) {
  await page.goto(base + path);
  await page.locator(".workspace main h1:visible").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function fits(page, label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `Sem rolagem horizontal: ${label}`,
  );
}
async function desktopDiff(page, name) {
  const before = `.setup/screenshots/mobile-before-${name}.png`;
  const after = `.setup/screenshots/mobile-after-${name}.png`;
  await page.screenshot({ path: after, fullPage: true });
  if (!existsSync(before)) {
    console.log("SKIP comparação de pixels: captura anterior indisponível");
    return;
  }
  const a = await sharp(before)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(after)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(a.info.width, b.info.width);
  assert.equal(a.info.height, b.info.height);
  const masks = await page
    .locator(".product-image:visible")
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height };
      }),
    );
  let changed = 0,
    compared = 0;
  for (let y = 0; y < a.info.height; y++) {
    for (let x = 0; x < a.info.width; x++) {
      if (
        masks.some(
          (r) =>
            x >= r.x - 2 &&
            x <= r.x + r.w + 2 &&
            y >= r.y - 2 &&
            y <= r.y + r.h + 2,
        )
      )
        continue;
      compared++;
      const i = (y * a.info.width + x) * 4;
      if ([0, 1, 2].some((c) => Math.abs(a.data[i + c] - b.data[i + c]) > 8))
        changed++;
    }
  }
  const ratio = changed / compared;
  console.log(
    `Desktop ${name}: ${(ratio * 100).toFixed(5)}% de pixels diferentes fora de fotos remotas`,
  );
  assert.ok(ratio < 0.001, `Desktop ${name} preservado`);
}
export async function runMobileChecks({
  page,
  adminPage,
  context,
  adminContext,
  check,
}) {
  await context.route("https://images.unsplash.com/**", (route) =>
    route.fulfill({
      path: "public/product-placeholder.svg",
      contentType: "image/svg+xml",
    }),
  );
  for (const [name, width, height] of [
    ["fullhd", 1920, 1080],
    ["notebook", 1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await ready(page, "/");
    await page.locator(".hero-scene:visible").evaluate((img) => img.decode());
    assert.equal(
      await page.locator(".mobile-bottom-nav:visible").isVisible(),
      false,
    );
    assert.equal(
      await page.locator(".mobile-menu-toggle:visible").isVisible(),
      false,
    );
    await desktopDiff(page, name);
    check(`Desktop aprovado preservado: ${name}`);
  }
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await adminPage.setViewportSize({ width, height: 844 });
    await ready(page, "/");
    const bottom = page.getByRole("navigation", { name: "Navegação inferior" });
    assert.ok(await bottom.isVisible());
    assert.equal(await bottom.getByRole("link").count(), 5);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const drawer = page.getByRole("dialog");
    assert.ok(await drawer.isVisible());
    assert.equal(await drawer.locator('a[href="/admin"]').count(), 0);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".workspace")).some(
        (el) => el.checkVisibility() && el.inert,
      ),
    );
    assert.equal(
      await page.locator(".workspace:visible").evaluate((el) => el.inert),
      true,
    );
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(
      await page.locator(".workspace:visible").evaluate((el) => el.inert),
      false,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Abrir menu" })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await bottom.getByRole("link", { name: "Loja", exact: true }).click();
    await page.waitForURL("**/loja");
    assert.equal(
      await bottom.locator('[aria-current="page"]').innerText(),
      "Loja",
    );
    await bottom.getByRole("link", { name: "Perfil", exact: true }).click();
    await page.waitForURL("**/perfil");
    for (const path of [
      "/",
      "/loja",
      "/carteira",
      "/missoes",
      "/resgates",
      "/perfil",
    ]) {
      await ready(page, path);
      await fits(page, `${width}px ${path}`);
      if (path === "/") {
        await page
          .locator(".hero-scene:visible")
          .evaluate((img) => img.decode());
        assert.equal(await page.locator(".stat-card:visible").count(), 4);
        const columns = await page
          .locator(".stats-grid:visible")
          .evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
          );
        assert.equal(columns, 2);
        await page.screenshot({
          path: `.setup/screenshots/mobile-${width}.png`,
          fullPage: true,
        });
      }
      if (path === "/carteira" && width === 390)
        await page.screenshot({
          path: ".setup/screenshots/mobile-wallet-390.png",
          fullPage: true,
        });
    }
    for (const path of ["/rh", "/relatorios", "/estoque", "/admin"]) {
      await ready(adminPage, path);
      await fits(adminPage, `${width}px admin ${path}`);
    }
    await adminPage.getByRole("button", { name: "Abrir menu" }).click();
    const adminDrawer = adminPage.getByRole("dialog");
    for (const path of [
      "/rh",
      "/relatorios",
      "/estoque",
      "/admin",
      "/resgates",
    ])
      assert.ok(await adminDrawer.locator(`a[href="${path}"]`).isVisible());
    await adminDrawer.locator('a[href="/estoque"]').click();
    await adminPage.waitForURL("**/estoque");
    assert.equal(await adminPage.getByRole("dialog").count(), 0);
    if (width === 390) {
      await ready(adminPage, "/admin");
      await adminPage.screenshot({
        path: ".setup/screenshots/mobile-admin-390.png",
        fullPage: true,
      });
    }
    check(
      `Mobile ${width}px: seis telas, quatro painéis, menu, permissões e barra inferior`,
    );
  }
  await ready(page, "/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifestResponse = await page.request.get(
    base + "/manifest.webmanifest",
  );
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.icons.length, 3);
  for (const icon of manifest.icons) {
    const response = await page.request.get(base + icon.src);
    assert.equal(response.status(), 200);
  }
  assert.ok(await page.locator('link[rel="apple-touch-icon"]').count());
  const swResponse = await page.request.get(base + "/sw.js");
  assert.ok(swResponse.headers()["cache-control"].includes("no-store"));
  check("Manifest, ícones Android/iPhone e service worker disponíveis");
  const { chromium } = qa("playwright");
  const installContext = await chromium.launchPersistentContext(
    resolve(".setup", `pwa-install-${Date.now()}`),
    {
      channel: "chrome",
      headless: true,
      viewport: { width: 390, height: 844 },
    },
  );
  try {
    await installContext.addCookies(await context.cookies());
    const installPage = await installContext.newPage();
    await ready(installPage, "/");
    await installPage.waitForFunction(
      () => !!navigator.serviceWorker.controller,
    );
    const cdp = await installContext.newCDPSession(installPage);
    const installability = await cdp.send("Page.getInstallabilityErrors");
    assert.deepEqual(installability.installabilityErrors, []);
    await cdp.detach();
  } finally {
    await installContext.close();
  }
  check("Chromium em perfil normal confirma critérios de instalação da PWA");
  const cacheEntries = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("amazonitos-public-")) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        result.push(new URL(request.url).pathname);
      }
    }
    return result;
  });
  assert.equal(cacheEntries.length, 6);
  assert.ok(
    cacheEntries.every(
      (p) =>
        p === "/offline.html" || p === "/brand.svg" || p.startsWith("/icons/"),
    ),
  );
  check("Cache real do navegador contém somente os seis recursos públicos");
  const beforeSession = (await context.cookies()).find(
    (c) => c.name === "amazonitos_session",
  );
  await context.setOffline(true);
  try {
    await page.goto(base + "/carteira");
    await page
      .getByRole("heading", { name: "Vamos nos reconectar?" })
      .waitFor();
    const html = await page.content();
    assert.ok(!html.includes("Colaborador QA"));
    assert.ok(!html.includes("Reconhecimento de teste QA"));
    assert.equal(await page.locator(".mobile-bottom-nav:visible").count(), 0);
    const apiOffline = await page.evaluate(() =>
      fetch("/api/health")
        .then(() => true)
        .catch(() => false),
    );
    assert.equal(apiOffline, false);
    await page.screenshot({
      path: ".setup/screenshots/mobile-offline.png",
      fullPage: true,
    });
  } finally {
    await context.setOffline(false);
  }
  await ready(page, "/carteira");
  assert.equal(
    (await context.cookies()).find((c) => c.name === "amazonitos_session")
      ?.value,
    beforeSession?.value,
  );
  check("Offline genérico sem dados privados; reconexão preserva a sessão");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: async () => {
        window.__pwaPromptCalled = true;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Instalar aplicativo" }).click();
  assert.equal(await page.evaluate(() => window.__pwaPromptCalled), true);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await page.getByText("Você está usando o aplicativo instalado.").waitFor();
  await page.keyboard.press("Escape");
  check("Botão de instalação respeita interação e estado de app instalado");
  const { webkit, devices } = qa("playwright");
  const safari = await webkit.launch({ headless: true });
  try {
    const ios = await safari.newContext({ ...devices["iPhone 13"] });
    const iosPage = await ios.newPage();
    for (const width of widths) {
      await iosPage.setViewportSize({ width, height: 844 });
      await iosPage.goto(base + "/login");
      await iosPage.locator(".login-form:visible").waitFor();
      await fits(iosPage, `WebKit iPhone ${width}px`);
    }
    await iosPage.setViewportSize({ width: 390, height: 844 });
    await iosPage.getByRole("button", { name: "Instalar aplicativo" }).click();
    await iosPage.locator(".install-help").waitFor();
    assert.ok(
      (await iosPage.locator(".install-help").innerText()).includes(
        "Compartilhar",
      ),
    );
    await iosPage.screenshot({
      path: ".setup/screenshots/mobile-ios-login.png",
      fullPage: true,
    });
    await ios.close();
  } finally {
    await safari.close();
  }
  check("WebKit: login em cinco larguras e instruções de instalação iPhone");
  const { devices: androidDevices } = qa("playwright");
  const android = await context
    .browser()
    .newContext({ ...androidDevices["Pixel 7"] });
  try {
    await android.addCookies(await context.cookies());
    const androidPage = await android.newPage();
    await ready(androidPage, "/");
    await fits(androidPage, "Android Pixel 7");
    assert.ok(
      await androidPage
        .getByRole("navigation", { name: "Navegação inferior" })
        .isVisible(),
    );
    await androidPage.getByRole("button", { name: "Abrir menu" }).tap();
    await androidPage.getByRole("dialog").waitFor();
    await androidPage.getByRole("dialog").locator('a[href="/loja"]').tap();
    await androidPage.waitForURL("**/loja");
  } finally {
    await android.close();
  }
  check("Android emulado: navegação por toque e sessão preservada");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await ready(page, "/");
  await ready(adminPage, "/rh");
}
export async function runLogoutOfflineChecks({ page, context, check }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.waitForURL("**/login");
  assert.equal(
    (await context.cookies()).find((c) => c.name === "amazonitos_session"),
    undefined,
  );
  await context.setOffline(true);
  try {
    await page.goto(base + "/carteira");
    await page
      .getByRole("heading", { name: "Vamos nos reconectar?" })
      .waitFor();
    assert.ok(!(await page.content()).includes("Colaborador QA"));
  } finally {
    await context.setOffline(false);
  }
  await page.goto(base + "/carteira");
  await page.waitForURL("**/login");
  check("Logout remove sessão e não permite rever carteira pelo cache offline");
}
