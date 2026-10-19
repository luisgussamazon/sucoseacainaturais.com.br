import assert from "node:assert/strict";
export async function runHomeCardChecks({
  db,
  browser,
  admin,
  employee,
  login,
  check,
}) {
  const contexts = [];
  async function actor(user) {
    const c = await browser.newContext();
    contexts.push(c);
    const p = await c.newPage();
    await login(p, user.email);
    return p;
  }
  const tables = [
    "user",
    "product",
    "batch",
    "order",
    "ledger",
    "mission",
    "completion",
    "communityPost",
    "communityEvent",
    "communityAlbum",
    "communityMedia",
    "photoEvidence",
  ];
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(tables.map(async (t) => [t, await db[t].count()])),
    );
  try {
    const post = await db.communityPost.create({
      data: {
        title: "Reconhecimento preservado no mural QA",
        description: "Publicação real de teste que deve continuar no mural",
        category: "Reconhecimento",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        authorId: admin.id,
      },
    });
    const event = await db.communityEvent.create({
      data: {
        title: "Evento preservado no cadastro QA",
        description: "Registro usado somente no banco isolado",
        location: "Unidade QA",
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
        status: "PUBLISHED",
        visibility: "INTERNAL",
        authorId: admin.id,
      },
    });
    const before = await snapshot(),
      e = await actor(employee);
    const base = "http://localhost:3147";
    for (const width of [320, 375, 390, 768, 1366, 1920]) {
      await e.setViewportSize({ width, height: 1000 });
      await e.goto(base + "/");
      await e
        .getByRole("heading", { name: "Bem-vindo ao SSD VBJ2!", exact: true })
        .waitFor();
      assert.equal(
        await e.locator(".home-events,.home-recognition").count(),
        0,
      );
      const aside = e.locator(
        ".home-community-layout:visible > .community-aside",
      );
      assert.deepEqual(await aside.locator("h2").allTextContents(), [
        "Missões disponíveis",
        "Seu próximo passo",
      ]);
      assert.equal(await aside.locator(":scope > section").count(), 2);
      assert.equal(
        await e.locator(".stats-grid:visible .stat-card").count(),
        4,
      );
      const hero = await e.locator(".hero:visible").boundingBox(),
        stats = await e.locator(".stats-grid:visible").boundingBox();
      assert.ok(hero.y < stats.y);
      await e
        .getByRole("heading", { name: "Mural SSD VBJ2", exact: true })
        .waitFor();
      await e
        .getByRole("heading", { name: "Momentos VBJ2", exact: true })
        .waitFor();
      const main = await e
          .locator(".home-community-layout:visible > .community-main")
          .boundingBox(),
        side = await aside.boundingBox();
      if (width >= 1366) {
        assert.ok(side.width <= 301);
        assert.ok(main.width > side.width);
      } else if (width <= 768) {
        assert.ok(side.y > main.y);
      }
      assert.ok(
        await e.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await e.screenshot({
        path: ".setup/screenshots/home-without-cards-" + width + ".png",
        fullPage: true,
      });
    }
    check(
      "Visão Geral sem os dois cards, containers vazios ou overflow nas seis larguras; capa, quatro indicadores, mural, Momentos e missões preservados",
    );
    await e.goto(base + "/mural?post=" + post.id);
    await e.getByRole("heading", { name: post.title, exact: true }).waitFor();
    assert.equal(
      (await db.communityPost.findUniqueOrThrow({ where: { id: post.id } }))
        .category,
      "Reconhecimento",
    );
    check(
      "Reconhecimento registrado continua disponível no mural com suas interações",
    );
    const a = await actor(admin);
    await a.goto(base + "/comunidade?kind=event");
    await a
      .getByRole("heading", { name: "Criar evento", exact: true })
      .waitFor();
    await a.getByText(event.title, { exact: true }).waitFor();
    await a.goto(base + "/comunidade/conquistas");
    await a
      .getByRole("heading", {
        name: "Conquistas aguardando publicação",
        exact: true,
      })
      .waitFor();
    check(
      "Cadastro de eventos e fila de conquistas continuam acessíveis pelas permissões existentes",
    );
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await db.communityEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .title,
      event.title,
    );
    check(
      "Remover os cards não altera registros de eventos, publicações, fotos, conclusões, saldo, produtos ou pedidos",
    );
  } finally {
    for (const c of contexts) await c.close();
  }
}
