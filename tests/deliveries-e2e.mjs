import assert from "node:assert/strict";
import sharp from "sharp";
export async function runDeliveryChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    image = await sharp({
      create: { width: 180, height: 180, channels: 3, background: "#dfaf64" },
    })
      .webp()
      .toBuffer();
  const owner = await db.user.create({
    data: {
      name: "Colaborador entrega histórica QA",
      email: "entrega-historica@qa.invalid",
      passwordHash: admin.passwordHash,
      balance: 680,
    },
  });
  const hr = await db.user.create({
    data: {
      name: "RH entregas QA",
      email: "entregas-rh@qa.invalid",
      role: "HR",
      passwordHash: admin.passwordHash,
    },
  });
  const product = await db.product.create({
    data: {
      name: "Produto central entregas QA",
      description:
        "Histórico preservado e acompanhamento de entregas na base isolada.",
      category: "QA",
      price: 20,
      imageUrl: "data:image/webp;base64," + image.toString("base64"),
    },
  });
  const batch = await db.batch.create({
    data: {
      productId: product.id,
      code: "ENTREGAS-QA",
      quantity: 109,
      expiresAt: new Date(Date.now() + 90 * 86400000),
    },
  });
  await db.ledger.create({
    data: {
      userId: owner.id,
      amount: 1040,
      description: "Crédito para histórico QA",
    },
  });
  const fixtures = [];
  const now = Date.now();
  for (let i = 0; i < 27; i++) {
    const status = ["RESERVED", "COLLECTED", "CANCELLED"][i % 3];
    const o = await db.order.create({
      data: {
        userId: owner.id,
        productId: product.id,
        quantity: 1,
        cost: 20,
        status,
        createdAt: new Date(now - i * 86400000),
        allocations: { create: { batchId: batch.id, quantity: 1 } },
      },
    });
    fixtures.push(o);
    await db.ledger.create({
      data: {
        userId: owner.id,
        amount: -20,
        description: "Resgate histórico QA " + i,
      },
    });
    if (status === "CANCELLED")
      await db.ledger.create({
        data: {
          userId: owner.id,
          amount: 20,
          description: "Estorno histórico QA " + i,
        },
      });
  }
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [manager, staff, participant] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const rows = (p) =>
    p.locator('section[aria-label="Lista de pedidos"]:visible tbody tr');
  const details = (p) =>
    p.getByRole("complementary", { name: "Detalhes do pedido", exact: true });
  const snapshot = async () => ({
    balance: (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
      .balance,
    stock: (await db.batch.findUniqueOrThrow({ where: { id: batch.id } }))
      .quantity,
    ledger: await db.ledger.count({ where: { userId: owner.id } }),
    orders: await db.order.count({ where: { userId: owner.id } }),
  });
  const before = await snapshot();
  const history = JSON.stringify(
    await db.order.findMany({
      where: { userId: owner.id },
      orderBy: { id: "asc" },
    }),
  );
  async function visit(p, query = "") {
    await p.goto(base + "/entregas" + query);
    await p
      .getByRole("heading", { name: "Entrega de Produtos", exact: true })
      .waitFor();
  }
  try {
    await login(manager, admin.email);
    await login(staff, hr.email);
    await login(participant, owner.email);
    await manager.goto(base + "/admin");
    await manager
      .getByRole("heading", { name: "Administração", exact: true })
      .waitFor();
    assert.equal(
      await manager.getByRole("heading", { name: /Pedidos/ }).count(),
      0,
    );
    await manager
      .getByRole("heading", { name: "Usuários e permissões", exact: true })
      .waitFor();
    await manager.getByRole("heading", { name: /Auditoria/ }).waitFor();
    await visit(manager, "?q=" + encodeURIComponent(product.name));
    assert.equal(await rows(manager).count(), 20);
    assert.ok(
      (await rows(manager).first().innerText()).includes("Aguardando retirada"),
    );
    await rows(manager)
      .first()
      .locator("img")
      .evaluate((img) => img.decode());
    await manager
      .getByRole("navigation", { name: "Paginação de entregas" })
      .getByRole("link", { name: "Próxima", exact: true })
      .click();
    await manager.waitForURL(/page=2/);
    await rows(manager).first().waitFor();
    assert.equal(await rows(manager).count(), 7);
    await visit(
      manager,
      "?q=" + encodeURIComponent(owner.name) + "&status=COLLECTED",
    );
    assert.equal(await rows(manager).count(), 9);
    await visit(manager, "?q=" + fixtures[5].pickupCode);
    assert.equal(await rows(manager).count(), 1);
    await visit(
      manager,
      "?q=" + encodeURIComponent(product.name) + "&period=7",
    );
    assert.equal(await rows(manager).count(), 7);
    await visit(
      manager,
      "?q=" + encodeURIComponent(product.name) + "&sort=oldest",
    );
    assert.ok(
      (await rows(manager).first().innerText()).includes(fixtures[26].id),
    );
    await visit(
      manager,
      "?q=" + encodeURIComponent(product.name) + "&sort=newest",
    );
    assert.ok(
      (await rows(manager).first().innerText()).includes(fixtures[0].id),
    );
    await visit(manager, "?q=" + fixtures[0].id + "&page=999999");
    assert.equal(await rows(manager).count(), 1);
    assert.equal(
      JSON.stringify(
        await db.order.findMany({
          where: { userId: owner.id },
          orderBy: { id: "asc" },
        }),
      ),
      history,
    );
    assert.deepEqual(await snapshot(), before);
    check(
      "Administração preserva acessos/auditoria sem seção de pedidos; central consulta histórico completo, prioriza pendentes, busca, filtra, ordena e pagina sem modificar registros",
    );
    const actualStats = await Promise.all([
      db.order.count({ where: { status: "RESERVED" } }),
      db.order.count({ where: { status: "COLLECTED" } }),
      db.order.count({ where: { status: "CANCELLED" } }),
      db.order.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { cost: true },
      }),
    ]);
    await visit(staff, "?order=" + fixtures[0].id);
    await details(staff)
      .getByRole("heading", { name: product.name, exact: true })
      .waitFor();
    assert.deepEqual(
      await staff.locator("main:visible article strong").allTextContents(),
      [
        actualStats[0],
        actualStats[1],
        actualStats[2],
        actualStats[3]._sum.cost ?? 0,
      ].map((n) => n.toLocaleString("pt-BR")),
    );
    assert.equal(
      await details(staff)
        .getByRole("button", { name: "Cancelar pedido", exact: true })
        .count(),
      0,
    );
    await details(staff)
      .getByText("Lotes e validades", { exact: true })
      .click();
    await details(staff)
      .getByText(/Lote ENTREGAS-QA/)
      .waitFor();
    for (const width of [320, 375, 390, 430, 768, 1366, 1920]) {
      await staff.setViewportSize({ width, height: 1080 });
      assert.ok(
        await staff.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + width,
      );
      if ([390, 1920].includes(width)) {
        await staff.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await staff.screenshot({
          path: ".setup/screenshots/deliveries-" + width + ".png",
          fullPage: false,
        });
      }
    }
    await details(staff)
      .getByRole("button", { name: "Tela cheia", exact: true })
      .click();
    await staff
      .getByRole("dialog", { name: "Comprovante de retirada", exact: true })
      .getByText(fixtures[0].pickupCode, { exact: true })
      .waitFor();
    await staff
      .getByRole("button", { name: "Fechar comprovante", exact: true })
      .click();
    await details(staff)
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await staff
      .getByRole("dialog")
      .getByRole("heading", {
        name: "Você confirma que entregou este produto ao colaborador?",
        exact: true,
      })
      .waitFor();
    await staff
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: fixtures[0].id } }))
        .status,
      "RESERVED",
    );
    check(
      "RH acessa detalhes reais, lote, validade e comprovante; painel conferido em sete larguras e cancelar confirmação não altera pedido",
    );
    await participant.goto(base + "/resgates");
    const ownCard = participant
      .locator("article:visible")
      .filter({ hasText: fixtures[0].pickupCode });
    await ownCard.getByText("Aguardando retirada", { exact: true }).waitFor();
    await details(staff)
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await staff
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await staff
      .getByRole("status")
      .filter({ hasText: "Retirada confirmada" })
      .waitFor();
    const delivered = await db.order.findUniqueOrThrow({
      where: { id: fixtures[0].id },
    });
    assert.equal(delivered.status, "COLLECTED");
    assert.equal(delivered.collectedById, hr.id);
    assert.ok(delivered.collectedAt);
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      await db.audit.count({
        where: { details: delivered.id, action: "COLLECTED" },
      }),
      1,
    );
    await ownCard
      .getByText("Retirado", { exact: true })
      .waitFor({ timeout: 15000 });
    const again = await staff.request.post(base + "/api/redemptions", {
      headers: { origin: base },
      multipart: {
        action: "confirm",
        orderId: delivered.id,
        code: delivered.pickupCode,
        checked: "on",
      },
    });
    assert.equal(again.status(), 409);
    check(
      "Confirmar entrega registra responsável, horário e auditoria, atualiza colaborador e bloqueia repetição sem movimentar moedas ou estoque",
    );
    const hrCancel = await staff.request.post(base + "/api/deliveries", {
      headers: { origin: base },
      data: { action: "cancel", orderId: fixtures[3].id, checked: true },
    });
    assert.equal(hrCancel.status(), 403);
    await visit(manager, "?order=" + fixtures[3].id);
    await details(manager)
      .getByRole("button", { name: "Cancelar pedido", exact: true })
      .click();
    await manager
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar cancelamento", exact: true })
      .click();
    await manager
      .getByRole("status")
      .filter({ hasText: "Pedido cancelado" })
      .waitFor();
    assert.equal((await snapshot()).balance, before.balance + 20);
    assert.equal((await snapshot()).stock, before.stock + 1);
    const cancel = () =>
      manager.request.post(base + "/api/deliveries", {
        headers: { origin: base },
        data: { action: "cancel", orderId: fixtures[6].id, checked: true },
      });
    const responses = await Promise.all([cancel(), cancel()]);
    assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 409]);
    assert.equal((await snapshot()).balance, before.balance + 40);
    assert.equal((await snapshot()).stock, before.stock + 2);
    assert.equal(
      (
        await staff.request.post(base + "/api/redemptions", {
          headers: { origin: base },
          multipart: {
            action: "confirm",
            orderId: fixtures[3].id,
            code: fixtures[3].pickupCode,
            checked: "on",
          },
        })
      ).status(),
      409,
    );
    check(
      "Cancelamento continua exclusivo de ADMIN, estorna uma única vez mesmo em concorrência e bloqueia entrega de pedido cancelado",
    );
    const notice = await db.redemptionNotice.create({
      data: { userId: hr.id, orderId: fixtures[9].id },
    });
    await staff.goto(base + "/");
    await staff.getByRole("button", { name: /Notificações:/ }).click();
    await staff
      .getByRole("region", { name: "Central de notificações" })
      .getByRole("button", { name: /Ver pedido/ })
      .click();
    await staff.waitForURL(/entregas\?notification=/);
    await details(staff).getByText(fixtures[9].id, { exact: true }).waitFor();
    assert.ok(
      (
        await db.redemptionNotice.findUniqueOrThrow({
          where: { id: notice.id },
        })
      ).readAt,
    );
    await manager.goto(base + "/entregas?notification=" + notice.id);
    assert.equal(await details(manager).count(), 0);
    check(
      "Sino abre o pedido na nova central, mantém leitura individual e rejeita notificação de outro destinatário",
    );
    await participant.goto(base + "/entregas");
    assert.equal(
      await participant
        .getByRole("heading", { name: "Entrega de Produtos", exact: true })
        .count(),
      0,
    );
    assert.equal(
      (await participant.request.get(base + "/api/deliveries")).status(),
      403,
    );
    assert.equal(
      (
        await participant.request.post(base + "/api/deliveries", {
          headers: { origin: base },
          data: { action: "cancel", orderId: fixtures[12].id, checked: true },
        })
      ).status(),
      403,
    );
    const anon = await browser.newContext();
    try {
      assert.equal(
        (await anon.request.get(base + "/api/deliveries")).status(),
        401,
      );
      // More than 100 newer historical orders must not hide updates to an old pending order.
      await db.$transaction(
        async (tx) => {
          await tx.ledger.create({
            data: {
              userId: owner.id,
              amount: 2020,
              description: "Crédito histórico adicional QA",
            },
          });
          for (let i = 0; i < 101; i++) {
            const previous = await tx.order.create({
              data: {
                userId: owner.id,
                productId: product.id,
                quantity: 1,
                cost: 20,
                status: "COLLECTED",
                createdAt: new Date(now - 60000 - i),
                allocations: { create: { batchId: batch.id, quantity: 1 } },
              },
            });
            await tx.ledger.create({
              data: {
                userId: owner.id,
                amount: -20,
                description: "Resgate histórico adicional QA " + previous.id,
              },
            });
          }
          await tx.batch.update({
            where: { id: batch.id },
            data: { quantity: { decrement: 101 } },
          });
        },
        { timeout: 20000 },
      );
      await participant.goto(base + "/resgates?status=RESERVED");
      const oldCard = participant
        .locator("article:visible")
        .filter({ hasText: fixtures[24].pickupCode });
      await oldCard.getByText("Aguardando retirada", { exact: true }).waitFor();
      const beforeOld = await snapshot();
      const result = await staff.request.post(base + "/api/redemptions", {
        headers: { origin: base },
        multipart: {
          action: "confirm",
          orderId: fixtures[24].id,
          code: fixtures[24].pickupCode,
          checked: "on",
        },
      });
      assert.equal(result.status(), 200);
      await oldCard.waitFor({ state: "hidden", timeout: 15000 });
      assert.deepEqual(await snapshot(), beforeOld);
      check(
        "Entrega de pedido fora dos 100 mais recentes atualiza Meus resgates automaticamente sem alterar saldo, estoque ou histórico financeiro",
      );
    } finally {
      await anon.close();
    }
    assert.match(
      (await staff.request.get(base + "/api/deliveries")).headers()[
        "cache-control"
      ],
      /private, no-store/,
    );
    const csrf = await manager.request.post(base + "/api/deliveries", {
      headers: { origin: "https://invalid.example" },
      data: { action: "cancel", orderId: fixtures[12].id, checked: true },
    });
    assert.equal(csrf.status(), 403);
    check(
      "Página e API validam função/sessão no servidor, dados privados não entram no cache e origem inválida não executa operação",
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
}
