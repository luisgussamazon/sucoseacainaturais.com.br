import assert from "node:assert/strict";
import sharp from "sharp";
export async function runMuralSocialChecks({
  db,
  browser,
  admin,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    contexts = [];
  async function actor(user) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const p = await ctx.newPage();
    await login(p, user.email);
    return { ctx, p };
  }
  async function send(a, action, fields) {
    return a.p.evaluate(
      async ({ action, fields }) => {
        const f = new FormData();
        for (const [k, v] of Object.entries(fields)) f.set(k, v);
        const r = await fetch("/api/community/" + action, {
          method: "POST",
          body: f,
        });
        return { status: r.status, data: await r.json() };
      },
      { action, fields },
    );
  }
  async function ok(a, action, fields) {
    const r = await send(a, action, fields);
    assert.equal(r.status, 200, JSON.stringify(r));
    return r;
  }
  async function read(a, id, params = {}) {
    const r = await a.ctx.request.get(
      base +
        "/api/community/interactions?" +
        new URLSearchParams({ kind: "POST", targetId: id, ...params }),
    );
    assert.equal(r.status(), 200);
    return r.json();
  }
  const users = [];
  for (let i = 0; i < 3; i++)
    users.push(
      await db.user.create({
        data: {
          name: "Pessoa social QA " + i,
          email: "social-" + i + "-" + Date.now() + "@qa.invalid",
          passwordHash: admin.passwordHash,
        },
      }),
    );
  const [owner, reader, moderator] = users;
  await db.communityGrant.create({
    data: { userId: moderator.id, assignedBy: admin.id, moderate: true },
  });
  const finance = async () =>
    JSON.stringify(
      await db.$transaction([
        db.user.findMany({
          select: { id: true, balance: true },
          orderBy: { id: "asc" },
        }),
        db.ledger.findMany({ orderBy: { id: "asc" } }),
        db.order.findMany({ orderBy: { id: "asc" } }),
        db.batch.findMany({ orderBy: { id: "asc" } }),
      ]),
    );
  const before = await finance();
  try {
    const a = await actor(owner),
      b = await actor(reader),
      m = await actor(moderator);
    const post = await db.communityPost.create({
      data: {
        title: "Conversa social QA isolada",
        description:
          "Reconhecimento real da equipe de teste, com respostas persistentes.",
        category: "Equipe",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        publishedAt: new Date(Date.now() - 1000),
        authorId: owner.id,
        imageAuthorization: true,
        restrictedChecked: true,
        pinned: true,
      },
    });
    const bytes = await sharp({
      create: { width: 800, height: 350, channels: 3, background: "#153b50" },
    })
      .webp()
      .toBuffer();
    await db.communityMedia.create({
      data: {
        ownerId: owner.id,
        postId: post.id,
        bytes,
        width: 800,
        height: 350,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.profilePhoto.create({ data: { userId: owner.id, bytes } });
    await db.user.update({
      where: { id: owner.id },
      data: { avatarUpdatedAt: new Date() },
    });
    const root = await db.communityComment.create({
      data: {
        postId: post.id,
        userId: owner.id,
        text: "Comentário histórico preservado",
        createdAt: new Date(Date.now() - 3600000),
      },
    });
    const fields = { kind: "POST", targetId: post.id };
    const guest = await browser.newContext();
    assert.equal(
      (
        await guest.request.post(base + "/api/community/comment-like", {
          multipart: { ...fields, id: root.id, liked: "true" },
          headers: { origin: base },
        })
      ).status(),
      401,
    );
    await guest.close();
    const badOrigin = await a.ctx.request.post(
      base + "/api/community/comment-like",
      {
        multipart: { ...fields, id: root.id, liked: "true" },
        headers: { origin: "https://invalid.example" },
      },
    );
    assert.equal(badOrigin.status(), 403);
    check("Curtidas e respostas exigem sessão e mesma origem");
    await Promise.all([
      ok(b, "comment-like", { ...fields, id: root.id, liked: "true" }),
      ok(b, "comment-like", { ...fields, id: root.id, liked: "true" }),
    ]);
    assert.equal(
      await db.communityCommentLike.count({ where: { commentId: root.id } }),
      1,
    );
    assert.equal((await read(b, post.id)).comments[0].liked, true);
    await ok(b, "comment-like", { ...fields, id: root.id, liked: "false" });
    assert.equal(
      await db.communityCommentLike.count({ where: { commentId: root.id } }),
      0,
    );
    check(
      "Curtir e descurtir comentário são idempotentes, inclusive simultâneos",
    );
    const requestId = crypto.randomUUID(),
      replyFields = {
        ...fields,
        replyToId: root.id,
        text: "Resposta persistida 💙",
        requestId,
      };
    await ok(b, "comment", replyFields);
    await ok(b, "comment", replyFields);
    assert.equal(await db.communityComment.count({ where: { requestId } }), 1);
    const reply = await db.communityComment.findUniqueOrThrow({
      where: { requestId },
    });
    await ok(a, "comment", {
      ...fields,
      replyToId: reply.id,
      text: "Resposta da resposta 🌱",
      requestId: crypto.randomUUID(),
    });
    const nested = await db.communityComment.findFirstOrThrow({
      where: { replyToId: reply.id },
    });
    assert.equal(nested.parentId, root.id);
    await ok(a, "comment-like", { ...fields, id: reply.id, liked: "true" });
    await ok(a, "comment-like", { ...fields, id: reply.id, liked: "true" });
    assert.equal(
      await db.communityCommentLike.count({ where: { commentId: reply.id } }),
      1,
    );
    await ok(a, "comment-like", { ...fields, id: reply.id, liked: "false" });
    assert.equal(
      await db.communityCommentLike.count({ where: { commentId: reply.id } }),
      0,
    );
    check(
      "Respostas e respostas de respostas persistem na mesma conversa, com curtidas independentes",
    );
    const other = await db.communityPost.create({
      data: {
        title: "Outra conversa QA",
        description: "Isolamento",
        category: "Equipe",
        status: "PUBLISHED",
        publishedAt: new Date(0),
        authorId: owner.id,
      },
    });
    assert.equal(
      (await send(b, "comment", { ...replyFields, targetId: other.id })).status,
      404,
    );
    assert.equal(
      (
        await send(b, "comment-like", {
          ...fields,
          targetId: other.id,
          id: reply.id,
          liked: "true",
        })
      ).status,
      404,
    );
    assert.equal(
      (await send(b, "delete-comment", { ...fields, id: root.id })).status,
      403,
    );
    assert.equal(
      (
        await send(b, "moderate", {
          ...fields,
          id: root.id,
          hidden: "true",
          reason: "Sem permissão",
        })
      ).status,
      403,
    );
    check("IDs de outra publicação e ações sem permissão são recusados");
    await a.p.goto(base + "/mural?post=" + post.id);
    const card = a.p
      .locator("article:visible")
      .filter({ has: a.p.getByRole("heading", { name: post.title }) });
    await card.waitFor();
    await card.locator('[data-comment-id="' + root.id + '"]').waitFor();
    assert.equal(
      (await card
        .locator('img[src^="/api/avatars/' + owner.id + '"]')
        .count()) > 0,
      true,
    );
    await a.p.evaluate(() => {
      window.__muralNoReload = "preserved";
    });
    const rootUI = card.locator('[data-comment-id="' + root.id + '"]');
    await rootUI
      .getByRole("button", { name: "Curtir comentário", exact: true })
      .click();
    await rootUI
      .getByRole("button", { name: "Descurtir comentário", exact: true })
      .waitFor();
    const replyUI = card.locator('[data-comment-id="' + reply.id + '"]');
    await replyUI
      .getByRole("button", { name: "Curtir comentário", exact: true })
      .click();
    await replyUI
      .getByRole("button", { name: "Descurtir comentário", exact: true })
      .waitFor();
    assert.equal(await a.p.evaluate(() => window.__muralNoReload), "preserved");
    check(
      "Curtidas de comentários e respostas atualizam na interface sem recarregar a página",
    );
    const textbox = card.getByLabel("Seu comentário", { exact: true });
    await textbox.fill("Novo comentário");
    await textbox.press("Shift+Enter");
    await textbox.type("com nova linha");
    assert.match(await textbox.inputValue(), /\n/);
    const sent = a.p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community/comment") &&
        r.request().method() === "POST",
    );
    await textbox.press("Enter");
    assert.equal((await sent).status(), 200);
    await card
      .locator(".community-comment p")
      .getByText("Novo comentário", { exact: false })
      .waitFor();
    const rootEl = card.locator('[data-comment-id="' + root.id + '"]');
    await rootEl
      .getByRole("button", { name: "Responder", exact: true })
      .click();
    const replyInput = card.getByLabel("Sua resposta", { exact: true });
    await replyInput.fill("Emojis ");
    const replyForm = replyInput.locator("xpath=ancestor::form");
    await replyForm.getByLabel("Selecionar emoji").click();
    await replyForm.getByLabel("Inserir 💚", { exact: true }).click();
    assert.equal(await replyInput.inputValue(), "Emojis 💚");
    await replyForm.getByLabel("Selecionar emoji").click();
    await replyForm.getByLabel("Inserir 🎉", { exact: true }).click();
    assert.equal(await replyInput.inputValue(), "Emojis 💚🎉");
    const sentReply = a.p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community/comment") &&
        r.request().method() === "POST",
    );
    await replyInput.press("Enter");
    assert.equal((await sentReply).status(), 200);
    await card
      .locator(".community-comment p")
      .getByText("Emojis 💚🎉", { exact: false })
      .waitFor();
    check(
      "Composer envia por Enter, preserva Shift+Enter e insere vários emojis nas respostas",
    );
    const now = Date.now();
    for (let i = 0; i < 8; i++)
      await db.communityComment.create({
        data: {
          postId: post.id,
          userId: owner.id,
          text: "Histórico paginado " + i,
          createdAt: new Date(now - 10000 - i * 1000),
        },
      });
    for (let i = 0; i < 5; i++)
      await db.communityComment.create({
        data: {
          postId: post.id,
          parentId: root.id,
          replyToId: root.id,
          userId: owner.id,
          text: "Resposta paginada " + i,
          createdAt: new Date(now + i * 1000),
        },
      });
    const first = await read(b, post.id),
      second = await read(b, post.id, { page: "2" });
    assert.equal(first.comments.length, 5);
    assert.equal(second.comments.length, 5);
    assert.equal(
      new Set([...first.comments, ...second.comments].map((c) => c.id)).size,
      10,
    );
    const rp1 = await read(b, post.id, { parentId: root.id }),
      rp2 = await read(b, post.id, { parentId: root.id, page: "2" });
    assert.equal(rp1.comments.length, 3);
    assert.equal(rp2.comments.length, 3);
    assert.ok(
      new Date(rp1.comments.at(-1).createdAt) <=
        new Date(rp2.comments[0].createdAt),
    );
    await a.p.reload();
    await card
      .getByRole("button", { name: "Ver mais comentários", exact: false })
      .click();
    await card.locator('[data-comment-id="' + root.id + '"]').waitFor();
    await card
      .getByRole("button", { name: "Ver mais respostas", exact: false })
      .click();
    await card
      .locator(".community-comment p")
      .getByText("Resposta paginada 0", { exact: false })
      .waitFor();
    check(
      "Paginação real de comentários e respostas preserva ordem e registros históricos",
    );
    await m.p.goto(base + "/mural?post=" + post.id);
    const modCard = m.p
      .locator("article:visible")
      .filter({ has: m.p.getByRole("heading", { name: post.title }) });
    await modCard
      .getByRole("button", { name: "Ver mais comentários", exact: false })
      .click();
    const modRoot = modCard.locator('[data-comment-id="' + root.id + '"]');
    await modRoot.getByLabel("Opções do comentário").click();
    await modRoot
      .getByRole("button", { name: "Ocultar comentário", exact: true })
      .click();
    const modal = m.p.getByRole("dialog", { name: "Moderar comentário" });
    await modal.getByLabel("Motivo da moderação").fill("Revisão temporária QA");
    await modal.getByRole("button", { name: "Confirmar moderação" }).click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await read(b, post.id, { page: "2" })).comments.some(
        (c) => c.id === root.id,
      ),
      false,
    );
    assert.equal(
      (
        await send(b, "comment-like", {
          ...fields,
          id: reply.id,
          liked: "true",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await send(b, "comment", {
          ...fields,
          replyToId: reply.id,
          text: "Proibido",
        })
      ).status,
      404,
    );
    await modRoot.getByLabel("Opções do comentário").click();
    await modRoot
      .getByRole("button", { name: "Restaurar comentário", exact: true })
      .click();
    await modal.getByLabel("Motivo da moderação").fill("Revisão concluída QA");
    await modal.getByRole("button", { name: "Confirmar moderação" }).click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await db.communityComment.findUnique({ where: { id: root.id } })).hidden,
      false,
    );
    assert.equal(
      await db.audit.count({
        where: { actorId: moderator.id, action: "MODERATE_COMMENT" },
      }),
      2,
    );
    check(
      "Moderação individual em menu e modal oculta/restaura conversa, impede interações ocultas e audita",
    );
    await ok(b, "delete-comment", { ...fields, id: reply.id });
    const deleted = await db.communityComment.findUnique({
      where: { id: reply.id },
    });
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.text, "Resposta persistida 💙");
    check(
      "Exclusão própria é lógica e preserva o conteúdo histórico no PostgreSQL",
    );
    for (const u of [owner, reader, moderator])
      await db.communityLike.create({
        data: { postId: post.id, userId: u.id },
      });
    await a.p.reload();
    await card.getByText(/e outra 1 pessoa curtiram isso/).waitFor();
    // Keep the pagination fixture in PostgreSQL; simplify only this QA screenshot.
    await db.communityComment.updateMany({
      where: {
        postId: post.id,
        OR: [
          { text: { startsWith: "Histórico paginado " } },
          { text: { startsWith: "Resposta paginada " } },
        ],
      },
      data: { hidden: true },
    });
    await a.p.reload();
    await card.locator('[data-comment-id="' + root.id + '"]').waitFor();
    await a.p.addStyleTag({ content: ".topbar {position:static!important}" });
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await a.p.setViewportSize({ width, height: 1080 });
      await card.scrollIntoViewIfNeeded();
      assert.ok(
        await a.p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width,
      );
      const image = await card
          .getByRole("button", { name: "Ampliar foto: " + post.title })
          .boundingBox(),
        text = await card
          .getByText(post.description, { exact: true })
          .boundingBox();
      assert.ok(image.y > text.y, "Foto deve estar abaixo do texto");
      if ([390, 1920].includes(width))
        await card.screenshot({
          path: ".setup/mural-social-" + width + ".png",
        });
    }
    await a.p.goto(base);
    await a.p
      .locator("article:visible")
      .filter({ has: a.p.getByRole("heading", { name: post.title }) })
      .waitFor();
    check(
      "Home e Mural compartilham post vertical, avatares reais e layout sem overflow em seis larguras",
    );
    assert.equal(await finance(), before);
    assert.equal(
      (await db.communityComment.findUnique({ where: { id: root.id } })).text,
      "Comentário histórico preservado",
    );
    check(
      "Interações sociais preservam saldos, extrato, pedidos, lotes e comentário histórico",
    );
  } finally {
    for (const c of contexts) await c.close();
  }
}
