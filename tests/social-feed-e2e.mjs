import assert from "node:assert/strict";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
export async function runFeedChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    ctx = await browser.newContext(),
    p = await ctx.newPage();
  try {
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
    const like = card.getByRole("button", { name: "♡ Curtir", exact: true });
    await like.waitFor();
    await p.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.includes("♡ Curtir") && !b.disabled,
      ),
    );
    await like.click();
    await card
      .getByRole("button", { name: "♥ Descurtir", exact: true })
      .waitFor();
    await card
      .getByPlaceholder("Escreva um comentário...")
      .fill("Comentário QA isolado");
    await card
      .getByRole("button", { name: "Enviar comentário", exact: true })
      .click();
    await card.getByText("Comentário QA isolado", { exact: true }).waitFor();
    await card.getByRole("button", { name: "Excluir meu comentário" }).click();
    await p.waitForFunction(
      () => !document.body.innerText.includes("Comentário QA isolado"),
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
  } finally {
    await ctx.close();
  }
}
