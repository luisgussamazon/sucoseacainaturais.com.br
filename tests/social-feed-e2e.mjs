import assert from "node:assert/strict";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
export async function runFeedChecks({ db, browser, admin, login, check }) {
  const base = "http://localhost:3147",
    ctx = await browser.newContext(),
    p = await ctx.newPage();
  try {
    const employee = await db.user.create({
      data: {
        name: "Colaborador Interações QA",
        email: "interacoes-" + Date.now() + "@qa.invalid",
        passwordHash: admin.passwordHash,
      },
    });
    await login(p, employee.email);
    const post = await db.communityPost.create({
      data: {
        title: "Mural visual QA isolado",
        description: "Conquistas e participação da equipe. ".repeat(20),
        category: "Sustentabilidade",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        publishedAt: new Date(Date.now() - 60000),
        authorId: admin.id,
        imageAuthorization: true,
        restrictedChecked: true,
        pinned: true,
      },
    });
    const media = [];
    for (const [width, height] of [
      [800, 500],
      [500, 800],
    ]) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: "#78a83b" },
      })
        .webp()
        .toBuffer();
      media.push(
        await db.communityMedia.create({
          data: {
            ownerId: admin.id,
            postId: post.id,
            bytes,
            width,
            height,
            position: media.length,
            expiresAt: new Date(Date.now() + 86400000),
          },
        }),
      );
    }
    const url = (id) => base + "/api/community/media/" + id + "/download";
    const guest = await browser.newContext();
    assert.equal((await guest.request.get(url(media[0].id))).status(), 401);
    await guest.close();
    check("Download exige autenticação");
    await db.mission.create({
      data: {
        title: "Evidência privada QA isolada",
        description: "Validação de segurança",
        reward: 1,
        question: "QA?",
        options: ["Sim"],
        answer: 0,
        endsAt: new Date(Date.now() + 86400000),
        photoConfig: {
          create: {
            category: "Sustentabilidade",
            startsAt: new Date(0),
            reviewerId: admin.id,
            media: {
              create: {
                ownerId: employee.id,
                bytes: media[0].bytes,
                width: 800,
                height: 500,
                expiresAt: new Date(Date.now() + 86400000),
              },
            },
            evidence: {
              create: {
                userId: employee.id,
                media: {
                  create: {
                    ownerId: employee.id,
                    bytes: media[0].bytes,
                    width: 800,
                    height: 500,
                    expiresAt: new Date(Date.now() + 86400000),
                  },
                },
              },
            },
          },
        },
      },
    });
    const protectedPhotos = await db.communityMedia.findMany({
      where: {
        OR: [{ evidenceId: { not: null } }, { photoMissionId: { not: null } }],
      },
      select: { id: true },
    });
    assert.ok(protectedPhotos.length > 0);
    for (const photo of protectedPhotos)
      assert.equal((await ctx.request.get(url(photo.id))).status(), 404);
    check("Evidências e fotografias de missões não podem ser baixadas");

    const r = await ctx.request.get(url(media[0].id));
    assert.equal(r.status(), 200);
    assert.deepEqual(await r.body(), Buffer.from(media[0].bytes));
    assert.match(r.headers()["content-disposition"], /^attachment/);
    assert.match(r.headers()["cache-control"], /no-store/);
    assert.equal(
      await db.audit.count({
        where: { actorId: employee.id, action: "COMMUNITY_PHOTO_DOWNLOAD" },
      }),
      1,
    );
    check("Download preserva bytes, usa attachment, não cacheia e audita");
    for (const patch of [
      { status: "DRAFT" },
      { status: "PUBLISHED", publishedAt: new Date(Date.now() + 86400000) },
      { publishedAt: new Date(Date.now() - 60000), visibility: "MANAGEMENT" },
      { visibility: "INTERNAL", imageAuthorization: false },
      { imageAuthorization: true, restrictedChecked: false },
    ]) {
      await db.communityPost.update({ where: { id: post.id }, data: patch });
      assert.equal((await ctx.request.get(url(media[0].id))).status(), 404);
    }
    await db.communityPost.update({
      where: { id: post.id },
      data: {
        status: "PUBLISHED",
        visibility: "INTERNAL",
        publishedAt: new Date(Date.now() - 60000),
        imageAuthorization: true,
        restrictedChecked: true,
      },
    });
    await db.communityMedia.update({
      where: { id: media[0].id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal((await ctx.request.get(url(media[0].id))).status(), 404);
    await db.communityMedia.update({
      where: { id: media[0].id },
      data: { expiresAt: new Date(Date.now() + 86400000) },
    });
    check(
      "Rascunhos, agenda, restritos, falta de consentimento e expiradas bloqueados",
    );
    await p.goto(base + "/mural?post=" + post.id);
    const card = p
      .locator("article:visible")
      .filter({ has: p.getByRole("heading", { name: post.title }) });
    await card.waitFor();
    await card.getByRole("button", { name: "Ver mais", exact: true }).click();
    assert.equal(
      await card
        .getByRole("button", { name: "Ver menos", exact: true })
        .count(),
      1,
    );
    const like = card.getByRole("button", { name: "Curtir", exact: true });
    await like.waitFor();
    await p.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.getAttribute("aria-label") === "Curtir" && !b.disabled,
      ),
    );
    await like.click();
    await card
      .getByRole("button", { name: "Descurtir", exact: true })
      .waitFor();
    await card
      .getByText(employee.name + " curtiu isso", { exact: true })
      .waitFor();
    const social = await ctx.request.get(
        base + "/api/community/interactions?kind=POST&targetId=" + post.id,
      ),
      socialData = await social.json();
    assert.equal(socialData.likers[0].name, employee.name);
    assert.equal(socialData.likers[0].id, employee.id);
    assert.equal(socialData.viewerName, employee.name);
    const actions = card.getByRole("button", {
      name: "Comentários",
      exact: true,
    });
    const likeBox = await card
        .getByRole("button", { name: "Descurtir", exact: true })
        .boundingBox(),
      commentBox = await actions.boundingBox(),
      downloadBox = await card
        .getByRole("button", { name: "Baixar foto", exact: true })
        .boundingBox();
    assert.ok(
      Math.abs(likeBox.y - commentBox.y) < 2 &&
        Math.abs(commentBox.y - downloadBox.y) < 2,
    );
    assert.ok(downloadBox.x > commentBox.x);
    check("Curtidas mostram nomes reais e ações ficam na mesma linha");
    const input = card.getByPlaceholder("Escreva um comentário...");
    await input.fill("Antes depois");
    await input.evaluate((el) => {
      el.focus();
      el.setSelectionRange(6, 6);
      el.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await card.getByRole("button", { name: "Selecionar emoji" }).click();
    await card.getByRole("button", { name: "Inserir 🌱", exact: true }).click();
    assert.equal(await input.inputValue(), "Antes 🌱depois");
    await input.evaluate((el) => {
      el.setSelectionRange(0, 5);
      el.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await card.getByRole("button", { name: "Selecionar emoji" }).click();
    await card.getByRole("button", { name: "Inserir ❤️", exact: true }).click();
    assert.equal(await input.inputValue(), "❤️ 🌱depois");
    await card.getByRole("button", { name: "Selecionar emoji" }).click();
    await p.keyboard.press("Escape");
    assert.equal(
      await card
        .getByRole("button", { name: "Selecionar emoji" })
        .getAttribute("aria-expanded"),
      "false",
    );
    check("Emojis respeitam cursor, substituem seleção e fecham por Escape");
    await input.fill("Comentário QA isolado 🌱");
    const published = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community/comment") &&
        r.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Publicar", exact: true }).click();
    const response = await published;
    assert.equal(response.status(), 200, await response.text());
    await card
      .locator(".community-comment")
      .getByText("Comentário QA isolado 🌱", { exact: true })
      .waitFor();
    await card.getByLabel("Opções do comentário").click();
    await card.getByRole("button", { name: "Excluir meu comentário" }).click();
    await p.waitForFunction(
      () => !document.body.innerText.includes("Comentário QA isolado 🌱"),
    );
    check(
      "Curtir, expandir descrição, comentar e excluir comentário funcionam",
    );
    await card
      .getByRole("button", { name: "Próxima foto", exact: true })
      .click();
    const download = p.waitForEvent("download");
    await card
      .getByRole("button", { name: "Baixar foto", exact: true })
      .click();
    const saved = await download;
    assert.match(saved.suggestedFilename(), /SSD-VBJ2-FOTO.*-2.webp/);
    await saved.saveAs(".setup/social-feed-download.webp");
    await card
      .getByRole("button", { name: "Ampliar foto: " + post.title })
      .click();
    await p.getByRole("dialog").waitFor();
    await p
      .getByRole("dialog")
      .getByRole("region", { name: "Interações da fotografia" })
      .waitFor();
    await p.getByRole("button", { name: "Fechar fotografia" }).click();
    check("Carrossel, modal e download real da foto selecionada funcionam");
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await p.setViewportSize({ width, height: 1080 });
      await p.evaluate(() => scrollTo(0, 0));
      await p.waitForTimeout(150);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "Overflow " + width,
      );
      const controls = card.getByRole("button", {
        name: "Comentários",
        exact: true,
      });
      await controls.scrollIntoViewIfNeeded();
      const a = await controls.boundingBox(),
        b = await card
          .getByRole("button", { name: "Baixar foto", exact: true })
          .boundingBox();
      assert.ok(Math.abs(a.y - b.y) < 2, "Actions wrap " + width);
      await input.scrollIntoViewIfNeeded();
      await card.getByRole("button", { name: "Selecionar emoji" }).click();
      const popup = card.getByRole("group", { name: "Emojis" });
      await popup.waitFor();
      const bounds = await popup.boundingBox();
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        "Emoji overflow " + width,
      );
      await p.keyboard.press("Escape");
      if ([390, 1920].includes(width))
        await card
          .locator('[aria-label="Interações da publicação"]')
          .screenshot({ path: ".setup/mural-interactions-" + width + ".png" });
      if ([390, 1920].includes(width))
        await p.screenshot({ path: ".setup/social-feed-" + width + ".png" });
    }
    assert.equal(
      await card
        .getByRole("button", { name: "Compartilhar", exact: true })
        .count(),
      0,
    );
    check("Feed sem Compartilhar e sem overflow em seis larguras");
  } catch (error) {
    await p
      .screenshot({ path: ".setup/interactions-failure.png", fullPage: true })
      .catch(() => {});
    console.log(
      "Composer diagnostic:",
      await p
        .locator('[aria-label="Selecionar emoji"]')
        .evaluateAll((els) =>
          els.map((el) => ({
            expanded: el.getAttribute("aria-expanded"),
            visible: !!el.getClientRects().length,
          })),
        )
        .catch(() => []),
    );
    throw error;
  } finally {
    await ctx.close();
  }
}
