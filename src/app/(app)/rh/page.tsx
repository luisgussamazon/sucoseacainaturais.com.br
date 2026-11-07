import { communityActor } from "@/components/community-server";
import { rights } from "@/lib/community";
import { CampaignManagement } from "@/components/management";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { grantCoins } from "@/lib/actions";
import { PageTitle, Stats, Field, number } from "@/components/ui";
export default async function HR() {
  await requireRole(["HR", "ADMIN"]);
  const canMissions = rights(await communityActor()).missions;
  const [users, missions, completed, credits] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.mission.count({ where: { active: true, endsAt: { gt: new Date() } } }),
    db.completion.count(),
    db.ledger.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="CULTURA DE RECONHECIMENTO"
        title="Conceder Amazonitos"
        description="Reconheça as contribuições da equipe concedendo Amazonitos com motivo e registro de auditoria."
      />
      <Stats
        items={[
          {
            label: "Colaboradores ativos",
            value: number(users.length),
            detail: "Pessoas participantes",
          },
          {
            label: "Moedas creditadas",
            value: number(credits._sum.amount ?? 0),
            detail: "Inclui concessões, missões e estornos",
          },
          {
            label: "Campanhas ativas",
            value: number(missions),
            detail: "Disponíveis para participação",
          },
          {
            label: "Participações",
            value: number(completed),
            detail: "Missões concluídas",
          },
        ]}
      />
      <div style={{ maxWidth: 760 }}>
        <section className="panel">
          <h2>Conceder Amazonitos</h2>
          <p className="muted">
            Todo crédito gera uma movimentação e um registro de auditoria.
          </p>
          <form action={grantCoins} className="form-stack">
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
              label="Quantidade de Amazonitos"
              name="amount"
              type="number"
              min={1}
              max={100000}
            />
            <Field
              label="Motivo do reconhecimento"
              name="description"
              placeholder="Ex.: participação na campanha de segurança"
            />
            <button className="button">Confirmar concessão</button>
          </form>
        </section>
      </div>
      {canMissions && <CampaignManagement />}
    </>
  );
}
