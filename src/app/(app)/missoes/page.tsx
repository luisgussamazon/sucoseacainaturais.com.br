import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { completeMission } from "@/lib/actions";
import { Empty, PageTitle, date, Flash } from "@/components/ui";
import { Sparkles } from "lucide-react";
export default async function Missions({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const u = await requireUser();
  const params = await searchParams;
  const missions = await db.mission.findMany({
    where: { active: true, endsAt: { gt: new Date() } },
    include: { completions: { where: { userId: u.id }, select: { id: true } } },
    orderBy: { endsAt: "asc" },
  });
  return (
    <>
      <PageTitle
        eyebrow="APRENDA. PARTICIPE. CONQUISTE."
        title="Missões e quizzes"
        description="Participe das campanhas da equipe. Cada missão concluída vale uma nova conquista."
      />
      <Flash {...params} />
      {missions.length ? (
        <div className="mission-grid">
          {missions.map((m) => (
            <article className="panel mission-card" key={m.id}>
              <div className="mission-top">
                <Sparkles />
                <span className="badge">+{m.reward} Amazonitos</span>
              </div>
              <h2>{m.title}</h2>
              <p>{m.description}</p>
              <small className="muted">Disponível até {date(m.endsAt)}</small>
              {m.completions.length ? (
                <div className="notice success">
                  Missão concluída! Recompensa recebida.
                </div>
              ) : (
                <form action={completeMission}>
                  <input type="hidden" name="missionId" value={m.id} />
                  <fieldset>
                    <legend>{m.question}</legend>
                    {(m.options as string[]).map((option, i) => (
                      <label className="radio-option" key={i}>
                        <input type="radio" name="answer" value={i} required />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                  <button className="button full">Enviar resposta</button>
                </form>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Prepare-se para a próxima missão"
          text="As campanhas e quizzes publicados pelo RH aparecerão aqui."
        />
      )}
    </>
  );
}
