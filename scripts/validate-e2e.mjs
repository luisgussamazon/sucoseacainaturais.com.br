import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const qa = createRequire(resolve(".setup/qa/package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(qa.resolve("embedded-postgres")).href
);
const { chromium } = qa("playwright");
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const root = process.cwd();
const password = randomBytes(24).toString("hex");
const pg = new EmbeddedPostgres({
  databaseDir: resolve(".setup", `postgres-${Date.now()}`),
  port: 55439,
  user: "amazonitos_qa",
  password,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let server, browser, db;
let failed = false;
const checks = [];
const check = (text) => {
  checks.push(text);
  console.log(`PASS ${text}`);
};
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://amazonitos_qa:${password}@127.0.0.1:55439/amazonitos_qa?schema=public`,
  PORT: "3147",
  HOSTNAME: "127.0.0.1",
  NEXT_TELEMETRY_DISABLED: "1",
};
async function login(page, email) {
  await page.goto("http://localhost:3147/login");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.waitForURL("http://localhost:3147/");
}
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("amazonitos_qa");
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(migration.status, 0, "Migração deve concluir");
  check("Migração PostgreSQL real aplicada");
  const bootstrap = spawnSync(
    process.execPath,
    ["scripts/bootstrap-admin.mjs"],
    {
      env: {
        ...env,
        SEED_ADMIN_EMAIL: "bootstrap@qa.invalid",
        SEED_ADMIN_PASSWORD: password,
      },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(bootstrap.status, 0);
  assert.ok(!bootstrap.stdout.includes(password));
  check("Administrador inicial criado sem expor credenciais");
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const admin = await db.user.create({
    data: {
      name: "Administrador QA",
      email: "admin@qa.invalid",
      role: "ADMIN",
      passwordHash,
    },
  });
  const employee = await db.user.create({
    data: {
      name: "Colaborador QA",
      email: "colaborador@qa.invalid",
      passwordHash,
    },
  });
  const p = await db.product.create({
    data: {
      name: "Suco integral QA",
      description: "Produto exclusivo do teste isolado",
      category: "Bebidas",
      price: 30,
      imageUrl:
        "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600",
    },
  });
  const early = await db.batch.create({
    data: {
      code: "QA-EARLY",
      productId: p.id,
      quantity: 1,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.batch.create({
    data: {
      code: "QA-LATE",
      productId: p.id,
      quantity: 3,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  await db.batch.create({
    data: {
      code: "QA-EXPIRED",
      productId: p.id,
      quantity: 20,
      expiresAt: new Date(Date.now() - 86400000),
    },
  });
  const m = await db.mission.create({
    data: {
      title: "Consumo consciente QA",
      description: "Campanha de teste",
      question: "Qual lote deve sair primeiro?",
      options: ["O que vence primeiro", "O maior", "O mais novo"],
      answer: 0,
      reward: 20,
      endsAt: new Date(Date.now() + 86400000),
    },
  });
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3147",
    ],
    { env, windowsHide: true, stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://localhost:3147/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.equal((await fetch("http://localhost:3147/api/health")).status, 200);
  check("Healthcheck valida banco e schema");
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
  });
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const a = await adminContext.newPage();
  await a.goto("http://localhost:3147/");
  await a.waitForURL("**/login");
  check("Rotas privadas exigem autenticação");
  await login(a, "admin@qa.invalid");
  check("Login seguro funciona");
  const cookie = (await adminContext.cookies()).find(
    (c) => c.name === "amazonitos_session",
  );
  assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax");
  check("Cookie HttpOnly, Secure e SameSite");
  await a.goto("http://localhost:3147/rh");
  const grant = a
    .locator("form")
    .filter({ has: a.locator("select[name=userId]") });
  await grant.locator("select[name=userId]").selectOption(employee.id);
  await grant.locator("[name=amount]").fill("100");
  await grant.locator("[name=description]").fill("Reconhecimento de teste QA");
  await grant.getByRole("button", { name: "Confirmar concessão" }).click();
  await a.waitForTimeout(500);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    100,
  );
  check("RH concede crédito com extrato e auditoria");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const e = await context.newPage();
  await login(e, "colaborador@qa.invalid");
  mkdirSync(".setup/screenshots", { recursive: true });
  await e
    .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", exact: true })
    .waitFor();
  await e.screenshot({
    path: ".setup/screenshots/dashboard-desktop.png",
    fullPage: true,
  });
  await e.goto("http://localhost:3147/rh");
  assert.equal(await e.locator("form select[name=userId]").count(), 0);
  check("Colaborador não acessa formulário RH");
  await e.goto("http://localhost:3147/loja");
  assert.ok(
    (await e.locator(".stock:visible").innerText()).includes("4 unidades"),
  );
  await e.getByRole("button", { name: "Resgatar", exact: true }).click();
  await e
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar resgate", exact: true })
    .click();
  await e.waitForURL(/resgates\?success=1/);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    70,
  );
  assert.equal(
    (await db.batch.findUniqueOrThrow({ where: { id: early.id } })).quantity,
    0,
  );
  const order = await db.order.findFirstOrThrow({
    where: { userId: employee.id },
    include: { allocations: true },
  });
  assert.equal(order.allocations[0].batchId, early.id);
  check("Resgate debita saldo e usa FEFO sem lotes vencidos");
  await e.goto("http://localhost:3147/missoes");
  await e.locator('input[name=answer][value="1"]:visible').check();
  await e.getByRole("button", { name: "Enviar resposta" }).click();
  await e.waitForURL("**/missoes?error=mission");
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    70,
  );
  check("Resposta incorreta não concede recompensa");
  await e.locator('input[name=answer][value="0"]:visible').check();
  await e.getByRole("button", { name: "Enviar resposta" }).click();
  await e.waitForURL("**/missoes?success=1");
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    90,
  );
  assert.equal(
    await db.completion.count({
      where: { userId: employee.id, missionId: m.id },
    }),
    1,
  );
  assert.equal(
    await e.getByRole("button", { name: "Enviar resposta" }).count(),
    0,
  );
  check("Quiz correto concede recompensa única");
  await a.goto("http://localhost:3147/entregas?order=" + order.id);
  await a
    .getByRole("complementary", { name: "Detalhes do pedido" })
    .getByRole("button", { name: "Cancelar pedido", exact: true })
    .click();
  await a
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar cancelamento", exact: true })
    .click();
  await a.getByRole("status").filter({ hasText: "Pedido cancelado" }).waitFor();
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    120,
  );
  assert.equal(
    (await db.batch.findUniqueOrThrow({ where: { id: early.id } })).quantity,
    1,
  );
  check("Cancelamento estorna saldo e estoque");
  await e.goto("http://localhost:3147/loja");
  await e.getByRole("button", { name: "Resgatar", exact: true }).click();
  await e.getByRole("dialog").getByLabel("Quantidade do resgate").waitFor();
  await e.waitForFunction(() =>
    Array.from(
      document.querySelectorAll('dialog[open] button[type="submit"]'),
    ).some((b) => b.getClientRects().length > 0 && !b.disabled),
  );
  await db.user.update({ where: { id: employee.id }, data: { balance: 0 } });
  await e
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar resgate", exact: true })
    .click();
  await e
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Saldo insuficiente" })
    .waitFor();
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    0,
  );
  assert.equal(
    await db.order.count({
      where: { userId: employee.id, status: "RESERVED" },
    }),
    0,
  );
  await db.user.update({ where: { id: employee.id }, data: { balance: 120 } });
  check("Servidor rejeita resgate sem saldo e faz rollback");
  await db.batch.updateMany({
    where: { productId: p.id, code: "QA-LATE" },
    data: { quantity: 0 },
  });
  const concurrent = await context.newPage();
  await Promise.all([
    e.goto("http://localhost:3147/loja"),
    concurrent.goto("http://localhost:3147/loja"),
  ]);
  await Promise.all([
    e.getByRole("button", { name: "Resgatar", exact: true }).click(),
    concurrent.getByRole("button", { name: "Resgatar", exact: true }).click(),
  ]);
  await Promise.all(
    [e, concurrent].map((p) =>
      p.waitForFunction(() =>
        Array.from(document.querySelectorAll("dialog[open] button")).some(
          (b) => b.textContent === "Confirmar resgate" && !b.disabled,
        ),
      ),
    ),
  );
  await Promise.all([
    e
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click(),
    concurrent
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click(),
  ]);
  await Promise.all(
    [e, concurrent].map((p) =>
      p.waitForFunction(
        () =>
          location.pathname === "/resgates" ||
          !!document.querySelector('dialog[open] [role="alert"]'),
      ),
    ),
  );
  assert.equal(
    await db.order.count({
      where: { userId: employee.id, status: "RESERVED" },
    }),
    1,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
    90,
  );
  assert.equal(
    (await db.batch.findUniqueOrThrow({ where: { id: early.id } })).quantity,
    0,
  );
  check("Resgates simultâneos não duplicam estoque nem débito");
  await concurrent.close();
  await db.batch.update({ where: { id: early.id }, data: { quantity: 1 } });
  await e.goto("http://localhost:3147/");
  await e.setViewportSize({ width: 390, height: 844 });
  await e
    .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", exact: true })
    .waitFor();
  await e.screenshot({
    path: ".setup/screenshots/dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await e.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  check("Dashboard mobile sem rolagem horizontal");
  await db.user.update({ where: { id: employee.id }, data: { balance: 0 } });
  await e.goto("http://localhost:3147/loja");
  assert.equal(
    await e.getByRole("button", { name: "Saldo insuficiente" }).count(),
    1,
  );
  check("Saldo insuficiente impede resgate na interface");
  let constraint = false;
  try {
    await db.batch.update({ where: { id: early.id }, data: { quantity: -1 } });
  } catch {
    constraint = true;
  }
  assert.ok(constraint);
  check("Banco rejeita estoque negativo");
  assert.ok(
    await db.audit.count({
      where: { action: "GRANT_COINS", actorId: admin.id },
    }),
  );
  check("Operações administrativas são auditadas");
  writeFileSync(
    ".setup/qa-results.json",
    JSON.stringify({ completedAt: new Date().toISOString(), checks }, null, 2),
  );
} catch (error) {
  failed = true;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (db) await db.$disconnect();
  await pg.stop().catch(() => {});
}

if (failed) process.exit(1);
