import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function runStoreDesignChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const c = await browser.newContext(),
    page = await c.newPage(),
    base = "http://localhost:3147";
  const originals = await db.product.findMany();
  const beforeLedger = await db.ledger.count();
  const userBefore = await db.user.findUniqueOrThrow({
    where: { id: admin.id },
  });
  try {
    await db.product.updateMany({
      where: { id: { in: originals.map((p) => p.id) } },
      data: { active: false },
    });
    await db.user.update({ where: { id: admin.id }, data: { balance: 1000 } });
    const tiers = ["MINI", "BRONZE", "PRATA", "OURO", "PREMIUM", "MASTER"],
      prices = [10, 20, 35, 50, 75, 100],
      ranges = ["1 a 2", "2 a 3", "3 a 4", "4 a 5", "5 a 7", "7 a 10"],
      products = [];
    for (const [i, tier] of tiers.entries()) {
      const product = await db.product.create({
        data: {
          name: "CAIXA MISTERIOSA " + tier,
          category: tier,
          price: prices[i],
          description:
            "Surpresa contendo " +
            ranges[i] +
            " produtos alimentícios. Confira as informações de alergênicos antes de confirmar o resgate.",
          imageUrl:
            "data:image/webp;base64," +
            readFileSync(
              "public/images/store/" + tier.toLowerCase() + ".webp",
            ).toString("base64"),
        },
      });
      products.push(product);
      if (tier !== "MASTER")
        await db.batch.create({
          data: {
            productId: product.id,
            code: "STORE-DESIGN-" + tier,
            quantity: 3,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
    }
    await login(page, admin.email);
    await page.goto(base + "/loja");
    assert.equal(
      await page.locator(".store-page .product-card:visible").count(),
      6,
    );
    assert.deepEqual(
      await page.locator(".store-page .price strong:visible").allTextContents(),
      prices.map(String),
    );
    assert.equal(
      await page
        .locator(".store-page:visible .stock")
        .filter({ hasText: "Disponível para resgate" })
        .count(),
      5,
    );
    assert.equal(
      await page.getByRole("button", { name: "Esgotado", exact: true }).count(),
      1,
    );
    check(
      "Loja usa seis registros reais do banco isolado com preços e disponibilidade corretos, sem cards demonstrativos",
    );
    for (const width of [320, 375, 390, 768, 1366, 1672, 1920]) {
      await page.setViewportSize({
        width,
        height: width === 1672 ? 941 : 1080,
      });
      await page.goto(base + "/loja");
      await page
        .getByRole("heading", { name: "SSD VBJ2", exact: true })
        .waitFor();
      await page
        .locator(".store-page:visible .product-card img")
        .evaluateAll((images) =>
          images.forEach((img) => {
            img.loading = "eager";
          }),
        );
      await page
        .locator(".store-page:visible .product-card img")
        .evaluateAll((images) =>
          Promise.all(
            images.map((i) =>
              i.complete
                ? Promise.resolve()
                : new Promise((r) => {
                    i.onload = r;
                    i.onerror = r;
                  }),
            ),
          ),
        );
      assert.ok(
        await page
          .locator(".store-page:visible .product-card img")
          .evaluateAll((images) => images.every((i) => i.naturalWidth > 0)),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + width,
      );
      const columns = await page
        .locator(".store-page .product-grid:visible")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        );
      assert.equal(columns, width >= 1366 ? 3 : width >= 541 ? 2 : 1);
      const hero = await page.locator(".store-banner:visible").boundingBox(),
        filters = await page.locator(".store-filters:visible").boundingBox(),
        grid = await page.locator(".product-grid:visible").boundingBox();
      assert.ok(hero.y < filters.y && filters.y < grid.y);
      await page.screenshot({
        path: ".setup/screenshots/store-reference-" + width + ".png",
        fullPage: true,
      });
    }
    check(
      "Banner, filtros e grade conferidos em sete larguras, incluindo a resolução exata da referência, sem cortes ou overflow",
    );
    await page.goto(base + "/loja");
    const filter = page.locator(".store-filters:visible");
    await filter.getByLabel("Preço", { exact: true }).selectOption("up-to-20");
    await filter.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.waitForURL(/price=up-to-20/);
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA MINI", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".store-page .product-card:visible").count(),
      2,
    );
    await page.goto(base + "/loja?availability=unavailable");
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA MASTER", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".store-page .product-card:visible").count(),
      1,
    );
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA MASTER", exact: true })
      .waitFor();
    await page.goto(base + "/loja?availability=available&sort=price-desc");
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA PREMIUM", exact: true })
      .waitFor();
    assert.deepEqual(
      await page.locator(".store-page .price strong:visible").allTextContents(),
      ["75", "50", "35", "20", "10"],
    );
    await page.goto(base + "/loja?category=PRATA&q=prata");
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA PRATA", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".store-page .product-card:visible").count(),
      1,
    );
    await page.goto(base + "/loja?price=__proto__");
    await page
      .getByRole("heading", { name: "CAIXA MISTERIOSA MINI", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".store-page .product-card:visible").count(),
      6,
    );
    check(
      "Busca, categoria, preços, disponibilidade e ordenação funcionam com lotes válidos",
    );
    await page.goto(base + "/loja?category=MINI");
    await page.locator(".product-description:visible summary").click();
    await page
      .locator(".store-page:visible")
      .getByText(/Confira as informações de alergênicos/)
      .waitFor();
    await page
      .locator(".store-page:visible")
      .getByText(/Validade do próximo lote/)
      .waitFor();
    check(
      "Descrição integral, informações de alergênicos, quantidade e validade continuam acessíveis",
    );
    await page
      .getByRole("button", { name: "Resgatar agora", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar resgate", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/resgates");
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).balance,
      990,
    );
    const order = await db.order.findFirstOrThrow({
      where: { userId: admin.id, productId: products[0].id },
      include: { allocations: true },
    });
    assert.equal(order.cost, 10);
    assert.equal(order.allocations[0].quantity, 1);
    assert.equal(await db.ledger.count(), beforeLedger + 1);
    check("Botão da nova caixa mantém débito, estoque e alocação FEFO reais");
    for (const p of products) {
      const current = await db.product.findUniqueOrThrow({
        where: { id: p.id },
      });
      assert.equal(current.price, p.price);
      assert.equal(current.imageUrl, p.imageUrl);
    }
    check("Redesign preserva os registros de produtos e imagens cadastradas");
  } finally {
    for (const p of originals)
      await db.product.update({
        where: { id: p.id },
        data: { active: p.active },
      });
    await db.user.update({
      where: { id: admin.id },
      data: { balance: userBefore.balance },
    });
    await c.close();
  }
}
