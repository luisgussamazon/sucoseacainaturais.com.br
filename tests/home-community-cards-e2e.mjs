import assert from "node:assert/strict";
import sharp from "sharp";
export async function runHomeCardChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const contexts = [];
  const base = "http://localhost:3147";
  async function actor(user) {
    const c = await browser.newContext();
    contexts.push(c);
    const page = await c.newPage();
    await login(page, user.email);
    return page;
  }
  async function send(page, action, fields) {
    return page.evaluate(
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
  try {
    const a = await actor(admin);
    const operator = await db.user.create({
      data: {
        name: "Gestor individual QA",
        email: "home-cards@qa.invalid",
        passwordHash: admin.passwordHash,
      },
    });
    const g = await actor(operator),
      e = await actor(employee);
    assert.equal(
      (
        await send(a, "grant", {
          userId: operator.id,
          events: "on",
          photos: "on",
          publish: "on",
          recognize: "on",
        })
      ).status,
      200,
    );
    await g.goto(base + "/comunidade");
    await g
      .locator(".community-quick-actions:visible")
      .getByRole("link", { name: "Cadastrar evento", exact: true })
      .click();
    await g
      .getByRole("heading", { name: "Criar evento", exact: true })
      .waitFor();
    const form = g.locator("#editor:visible form");
    const now = Date.now(),
      near = new Date(now + 7200000),
      far = new Date(now + 172800000);
    const iso = (d) =>
      new Date(d.getTime() - 10800000).toISOString().slice(0, 16);
    await form.locator("[name=title]").fill("Evento próximo QA");
    await form
      .locator("[name=description]")
      .fill("Encontro real do teste isolado com imagem autorizada");
    await form.locator("[name=status]").selectOption("PUBLISHED");
    await form.locator("[name=location]").fill("Unidade QA");
    await form.locator("[name=startsAt]").fill(iso(near));
    await form
      .locator("[name=endsAt]")
      .fill(iso(new Date(near.getTime() + 3600000)));
    const png = await sharp({
      create: { width: 500, height: 300, channels: 3, background: "#ff9900" },
    })
      .png()
      .toBuffer();
    await form
      .getByLabel("Selecionar fotos da galeria", { exact: true })
      .setInputFiles({
        name: "evento.png",
        mimeType: "image/png",
        buffer: png,
      });
    await form.locator("[name=imageAuthorization]").check();
    await form.locator("[name=restrictedChecked]").check();
    await form
      .getByRole("button", { name: "Salvar conteúdo", exact: true })
      .click();
    await g.waitForURL(/kind=event&id=/);
    const event = await db.communityEvent.findFirstOrThrow({
      where: { title: "Evento próximo QA" },
      include: { media: true },
    });
    assert.equal(event.media.length, 1);
    check(
      "Cadastro de eventos acessível a colaborador com permissão individual, incluindo data, horário e foto",
    );
    const common = {
      description: "Evento usado apenas no banco isolado",
      location: "Unidade QA",
      authorId: operator.id,
      startsAt: far,
      endsAt: new Date(far.getTime() + 3600000),
      status: "PUBLISHED",
      visibility: "INTERNAL",
    };
    await db.communityEvent.create({
      data: { ...common, title: "Evento distante QA" },
    });
    const draft = await db.communityEvent.create({
      data: { ...common, title: "Evento rascunho QA", status: "DRAFT" },
    });
    await db.communityEvent.create({
      data: { ...common, title: "Evento privado QA", visibility: "MANAGEMENT" },
    });
    await db.communityEvent.create({
      data: {
        ...common,
        title: "Evento encerrado QA",
        startsAt: new Date(now - 7200000),
        endsAt: new Date(now - 3600000),
      },
    });
    await e.goto(base + "/");
    const card = e.locator(".home-events:visible");
    await card
      .getByRole("link", { name: "Evento próximo QA", exact: true })
      .waitFor();
    const titles = await card.locator(".home-card-title").allTextContents();
    assert.ok(
      titles.indexOf("Evento próximo QA") <
        titles.indexOf("Evento distante QA"),
    );
    for (const title of [
      "Evento rascunho QA",
      "Evento privado QA",
      "Evento encerrado QA",
    ])
      assert.ok(!titles.includes(title));
    assert.equal(
      await card
        .getByRole("link", { name: "Cadastrar evento", exact: true })
        .count(),
      0,
    );
    await card
      .getByRole("link", { name: "Evento próximo QA", exact: true })
      .click();
    await e
      .getByRole("heading", { name: "Evento próximo QA", exact: true })
      .waitFor();
    await e.getByText("Início (Brasília)", { exact: true }).waitFor();
    const photo = e.locator(".event-details .gallery-cover img");
    await photo.scrollIntoViewIfNeeded();
    await e.waitForFunction(
      () => document.querySelector(".event-details img")?.naturalWidth > 0,
    );
    const privateResponse = await e.request.get(base + "/eventos/" + draft.id);
    const privateBody = await privateResponse.text();
    assert.ok([200, 404].includes(privateResponse.status()));
    assert.ok(!privateBody.includes(draft.title));
    assert.match(privateBody, /404|NEXT_HTTP_ERROR_FALLBACK/);
    check(
      "Eventos publicados aparecem por proximidade para todos; detalhes exibem horário e foto, rascunhos e privados são protegidos",
    );
    await e.goto(base + "/");
    const historicMission = await db.mission.create({
      data: {
        title: "Missão histórica do card QA",
        description: "Conclusão anterior usada apenas no teste isolado",
        question: "Pergunta de QA",
        options: ["A", "B"],
        answer: 0,
        reward: 10,
        endsAt: new Date(now - 86400000),
      },
    });
    const completion = await db.completion.create({
      data: {
        userId: employee.id,
        missionId: historicMission.id,
        createdAt: new Date(now - 2592000000),
      },
      include: { mission: true },
    });
    const before = {
      ledger: await db.ledger.count(),
      balance: (await db.user.findUniqueOrThrow({ where: { id: employee.id } }))
        .balance,
    };
    await g.goto(base + "/comunidade/conquistas");
    await g
      .getByRole("heading", { name: completion.mission.title, exact: true })
      .waitFor();
    const recognition = {
      title: "Conquista antiga no card QA",
      description:
        "Reconhecimento coletivo autorizado, sem identificação nem evidência privada",
      category: "Comunicados",
      status: "PUBLISHED",
      publishedAt: new Date().toISOString(),
      completionId: completion.id,
      recognitionAuthorization: "on",
    };
    assert.equal((await send(g, "post", recognition)).status, 200);
    await e
      .locator(".home-recognition:visible")
      .getByRole("link", { name: /Conquista antiga no card QA/ })
      .waitFor({ timeout: 25000 });
    assert.equal((await send(g, "post", recognition)).status, 400);
    assert.equal(await db.ledger.count(), before.ledger);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: employee.id } })).balance,
      before.balance,
    );
    check(
      "Conquista antiga autorizada entra no Reconhecimento sem recarregar e sem duplicar créditos ou publicar evidência privada",
    );
    const normal = {
      title: "Reconhecimento editorial QA",
      description: "Publicação editorial de reconhecimento autorizada",
      category: "Reconhecimento",
      status: "PUBLISHED",
      publishedAt: new Date().toISOString(),
    };
    assert.equal((await send(g, "post", normal)).status, 200);
    await e
      .locator(".home-recognition:visible")
      .getByRole("link", { name: /Reconhecimento editorial QA/ })
      .waitFor({ timeout: 25000 });
    await e
      .locator(".home-recognition:visible")
      .getByRole("link", { name: /Conquista antiga no card QA/ })
      .click();
    await e.waitForURL(/mural\?post=/);
    await e
      .getByRole("heading", {
        name: "Conquista antiga no card QA",
        exact: true,
      })
      .waitFor();
    check(
      "Reconhecimento editorial e conquista vinculada abrem a publicação específica",
    );
    await e.goto(base + "/");
    const fields = {
      title: "Evento atualizado sem reload QA",
      description: "Novo evento publicado em outra sessão",
      location: "Unidade QA",
      status: "PUBLISHED",
      startsAt: new Date(now + 10800000).toISOString(),
      endsAt: new Date(now + 14400000).toISOString(),
    };
    assert.equal((await send(g, "event", fields)).status, 200);
    await e
      .locator(".home-events:visible")
      .getByRole("link", { name: fields.title, exact: true })
      .waitFor({ timeout: 25000 });
    check(
      "Novo evento aparece automaticamente na Visão Geral de outro usuário",
    );
    for (const width of [390, 1366]) {
      await e.setViewportSize({ width, height: 900 });
      await e.goto(base + "/");
      await e.locator(".home-events:visible").waitFor();
      assert.ok(
        await e.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await e.screenshot({
        path: ".setup/screenshots/home-cards-" + width + ".png",
        fullPage: true,
      });
    }
    check("Cards e navegação de detalhes validados em desktop e celular");
  } finally {
    for (const c of contexts) await c.close();
  }
}
