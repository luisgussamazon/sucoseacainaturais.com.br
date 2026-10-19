import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdirSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const qa = createRequire(resolve(".setup/qa/package.json")),
  { default: EmbeddedPostgres } = await import(
    pathToFileURL(qa.resolve("embedded-postgres")).href
  ),
  password = randomBytes(24).toString("hex"),
  folder = resolve(".setup", "upgrade-improvements-" + Date.now()),
  migration = "20261019190000_community_individual_access_and_interactions";
mkdirSync(folder, { recursive: true });
const old = spawnSync(
  "git",
  ["show", "0355b011bc96e9d4bbc6a6fd99ead219182f0c97:prisma/schema.prisma"],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(old.status, 0);
writeFileSync(folder + "/schema.prisma", old.stdout);
mkdirSync(folder + "/migrations", { recursive: true });
for (const name of readdirSync("prisma/migrations")) {
  if (name === migration) continue;
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
  }),
  url = `postgresql://upgrade_qa:${password}@127.0.0.1:55440/upgrade_qa?schema=public`,
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
        name: "Registro antigo QA",
        email: "upgrade@qa.invalid",
        passwordHash: "not-a-login",
        role: "HR",
        balance: 20,
      },
    }),
    m = await db.mission.create({
      data: {
        title: "Quiz anterior QA",
        description: "Conquista histórica",
        reward: 25,
        question: "Questão anterior",
        options: ["A", "B", "C"],
        answer: 0,
        endsAt: new Date(Date.now() + 86400000),
      },
    });
  await db.$executeRaw`INSERT INTO "Completion" (id,"userId","missionId","createdAt") VALUES ('old-completion',${u.id},${m.id},now())`;
  await db.$executeRaw`INSERT INTO "CommunityGrant" ("userId",publish,review,moderate,leadership,"assignedBy","updatedAt") VALUES (${u.id},true,true,false,false,${u.id},now())`;
  await db.$executeRaw`INSERT INTO "CommunityAlbum" (id,title,description,"eventDate",status,visibility,"authorId","createdAt") VALUES ('old-album','Álbum anterior','Fotos previamente autorizadas',now(),'PUBLISHED','INTERNAL',${u.id},now())`;
  await db.audit.create({
    data: { actorId: u.id, action: "COMMUNITY_ALBUM", details: "old-album" },
  });
  await db.$executeRaw`INSERT INTO "CommunityPost" (id,title,description,category,status,visibility,"publishedAt",pinned,"authorId","imageAuthorization","restrictedChecked","createdAt","updatedAt") VALUES ('old-private-post','Restrito anterior','Não expor automaticamente','Comunicados','PUBLISHED','MANAGEMENT',now(),false,${u.id},false,false,now(),now())`;
  await db.$executeRaw`INSERT INTO "CommunityComment" (id,"postId","userId",text,hidden,"createdAt") VALUES ('old-comment','old-private-post',${u.id},'Comentário antigo',false,now())`;
  await db.ledger.createMany({
    data: [
      { userId: u.id, amount: 25, description: "Crédito anterior" },
      { userId: u.id, amount: -5, description: "Resgate anterior" },
    ],
  });
  const p = await db.product.create({
      data: {
        name: "Produto anterior",
        description: "Registro anterior",
        category: "Teste",
        price: 5,
        imageUrl: "https://example.invalid/p.png",
      },
    }),
    b = await db.batch.create({
      data: {
        code: "OLD",
        productId: p.id,
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
  const before = await snapshot();
  migrate("prisma/schema.prisma");
  const after = await snapshot();
  assert.deepEqual(after, before);
  const g = await db.communityGrant.findUniqueOrThrow({
    where: { userId: u.id },
  });
  for (const k of ["photos", "albums", "events", "missions", "recognize"])
    assert.equal(g[k], false);
  assert.equal(await db.communityThread.count(), 0);
  console.log(
    "PASS migração incremental preserva integralmente dados antigos, permissões originais, conteúdo restrito, comentários, saldo, extrato, quiz, produto, estoque e resgate; nenhuma nova permissão concedida.",
  );
  async function snapshot() {
    const records = [];
    for (const [name, omit] of [
      ["User", []],
      ["Mission", []],
      ["Completion", ["recognitionConsent"]],
      ["Ledger", []],
      ["Product", []],
      ["Batch", []],
      ["Order", []],
      ["Allocation", []],
      [
        "CommunityGrant",
        ["photos", "albums", "events", "missions", "recognize"],
      ],
      [
        "CommunityAlbum",
        ["category", "imageAuthorization", "restrictedChecked"],
      ],
      ["CommunityPost", ["completionId", "recognitionIdentified"]],
      ["CommunityComment", ["requestId", "deletedAt"]],
      ["Audit", []],
    ]) {
      const rows = await db.$queryRawUnsafe(
        'SELECT to_jsonb(t) - $1::text[] AS row FROM "' +
          name +
          '" t ORDER BY 1::text',
        omit,
      );
      records.push(
        rows
          .map((r) => r.row)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      );
    }
    return records;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
  await pg.stop().catch(() => {});
}
