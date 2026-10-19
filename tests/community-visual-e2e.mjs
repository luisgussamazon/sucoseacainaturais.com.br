import assert from "node:assert/strict";
import sharp from "sharp";
export async function runVisualChecks({ db, browser, admin, login, check }) {
  const c = await browser.newContext(),
    page = await c.newPage();
  try {
    await db.communityGrant.upsert({
      where: { userId: admin.id },
      create: {
        userId: admin.id,
        assignedBy: admin.id,
        publish: true,
        photos: true,
        review: true,
        moderate: true,
      },
      update: { publish: true, photos: true, review: true, moderate: true },
    });
    await login(page, admin.email);
    await page.goto("http://localhost:3147/comunidade?kind=post");
    const form = page.locator("#editor:visible form");
    await form.locator("[name=title]").fill("Publicação visual QA");
    await form
      .locator("[name=description]")
      .fill("Conteúdo autorizado para validar o formulário redesenhado.");
    await form.locator("[name=status]").selectOption("PUBLISHED");
    await form.locator("[name=category]").selectOption("Eventos");
    const image = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#f89900" },
    })
      .png()
      .toBuffer();
    await form
      .getByLabel("Selecionar fotos da galeria", { exact: true })
      .setInputFiles([
        { name: "visual.png", mimeType: "image/png", buffer: image },
      ]);
    assert.equal(await form.locator(".selected-photo").count(), 1);
    await page.route("**/api/community/post", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha controlada QA" }),
      }),
    );
    await form
      .getByRole("button", { name: "Salvar publicação", exact: true })
      .click();
    await form.getByRole("alert").waitFor();
    assert.equal(
      await form.locator("[name=title]").inputValue(),
      "Publicação visual QA",
    );
    assert.equal(await form.locator(".selected-photo").count(), 1);
    await page.unroute("**/api/community/post");
    check("Falha no envio mantém campos e fotos selecionadas");
    await form.locator("[name=imageAuthorization]").check();
    await form.locator("[name=restrictedChecked]").check();
    await form
      .getByRole("button", { name: "Salvar publicação", exact: true })
      .click();
    await page.waitForURL(/kind=post&id=/);
    const post = await db.communityPost.findFirstOrThrow({
      where: { title: "Publicação visual QA" },
      include: { media: true },
    });
    assert.equal(post.media.length, 1);
    assert.equal(post.status, "PUBLISHED");
    await page
      .locator("#editor:visible")
      .getByRole("button", {
        name: "Abrir fotos: Publicação visual QA",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Fechar galeria", exact: true })
      .click();
    assert.equal(
      await page.locator("#editor:visible [name=title]").inputValue(),
      "Publicação visual QA",
    );
    await page
      .locator("#editor:visible [name=title]")
      .fill("Publicação visual QA editada");
    await page
      .locator("#editor:visible")
      .getByRole("button", { name: "Salvar publicação", exact: true })
      .click();
    await page
      .getByText("Conteúdo salvo.", { exact: false })
      .first()
      .waitFor({ timeout: 1000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    assert.equal(
      (await db.communityPost.findUniqueOrThrow({ where: { id: post.id } }))
        .title,
      "Publicação visual QA editada",
    );
    assert.equal(
      await db.communityMedia.count({ where: { postId: post.id } }),
      1,
    );
    check(
      "Novo editor cria e edita publicação com upload real, preservando fotografia",
    );
    await page.goto(
      "http://localhost:3147/comunidade?kind=post&q=Publicação%20visual&category=Eventos&sort=oldest",
    );
    assert.equal(
      await page.locator(".publication-table-row:visible").count(),
      1,
    );
    await page.goto(
      "http://localhost:3147/comunidade?kind=post&q=sem-resultado-visual",
    );
    assert.equal(
      await page.locator(".publication-table-row:visible").count(),
      0,
    );
    check("Busca, categoria e ordenação usam dados reais na listagem");
    await page.goto("http://localhost:3147/comunidade?kind=post");
    await page
      .locator(".community-primary-tabs")
      .getByRole("link", { name: "Comentários", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Moderação de comentários" })
      .waitFor();
    await page
      .locator(".community-primary-tabs")
      .getByRole("link", { name: "Evidências pendentes", exact: true })
      .click();
    await page.waitForURL("**/comunidade/evidencias");
    check("Abas de comentários e evidências acessam os módulos existentes");
    for (const width of [320, 375, 390, 768, 1366, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto("http://localhost:3147/comunidade?kind=post");
      await page.locator("#editor:visible").waitFor();
      await page
        .locator("#editor:visible")
        .getByLabel("Selecionar fotos da galeria", { exact: true })
        .setInputFiles(
          [1, 2, 3].map((n) => ({
            name: "visual-" + n + ".png",
            mimeType: "image/png",
            buffer: image,
          })),
        );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + width,
      );
      const fields = await page
          .locator(".publication-fields:visible")
          .boundingBox(),
        photos = await page
          .locator(".publication-photos:visible")
          .boundingBox();
      assert.ok(
        width >= 1366
          ? photos.x > fields.x + fields.width
          : photos.y > fields.y,
        "composer layout " + width,
      );
      await page.screenshot({
        path: ".setup/screenshots/community-visual-" + width + ".png",
        fullPage: true,
      });
    }
    check(
      "Comunidade validada em 320, 375, 390, 768, 1366 e 1920px, sem rolagem horizontal",
    );
  } finally {
    await c.close();
  }
}
