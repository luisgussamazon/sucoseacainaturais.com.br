import assert from "node:assert/strict";
import sharp from "sharp";
export async function runPurchaseChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    image = await sharp({
      create: { width: 200, height: 180, channels: 3, background: "#e3ae60" },
    })
      .webp()
      .toBuffer();
  const buyer = await db.user.create({
    data: {
      name: "Compra confirmada QA",
      email: "compra@qa.invalid",
      passwordHash: admin.passwordHash,
      balance: 500,
    },
  });
  const hr = await db.user.create({
    data: {
      name: "RH notificações QA",
      email: "notificacoes-rh@qa.invalid",
      role: "HR",
      passwordHash: admin.passwordHash,
    },
  });
  const inactive = await db.user.create({
    data: {
      name: "RH inativo QA",
      email: "inativo@qa.invalid",
      role: "HR",
      active: false,
      passwordHash: admin.passwordHash,
    },
  });
  const product = await db.product.create({
    data: {
      name: "Produto confirmação QA",
      description:
        "Produto na base isolada para confirmar compra e notificações.",
      category: "QA",
      price: 20,
      imageUrl: "data:image/webp;base64," + image.toString("base64"),
    },
  });
  const batch = await db.batch.create({
    data: {
      productId: product.id,
      code: "CONFIRMACAO-QA",
      quantity: 10,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  const ownerCtx = await browser.newContext(),
    hrCtx = await browser.newContext(),
    adminCtx = await browser.newContext();
  const page = await ownerCtx.newPage(),
    staff = await hrCtx.newPage(),
    manager = await adminCtx.newPage();
  const snapshot = async () => ({
    balance: (await db.user.findUniqueOrThrow({ where: { id: buyer.id } }))
      .balance,
    stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
      .quantity,
    orders: await db.order.count({ where: { userId: buyer.id } }),
    ledger: await db.ledger.count({ where: { userId: buyer.id } }),
    requests: await db.redemptionRequest.count({ where: { userId: buyer.id } }),
    notices: await db.redemptionNotice.count(),
  });
  const confirmation = () => page.getByRole("dialog");
  async function open() {
    await page.goto(base + "/loja?q=Produto+confirmação+QA");
    await page
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    await page
      .locator(".product-card:visible")
      .getByRole("button", { name: "Resgatar", exact: true })
      .click();
    await confirmation()
      .getByRole("heading", {
        name: "Deseja realmente confirmar este resgate?",
        exact: true,
      })
      .waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("dialog[open] button")).some(
        (b) => b.textContent === "Confirmar resgate" && !b.disabled,
      ),
    );
  }
  try {
    await login(page, buyer.email);
    await login(staff, hr.email);
    await login(manager, admin.email);
    assert.equal(
      await page.getByRole("button", { name: /Notificações:/ }).count(),
      0,
    );
    const before = await snapshot();
    await open();
    await confirmation()
      .getByAltText(product.name)
      .evaluate((img) => img.decode());
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const box = await confirmation().boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= width + 1,
        "panel bounds " + width + ": " + JSON.stringify(box),
      );
      if ([390, 1920].includes(width))
        await page.screenshot({
          path: ".setup/screenshots/purchase-confirmation-" + width + ".png",
          fullPage: true,
        });
    }
    await confirmation()
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    assert.deepEqual(await snapshot(), before);
    check(
      "Abrir e cancelar confirmação não altera saldo, estoque, pedidos ou notificações; modal conferido em seis larguras",
    );
    await open();
    await db.product.update({ where: { id: product.id }, data: { price: 25 } });
    await confirmation()
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click();
    await confirmation()
      .getByRole("alert")
      .filter({ hasText: "O preço mudou" })
      .waitFor();
    assert.deepEqual(await snapshot(), before);
    await db.product.update({ where: { id: product.id }, data: { price: 20 } });
    await open();
    await db.batch.update({ where: { id: batch.id }, data: { quantity: 0 } });
    await confirmation()
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click();
    await confirmation()
      .getByRole("alert")
      .filter({ hasText: "Estoque insuficiente" })
      .waitFor();
    assert.equal((await snapshot()).balance, before.balance);
    assert.equal((await snapshot()).orders, before.orders);
    assert.equal((await snapshot()).notices, before.notices);
    await db.batch.update({ where: { id: batch.id }, data: { quantity: 10 } });
    check(
      "Servidor revalida preço e estoque após abrir modal; falhas fazem rollback e não geram notificações",
    );
    await open();
    await confirmation()
      .getByLabel("Quantidade do resgate", { exact: true })
      .fill("2");
    await confirmation().getByText("460 Amazonitos", { exact: true }).waitFor();
    const requestPromise = page.waitForRequest(
      (r) => r.method() === "POST" && !!r.headers()["next-action"],
    );
    const clicked = confirmation()
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click();
    const req = await requestPromise;
    const replay = () =>
      page.request.post(req.url(), {
        headers: {
          "next-action": req.headers()["next-action"],
          "content-type": req.headers()["content-type"],
          origin: base,
        },
        data: req.postDataBuffer(),
        maxRedirects: 0,
      });
    const results = await Promise.all([replay(), replay()]);
    await clicked;
    await page.waitForURL((u) => u.pathname === "/resgates");
    assert.ok(results.every((r) => r.status() < 400));
    assert.equal(await db.order.count({ where: { userId: buyer.id } }), 1);
    assert.equal((await snapshot()).balance, 460);
    assert.equal((await snapshot()).stock, 8);
    assert.equal((await snapshot()).ledger, 1);
    assert.equal((await snapshot()).requests, 1);
    const order = await db.order.findFirstOrThrow({
      where: { userId: buyer.id },
    });
    const recipients = await db.user.findMany({
      where: { active: true, role: { in: ["HR", "ADMIN"] } },
      select: { id: true },
    });
    const notices = await db.redemptionNotice.findMany({
      where: { orderId: order.id },
    });
    assert.deepEqual(
      notices.map((n) => n.userId).sort(),
      recipients.map((r) => r.id).sort(),
    );
    assert.ok(notices.every((n) => !n.readAt));
    assert.equal(
      notices.some((n) =>
        [buyer.id, inactive.id, employee.id].includes(n.userId),
      ),
      false,
    );
    await page
      .getByRole("button", {
        name: "Ver comprovante deste resgate",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Apresentar ao RH", exact: true })
      .waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Fechar detalhes" })
      .click();
    check(
      "Confirmação com quantidade selecionada e reenvios simultâneos gera um pedido, um débito, uma reserva e uma notificação por RH/ADMIN ativo",
    );
    await staff
      .getByRole("button", { name: "Notificações: 1 não lidas", exact: true })
      .waitFor({ timeout: 15000 });
    await staff.getByRole("button", { name: /Notificações:/ }).click();
    const center = staff.getByRole("region", {
      name: "Central de notificações",
      exact: true,
    });
    await center
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    await center.getByText(buyer.name, { exact: true }).waitFor();
    await center.getByAltText(product.name).evaluate((img) => img.decode());
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await staff.setViewportSize({ width, height: 1080 });
      assert.ok(
        await staff.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "notification overflow " + width,
      );
      const box = await center.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      if ([390, 1920].includes(width))
        await staff.screenshot({
          path: ".setup/screenshots/notifications-" + width + ".png",
          fullPage: true,
        });
    }
    const notice = notices.find((n) => n.userId === hr.id),
      adminNotice = notices.find((n) => n.userId === admin.id);
    const privateList = await page.request.get(
      base + "/api/notifications?userId=" + hr.id,
    );
    assert.equal(privateList.status(), 403);
    const foreign = await manager.request.post(base + "/api/notifications", {
      headers: { origin: base },
      data: { id: notice.id },
    });
    assert.equal(foreign.status(), 404);
    const ownList = await staff.request.get(base + "/api/notifications");
    assert.match(ownList.headers()["cache-control"], /private, no-store/);
    assert.ok(!(await ownList.text()).includes(adminNotice.id));
    await center
      .getByRole("button", { name: "Ver pedido", exact: false })
      .click();
    await staff.waitForURL(/notification=/);
    await staff
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    assert.equal(new URL(staff.url()).searchParams.has("code"), false);
    assert.ok(
      (
        await db.redemptionNotice.findUniqueOrThrow({
          where: { id: notice.id },
        })
      ).readAt,
    );
    assert.equal(
      (
        await db.redemptionNotice.findUniqueOrThrow({
          where: { id: adminNotice.id },
        })
      ).readAt,
      null,
    );
    const finance = await snapshot();
    await staff.getByRole("checkbox").check();
    await staff
      .getByRole("button", { name: "Confirmar retirada", exact: true })
      .click();
    await staff
      .getByRole("status")
      .filter({ hasText: "Retirada confirmada" })
      .waitFor();
    assert.deepEqual(await snapshot(), finance);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .collectedById,
      hr.id,
    );
    const again = await staff.request.post(base + "/api/redemptions", {
      headers: { origin: base },
      multipart: {
        action: "confirm",
        orderId: order.id,
        code: order.pickupCode,
        checked: "on",
      },
    });
    assert.equal(again.status(), 409);
    await manager.goto(base + "/resgates/conferir?notification=" + notice.id);
    assert.equal(
      await manager
        .getByRole("heading", { name: product.name, exact: true })
        .count(),
      0,
    );
    check(
      "Sino atualiza sem recarregar, leitura é individual e Ver pedido abre conferência autorizada; retirada única não movimenta moedas ou estoque",
    );
    const anon = await browser.newContext();
    try {
      assert.equal(
        (await anon.request.get(base + "/api/notifications")).status(),
        401,
      );
      assert.equal(
        (
          await anon.request.get(
            base + "/api/purchase-quote?productId=" + product.id,
          )
        ).status(),
        401,
      );
    } finally {
      await anon.close();
    }
    const csrf = await staff.request.post(base + "/api/notifications", {
      headers: { origin: "https://invalid.example" },
      data: { id: notice.id },
    });
    assert.equal(csrf.status(), 403);
    await db.user.update({ where: { id: hr.id }, data: { role: "EMPLOYEE" } });
    assert.equal(
      (await staff.request.get(base + "/api/notifications")).status(),
      403,
    );
    check(
      "Sessão, função atual, destinatário e origem protegem notificações e dados de colaboradores",
    );
  } finally {
    await Promise.all([ownerCtx.close(), hrCtx.close(), adminCtx.close()]);
  }
}
