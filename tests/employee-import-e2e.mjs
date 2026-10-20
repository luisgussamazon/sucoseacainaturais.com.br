import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
export async function runEmployeeImportChecks({
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
  const stamp = Date.now(),
    source = Array.from({ length: 44 }, (_, i) => ({
      name: "Pessoa CSV QA " + i,
      email: "Csv-QA-" + stamp + "-" + i + "@example.invalid",
    }));
  const csv =
    "nome,email,perfil\r\n" +
    source.map((r) => r.name + "," + r.email + ",COLABORADOR").join("\r\n") +
    "\r\nConta existente," +
    employee.email.toUpperCase() +
    ",EMPLOYEE\r\nNão elevar,role-" +
    stamp +
    "@example.invalid,ADMIN\r\nInválido,email-invalido,EMPLOYEE\r\nDuplicado," +
    source[0].email.toLowerCase() +
    ",EMPLOYEE";
  const file = (content) => ({
    name: "colaboradores-qa.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  const send = (client, action, extra = {}, content = csv, origin = base) =>
    client.post(base + "/api/admin/employee-import", {
      headers: { origin },
      multipart: { action, file: file(content), ...extra },
    });
  try {
    const old = await db.user.findMany({
        orderBy: { id: "asc" },
        include: { communityGrant: true },
      }),
      before = await db.user.count();
    assert.equal((await send(guest.request, "preview")).status(), 401);
    assert.equal((await send(e.request, "preview")).status(), 403);
    const hr = await db.user.create({
        data: {
          name: "RH QA sem autorização de importação",
          email: "hr-import-" + stamp + "@example.invalid",
          role: "HR",
          passwordHash: admin.passwordHash,
        },
      }),
      h = await actor(hr);
    assert.equal((await send(h.request, "preview")).status(), 403);
    assert.equal(
      (
        await send(a.request, "preview", {}, csv, "https://outside.invalid")
      ).status(),
      403,
    );
    check(
      "Importação exclusiva ADMIN; visitante, colaborador, RH e CSRF bloqueados",
    );
    const preview = await send(a.request, "preview"),
      d = await preview.json();
    assert.equal(preview.status(), 200);
    assert.match(preview.headers()["cache-control"], /no-store/);
    assert.equal(d.rows.filter((r) => r.status === "NEW").length, 44);
    assert.equal(d.rows.filter((r) => r.status === "EXISTS").length, 1);
    assert.equal(d.rows.filter((r) => r.status === "INVALID").length, 3);
    assert.equal(await db.user.count(), before + 1);
    assert.ok(!JSON.stringify(d).includes("temporaryPassword"));
    check(
      "Prévia mostra 44 novos, existentes e inválidos sem cadastrar contas",
    );
    assert.equal(
      (
        await send(a.request, "confirm", { token: d.token, confirmed: "false" })
      ).status(),
      400,
    );
    assert.equal(
      (
        await send(
          a.request,
          "confirm",
          { token: d.token, confirmed: "true" },
          csv + "\r\nMudou,mudou@example.invalid,EMPLOYEE",
        )
      ).status(),
      400,
    );
    check("Confirmação explícita e arquivo da prévia são obrigatórios");
    const results = await Promise.all([
      send(a.request, "confirm", { token: d.token, confirmed: "true" }),
      send(a.request, "confirm", { token: d.token, confirmed: "true" }),
    ]);
    assert.ok(results.every((r) => r.status() === 200));
    const reports = await Promise.all(results.map((r) => r.json())),
      created = reports.flatMap((r) =>
        r.rows.filter((row) => row.status === "NEW"),
      );
    assert.equal(created.length, 44);
    assert.equal(new Set(created.map((r) => r.temporaryPassword)).size, 44);
    assert.ok(created.every((r) => r.temporaryPassword.length >= 24));
    assert.ok(
      reports.every((r) =>
        r.rows
          .filter((row) => row.status !== "NEW")
          .every((row) => !row.temporaryPassword),
      ),
    );
    check(
      "Confirmações concorrentes criam 44 contas uma única vez com senhas individuais",
    );
    const persisted = await db.user.findMany({
      where: { email: { in: source.map((r) => r.email) } },
      include: { communityGrant: true },
    });
    assert.equal(persisted.length, 44);
    for (const u of persisted) {
      const input = source.find((r) => r.email === u.email);
      assert.equal(u.name, input.name);
      assert.equal(u.role, "EMPLOYEE");
      assert.equal(u.balance, 0);
      assert.equal(u.mustChangePassword, true);
      assert.equal(u.communityGrant, null);
      assert.ok(!created.some((r) => r.temporaryPassword === u.passwordHash));
    }
    for (const u of old)
      assert.deepEqual(
        await db.user.findUnique({
          where: { id: u.id },
          include: { communityGrant: true },
        }),
        u,
      );
    assert.equal(
      await db.audit.count({
        where: { actorId: admin.id, action: "IMPORT_EMPLOYEE_CSV" },
      }),
      44,
    );
    const audits = await db.audit.findMany({
      where: { action: { startsWith: "IMPORT_EMPLOYEE_CSV" } },
    });
    assert.ok(
      !created.some((c) =>
        audits.some((log) => log.details.includes(c.temporaryPassword)),
      ),
    );
    check(
      "Dados originais preservados; novos saldos zero, perfil EMPLOYEE, sem privilégios extras e com auditoria",
    );
    const temp = await browser.newContext();
    contexts.push(temp);
    const page = await temp.newPage(),
      user = created[0];
    await page.goto(base + "/login");
    await page.getByLabel("E-mail corporativo").fill(user.email.toLowerCase());
    await page
      .getByLabel("Senha", { exact: true })
      .fill(user.temporaryPassword);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await page.waitForURL("**/alterar-senha-inicial");
    assert.equal(
      (await temp.request.get(base + "/api/redemptions")).status(),
      401,
    );
    assert.equal((await send(temp.request, "preview")).status(), 401);
    await page.goto(base + "/loja");
    await page.waitForURL("**/alterar-senha-inicial");
    check(
      "Senha temporária exige troca antes de acessar loja ou APIs, inclusive com e-mail em caixa diferente",
    );
    const change = (password, confirmation, origin = base) =>
      temp.request.post(base + "/api/initial-password", {
        headers: { origin },
        data: { password, confirmation },
      });
    assert.equal(
      (await change(user.temporaryPassword, user.temporaryPassword)).status(),
      400,
    );
    assert.equal((await change("curta", "curta")).status(), 400);
    assert.equal(
      (await change("NovaSenhaTeste123", "DiferenteTeste123")).status(),
      400,
    );
    assert.equal(
      (
        await change(
          "NovaSenhaTeste123",
          "NovaSenhaTeste123",
          "https://outside.invalid",
        )
      ).status(),
      403,
    );
    const newPassword = "Nova_" + randomBytes(20).toString("base64url");
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page
      .getByLabel("Confirme a nova senha", { exact: true })
      .fill(newPassword);
    await page
      .getByRole("button", { name: "Salvar senha e entrar novamente" })
      .click();
    await page.waitForURL("**/login");
    assert.equal(
      (await db.user.findUnique({ where: { email: user.email } }))
        .mustChangePassword,
      false,
    );
    assert.equal(
      (await temp.request.get(base + "/api/redemptions")).status(),
      401,
    );
    await page.getByLabel("E-mail corporativo").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await page.waitForURL(base + "/");
    assert.equal((await send(temp.request, "preview")).status(), 403);
    check(
      "Troca valida senha, revoga sessões e permite novo login sem elevar permissões",
    );
    await a.page.goto(base + "/admin");
    const panel = a.page.getByRole("region", {
        name: "Importação de colaboradores",
      }),
      uiCsv =
        "nome,email,perfil\nPessoa UI QA,ui-" +
        stamp +
        "@example.invalid,EMPLOYEE";
    await panel.locator("input[type=file]").setInputFiles(file(uiCsv));
    await panel.getByRole("button", { name: "Gerar prévia" }).click();
    await panel
      .getByText("Prévia — nenhum cadastro realizado", { exact: true })
      .waitFor();
    await panel.getByRole("checkbox").check();
    const saved = a.page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/employee-import") &&
        r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Confirmar importação de 1 colaboradores" })
      .click();
    const savedData = await (await saved).json();
    await panel.getByText("Relatório da importação", { exact: true }).waitFor();
    const download = a.page.waitForEvent("download");
    await panel
      .getByRole("button", { name: "Baixar credenciais privadas (.csv)" })
      .click();
    await (await download).saveAs(".setup/import-credentials-qa.csv");
    assert.ok(
      readFileSync(".setup/import-credentials-qa.csv", "utf8").includes(
        savedData.rows[0].temporaryPassword,
      ),
    );
    assert.equal(
      await panel
        .getByRole("button", { name: "Baixar credenciais privadas (.csv)" })
        .isDisabled(),
      false,
    );
    await panel
      .getByRole("button", { name: "Limpar senhas desta tela" })
      .click();
    assert.equal(
      await panel
        .getByRole("button", { name: "Baixar credenciais privadas (.csv)" })
        .isDisabled(),
      true,
    );
    check(
      "Administração permite prévia, confirmação, relatório e download privado das credenciais",
    );
    for (const width of [320, 390, 768, 1920]) {
      await a.page.setViewportSize({ width, height: 1000 });
      await panel.scrollIntoViewIfNeeded();
      assert.ok(
        await a.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await a.page.screenshot({
        path: ".setup/screenshots/employee-import-" + width + ".png",
      });
    }
    check(
      "Importação responsiva em celular, tablet e desktop sem rolagem horizontal da página",
    );
  } finally {
    for (const c of contexts) await c.close();
  }
}
