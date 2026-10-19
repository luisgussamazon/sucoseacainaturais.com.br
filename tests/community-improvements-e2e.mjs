import assert from "node:assert/strict";
import sharp from "sharp";
export async function runImprovementChecks({
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
    return { page, context, request: context.request };
  }
  async function send(actor, action, fields = {}, photos = []) {
    const response = await actor.page.evaluate(
      async ({ action, fields, photos }) => {
        const f = new FormData();
        Object.entries(fields).forEach(([k, v]) => f.set(k, v));
        for (const [i, b64] of photos.entries()) {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          f.append(
            "photos",
            new File([bytes], "photo" + i + ".png", { type: "image/png" }),
          );
        }
        const r = await fetch("/api/community/" + action, {
          method: "POST",
          body: f,
        });
        return { status: r.status, data: await r.json() };
      },
      { action, fields, photos: photos.map((p) => p.toString("base64")) },
    );
    return response;
  }
  async function ok(actor, action, fields = {}, photos = []) {
    const r = await send(actor, action, fields, photos);
    assert.equal(r.status, 200, JSON.stringify(r));
    return r.data;
  }
  const flags = {
    publish: "on",
    photos: "on",
    albums: "on",
    events: "on",
    missions: "on",
    recognize: "on",
    review: "on",
    moderate: "on",
  };
  const png = await sharp({
      create: { width: 640, height: 420, channels: 3, background: "#ff9900" },
    })
      .png()
      .toBuffer(),
    png2 = await sharp({
      create: { width: 400, height: 400, channels: 3, background: "#78a83b" },
    })
      .png()
      .toBuffer();
  const a = await actor(admin),
    e = await actor(employee),
    genericUser = await db.user.create({
      data: {
        name: "Usuário operacional QA",
        email: "individual@qa.invalid",
        passwordHash: admin.passwordHash,
      },
    }),
    hrUser = await db.user.create({
      data: {
        name: "RH sem concessões QA",
        email: "rh-sem-grants@qa.invalid",
        role: "HR",
        passwordHash: admin.passwordHash,
      },
    });
  const g = await actor(genericUser),
    hr = await actor(hrUser);
  const content = {
    title: "Publicação da operação QA",
    description: "Publicação autorizada criada no banco isolado.",
    category: "Comunicados",
    publishedAt: new Date(Date.now() - 1000).toISOString(),
    status: "PUBLISHED",
    imageAuthorization: "on",
    restrictedChecked: "on",
  };
  try {
    await ok(a, "grant", { userId: genericUser.id, ...flags });
    assert.equal(
      (
        await db.communityGrant.findUniqueOrThrow({
          where: { userId: genericUser.id },
        })
      ).leadership,
      false,
    );
    assert.equal((await send(hr, "post", content, [png])).status, 403);
    await ok(g, "post", content, [png]);
    await g.page.goto(base + "/comunidade");
    await g.page
      .getByRole("heading", { name: "Comunidade e Eventos", level: 1 })
      .waitFor();
    await g.page.locator(".community-tools summary:visible").click();
    await g.page
      .getByRole("link", { name: "Gerenciar fotos", exact: true })
      .waitFor();
    check(
      "Usuário comum autorizado publica fotos sem cargo ou liderança; RH sem permissão é recusado",
    );
    await ok(a, "grant", { userId: genericUser.id });
    assert.equal(
      (await send(g, "post", { ...content, title: "Não deve publicar" }, [png]))
        .status,
      403,
    );
    await g.page.goto(base + "/");
    await g.page
      .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", level: 1 })
      .waitFor();
    assert.equal(
      await g.page.locator('.sidebar a[href="/comunidade"]:visible').count(),
      0,
    );
    await ok(a, "grant", { userId: genericUser.id, ...flags });
    await g.page.reload();
    await g.page.locator('.sidebar a[href="/comunidade"]:visible').waitFor();
    check(
      "Conceder e revogar permissões atualiza API e menu sem exigir novo login",
    );
    // Every newly published entry has the same authenticated audience even if legacy clients submit a visibility value.
    await ok(g, "post", {
      ...content,
      title: "Publicação para todos QA",
      visibility: "MANAGEMENT",
    });
    const allPost = await db.communityPost.findFirstOrThrow({
      where: { title: "Publicação para todos QA" },
    });
    assert.equal(allPost.visibility, "INTERNAL");
    await e.page.goto(base + "/mural");
    await e.page
      .getByRole("heading", { name: "Publicação para todos QA", exact: true })
      .waitFor();
    check(
      "Todas as novas publicações publicadas são visíveis a todos; seletor de público foi removido",
    );
    await g.page.goto(base + "/comunidade?kind=post");
    await g.page
      .getByRole("heading", { name: "Comunidade e Eventos", level: 1 })
      .waitFor();
    assert.equal(await g.page.locator("[name=visibility]").count(), 0);
    assert.equal(
      await g.page.locator("#editor:visible select[name=category]").count(),
      1,
    );
    assert.equal(
      await g.page
        .locator("#editor:visible select[name=status] option[value=SCHEDULED]")
        .count(),
      1,
    );
    await g.page.goto(base + "/comunidade?kind=photo-mission");
    await g.page
      .getByRole("combobox", { name: "Categoria da missão" })
      .waitFor();
    assert.equal(
      await g.page.locator("#editor:visible select[name=reviewerId]").count(),
      1,
    );
    assert.equal(
      await g.page
        .getByRole("combobox", { name: "Tipo de missão" })
        .inputValue(),
      "photo-mission",
    );
    await g.page
      .getByRole("combobox", { name: "Tipo de missão" })
      .selectOption("quiz-mission");
    await g.page.waitForURL("**/comunidade?kind=quiz-mission");
    await g.page.getByLabel("Pergunta", { exact: true }).waitFor();
    check(
      "Categorias, tipos de missão, status agendado e responsáveis usam seletores funcionais",
    );
    // Exercise the real photo picker, remove/order/cover controls and upload progress.
    await g.page.goto(base + "/comunidade?kind=album");
    await g.page
      .getByRole("heading", { name: "Criar álbum", exact: true })
      .waitFor();
    const form = g.page.locator("#editor:visible form");
    await form
      .getByLabel("Título", { exact: true })
      .fill("Álbum com seleção QA");
    await form
      .getByLabel("Descrição", { exact: true })
      .fill("Álbum criado pelo seletor real com duas fotografias autorizadas.");
    await form.locator("select[name=status]").selectOption("PUBLISHED");
    await form.getByLabel("Categoria do álbum").selectOption("Eventos");
    const file = (n) => ({
      name: n + ".png",
      mimeType: "image/png",
      buffer: n === "verde" ? png2 : png,
    });
    await form
      .getByLabel("Selecionar fotos da galeria", { exact: true })
      .setInputFiles([file("laranja"), file("verde"), file("extra")]);
    assert.equal(await form.locator(".selected-photo").count(), 3);
    await form
      .getByRole("button", { name: "Remover foto 3", exact: true })
      .click();
    await form
      .getByRole("button", { name: "Mover foto 2 para antes", exact: true })
      .click();
    await form
      .locator(".selected-photo")
      .nth(0)
      .getByRole("button", { name: "Escolher capa", exact: true })
      .click();
    await form
      .locator(".selected-photo")
      .nth(1)
      .getByRole("button", { name: "Escolher capa", exact: true })
      .click();
    await form
      .getByLabel("Confirmo autorização válida para uso de todas as imagens.")
      .check();
    await form
      .getByLabel("Revisei a ausência de informações restritas.")
      .check();
    await form
      .getByRole("button", { name: "Salvar conteúdo", exact: true })
      .click();
    await g.page.waitForURL(/kind=album&id=/);
    const album = await db.communityAlbum.findFirstOrThrow({
      where: { title: "Álbum com seleção QA" },
      include: { media: { orderBy: { position: "asc" } } },
    });
    assert.equal(album.media.length, 2);
    assert.equal(album.media[1].cover, true);
    assert.equal(album.media[0].width, 400);
    assert.equal(album.media[1].width, 640);
    check(
      "Upload múltiplo real permite remover, ordenar e escolher capa; imagens e ordem persistem",
    );
    await ok(
      g,
      "append-photos",
      {
        kind: "ALBUM",
        targetId: album.id,
        imageAuthorization: "on",
        restrictedChecked: "on",
        coverIndex: "0",
      },
      [png2],
    );
    assert.equal(
      await db.communityMedia.count({ where: { albumId: album.id } }),
      3,
    );
    await ok(g, "append-photos", {
      kind: "ALBUM",
      targetId: album.id,
      coverId: album.media[0].id,
      imageAuthorization: "on",
      restrictedChecked: "on",
    });
    assert.equal(
      await db.communityMedia.count({
        where: { albumId: album.id, cover: true },
      }),
      1,
    );
    assert.equal(
      (
        await db.communityMedia.findUniqueOrThrow({
          where: { id: album.media[0].id },
        })
      ).cover,
      true,
    );
    check(
      "Fotos são acrescentadas a álbum existente sem recriá-lo, e a capa pode ser alterada",
    );
    await e.page.goto(base + "/momentos?album=" + album.id);
    await e.page
      .getByRole("heading", { name: album.title, exact: true })
      .waitFor();
    const albumSocial = e.page.getByRole("region", {
      name: "Interações do álbum",
      exact: true,
    });
    await albumSocial
      .getByRole("button", { name: "♡ Curtir", exact: true })
      .click();
    await albumSocial.getByText("1 curtidas", { exact: true }).waitFor();
    await albumSocial.getByRole("button", { name: /Comentar/ }).click();
    await albumSocial
      .getByLabel("Seu comentário")
      .fill("Comentário imediato no álbum");
    await albumSocial
      .getByRole("button", { name: "Enviar comentário", exact: true })
      .click();
    await albumSocial
      .getByText("Comentário imediato no álbum", { exact: true })
      .waitFor();
    check("Álbum permite curtida e comentário imediato por qualquer associado");
    await e.page
      .getByRole("button", { name: "Abrir fotos: " + album.title, exact: true })
      .click();
    const modal = e.page.getByRole("dialog", {
      name: "Galeria: " + album.title,
      exact: true,
    });
    const photoSocial = modal.getByRole("region", {
      name: "Interações da fotografia",
      exact: true,
    });
    await photoSocial
      .getByRole("button", { name: "♡ Curtir", exact: true })
      .click();
    await photoSocial.getByText("1 curtidas", { exact: true }).waitFor();
    await photoSocial.getByRole("button", { name: /Comentar/ }).click();
    await photoSocial
      .getByLabel("Seu comentário")
      .fill("Comentário exclusivo desta fotografia");
    await photoSocial
      .getByRole("button", { name: "Enviar comentário", exact: true })
      .click();
    await photoSocial
      .getByText("Comentário exclusivo desta fotografia", { exact: true })
      .waitFor();
    await modal.getByRole("button", { name: "Próxima", exact: true }).click();
    const next = modal.getByRole("region", {
      name: "Interações da fotografia",
      exact: true,
    });
    await next.getByRole("button", { name: "♡ Curtir", exact: true }).waitFor();
    await next.getByText("0 curtidas", { exact: true }).waitFor();
    assert.equal(
      await next
        .getByText("Comentário exclusivo desta fotografia", { exact: true })
        .count(),
      0,
    );
    await modal
      .getByRole("button", { name: "Fechar galeria", exact: true })
      .click();
    check(
      "Cada foto ampliada tem curtidas e comentários próprios, separados do álbum e de outras fotos",
    );
    const targetPhoto = album.media[0];
    await Promise.all([
      ok(e, "like", { kind: "PHOTO", targetId: targetPhoto.id, liked: "true" }),
      ok(e, "like", { kind: "PHOTO", targetId: targetPhoto.id, liked: "true" }),
    ]);
    const thread = await db.communityThread.findUniqueOrThrow({
      where: { mediaId: targetPhoto.id },
    });
    assert.equal(
      await db.mediaLike.count({
        where: { threadId: thread.id, userId: employee.id },
      }),
      1,
    );
    await ok(e, "like", {
      kind: "PHOTO",
      targetId: targetPhoto.id,
      liked: "false",
    });
    assert.equal(
      await db.mediaLike.count({
        where: { threadId: thread.id, userId: employee.id },
      }),
      0,
    );
    check("Curtidas de fotos são idempotentes e permitem descurtir");
    const own = await db.mediaComment.findFirstOrThrow({
      where: { userId: employee.id, thread: { albumId: album.id } },
    });
    assert.equal(
      (await send(g, "delete-comment", { kind: "ALBUM", id: own.id })).status,
      403,
    );
    await ok(e, "delete-comment", { kind: "ALBUM", id: own.id });
    assert.ok(
      (await db.mediaComment.findUniqueOrThrow({ where: { id: own.id } }))
        .deletedAt,
    );
    const photoComment = await db.mediaComment.findFirstOrThrow({
      where: { text: "Comentário exclusivo desta fotografia" },
    });
    await ok(g, "moderate", {
      kind: "PHOTO",
      id: photoComment.id,
      hidden: "true",
      reason: "Revisão autorizada no teste",
    });
    assert.ok(
      (
        await db.mediaComment.findUniqueOrThrow({
          where: { id: photoComment.id },
        })
      ).hidden,
    );
    check(
      "Associado exclui apenas seus próprios comentários; moderador autorizado oculta comentários de fotos",
    );
    // Old completed quiz is recognized without identity or photos and without a new reward.
    const legacy = await db.completion.findFirstOrThrow({
      where: { userId: employee.id, mission: { photoConfig: null } },
      include: { mission: true },
    });
    const balance = (
        await db.user.findUniqueOrThrow({ where: { id: employee.id } })
      ).balance,
      ledgerCount = await db.ledger.count();
    await g.page.goto(base + "/comunidade/conquistas");
    await g.page
      .getByRole("heading", {
        name: "Conquistas aguardando publicação",
        exact: true,
      })
      .waitFor();
    await g.page
      .getByRole("heading", { name: legacy.mission.title, exact: true })
      .waitFor();
    const recognition = {
      ...content,
      title: "Conquista antiga coletiva QA",
      category: "Reconhecimento",
      completionId: legacy.id,
      recognitionAuthorization: "on",
    };
    await ok(g, "post", recognition);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
      balance,
    );
    assert.equal(await db.ledger.count(), ledgerCount);
    assert.equal(
      (await send(g, "post", { ...recognition, title: "Duplicação bloqueada" }))
        .status,
      400,
    );
    assert.equal(
      await db.communityPost.count({ where: { completionId: legacy.id } }),
      1,
    );
    check(
      "Conquistas antigas de quizzes são localizadas e publicadas uma única vez, sem novo crédito",
    );
    const otherCompletion = await db.completion.findFirstOrThrow({
      where: { userId: employee.id, mission: { photoConfig: { isNot: null } } },
      include: { mission: { include: { photoConfig: true } } },
    });
    const ev = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: {
          photoMissionId: otherCompletion.mission.photoConfig.id,
          userId: employee.id,
        },
      },
      include: { media: true },
    });
    assert.equal(
      (
        await e.request.get(
          base + "/api/community/recognition/" + ev.media[0].id,
        )
      ).status(),
      403,
    );
    assert.equal(
      (
        await g.request.get(
          base + "/api/community/recognition/" + ev.media[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await send(e, "comment", {
          kind: "PHOTO",
          targetId: ev.media[0].id,
          text: "Não deve comentar evidência",
        })
      ).status,
      404,
    );
    check(
      "Evidências privadas não possuem interações públicas; prévia de reconhecimento exige permissão e consentimento",
    );
    await db.mission.create({
      data: {
        title: "Quiz para consentimento QA",
        description: "Somente teste de autorização",
        reward: 1,
        question: "Questão QA",
        options: ["A", "B", "C"],
        answer: 0,
        endsAt: new Date(Date.now() + 86400000),
      },
    });
    const mc = await db.mission.findFirstOrThrow({
      where: { title: "Quiz para consentimento QA" },
    });
    const c = await db.completion.create({
      data: { userId: employee.id, missionId: mc.id },
    });
    assert.equal(
      (
        await send(g, "post", {
          ...recognition,
          title: "Identificação sem consentimento",
          completionId: c.id,
          identify: "on",
        })
      ).status,
      400,
    );
    await ok(e, "consent-recognition", { id: c.id, consent: "on" });
    await ok(g, "post", {
      ...recognition,
      title: "Identificação autorizada QA",
      completionId: c.id,
      identify: "on",
    });
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
      balance,
    );
    check(
      "Identificação pessoal exige consentimento do próprio associado, separado de imagens e saldo",
    );
    await ok(
      g,
      "event",
      {
        title: "Evento com fotos QA",
        description: "Evento autorizado com galeria no banco isolado.",
        location: "Sala de equipe QA",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        status: "PUBLISHED",
        imageAuthorization: "on",
        restrictedChecked: "on",
      },
      [png],
    );
    const event = await db.communityEvent.findFirstOrThrow({
      where: { title: "Evento com fotos QA" },
      include: { media: true },
    });
    assert.equal(event.media.length, 1);
    assert.equal(
      (
        await e.request.get(base + "/api/community/media/" + event.media[0].id)
      ).status(),
      200,
    );
    check(
      "Eventos recebem fotografias pelo mesmo componente e mantêm acesso autenticado",
    );
    // Check loaded, real pages and ordering at every requested width.
    for (const width of [320, 375, 390, 768, 1366, 1920]) {
      await e.page.setViewportSize({ width, height: 900 });
      await g.page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/mural", "/momentos", "/missoes"]) {
        await e.page.goto(base + route);
        await e.page.locator("main h1:visible").waitFor();
        await e.page.waitForLoadState("networkidle");
        assert.ok(
          await e.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " at " + width,
        );
      }
      for (const route of [
        "/comunidade?kind=post",
        "/comunidade?kind=album",
        "/comunidade?kind=event",
        "/comunidade?kind=photo-mission",
        "/comunidade?kind=photos",
        "/comunidade/conquistas",
      ]) {
        await g.page.goto(base + route);
        await g.page.locator("main h1:visible").waitFor();
        await g.page.waitForLoadState("networkidle");
        assert.ok(
          await g.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " at " + width,
        );
      }
      await e.page.goto(base + "/");
      await e.page
        .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", exact: true })
        .waitFor();
      await e.page.waitForLoadState("networkidle");
      assert.equal(
        await e.page.locator(".hero-scene").getAttribute("src"),
        "/images/amazonitos-hero.webp",
      );
      assert.equal(await e.page.locator(".product-card").count(), 0);
      assert.equal(
        await e.page
          .getByText("Boas escolhas, por menos Amazonitos", { exact: true })
          .count(),
        0,
      );
      assert.equal(await e.page.locator(".stats-grid .stat-card").count(), 4);
      assert.ok(
        await e.page
          .locator(".hero")
          .evaluate(
            (el) =>
              !!(
                el.compareDocumentPosition(
                  document.querySelector(".stats-grid"),
                ) & Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
      );
      assert.ok(
        await e.page
          .locator(".community-feed")
          .evaluate(
            (el) =>
              !!(
                el.compareDocumentPosition(
                  document.querySelector(".community-moments"),
                ) & Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
      );
      await e.page
        .getByRole("heading", { name: "Álbum com seleção QA", exact: true })
        .waitFor();
      await e.page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 75));
        }
        scrollTo(0, 0);
      });
      await e.page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll('img[src^="/api/community/media/"]'),
        )
          .filter((img) => img.getClientRects().length > 0)
          .every((img) => img.complete && img.naturalWidth > 0),
      );
      await e.page.screenshot({
        path: ".setup/screenshots/improvements-" + width + ".png",
        fullPage: true,
      });
      check(
        "Capa → indicadores → mural → Momentos, sem produtos ou overflow, em " +
          width +
          "px",
      );
    }
    await e.page.goto(base + "/loja");
    await e.page.locator(".product-card:visible").waitFor();
    assert.ok((await db.product.count()) > 0);
    check(
      "Produtos permanecem na loja; dados de estoque, saldo e histórico preservados",
    );
  } catch (error) {
    await g.page
      .screenshot({
        path: ".setup/screenshots/improvements-failure.png",
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}
