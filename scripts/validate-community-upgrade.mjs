import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdirSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const qa = createRequire(resolve(".setup/qa/package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(qa.resolve("embedded-postgres")).href
);
const password = randomBytes(24).toString("hex"),
  folder = resolve(".setup", "upgrade-" + Date.now());
mkdirSync(folder, { recursive: true });
const baseline = spawnSync(
  "git",
  ["show", "bf571fca32bb05a6389e4c14ef97e57fc77b18a8:prisma/schema.prisma"],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(
  baseline.status,
  0,
  "Full repository history required for upgrade validation",
);
writeFileSync(folder + "/schema.prisma", baseline.stdout);
mkdirSync(folder + "/migrations", { recursive: true });
for (const name of readdirSync("prisma/migrations")) {
  if (name === "20261019150000_community_photo_missions") continue;
  if (name.endsWith(".toml"))
    copyFileSync("prisma/migrations/" + name, folder + "/migrations/" + name);
  else {
    mkdirSync(folder + "/migrations/" + name, { recursive: true });
    copyFileSync(
      "prisma/migrations/" + name + "/migration.sql",
      folder + "/migrations/" + name + "/migration.sql",
    );
  }
}
const pg = new EmbeddedPostgres({
  databaseDir: folder + "/data",
  port: 55440,
  user: "upgrade_qa",
  password,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const url = `postgresql://upgrade_qa:${password}@127.0.0.1:55440/upgrade_qa?schema=public`,
  env = { ...process.env, DATABASE_URL: url };
let db;
function migrate(schema) {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      schema,
    ],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(r.status, 0, "Migration must succeed");
}
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("upgrade_qa");
  migrate(folder + "/schema.prisma");
  db = new PrismaClient({ datasources: { db: { url } } });
  const u = await db.user.create({
    data: {
      name: "Registro existente QA",
      email: "existing@qa.invalid",
      passwordHash: "not-a-login",
      balance: 20,
    },
  });
  const m = await db.mission.create({
    data: {
      title: "Quiz anterior",
      description: "Registro anterior à migração",
      reward: 25,
      question: "Questão anterior",
      options: ["A", "B", "C"],
      answer: 0,
      endsAt: new Date(Date.now() + 86400000),
    },
  });
  await db.completion.create({ data: { userId: u.id, missionId: m.id } });
  await db.ledger.createMany({
    data: [
      { userId: u.id, amount: 25, description: "Crédito anterior" },
      { userId: u.id, amount: -5, description: "Resgate anterior" },
    ],
  });
  const p = await db.product.create({
      data: {
        name: "Produto anterior",
        description: "Registro de teste de upgrade",
        price: 5,
        category: "Teste",
        imageUrl: "https://example.invalid/product.png",
      },
    }),
    b = await db.batch.create({
      data: {
        productId: p.id,
        code: "EXISTING",
        quantity: 4,
        expiresAt: new Date(Date.now() + 86400000),
      },
    }),
    o = await db.order.create({
      data: { userId: u.id, productId: p.id, quantity: 1, cost: 5 },
    });
  await db.allocation.create({
    data: { orderId: o.id, batchId: b.id, quantity: 1 },
  });
  const models = [
    "user",
    "mission",
    "completion",
    "ledger",
    "product",
    "batch",
    "order",
    "allocation",
  ];
  const before = await Promise.all(
    models.map((k) => db[k].findMany({ orderBy: { id: "asc" } })),
  );
  migrate("prisma/schema.prisma");
  const after = await Promise.all(
    models.map((k) => db[k].findMany({ orderBy: { id: "asc" } })),
  );
  assert.deepEqual(after, before);
  assert.equal(await db.communityGrant.count(), 0);
  assert.equal(await db.photoEvidence.count(), 0);
  console.log(
    "PASS upgrade incremental preserva integralmente usuários, saldo, extrato, quiz, conclusão, produto, lote, pedido e alocação; nenhuma permissão concedida.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
  await pg.stop().catch(() => {});
}
