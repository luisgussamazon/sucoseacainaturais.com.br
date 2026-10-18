import { db } from "@/lib/db";
import {
  updateProduct,
  adjustStock,
  closeMission,
  resetPassword,
} from "@/lib/actions";
import { Field } from "./ui";
export async function ProductManagement() {
  const products = await db.product.findMany({ orderBy: { name: "asc" } });
  const batches = await db.batch.findMany({
    include: { product: true },
    orderBy: { expiresAt: "asc" },
  });
  return (
    <>
      <section className="panel">
        <h2>Editar catálogo</h2>
        {products.map((p) => (
          <details className="management-details" key={p.id}>
            <summary>
              {p.name} · {p.active ? "Ativo" : "Pausado"}
            </summary>
            <form action={updateProduct} className="form-stack">
              <input type="hidden" name="productId" value={p.id} />
              {[
                { label: "Nome", name: "name", value: p.name },
                {
                  label: "Descrição",
                  name: "description",
                  value: p.description,
                },
                { label: "Categoria", name: "category", value: p.category },
                { label: "Foto HTTPS", name: "imageUrl", value: p.imageUrl },
              ].map((f) => (
                <label className="field" key={f.name}>
                  {f.label}
                  <input name={f.name} defaultValue={f.value} required />
                </label>
              ))}
              <label className="field">
                Preço
                <input
                  name="price"
                  type="number"
                  min={1}
                  max={100000}
                  defaultValue={p.price}
                  required
                />
              </label>
              <label className="field">
                Situação
                <select name="active" defaultValue={String(p.active)}>
                  <option value="true">Ativo</option>
                  <option value="false">Pausado</option>
                </select>
              </label>
              <button className="button">Salvar produto</button>
            </form>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Ajuste de estoque disponível</h2>
        <p className="muted">
          Registre perdas, avarias ou correções. Reservas já efetuadas
          permanecem vinculadas aos pedidos.
        </p>
        <form action={adjustStock} className="form-stack">
          <label className="field">
            Lote
            <select name="batchId" required>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.product.name} · {b.quantity} un.
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Variação (ex.: -2 para baixa ou 3 para entrada)"
            name="delta"
            type="number"
            min={-100000}
            max={100000}
          />
          <Field label="Motivo do ajuste" name="reason" />
          <button className="button" disabled={!batches.length}>
            Registrar movimentação
          </button>
        </form>
      </section>
    </>
  );
}
export async function CampaignManagement() {
  const missions = await db.mission.findMany({
    where: { active: true },
    orderBy: { endsAt: "asc" },
  });
  return (
    <section className="panel">
      <h2>Encerrar campanhas</h2>
      <p className="muted">
        Encerrar bloqueia novas participações e preserva as recompensas já
        distribuídas.
      </p>
      {missions.map((m) => (
        <form className="report-row" action={closeMission} key={m.id}>
          <input type="hidden" name="missionId" value={m.id} />
          <span>{m.title}</span>
          <button className="button compact">Encerrar</button>
        </form>
      ))}
    </section>
  );
}
export async function PasswordManagement({ actorId }: { actorId: string }) {
  const users = await db.user.findMany({
    where: { id: { not: actorId } },
    orderBy: { name: "asc" },
  });
  return (
    <section className="panel">
      <h2>Recuperação assistida de acesso</h2>
      <p className="muted">
        Confirme a identidade do colaborador antes de definir uma nova senha.
        Sessões existentes serão revogadas e a ação será auditada.
      </p>
      <form action={resetPassword} className="form-stack">
        <label className="field">
          Colaborador
          <select name="userId" required>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Nova senha (mín. 12 caracteres)"
          name="password"
          type="password"
        />
        <button className="button" disabled={!users.length}>
          Redefinir acesso
        </button>
      </form>
    </section>
  );
}
