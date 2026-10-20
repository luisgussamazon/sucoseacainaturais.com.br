import assert from "node:assert/strict";
import sharp from "sharp";
export async function runProfileChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    contexts = [];
  async function actor(user) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await login(page, user.email);
    return { context, page, request: context.request };
  }
  const a = await actor(admin),
    e = await actor(employee),
    guest = await browser.newContext();
  contexts.push(guest);
  try {
    const image = await sharp({
        create: { width: 900, height: 600, channels: 3, background: "#ff9900" },
      })
        .png()
        .withMetadata()
        .toBuffer(),
      photo = { name: "profile-qa.png", mimeType: "image/png", buffer: image };
    const upload = (client, fields = {}, file = photo, origin = base) =>
      client.post(base + "/api/profile-photo", {
        headers: { origin },
        multipart: {
          photo: file,
          x: "0.25",
          y: "0.75",
          zoom: "1.5",
          consent: "true",
          ...fields,
        },
      });
    const before = await db.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    assert.equal((await upload(guest.request)).status(), 401);
    assert.equal(
      (await guest.request.get(base + "/api/avatars/" + employee.id)).status(),
      401,
    );
    assert.equal(
      (await upload(e.request, {}, photo, "https://outside.invalid")).status(),
      403,
    );
    assert.equal((await upload(e.request, { userId: admin.id })).status(), 403);
    assert.equal(
      (
        await e.request.delete(base + "/api/profile-photo?userId=" + admin.id, {
          headers: { origin: base },
        })
      ).status(),
      403,
    );
    check(
      "Fotos exigem sessão, origem válida e só podem ser alteradas pelo próprio usuário",
    );
    assert.equal((await upload(e.request, { consent: "false" })).status(), 400);
    assert.equal(
      (
        await upload(
          e.request,
          {},
          {
            name: "fake.png",
            mimeType: "image/png",
            buffer: Buffer.from("<svg/>"),
          },
        )
      ).status(),
      400,
    );
    assert.equal((await upload(e.request, { zoom: "Infinity" })).status(), 400);
    assert.equal(
      (
        await upload(
          e.request,
          {},
          {
            name: "large.png",
            mimeType: "image/png",
            buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
          },
        )
      ).status(),
      400,
    );
    assert.equal(
      await db.profilePhoto.count({ where: { userId: employee.id } }),
      0,
    );
    check(
      "Consentimento, imagem real, limite de 4 MB e parâmetros do recorte são validados no servidor",
    );
    const saved = await upload(e.request, {
      role: "ADMIN",
      balance: "9999",
      email: "not-allowed@example.invalid",
    });
    assert.equal(saved.status(), 200);
    const stored = await db.profilePhoto.findUniqueOrThrow({
        where: { userId: employee.id },
      }),
      meta = await sharp(stored.bytes).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
    const after = await db.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    for (const key of [
      "name",
      "email",
      "role",
      "active",
      "balance",
      "passwordHash",
      "createdAt",
    ])
      assert.deepEqual(after[key], before[key]);
    assert.ok(after.avatarUpdatedAt);
    const visible = await a.request.get(base + "/api/avatars/" + employee.id);
    assert.equal(visible.status(), 200);
    assert.deepEqual(await visible.body(), Buffer.from(stored.bytes));
    assert.match(visible.headers()["cache-control"], /private, no-store/);
    assert.equal(
      await db.audit.count({
        where: { actorId: employee.id, action: "PROFILE_PHOTO_CHANGED" },
      }),
      1,
    );
    check(
      "Foto persiste em PostgreSQL como WebP sem alterar nome, email, senha, perfil ou saldo",
    );
    await e.page.goto(base + "/perfil");
    await e.page
      .getByRole("heading", { name: "Meu perfil", exact: true })
      .waitFor();
    const panel = e.page.getByRole("region", { name: "Foto do perfil" });
    assert.equal(
      await e.page
        .locator(
          "main select[name=role],main input[name=email],main input[name=name]",
        )
        .count(),
      0,
    );
    await panel.locator("input[type=file]").setInputFiles(photo);
    await panel.getByAltText("Pré-visualização da foto de perfil").waitFor();
    await e.page.waitForFunction(() => {
      const i = document.querySelector(
        'img[alt="Pré-visualização da foto de perfil"]',
      );
      return i?.naturalWidth > 0;
    });
    await panel.getByLabel("Zoom", { exact: true }).press("End");
    await panel.getByLabel("Posição horizontal").press("End");
    await panel.getByRole("checkbox").check();
    await panel
      .getByRole("button", { name: "Salvar foto", exact: true })
      .click();
    await panel
      .getByText("Foto de perfil atualizada.", { exact: true })
      .waitFor();
    await e.page
      .locator('header summary img[alt="Foto de ' + employee.name + '"]')
      .waitFor();
    await e.page.waitForFunction(
      () =>
        document.querySelector('header summary img[src^="/api/avatars/"]')
          ?.naturalWidth > 0,
    );
    check(
      "Editor oferece prévia circular, zoom e reposicionamento; cabeçalho atualiza sem recarregar",
    );
    const post = await db.communityPost.create({
      data: {
        title: "Autor com foto QA",
        description: "Publicação de validação somente no banco isolado.",
        category: "Comunicados",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        publishedAt: new Date(Date.now() - 60000),
        authorId: employee.id,
      },
    });
    await db.communityComment.create({
      data: {
        postId: post.id,
        userId: employee.id,
        text: "Comentário com avatar QA",
      },
    });
    await a.page.goto(base + "/mural?post=" + post.id);
    const card = a.page
      .locator("article:visible")
      .filter({ has: a.page.getByRole("heading", { name: post.title }) });
    await card.getByAltText("Foto de " + employee.name).waitFor();
    await card.getByRole("button", { name: /Comentar/ }).click();
    await card
      .locator(".community-comment")
      .getByAltText("Foto de " + employee.name)
      .waitFor();
    check(
      "Autores e comentários usam a foto real sem divulgar hashes ou dados de acesso",
    );
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await e.page.setViewportSize({ width, height: 1080 });
      await e.page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      const trigger = e.page.locator(
        'summary[aria-label="Abrir menu do usuário"]',
      );
      await trigger.click();
      const menu = e.page.locator("details[open]").filter({
        has: e.page.getByRole("link", { name: "Meu perfil", exact: true }),
      });
      await menu.getByText(employee.email, { exact: true }).waitFor();
      assert.ok(
        !(await menu
          .innerText()
          .then((t) => t.includes(employee.passwordHash))),
      );
      const dropdown = await menu.locator(":scope>div").boundingBox();
      assert.ok(dropdown.x >= 0 && dropdown.x + dropdown.width <= width);
      assert.ok(
        await e.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if ([390, 1920].includes(width))
        await e.page.screenshot({
          path: ".setup/screenshots/profile-menu-" + width + ".png",
        });
      await e.page.keyboard.press("Escape");
      assert.equal(await menu.count(), 0);
    }
    check(
      "Menu de perfil funciona em seis larguras, fecha por Escape e mantém PWA responsiva",
    );
    await e.page.locator('summary[aria-label="Abrir menu do usuário"]').click();
    await e.page
      .getByRole("link", { name: "Alterar senha", exact: true })
      .click();
    await e.page.waitForURL("**/perfil#alterar-senha");
    assert.ok(e.page.url().endsWith("/perfil#alterar-senha"));
    await e.page
      .getByRole("heading", { name: "Alterar senha", exact: true })
      .waitFor();
    await panel
      .getByRole("button", { name: "Remover foto", exact: true })
      .click();
    await panel.getByText("Foto removida.", { exact: true }).waitFor();
    assert.equal(
      await db.profilePhoto.count({ where: { userId: employee.id } }),
      0,
    );
    assert.equal(
      (await a.request.get(base + "/api/avatars/" + employee.id)).status(),
      404,
    );
    await e.page.waitForFunction(
      () => !document.querySelector('header summary img[src^="/api/avatars/"]'),
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employee.id } }))
        .avatarUpdatedAt,
      null,
    );
    check(
      "Remoção restaura as iniciais e alteração de senha reutiliza o formulário existente",
    );
    await e.page.locator('summary[aria-label="Abrir menu do usuário"]').click();
    await e.page
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
    await e.page.waitForURL("**/login");
    assert.equal(
      (await e.request.get(base + "/api/avatars/" + admin.id)).status(),
      401,
    );
    check(
      "Sair da conta revoga a sessão existente e bloqueia as fotos privadas",
    );
  } catch (error) {
    await e.page
      .screenshot({
        path: ".setup/screenshots/profile-failure.png",
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}
