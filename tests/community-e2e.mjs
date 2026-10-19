import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url),
  sharp = require("sharp");
export async function runCommunityChecks({
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
    e = await actor(employee);
  async function post(actor, action, fields = {}, photo) {
    const data = { ...fields };
    if (photo) data.photos = photo;
    const response = await actor.request.post(
      base + "/api/community/" + action,
      { multipart: data, headers: { origin: base } },
    );
    return { status: response.status(), data: await response.json() };
  }
  async function ok(actor, action, data, photo) {
    const r = await post(actor, action, data, photo);
    assert.equal(r.status, 200, JSON.stringify(r));
    return r;
  }
  const png = await sharp({
    create: { width: 500, height: 300, channels: 3, background: "#78a83b" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const photo = { name: "authorized.png", mimeType: "image/png", buffer: png };
  const content = {
    title: "Ação autorizada QA",
    description: "Comunicação de teste somente no banco isolado.",
    status: "PUBLISHED",
    visibility: "INTERNAL",
    category: "Ações do RH",
    publishedAt: new Date(Date.now() - 1000).toISOString(),
    imageAuthorization: "on",
    restrictedChecked: "on",
  };
  const hrUser = await db.user.create({
    data: {
      name: "RH QA comunidade",
      email: "rh-comunidade@qa.invalid",
      role: "HR",
      passwordHash: admin.passwordHash,
    },
  });
  const leaderUser = await db.user.create({
    data: {
      name: "Liderança QA",
      email: "lideranca@qa.invalid",
      passwordHash: admin.passwordHash,
    },
  });
  const otherUser = await db.user.create({
    data: {
      name: "Outro AA QA",
      email: "outro-aa@qa.invalid",
      passwordHash: admin.passwordHash,
    },
  });
  const hr = await actor(hrUser),
    leader = await actor(leaderUser),
    other = await actor(otherUser);
  try {
    assert.equal((await post(a, "post", content)).status, 403);
    assert.equal((await post(hr, "post", content)).status, 403);
    assert.equal((await post(e, "post", content)).status, 403);
    assert.equal(
      (await post(e, "grant", { userId: employee.id, publish: "on" })).status,
      403,
    );
    check(
      "Novas permissões não são automáticas; AA não publica nem concede acesso",
    );
    for (const user of [admin, hrUser, leaderUser])
      await ok(a, "grant", {
        userId: user.id,
        publish: "on",
        review: "on",
        moderate: "on",
        ...(user.id === leaderUser.id ? { leadership: "on" } : {}),
      });
    await ok(hr, "post", content, photo);
    await ok(leader, "post", {
      ...content,
      title: "Reconhecimento autorizado QA",
      category: "Reconhecimento",
    });
    assert.equal(
      (await db.user.findUnique({ where: { id: leaderUser.id } })).role,
      "EMPLOYEE",
    );
    check(
      "RH e liderança explicitamente autorizados publicam sem ampliar perfis existentes",
    );
    const pub = await db.communityPost.findFirstOrThrow({
      where: { title: content.title },
      include: { media: true },
    });
    const media = pub.media[0];
    const metadata = await sharp(Buffer.from(media.bytes)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(
      (await e.request.get(base + "/api/community/media/" + media.id)).status(),
      200,
    );
    assert.match(
      (
        await e.request.get(base + "/api/community/media/" + media.id)
      ).headers()["cache-control"],
      /private, no-store/,
    );
    check(
      "Imagem real validada, convertida, sem metadados e servida por acesso autenticado",
    );
    assert.equal(
      (
        await post(
          hr,
          "post",
          { ...content, title: "Arquivo inválido" },
          {
            name: "bad.png",
            mimeType: "image/png",
            buffer: Buffer.from("<svg><script>bad</script></svg>"),
          },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          hr,
          "post",
          { ...content, title: "Tipo inválido" },
          { name: "bad.gif", mimeType: "image/gif", buffer: png },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          hr,
          "post",
          { ...content, title: "Arquivo excessivo" },
          {
            name: "large.png",
            mimeType: "image/png",
            buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
          },
        )
      ).status,
      400,
    );
    check(
      "Uploads com conteúdo falso, tipo proibido ou tamanho excessivo são recusados",
    );
    await e.page.goto(base + "/mural");
    assert.ok(
      await e.page
        .getByRole("heading", { name: content.title, exact: true })
        .isVisible(),
    );
    await ok(
      hr,
      "post",
      { ...content, title: "Rascunho secreto QA", status: "DRAFT" },
      photo,
    );
    await ok(
      hr,
      "post",
      { ...content, title: "Apenas gestão QA", visibility: "MANAGEMENT" },
      photo,
    );
    await ok(
      hr,
      "post",
      {
        ...content,
        title: "Agendado QA",
        publishedAt: new Date(Date.now() + 86400000).toISOString(),
      },
      photo,
    );
    await e.page.reload();
    for (const title of [
      "Rascunho secreto QA",
      "Apenas gestão QA",
      "Agendado QA",
    ])
      assert.equal(
        await e.page.getByRole("heading", { name: title, exact: true }).count(),
        0,
      );
    for (const title of [
      "Rascunho secreto QA",
      "Apenas gestão QA",
      "Agendado QA",
    ]) {
      const p = await db.communityPost.findFirstOrThrow({
        where: { title },
        include: { media: true },
      });
      assert.equal(
        (
          await e.request.get(base + "/api/community/media/" + p.media[0].id)
        ).status(),
        404,
      );
    }
    check(
      "AA visualiza somente publicações e imagens publicadas, autorizadas e dentro da data",
    );
    await Promise.all([
      ok(e, "like", { postId: pub.id, liked: "true" }),
      ok(e, "like", { postId: pub.id, liked: "true" }),
    ]);
    assert.equal(
      await db.communityLike.count({
        where: { postId: pub.id, userId: employee.id },
      }),
      1,
    );
    await ok(e, "like", { postId: pub.id, liked: "false" });
    assert.equal(
      await db.communityLike.count({
        where: { postId: pub.id, userId: employee.id },
      }),
      0,
    );
    check("Curtir é idempotente e descurtir funciona sem duplicidades");
    await ok(e, "comment", {
      postId: pub.id,
      text: "Comentário de teste moderado",
    });
    const comment = await db.communityComment.findFirstOrThrow({
      where: { postId: pub.id },
    });
    assert.equal(
      (
        await post(e, "moderate", {
          id: comment.id,
          hidden: "on",
          reason: "Texto inadequado",
        })
      ).status,
      403,
    );
    await ok(hr, "moderate", {
      id: comment.id,
      hidden: "on",
      reason: "Revisão da política interna",
    });
    await e.page.reload();
    assert.equal(
      await e.page
        .getByText("Comentário de teste moderado", { exact: true })
        .count(),
      0,
    );
    await ok(hr, "moderate", {
      id: comment.id,
      hidden: "false",
      reason: "Conteúdo revisado e liberado",
    });
    check(
      "Comentários são moderados no servidor, ocultados do feed e auditados",
    );
    const badOrigin = await e.request.post(base + "/api/community/like", {
      multipart: { postId: pub.id, liked: "true" },
      headers: { origin: "https://invalid.example" },
    });
    assert.equal(badOrigin.status(), 403);
    check("APIs recusam requisições de outra origem");
    const mission = {
      title: "5S fotográfico QA",
      description: "Envie uma imagem autorizada em condição segura.",
      reward: "10",
      category: "5S",
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      maxPhotos: "3",
      participationLimit: "10",
      allowResubmit: "on",
      status: "PUBLISHED",
      visibility: "INTERNAL",
    };
    await ok(hr, "photo-mission", mission);
    const pm = await db.photoMission.findFirstOrThrow({
      where: { mission: { title: mission.title } },
      include: { mission: true },
    });
    assert.equal(
      (await post(e, "submit", { photoMissionId: pm.id, safeImage: "on" }))
        .status,
      400,
    );
    await ok(
      e,
      "submit",
      { photoMissionId: pm.id, safeImage: "on", shareConsent: "on" },
      photo,
    );
    const evidence = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: { photoMissionId: pm.id, userId: employee.id },
      },
      include: { media: true },
    });
    assert.equal(evidence.status, "PENDING");
    assert.equal(
      (
        await post(
          e,
          "submit",
          { photoMissionId: pm.id, safeImage: "on" },
          photo,
        )
      ).status,
      400,
    );
    check(
      "Missão exige foto válida e impede participação duplicada enquanto está em análise",
    );
    assert.equal(
      (
        await other.request.get(
          base + "/api/community/media/" + evidence.media[0].id,
        )
      ).status(),
      404,
    );
    assert.equal(
      (
        await e.request.get(
          base + "/api/community/media/" + evidence.media[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await hr.request.get(
          base + "/api/community/media/" + evidence.media[0].id,
        )
      ).status(),
      200,
    );
    check(
      "Evidências privadas só são acessíveis ao participante e avaliador autorizado",
    );
    assert.equal(
      (await post(e, "review", { id: evidence.id, approved: "true" })).status,
      403,
    );
    await db.mission.create({
      data: {
        title: "Quiz de isolamento QA",
        description: "Teste de preservação da rota de quiz",
        reward: 1,
        question: "Questão de validação",
        options: ["Sim", "Não", "Outro"],
        answer: 0,
        endsAt: new Date(Date.now() + 86400000),
      },
    });
    await e.page.goto(base + "/missoes");
    const quizCard = e.page.locator(".mission-card:visible").filter({
      has: e.page.getByRole("heading", {
        name: "Quiz de isolamento QA",
        exact: true,
      }),
    });
    await quizCard
      .locator("input[name=missionId]")
      .evaluate((el, id) => (el.value = id), pm.missionId);
    await quizCard.locator('input[name=answer][value="0"]').check();
    await quizCard.getByRole("button", { name: "Enviar resposta" }).click();
    await e.page.waitForURL("**/missoes?error=mission");
    assert.equal(
      await db.completion.count({
        where: { userId: employee.id, missionId: pm.missionId },
      }),
      0,
    );
    check(
      "Endpoint de quiz antigo não permite contornar a evidência fotográfica",
    );
    const balance = (
      await db.user.findUniqueOrThrow({ where: { id: employee.id } })
    ).balance;
    await Promise.all([
      ok(hr, "review", { id: evidence.id, approved: "true" }),
      ok(a, "review", { id: evidence.id, approved: "true" }),
    ]);
    await ok(hr, "review", { id: evidence.id, approved: "true" });
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
      balance + 10,
    );
    assert.equal(
      await db.completion.count({
        where: { userId: employee.id, missionId: pm.missionId },
      }),
      1,
    );
    assert.equal(
      await db.ledger.count({
        where: { userId: employee.id, description: { contains: evidence.id } },
      }),
      1,
    );
    assert.equal(
      await db.evidenceReview.count({
        where: { evidenceId: evidence.id, status: "APPROVED" },
      }),
      1,
    );
    assert.equal(
      await db.communityPost.count({ where: { evidenceId: evidence.id } }),
      0,
    );
    check(
      "Aprovações simultâneas e repetidas creditam uma única vez com origem no extrato",
    );
    assert.equal(
      (
        await post(hr, "post", {
          ...content,
          title: "Destaque sem revisão",
          evidenceId: evidence.id,
          restrictedChecked: "false",
        })
      ).status,
      400,
    );
    await ok(hr, "post", {
      ...content,
      title: "Destaque revisado QA",
      category: "Reconhecimento",
      evidenceId: evidence.id,
    });
    const highlight = await db.communityPost.findUniqueOrThrow({
      where: { evidenceId: evidence.id },
      include: { media: true },
    });
    assert.equal(highlight.media.length, 1);
    assert.notEqual(highlight.media[0].id, evidence.media[0].id);
    assert.equal(
      (
        await other.request.get(
          base + "/api/community/media/" + highlight.media[0].id,
        )
      ).status(),
      200,
    );
    check(
      "Destaque exige consentimento, revisão e ação administrativa; evidência original continua privada",
    );
    await ok(
      other,
      "submit",
      { photoMissionId: pm.id, safeImage: "on" },
      photo,
    );
    const rejected = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: { photoMissionId: pm.id, userId: otherUser.id },
      },
    });
    await ok(hr, "review", {
      id: rejected.id,
      approved: "false",
      reason: "A imagem não atende às instruções",
    });
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: otherUser.id } }))
        .balance,
      0,
    );
    await ok(
      other,
      "submit",
      { photoMissionId: pm.id, safeImage: "on" },
      photo,
    );
    assert.equal(
      (await db.photoEvidence.findUniqueOrThrow({ where: { id: rejected.id } }))
        .attempts,
      2,
    );
    await ok(hr, "review", {
      id: rejected.id,
      approved: "false",
      reason: "A segunda imagem não atende às instruções",
    });
    await db.mission.update({
      where: { id: pm.missionId },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    assert.equal(
      (
        await post(
          other,
          "submit",
          { photoMissionId: pm.id, safeImage: "on" },
          photo,
        )
      ).status,
      400,
    );
    check(
      "Reprovação não credita moedas; reenvio respeita a política e o prazo",
    );
    await ok(hr, "photo-mission", {
      ...mission,
      title: "Missão sem divulgação QA",
      allowResubmit: "false",
    });
    const privateMission = await db.photoMission.findFirstOrThrow({
      where: { mission: { title: "Missão sem divulgação QA" } },
    });
    await ok(
      other,
      "submit",
      { photoMissionId: privateMission.id, safeImage: "on" },
      photo,
    );
    const privateEvidence = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: {
          photoMissionId: privateMission.id,
          userId: otherUser.id,
        },
      },
    });
    await ok(hr, "review", { id: privateEvidence.id, approved: "true" });
    assert.equal(
      (
        await post(hr, "post", {
          ...content,
          title: "Sem consentimento",
          evidenceId: privateEvidence.id,
        })
      ).status,
      400,
    );
    check(
      "Aprovar recompensa sem consentimento nunca autoriza publicação no mural",
    );
    await ok(hr, "event", {
      title: "Encontro QA",
      description: "Evento apenas no banco de teste.",
      location: "Sala QA",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      status: "PUBLISHED",
      visibility: "INTERNAL",
    });
    await ok(
      hr,
      "album",
      {
        title: "Momentos QA",
        description: "Álbum autorizado no teste isolado.",
        eventDate: new Date().toISOString(),
        status: "PUBLISHED",
        visibility: "INTERNAL",
        imageAuthorization: "on",
        restrictedChecked: "on",
      },
      photo,
    );
    await other.page.goto(base + "/momentos");
    assert.ok(
      await other.page
        .getByRole("heading", { name: "Momentos QA", exact: true })
        .isVisible(),
    );
    await other.page
      .getByRole("button", { name: "Abrir fotos: Momentos QA" })
      .click();
    await other.page
      .getByRole("button", { name: "Próxima", exact: true })
      .click();
    await other.page.keyboard.press("Escape");
    check(
      "Álbuns e eventos publicados funcionam com galeria ampliada e teclado",
    );
    // Test the actual responsive pages with real isolated records, including management.
    for (const width of [320, 375, 390, 768, 1366, 1920]) {
      await e.page.setViewportSize({ width, height: 900 });
      await a.page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/mural", "/momentos", "/missoes"]) {
        await e.page.goto(base + route);
        await e.page
          .getByRole("heading", {
            level: 1,
            name:
              route === "/"
                ? "Bem-vindo ao SSD VBJ2!"
                : route === "/mural"
                  ? "Mural SSD VBJ2"
                  : route === "/momentos"
                    ? "Momentos VBJ2"
                    : "Missões e quizzes",
            exact: true,
          })
          .waitFor();
        await e.page.waitForLoadState("networkidle");
        assert.ok(
          await e.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " overflow at " + width,
        );
      }
      for (const route of [
        "/comunidade",
        "/comunidade?kind=album",
        "/comunidade?kind=photo-mission",
        "/comunidade?kind=access",
        "/comunidade/evidencias",
      ]) {
        await a.page.goto(base + route);
        await a.page
          .getByRole("heading", {
            level: 1,
            name: route.includes("evidencias")
              ? "Evidências Pendentes"
              : "Comunidade e Eventos",
            exact: true,
          })
          .waitFor();
        await a.page.waitForLoadState("networkidle");
        assert.ok(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " overflow at " + width,
        );
      }
      await e.page.goto(base + "/");
      await e.page
        .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", exact: true })
        .waitFor();
      await e.page.waitForLoadState("networkidle");
      await e.page.screenshot({
        path: ".setup/screenshots/community-" + width + ".png",
        fullPage: true,
      });
      check(
        "Mural, galeria, missões e gestão sem rolagem horizontal em " +
          width +
          "px",
      );
    }
    await e.page.goto(base + "/missoes");
    await e.page
      .getByRole("heading", { name: "Missões com foto", exact: true })
      .waitFor();
    const expired = await db.communityMedia.create({
      data: {
        ownerId: admin.id,
        bytes: Buffer.from(media.bytes),
        width: media.width,
        height: media.height,
        postId: pub.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    assert.equal(
      (
        await e.request.get(base + "/api/community/media/" + expired.id)
      ).status(),
      404,
    );
    await ok(a, "purge");
    assert.equal(
      await db.communityMedia.count({ where: { id: expired.id } }),
      0,
    );
    assert.ok(await db.communityMedia.findUnique({ where: { id: media.id } }));
    check(
      "Retenção bloqueia fotos expiradas e limpeza controlada preserva fotos válidas e histórico",
    );
    await e.page.goto(base + "/mural");
    await e.page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await e.page.evaluate(async () => {
      const paths = [];
      for (const name of await caches.keys())
        for (const req of await (await caches.open(name)).keys())
          paths.push(new URL(req.url).pathname);
      return paths;
    });
    assert.ok(
      cached.every(
        (p) =>
          p === "/offline.html" ||
          p === "/brand.svg" ||
          p.startsWith("/icons/"),
      ),
    );
    assert.ok(!cached.some((p) => p.includes("/api/community")));
    await e.context.setOffline(true);
    await e.page.goto(base + "/mural");
    await e.page
      .getByRole("heading", { name: "Vamos nos reconectar?" })
      .waitFor();
    assert.equal(
      await e.page.getByText(content.title, { exact: true }).count(),
      0,
    );
    await e.context.setOffline(false);
    check(
      "PWA nunca armazena fotos privadas, publicações autenticadas ou dados de carteira",
    );
  } finally {
    for (const context of contexts) await context.close();
  }
}
