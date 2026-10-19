import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync } from "node:fs";
export async function runRedemptionChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const base = "http://localhost:3147";
  await checkMigration(db);
  check(
    "Migração aditiva preserva pedidos antigos, saldos, estoque e lançamentos e gera comprovantes únicos sem inventar retiradas",
  );
  const image = await sharp({
    create: { width: 240, height: 200, channels: 3, background: "#e5b565" },
  })
    .webp()
    .toBuffer();
  const product = await db.product.create({
    data: {
      name: "Produto retirada QA",
      description:
        "Produto real da base isolada para validar retirada e publicação.",
      category: "QA",
      price: 30,
      imageUrl: "data:image/webp;base64," + image.toString("base64"),
    },
  });
  const batch = await db.batch.create({
    data: {
      productId: product.id,
      code: "RETIRADA-QA",
      expiresAt: new Date(Date.now() + 86400000 * 30),
      quantity: 10,
    },
  });
  const owner = await db.user.create({
    data: {
      name: "Titular da conquista QA",
      email: "resgates@qa.invalid",
      passwordHash: admin.passwordHash,
      balance: 400,
    },
  });
  const hr = await db.user.create({
    data: {
      name: "RH retirada QA",
      email: "retirada-rh@qa.invalid",
      passwordHash: admin.passwordHash,
      role: "HR",
    },
  });
  const ctx = await browser.newContext(),
    hrctx = await browser.newContext(),
    adminctx = await browser.newContext(),
    otherctx = await browser.newContext();
  const page = await ctx.newPage(),
    staff = await hrctx.newPage(),
    moderator = await adminctx.newPage(),
    other = await otherctx.newPage();
  async function api(page, action, values = {}) {
    return page.evaluate(
      async ({ action, values }) => {
        const f = new FormData();
        f.set("action", action);
        for (const [k, v] of Object.entries(values)) f.set(k, String(v));
        const r = await fetch("/api/redemptions", { method: "POST", body: f });
        return {
          status: r.status,
          body: await r.json(),
          cache: r.headers.get("cache-control"),
        };
      },
      { action, values },
    );
  }
  async function share(
    page,
    id,
    {
      bad = false,
      consent = true,
      caption = "Minha conquista com participação e dedicação!",
    } = {},
  ) {
    return page.evaluate(
      async ({ id, photo, bad, consent, caption }) => {
        const f = new FormData();
        f.set("action", "share");
        f.set("orderId", id);
        f.set("caption", caption);
        if (consent) {
          f.set("imageAuthorization", "on");
          f.set("restrictedChecked", "on");
        }
        const bytes = bad
          ? new TextEncoder().encode("imagem falsa")
          : Uint8Array.from(atob(photo), (c) => c.charCodeAt(0));
        f.set("photos", new File([bytes], "foto.webp", { type: "image/webp" }));
        const r = await fetch("/api/redemptions", { method: "POST", body: f });
        return { status: r.status, body: await r.json() };
      },
      { id, photo: image.toString("base64"), bad, consent, caption },
    );
  }
  async function buy() {
    await page.goto(base + "/loja?q=Produto+retirada+QA");
    await page
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    await page
      .locator(".product-card:visible")
      .getByRole("button", { name: "Resgatar", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click();
    await page.waitForURL((u) => u.pathname === "/resgates");
    await page
      .getByRole("heading", { name: "Meus resgates", exact: true })
      .waitFor();
    return db.order.findFirstOrThrow({
      where: { userId: owner.id, productId: product.id, status: "RESERVED" },
      orderBy: { createdAt: "desc" },
    });
  }
  try {
    await login(page, owner.email);
    await login(staff, hr.email);
    await login(moderator, admin.email);
    await login(other, employee.email);
    const order = await buy();
    assert.match(order.pickupCode, /^[a-f0-9-]{36}$/);
    assert.notEqual(order.pickupCode, order.id);
    const card = page.locator("article:visible").filter({
      has: page.getByRole("heading", { name: product.name, exact: true }),
    });
    await card.locator("img").evaluate((img) => img.decode());
    assert.equal(
      await card.locator("img").getAttribute("src"),
      "/api/products/" +
        product.id +
        "/image?v=" +
        (await import("node:crypto"))
          .createHash("sha256")
          .update(product.imageUrl)
          .digest("hex")
          .slice(0, 16),
    );
    await card.getByRole("button", { name: /Ver detalhes/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText("30 Amazonitos", { exact: true }).first().waitFor();
    await dialog.getByText("Lotes e validades", { exact: true }).click();
    await dialog.getByText(/Lote RETIRADA-QA/).waitFor();
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + width,
      );
      if ([390, 1920].includes(width))
        await page.screenshot({
          path: ".setup/screenshots/redemptions-details-" + width + ".png",
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog
      .getByRole("button", { name: "Apresentar ao RH", exact: true })
      .click();
    await dialog
      .getByRole("heading", { name: "Apresentar ao RH", exact: true })
      .waitFor();
    await dialog.getByText(owner.name, { exact: true }).waitFor();
    assert.ok((await dialog.innerText()).includes(order.pickupCode));
    await page.screenshot({
      path: ".setup/screenshots/redemptions-receipt.png",
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Fechar detalhes" }).click();
    check(
      "Foto cadastrada, detalhes, lote, validade e comprovante real funcionam; seis larguras sem overflow",
    );
    assert.equal(
      (await api(page, "lookup", { code: order.pickupCode })).status,
      403,
    );
    assert.equal(
      (
        await api(page, "confirm", {
          code: order.pickupCode,
          orderId: order.id,
          checked: "on",
        })
      ).status,
      403,
    );
    assert.equal((await share(page, order.id)).status, 403);
    assert.equal((await share(other, order.id)).status, 403);
    await page.goto(base + "/resgates/conferir");
    assert.equal(new URL(page.url()).pathname, "/resgates/conferir");
    assert.equal(
      await page
        .getByRole("button", { name: "Conferir comprovante", exact: true })
        .count(),
      0,
    );
    await page.goto(base + "/resgates");
    await page
      .getByRole("heading", { name: "Meus resgates", exact: true })
      .waitFor();
    check(
      "Colaborador não confirma retirada nem publica pedido reservado ou de outro usuário",
    );
    await staff.goto(base + "/resgates/conferir");
    await staff
      .locator("main:visible")
      .getByLabel("Código de retirada", { exact: true })
      .fill(order.pickupCode);
    await staff
      .getByRole("button", { name: "Conferir comprovante", exact: true })
      .click();
    await staff
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    const before = {
      balance: (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .balance,
      stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
        .quantity,
      ledger: await db.ledger.count(),
    };
    await staff.getByRole("checkbox").check();
    await staff
      .getByRole("button", { name: "Confirmar retirada", exact: true })
      .click();
    await staff
      .getByRole("status")
      .filter({ hasText: "Retirada confirmada" })
      .waitFor();
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(saved.status, "COLLECTED");
    assert.equal(saved.collectedById, hr.id);
    assert.equal(saved.collectedByName, hr.name);
    assert.ok(saved.collectedAt);
    assert.equal(
      (
        await api(staff, "confirm", {
          code: order.pickupCode,
          orderId: order.id,
          checked: "on",
        })
      ).status,
      409,
    );
    assert.deepEqual(
      {
        balance: (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
          .balance,
        stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
          .quantity,
        ledger: await db.ledger.count(),
      },
      before,
    );
    await page
      .locator("article:visible")
      .filter({
        has: page.getByRole("heading", { name: product.name, exact: true }),
      })
      .getByText("Retirado", { exact: true })
      .waitFor({ timeout: 15000 });
    check(
      "RH confirma uma única vez, registra responsável e horário e atualiza colaborador sem débito ou baixa adicional",
    );
    assert.equal((await share(page, order.id, { bad: true })).status, 400);
    assert.equal((await share(page, order.id, { consent: false })).status, 400);
    assert.equal(
      (
        await share(page, order.id, {
          caption: "Comprovante " + order.pickupCode,
        })
      ).status,
      400,
    );
    await page
      .locator("article:visible")
      .filter({
        has: page.getByRole("heading", { name: product.name, exact: true }),
      })
      .getByRole("button", { name: /Ver detalhes/ })
      .click();
    await dialog
      .getByRole("button", {
        name: "Compartilhar minha conquista",
        exact: true,
      })
      .click();
    await dialog
      .getByLabel("Fotografia da conquista", { exact: true })
      .setInputFiles({
        name: "conquista.webp",
        mimeType: "image/webp",
        buffer: image,
      });
    await dialog
      .getByAltText("Pré-visualização da fotografia")
      .evaluate((img) => img.decode());
    await dialog
      .getByLabel("Legenda", { exact: true })
      .fill("Muito feliz com minha conquista!");
    await dialog.getByRole("checkbox").nth(0).check();
    await dialog.getByRole("checkbox").nth(1).check();
    await dialog
      .getByRole("button", { name: "Publicar no Mural SSD VBJ2", exact: true })
      .click();
    await dialog
      .getByRole("status")
      .filter({ hasText: "Conquista publicada" })
      .waitFor();
    const shared = await db.redemptionShare.findUniqueOrThrow({
      where: { orderId: order.id },
      include: { post: { include: { media: true } } },
    });
    assert.equal(shared.post.status, "PUBLISHED");
    assert.equal(shared.post.authorId, owner.id);
    assert.equal(shared.post.media.length, 1);
    assert.ok(shared.post.media[0].bytes.length > 0);
    assert.ok(!shared.post.description.includes(order.pickupCode));
    assert.ok(!shared.post.description.includes(order.id));
    assert.equal(
      await db.communityGrant.findUnique({ where: { userId: owner.id } }),
      null,
    );
    const duplicate = await Promise.all([
      share(page, order.id),
      share(page, order.id),
    ]);
    assert.ok(duplicate.every((r) => r.status === 200));
    assert.equal(
      await db.redemptionShare.count({ where: { orderId: order.id } }),
      1,
    );
    await other.goto(base + "/mural?post=" + shared.postId);
    await other
      .getByRole("heading", {
        name: "Mais uma conquista no SSD VBJ2!",
        exact: true,
      })
      .waitFor();
    await other
      .locator(".community-post:visible img")
      .first()
      .evaluate((img) => img.decode());
    assert.ok(
      !(await other.locator("main:visible").innerText()).includes(
        order.pickupCode,
      ),
    );
    assert.equal(
      (await api(other, "remove-share", { postId: shared.postId })).status,
      403,
    );
    assert.equal(
      (await api(other, "moderate-share", { postId: shared.postId })).status,
      403,
    );
    assert.equal(
      (
        await api(other, "report-share", {
          postId: shared.postId,
          reason: "Revisar autorização da fotografia enviada",
        })
      ).status,
      200,
    );
    await moderator.goto(base + "/resgates/conferir");
    await moderator
      .getByText("Revisar autorização da fotografia enviada", { exact: true })
      .waitFor();
    assert.equal(
      (await api(moderator, "moderate-share", { postId: shared.postId }))
        .status,
      200,
    );
    const privateMedia = await other.request.get(
      base + "/api/community/media/" + shared.post.media[0].id,
    );
    assert.equal(privateMedia.status(), 404);
    check(
      "Upload com prévia publica imediatamente no mural existente, sem dados do comprovante ou permissão administrativa; reenvio, denúncia e moderação são seguros",
    );
    assert.equal(
      (await api(page, "remove-share", { postId: shared.postId })).status,
      200,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
      "COLLECTED",
    );
    assert.equal((await share(other, order.id)).status, 403);
    const cancelled = await buy();
    const refundBefore = (
      await db.user.findUniqueOrThrow({ where: { id: owner.id } })
    ).balance;
    const cancellation = await Promise.all([
      api(page, "cancel", { orderId: cancelled.id }),
      api(page, "cancel", { orderId: cancelled.id }),
    ]);
    assert.equal(cancellation.filter((r) => r.status === 200).length, 1);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).balance,
      refundBefore + 30,
    );
    assert.equal(
      (await db.batch.findUniqueOrThrow({ where: { id: batch.id } })).quantity,
      9,
    );
    assert.equal(
      (
        await api(staff, "confirm", {
          code: cancelled.pickupCode,
          orderId: cancelled.id,
          checked: "on",
        })
      ).status,
      409,
    );
    assert.equal((await share(page, cancelled.id)).status, 403);
    check(
      "Cancelamento concorrente estorna uma só vez; pedido cancelado não pode ser retirado ou compartilhado; remoção mantém histórico",
    );
    const concurrent = await buy();
    const preserved = {
      stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
        .quantity,
      balance: (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .balance,
      ledger: await db.ledger.count(),
    };
    const confirmed = await Promise.all([
      api(moderator, "confirm", {
        code: concurrent.pickupCode,
        orderId: concurrent.id,
        checked: "on",
      }),
      api(moderator, "confirm", {
        code: concurrent.pickupCode,
        orderId: concurrent.id,
        checked: "on",
      }),
    ]);
    assert.equal(confirmed.filter((r) => r.status === 200).length, 1);
    assert.deepEqual(
      {
        stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
          .quantity,
        balance: (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
          .balance,
        ledger: await db.ledger.count(),
      },
      preserved,
    );
    const simultaneous = await Promise.all([
      share(page, concurrent.id),
      share(page, concurrent.id),
    ]);
    assert.ok(simultaneous.every((r) => r.status === 200));
    assert.equal(
      await db.redemptionShare.count({ where: { orderId: concurrent.id } }),
      1,
    );
    const owned = await db.redemptionShare.findUniqueOrThrow({
      where: { orderId: concurrent.id },
    });
    assert.equal(
      (await api(page, "remove-share", { postId: owned.postId })).status,
      200,
    );
    assert.equal(
      (
        await db.communityPost.findUniqueOrThrow({
          where: { id: owned.postId },
        })
      ).status,
      "ARCHIVED",
    );
    check(
      "Confirmação e primeira publicação concorrentes são únicas; autor exclui publicação ativa sem excluir pedido",
    );
    await buy();
    await page.goto(base + "/resgates?status=RESERVED");
    await page
      .locator("article:visible")
      .filter({
        has: page.getByRole("heading", { name: product.name, exact: true }),
      })
      .getByRole("button", { name: /Ver detalhes/ })
      .click();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar resgate", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Nenhum resgate encontrado", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    check(
      "Cancelamento na lista filtrada fecha os detalhes sem deixar modal vazio ou bloquear a navegação",
    );
    await db.pickupAttempt.upsert({
      where: { actorId: hr.id },
      create: { actorId: hr.id, attempts: 30 },
      update: { attempts: 30, windowStart: new Date() },
    });
    assert.equal(
      (await api(staff, "lookup", { code: order.pickupCode })).status,
      429,
    );
    const anonymous = await browser.newContext();
    try {
      assert.equal(
        (await anonymous.request.get(base + "/api/redemptions")).status(),
        401,
      );
    } finally {
      await anonymous.close();
    }
    const csrf = await page.request.post(base + "/api/redemptions", {
      headers: { origin: "https://invalid.example" },
      multipart: { action: "cancel", orderId: order.id },
    });
    assert.equal(csrf.status(), 403);
    const response = await page.request.get(base + "/api/redemptions");
    assert.match(response.headers()["cache-control"], /private, no-store/);
    assert.ok(!(await response.text()).includes(order.pickupCode));
    check(
      "Comprovantes protegidos por sessão, função RH, limite de tentativas, origem e respostas privadas sem cache",
    );
  } finally {
    await Promise.all([
      ctx.close(),
      hrctx.close(),
      adminctx.close(),
      otherctx.close(),
    ]);
  }
}

async function checkMigration(db) {
  const [{ name }] = await db.$queryRawUnsafe(
    "SELECT current_database() AS name",
  );
  assert.equal(name, "amazonitos_qa");
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("CREATE SCHEMA redemption_migration_qa");
      await tx.$executeRawUnsafe(
        "SET LOCAL search_path TO redemption_migration_qa",
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Order" ("id" TEXT PRIMARY KEY, "userId" TEXT, "productId" TEXT, "quantity" INTEGER, "cost" INTEGER, "status" TEXT, "createdAt" TIMESTAMP)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "CommunityPost" ("id" TEXT PRIMARY KEY)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Ledger" ("id" TEXT PRIMARY KEY, "amount" INTEGER)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "balance" INTEGER)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Batch" ("id" TEXT PRIMARY KEY, "quantity" INTEGER)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Order" VALUES ('old-reserved','owner','product',2,40,'RESERVED',CURRENT_TIMESTAMP),('old-collected','owner','product',1,20,'COLLECTED',CURRENT_TIMESTAMP),('old-cancelled','owner','product',1,20,'CANCELLED',CURRENT_TIMESTAMP)`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Ledger" VALUES ('credit',100),('out',-40),('refund',20)`,
      );
      await tx.$executeRawUnsafe(`INSERT INTO "User" VALUES ('owner',80)`);
      await tx.$executeRawUnsafe(`INSERT INTO "Batch" VALUES ('batch',7)`);
      const snapshot = async () => ({
        orders: await tx.$queryRawUnsafe(
          'SELECT "id","userId","productId","quantity","cost","status","createdAt" FROM "Order" ORDER BY "id"',
        ),
        ledger: await tx.$queryRawUnsafe(
          'SELECT * FROM "Ledger" ORDER BY "id"',
        ),
        users: await tx.$queryRawUnsafe('SELECT * FROM "User"'),
        batches: await tx.$queryRawUnsafe('SELECT * FROM "Batch"'),
      });
      const before = await snapshot();
      const sql = readFileSync(
        "prisma/migrations/20261020010000_redemption_receipts_and_shares/migration.sql",
        "utf8",
      ).replace(/^\uFEFF/, "");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.$executeRawUnsafe(statement);
      assert.deepEqual(await snapshot(), before);
      const receipts = await tx.$queryRawUnsafe(
        'SELECT "pickupCode","collectedAt","collectedById","cancelledAt" FROM "Order"',
      );
      assert.equal(new Set(receipts.map((r) => r.pickupCode)).size, 3);
      for (const r of receipts) {
        assert.match(r.pickupCode, /^[a-f0-9-]{36}$/);
        assert.equal(r.collectedAt, null);
        assert.equal(r.collectedById, null);
        assert.equal(r.cancelledAt, null);
      }
    },
    { timeout: 20000 },
  );
}
