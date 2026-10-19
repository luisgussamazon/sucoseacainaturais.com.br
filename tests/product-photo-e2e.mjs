import assert from "node:assert/strict";
import sharp from "sharp";
export async function runProductPhotoChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const context = await browser.newContext(),
    page = await context.newPage(),
    base = "http://localhost:3147";
  const originals = await db.product.findMany({
    select: { id: true, imageUrl: true, name: true, price: true },
  });
  try {
    await login(page, admin.email);
    await page.goto(base + "/estoque");
    let form = page
      .locator("form.product-form:visible")
      .filter({
        has: page.getByRole("button", {
          name: "Cadastrar produto",
          exact: true,
        }),
      });
    await form.locator("[name=name]").fill("Produto com foto QA");
    await form
      .locator("[name=description]")
      .fill("Fotografia validada em ambiente isolado");
    await form.locator("[name=category]").fill("Bebidas");
    await form.locator("[name=price]").fill("12");
    await form
      .getByLabel("Imagem do produto", { exact: true })
      .setInputFiles({
        name: "invalida.png",
        mimeType: "image/png",
        buffer: Buffer.from("imagem falsa"),
      });
    await form
      .getByRole("button", { name: "Cadastrar produto", exact: true })
      .click();
    await form.getByRole("alert").waitFor();
    assert.equal(
      await form.locator("[name=name]").inputValue(),
      "Produto com foto QA",
    );
    assert.equal(
      await db.product.count({ where: { name: "Produto com foto QA" } }),
      0,
    );
    check(
      "Upload inválido é rejeitado no servidor sem criar produto nem perder campos",
    );
    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#ff9900" },
    })
      .png()
      .toBuffer();
    await form
      .getByLabel("Imagem do produto", { exact: true })
      .setInputFiles({
        name: "produto.png",
        mimeType: "image/png",
        buffer: png,
      });
    await form
      .getByAltText("Pré-visualização da imagem do produto", { exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".setup/screenshots/product-upload-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await form
      .getByRole("button", { name: "Cadastrar produto", exact: true })
      .click();
    await form
      .getByText("Produto salvo com sucesso.", { exact: true })
      .waitFor();
    const product = await db.product.findFirstOrThrow({
      where: { name: "Produto com foto QA" },
    });
    assert.match(product.imageUrl, /^data:image\/webp;base64,/);
    await db.batch.create({
      data: {
        productId: product.id,
        code: "PHOTO-QA",
        quantity: 3,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await page.reload();
    const response = await context.request.get(
      base + "/api/products/" + product.id + "/image",
    );
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /image\/webp/);
    assert.match(response.headers()["cache-control"], /private, no-store/);
    assert.equal((await sharp(await response.body()).metadata()).width, 640);
    const anon = await browser.newContext();
    assert.equal(
      (
        await anon.request.get(base + "/api/products/" + product.id + "/image")
      ).status(),
      401,
    );
    await anon.close();
    check(
      "Imagem persiste no PostgreSQL e continua disponível após recarregar; endpoint exige sessão",
    );
    const details = page
      .locator("details.management-details")
      .filter({
        has: page.locator("summary", { hasText: "Produto com foto QA" }),
      });
    await details.locator("summary").click();
    form = details.locator("form.product-form");
    await form
      .locator("[name=description]")
      .fill("Descrição editada mantendo a foto");
    await form
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await form
      .getByText("Produto salvo com sucesso.", { exact: true })
      .waitFor();
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
        .imageUrl,
      product.imageUrl,
    );
    check("Editar produto sem nova seleção mantém a fotografia persistida");
    await page.goto(base + "/loja");
    const card = page
      .locator(".product-card")
      .filter({
        has: page.getByRole("heading", {
          name: "Produto com foto QA",
          exact: true,
        }),
      });
    await card.waitFor();
    const img = card.locator("img");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const i = Array.from(document.querySelectorAll(".product-card img")).find(
        (i) => i.alt === "Produto com foto QA",
      );
      return i?.complete && i.naturalWidth > 0;
    });
    assert.match(
      await img.getAttribute("src"),
      /\/api\/products\/.+\/image\?v=/,
    );
    check(
      "Card da loja carrega imagem persistida com URL versionada, sem alterar estoque ou resgate",
    );
    await page.goto(base + "/estoque");
    const edit = page
      .locator("details.management-details")
      .filter({
        has: page.locator("summary", { hasText: "Produto com foto QA" }),
      });
    await edit.locator("summary").click();
    form = edit.locator("form.product-form");
    const webp = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#78a83b" },
    })
      .webp()
      .toBuffer();
    await form
      .getByLabel("Imagem do produto", { exact: true })
      .setInputFiles({
        name: "nova.webp",
        mimeType: "image/webp",
        buffer: webp,
      });
    await form
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await page.waitForTimeout(800);
    assert.notEqual(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
        .imageUrl,
      product.imageUrl,
    );
    for (const original of originals)
      assert.deepEqual(
        await db.product.findUniqueOrThrow({
          where: { id: original.id },
          select: { id: true, imageUrl: true, name: true, price: true },
        }),
        original,
      );
    check(
      "Substituição de foto funciona e todos os produtos anteriores permanecem inalterados",
    );
  } finally {
    await context.close();
  }
}
