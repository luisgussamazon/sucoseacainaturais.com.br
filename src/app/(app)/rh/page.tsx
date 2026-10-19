import { communityActor } from "@/components/community-server";
import { rights } from "@/lib/community";
import { CampaignManagement } from "@/components/management";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { grantCoins, createMission } from "@/lib/actions";
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
        title="Pessoas e campanhas"
        description="Reconheça contribuições e crie oportunidades de participação para a equipe."
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
      <div className="management-grid">
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
        {canMissions && (
          <section className="panel">
            <h2>Publicar campanha ou quiz</h2>
            <form action={createMission} className="form-stack">
              <Field label="Título da missão" name="title" />
              <Field label="Descrição da campanha" name="description" />
              <div className="form-two">
                <Field
                  label="Recompensa"
                  name="reward"
                  type="number"
                  min={1}
                  max={100000}
                />
                <Field
                  label="Encerramento"
                  name="endsAt"
                  type="datetime-local"
                />
              </div>
              <Field label="Pergunta do quiz" name="question" />
              {[0, 1, 2].map((i) => (
                <Field
                  label={`Alternativa ${i + 1}`}
                  name={`option${i}`}
                  key={i}
                />
              ))}
              <label className="field">
                Resposta correta
                <select name="answer">
                  <option value="0">Alternativa 1</option>
                  <option value="1">Alternativa 2</option>
                  <option value="2">Alternativa 3</option>
                </select>
              </label>
              <button className="button">Publicar missão</button>
            </form>
          </section>
        )}
      </div>
      {canMissions && <CampaignManagement />}
    </>
  );
}
