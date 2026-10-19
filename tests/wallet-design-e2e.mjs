import assert from "node:assert/strict";
export async function runWalletChecks({
  db,
  browser,
  admin: sourceAdmin,
  employee,
  login,
  check,
}) {
  const admin = await db.user.create({
    data: {
      name: "Carteira QA",
      email: "carteira@qa.invalid",
      passwordHash: sourceAdmin.passwordHash,
      role: "EMPLOYEE",
      balance: 115,
    },
  });
  const now = Date.now();
  for (let i = 0; i < 43; i++)
    await db.ledger.create({
      data: {
        userId: admin.id,
        amount: i % 2 === 0 ? 10 : -5,
        description:
          i === 42
            ? "Crédito antigo do histórico completo"
            : "Movimentação carteira " +
              i +
              " — " +
              (i === 0
                ? "Reconhecimento por participação e conquistas da equipe ".repeat(
                    12,
                  )
                : "Atividade registrada"),
        createdAt: new Date(now - (i === 42 ? 120 * 86400000 : i * 3600000)),
      },
    });
  await db.ledger.create({
    data: {
      userId: employee.id,
      amount: 999,
      description: "PRIVADO-OUTRO-USUARIO",
    },
  });
  await db.user.update({ where: { id: admin.id }, data: { balance: 115 } });
  const before = JSON.stringify(
    await db.ledger.findMany({ orderBy: { id: "asc" } }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, admin.email);
    const visit = async (query = "") => {
      await page.goto("http://localhost:3147/carteira" + query);
      await page
        .getByRole("heading", { name: "Minha carteira", exact: true })
        .waitFor();
    };
    const rows = () => page.locator("table:visible tbody tr");
    await visit();
    const cards = page.locator("article:visible");
    assert.equal(await cards.count(), 3);
    assert.match(await cards.nth(0).innerText(), /115/);
    assert.match(await cards.nth(1).innerText(), /220/);
    assert.match(await cards.nth(2).innerText(), /\+10 Amazonitos/);
    assert.equal(await rows().count(), 20);
    assert.equal(await page.getByText("PRIVADO-OUTRO-USUARIO").count(), 0);
    assert.ok(!(await page.locator("main:visible").innerText()).includes("Débito"));
    check(
      "Carteira exibe saldo, créditos acumulados e última movimentação reais, com Crédito / Saída e isolamento por usuário",
    );
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width,
      );
      if (width === 1920) {
        const a = await cards.nth(0).boundingBox(),
          b = await cards.nth(2).boundingBox();
        assert.ok(Math.abs(a.y - b.y) < 2);
      }
      if ([390, 1920].includes(width))
        await page.screenshot({
          path: ".setup/screenshots/wallet-" + width + ".png",
          fullPage: true,
        });
    }
    check(
      "Carteira conferida em seis larguras, Full HD com três cards e celular sem overflow, incluindo descrição longa",
    );
    await page.getByRole("link", { name: "Próxima página" }).click();
    await page.waitForURL(/page=2/);
    await rows().first().waitFor();
    assert.equal(await rows().count(), 20);
    await page.getByRole("link", { name: "Próxima página" }).click();
    await page.waitForURL(/page=3/);
    await rows().first().waitFor();
    assert.equal(await rows().count(), 3);
    await page
      .getByText("Crédito antigo do histórico completo", { exact: true })
      .waitFor();
    check("Paginação acessa histórico antigo além da primeira página");
    await visit("?q=antigo");
    assert.equal(await rows().count(), 1);
    await visit("?q=antigo&period=90");
    await page
      .getByRole("heading", { name: "Nenhuma movimentação encontrada" })
      .waitFor();
    assert.equal(await rows().count(), 0);
    await visit("?type=out");
    assert.equal(await rows().count(), 20);
    assert.equal(await rows().getByText("Saída", { exact: true }).count(), 20);
    await page.getByRole("link", { name: "Próxima página" }).click();
    await page.waitForURL(/page=2/);
    await rows().first().waitFor();
    assert.equal(await rows().count(), 1);
    assert.ok(page.url().includes("type=out"));
    await visit("?type=credit&q=antigo");
    assert.equal(await rows().count(), 1);
    assert.match(await cards.nth(0).innerText(), /115/);
    assert.match(await cards.nth(1).innerText(), /220/);
    await visit("?q=antigo&page=99999999");
    assert.equal(await rows().count(), 1);
    check(
      "Busca, período, tipo e paginação combinam filtros reais sem mudar totais dos indicadores",
    );
    assert.equal(
      JSON.stringify(await db.ledger.findMany({ orderBy: { id: "asc" } })),
      before,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance,
      115,
    );
    check("Consultas e navegação preservam integralmente saldo e lançamentos");
  } finally {
    await context.close();
  }
}
