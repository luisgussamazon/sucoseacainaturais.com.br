import assert from "node:assert/strict";
import sharp from "sharp";
export async function runMissionCenterChecks({
  db,
  browser,
  admin,
  login,
  check,
}) {
  const base = "http://localhost:3147",
    contexts = [];
  async function actor(u) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const p = await ctx.newPage();
    await login(p, u.email);
    return { p, ctx };
  }
  async function send(a, action, fields = {}, images = []) {
    return a.p.evaluate(
      async ({ action, fields, images }) => {
        const f = new FormData();
        Object.entries(fields).forEach(([k, v]) => f.set(k, v));
        for (const b64 of images)
          f.append(
            "photos",
            new File(
              [Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))],
              "imagem.png",
              { type: "image/png" },
            ),
          );
        const r = await fetch("/api/community/" + action, {
          method: "POST",
          body: f,
        });
        return { status: r.status, data: await r.json() };
      },
      { action, fields, images: images.map((x) => x.toString("base64")) },
    );
  }
  const owner = await db.user.create({
      data: {
        name: "Participante missões QA",
        email: "missao-" + Date.now() + "@qa.invalid",
        passwordHash: admin.passwordHash,
      },
    }),
    viewer = await db.user.create({
      data: {
        name: "Leitor missões QA",
        email: "leitor-missao-" + Date.now() + "@qa.invalid",
        passwordHash: admin.passwordHash,
      },
    });
  const now = Date.now(),
    end = new Date(now + 2 * 86400000),
    start = new Date(now - 86400000);
  // Mark pre-existing QA quizzes completed only for this new isolated participant.
  const existing = await db.mission.findMany({ where: { photoConfig: null } });
  for (const m of existing)
    await db.completion.create({ data: { userId: owner.id, missionId: m.id } });
  const previousPhotos = await db.photoMission.findMany({
    select: { id: true },
  });
  for (const pm of previousPhotos)
    await db.photoEvidence.create({
      data: { photoMissionId: pm.id, userId: owner.id, status: "APPROVED" },
    });
  const png = await sharp({
    create: { width: 800, height: 450, channels: 3, background: "#74a641" },
  })
    .png()
    .toBuffer();
  const cover = await sharp(png).webp().toBuffer();
  async function photo(title, reward, patch = {}, missionPatch = {}) {
    return db.photoMission.create({
      data: {
        category: "Sustentabilidade",
        startsAt: start,
        status: "PUBLISHED",
        maxPhotos: 2,
        participationLimit: 30,
        responsible: { connect: { id: admin.id } },
        mission: {
          create: {
            title,
            description: "Participe de uma ação autorizada da equipe de teste.",
            reward,
            question: "Foto",
            options: ["Foto"],
            answer: 0,
            endsAt: end,
            ...missionPatch,
          },
        },
        media: {
          create: {
            ownerId: admin.id,
            bytes: cover,
            width: 800,
            height: 450,
            expiresAt: end,
          },
        },
        ...patch,
      },
      include: { mission: true },
    });
  }
  const aPhoto = await photo("Atividade com foto A QA", 10),
    bPhoto = await photo("Atividade com foto B QA", 15);
  await photo("Foto futura QA", 999, { startsAt: new Date(now + 86400000) });
  await photo("Foto rascunho QA", 999, { status: "DRAFT" });
  await photo("Foto encerrada QA", 999, {}, { endsAt: new Date(now - 1000) });
  const done = await photo("Atividade já aprovada QA", 20),
    pending = await photo("Atividade pendente QA", 11);
  await db.photoEvidence.create({
    data: { photoMissionId: done.id, userId: owner.id, status: "APPROVED" },
  });
  await db.photoEvidence.create({
    data: { photoMissionId: pending.id, userId: owner.id, status: "PENDING" },
  });
  const quiz = await db.mission.create({
    data: {
      title: "Quiz ativo QA",
      description: "Teste seus conhecimentos.",
      reward: 5,
      question: "Qual opção é correta?",
      options: ["Correta", "Incorreta", "Outra"],
      answer: 0,
      endsAt: end,
    },
  });
  const quizDone = await db.mission.create({
    data: {
      title: "Quiz já concluído QA",
      description: "Histórico",
      reward: 7,
      question: "QA",
      options: ["Sim"],
      answer: 0,
      endsAt: end,
    },
  });
  await db.completion.create({
    data: { userId: owner.id, missionId: quizDone.id },
  });
  const balances = () =>
    db.user.findUniqueOrThrow({
      where: { id: owner.id },
      select: { balance: true },
    });
  const beforeLedger = await db.ledger.count({ where: { userId: owner.id } });
  const financeBefore = JSON.stringify(
    await db.$transaction([
      db.batch.findMany({ orderBy: { id: "asc" } }),
      db.order.findMany({ orderBy: { id: "asc" } }),
    ]),
  );
  try {
    const a = await actor(owner),
      b = await actor(viewer);
    await a.p.goto(base + "/missoes");
    await a.p
      .getByRole("heading", { name: aPhoto.mission.title, exact: true })
      .waitFor();
    const stats = await Promise.all(
      [
        "Envie suas evidências",
        "Teste seus conhecimentos",
        "Aguardando validação",
        "Nas atividades disponíveis",
      ].map((text) =>
        a.p
          .locator("small:visible")
          .filter({ hasText: new RegExp("^" + text + "$") })
          .locator("..")
          .locator("strong")
          .innerText(),
      ),
    );
    assert.deepEqual(stats, ["2", "1", "1", "30"]);
    for (const title of [
      "Foto futura QA",
      "Foto rascunho QA",
      "Foto encerrada QA",
      done.mission.title,
      quizDone.title,
    ])
      assert.equal(
        await a.p.getByRole("heading", { name: title, exact: true }).count(),
        0,
      );
    check(
      "Indicadores usam disponibilidade real; agendadas, encerradas, rascunhos e concluídas não ocupam a área principal",
    );
    await a.p
      .getByRole("navigation", { name: "Filtrar atividades" })
      .getByRole("link", { name: /Com foto/ })
      .click();
    await a.p
      .getByRole("heading", { name: quiz.title, exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await a.p.getByRole("heading", { name: quiz.title, exact: true }).count(),
      0,
    );
    await a.p
      .getByRole("navigation", { name: "Filtrar atividades" })
      .getByRole("link", { name: /Quizzes/ })
      .click();
    await a.p.getByRole("heading", { name: quiz.title, exact: true }).waitFor();
    await a.p
      .getByRole("navigation", { name: "Filtrar atividades" })
      .getByRole("link", { name: "Regras", exact: true })
      .click();
    await a.p
      .getByRole("heading", { name: "Regras de participação" })
      .waitFor();
    await a.p.goto(base + "/missoes?sort=recompensa");
    const section = a.p.getByRole("region", {
      name: "Missões ativas",
      exact: true,
    });
    assert.equal(
      await section.locator("article h3").first().innerText(),
      bPhoto.mission.title,
    );
    check("Abas e ordenação funcionam sobre atividades reais");
    for (const width of [320, 375, 390, 430, 768, 1920]) {
      await a.p.setViewportSize({ width, height: 1080 });
      assert.ok(
        await a.p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow " + width,
      );
      if ([390, 1920].includes(width)) {
        await a.p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await a.p.screenshot({
          path: ".setup/missions-" + width + ".png",
          fullPage: true,
        });
      }
    }
    await a.p.setViewportSize({ width: 390, height: 844 });
    const card = a.p.locator("article").filter({
      has: a.p.getByRole("heading", {
        name: aPhoto.mission.title,
        exact: true,
      }),
    });
    await card
      .getByRole("button", { name: "Enviar evidência", exact: true })
      .click();
    const dialog = a.p.getByRole("dialog", {
      name: "Enviar evidência: " + aPhoto.mission.title,
    });
    await dialog
      .getByRole("button", { name: "Adicionar fotos" })
      .click({ trial: true });
    await dialog.locator('input[type="file"]').first().setInputFiles({
      name: "evidencia.png",
      mimeType: "image/png",
      buffer: png,
    });
    await dialog.locator('img[src^="blob:"]').waitFor();
    await dialog
      .getByLabel("Legenda (opcional)")
      .fill("Nossa participação autorizada 🌱");
    await dialog.locator('input[name="safeImage"]').check();
    await dialog.locator('input[name="shareConsent"]').check();
    const response = a.p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community/submit") &&
        r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Confirmar envio" }).click();
    assert.equal((await response).status(), 200);
    await a.p
      .getByRole("status")
      .filter({ hasText: "já apareceu em Momentos VBJ2" })
      .waitFor();
    const evidence = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: { photoMissionId: aPhoto.id, userId: owner.id },
      },
      include: {
        media: true,
        moments: { include: { album: { include: { media: true } } } },
      },
    });
    assert.equal(evidence.status, "PENDING");
    assert.equal(evidence.caption, "Nossa participação autorizada 🌱");
    assert.equal(evidence.moments.length, 1);
    const album = evidence.moments[0].album;
    assert.equal(album.authorId, owner.id);
    assert.equal(album.status, "PUBLISHED");
    assert.equal(album.description, evidence.caption);
    assert.equal(
      await db.evidenceReview.count({ where: { evidenceId: evidence.id } }),
      0,
    );
    assert.equal((await balances()).balance, 0);
    assert.equal(
      await db.ledger.count({ where: { userId: owner.id } }),
      beforeLedger,
    );
    assert.equal(
      (
        await send(
          a,
          "submit",
          {
            photoMissionId: aPhoto.id,
            safeImage: "true",
            shareConsent: "true",
          },
          [png],
        )
      ).status,
      400,
    );
    assert.equal(
      await db.missionMoment.count({ where: { evidenceId: evidence.id } }),
      1,
    );
    check(
      "Upload mobile mostra prévia; legenda, autoria e vínculo persistem e publicação é automática sem aprovação nem crédito",
    );
    await b.p.goto(base + "/momentos?album=" + album.id);
    await b.p
      .getByRole("heading", { name: album.title, exact: true })
      .waitFor();
    await b.p.getByText(evidence.caption, { exact: true }).waitFor();
    assert.ok(await b.p.getByText(owner.name, { exact: false }).count());
    assert.equal(
      (
        await b.ctx.request.get(
          base + "/api/community/media/" + album.media[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await b.ctx.request.get(
          base + "/api/community/media/" + evidence.media[0].id,
        )
      ).status(),
      404,
    );
    for (const action of ["like", "comment"]) {
      const r = await send(b, action, {
        kind: "ALBUM",
        targetId: album.id,
        liked: "true",
        text: "Participação da equipe 🌱",
        requestId: crypto.randomUUID(),
      });
      assert.equal(r.status, 200, JSON.stringify(r));
    }
    const social = await b.ctx.request.get(
        base +
          "/api/community/interactions?" +
          new URLSearchParams({ kind: "ALBUM", targetId: album.id }),
      ),
      data = await social.json();
    assert.equal(data.likeCount, 1);
    assert.equal(data.commentCount, 1);
    check(
      "Momentos exibe missão, nome, data e legenda para outros autenticados; curtidas/comentários funcionam e evidência original continua privada",
    );
    const noConsent = await send(
      a,
      "submit",
      {
        photoMissionId: bPhoto.id,
        safeImage: "true",
        caption: "Legenda privada",
      },
      [png],
    );
    assert.equal(noConsent.status, 200);
    assert.match(noConsent.data.message, /privado/);
    const privateEvidence = await db.photoEvidence.findUniqueOrThrow({
      where: {
        photoMissionId_userId: { photoMissionId: bPhoto.id, userId: owner.id },
      },
      include: { media: true },
    });
    assert.equal(
      await db.missionMoment.count({
        where: { evidenceId: privateEvidence.id },
      }),
      0,
    );
    assert.equal(
      (
        await b.ctx.request.get(
          base + "/api/community/media/" + privateEvidence.media[0].id,
        )
      ).status(),
      404,
    );
    const bad = await send(
      b,
      "submit",
      { photoMissionId: aPhoto.id, safeImage: "true", shareConsent: "true" },
      [Buffer.from("not an image")],
    );
    assert.equal(bad.status, 400);
    assert.equal(
      (
        await send(
          b,
          "submit",
          { photoMissionId: aPhoto.id, shareConsent: "true" },
          [png],
        )
      ).status,
      400,
    );
    check(
      "Ausência de consentimento mantém fotos/legenda privadas e arquivos falsos ou sem declaração são rejeitados",
    );
    await a.p.goto(base + "/missoes");
    await a.p
      .locator("article")
      .filter({
        has: a.p.getByRole("heading", { name: quiz.title, exact: true }),
      })
      .getByRole("button", { name: "Responder quiz" })
      .click();
    const qDialog = a.p.getByRole("dialog", {
      name: "Responder quiz: " + quiz.title,
    });
    await qDialog.getByLabel("Correta", { exact: true }).check();
    await qDialog.getByRole("button", { name: "Enviar resposta" }).click();
    await a.p.waitForURL("**/missoes?success=1");
    assert.equal((await balances()).balance, 5);
    assert.equal(
      await db.completion.count({
        where: { missionId: quiz.id, userId: owner.id },
      }),
      1,
    );
    assert.equal(
      await a.p.getByRole("heading", { name: quiz.title, exact: true }).count(),
      0,
    );
    await a.p.goto(base + "/momentos#minhas-conquistas");
    await a.p
      .getByText("Minhas atividades concluídas e autorizações", { exact: true })
      .click();
    await a.p.getByText(quiz.title, { exact: true }).waitFor();
    assert.equal(
      await db.communityPost.count({
        where: { completionId: { not: null }, authorId: owner.id },
      }),
      0,
    );
    check(
      "Quiz correto recompensa uma única vez e concluídos ficam no histórico próprio em Momentos, sem divulgação automática de dados privados",
    );
    assert.equal(
      JSON.stringify(
        await db.$transaction([
          db.batch.findMany({ orderBy: { id: "asc" } }),
          db.order.findMany({ orderBy: { id: "asc" } }),
        ]),
      ),
      financeBefore,
    );
    check("Integração de missões preserva pedidos e estoque");
  } catch (e) {
    for (const c of contexts)
      for (const p of c.pages())
        await p
          .screenshot({
            path: ".setup/missions-failure-" + contexts.indexOf(c) + ".png",
            fullPage: true,
          })
          .catch(() => {});
    throw e;
  } finally {
    for (const c of contexts) await c.close();
  }
}
