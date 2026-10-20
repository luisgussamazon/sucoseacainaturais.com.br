import Link from "next/link";
import { db } from "@/lib/db";
import { PageTitle, Flash, Empty, date } from "@/components/ui";
import { communityActor } from "@/components/community-server";
import { CommunityForm } from "@/components/community-client";
import {
  MissionActivity,
  MissionFeedback,
} from "@/components/mission-activity";
import {
  Target,
  CircleHelp,
  Clock,
  Diamond,
  Lightbulb,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import styles from "@/components/missions.module.css";
export default async function Missions({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    tab?: string;
    sort?: string;
  }>;
}) {
  const u = await communityActor(),
    params = await searchParams,
    now = new Date();
  const tab = ["ativas", "foto", "quizzes", "regras"].includes(params.tab ?? "")
    ? params.tab!
    : "ativas";
  const sort = ["titulo", "prazo", "recompensa"].includes(params.sort ?? "")
    ? params.sort!
    : "prazo";
  const [photoMissions, quizzes, pending] = await Promise.all([
    db.photoMission.findMany({
      where: {
        status: "PUBLISHED",
        startsAt: { lte: now },
        mission: { active: true, endsAt: { gt: now } },
      },
      include: {
        mission: true,
        media: {
          where: { expiresAt: { gt: now } },
          select: { id: true },
          orderBy: [{ cover: "desc" }, { position: "asc" }],
          take: 1,
        },
        evidence: { where: { userId: u.id }, select: { status: true } },
        _count: { select: { evidence: true } },
      },
    }),
    db.mission.findMany({
      where: {
        active: true,
        endsAt: { gt: now },
        photoConfig: null,
        completions: { none: { userId: u.id } },
      },
    }),
    db.photoEvidence.findMany({
      where: { userId: u.id, status: "PENDING" },
      include: {
        photoMission: { include: { mission: { select: { title: true } } } },
      },
      orderBy: { submittedAt: "desc" },
    }),
  ]);
  const photos = photoMissions.filter((p) =>
    p.evidence.length
      ? p.evidence[0].status === "REJECTED" && p.allowResubmit
      : p._count.evidence < p.participationLimit,
  );
  const ordered = <
    T extends { id: string; title: string; endsAt: Date; reward: number },
  >(
    items: T[],
  ) =>
    [...items].sort((a, b) =>
      sort === "prazo"
        ? a.endsAt.getTime() - b.endsAt.getTime()
        : sort === "recompensa"
          ? b.reward - a.reward
          : a.title.localeCompare(b.title, "pt-BR"),
    );
  const upcoming = [...photos.map((p) => p.mission), ...quizzes]
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
    .slice(0, 3);
  const rewards =
    photos.reduce((n, p) => n + p.mission.reward, 0) +
    quizzes.reduce((n, q) => n + q.reward, 0);
  const url = (value: string) => "/missoes?tab=" + value + "&sort=" + sort;
  return (
    <>
      <PageTitle
        eyebrow="APRENDA. PARTICIPE. CONQUISTE."
        title="Missões e quizzes"
        description="Participe das campanhas da equipe, envie suas evidências, responda aos quizzes e acumule Amazonitos."
      />
      <Flash {...params} />
      <MissionFeedback />
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.stats}>
            {[
              {
                label: "Missões ativas",
                value: photos.length,
                text: "Envie suas evidências",
                Icon: Target,
              },
              {
                label: "Quizzes ativos",
                value: quizzes.length,
                text: "Teste seus conhecimentos",
                Icon: CircleHelp,
              },
              {
                label: "Em análise",
                value: pending.length,
                text: "Aguardando validação",
                Icon: Clock,
              },
              {
                label: "Amazonitos possíveis",
                value: rewards,
                text: "Nas atividades disponíveis",
                Icon: Diamond,
              },
            ].map(({ label, value, text, Icon }) => (
              <div className={styles.stat} key={label}>
                <span className={styles.icon}>
                  <Icon size={24} />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{text}</small>
                </div>
              </div>
            ))}
          </div>
          <nav className={styles.tabs} aria-label="Filtrar atividades">
            {[
              {
                value: "ativas",
                label: "Ativas",
                count: photos.length + quizzes.length,
              },
              { value: "foto", label: "Com foto", count: photos.length },
              { value: "quizzes", label: "Quizzes", count: quizzes.length },
              { value: "regras", label: "Regras" },
            ].map((t) => (
              <Link
                key={t.value}
                href={url(t.value)}
                aria-current={tab === t.value ? "page" : undefined}
              >
                {t.label}
                {t.count !== undefined ? " (" + t.count + ")" : ""}
              </Link>
            ))}
          </nav>
          {tab !== "regras" && (
            <form className={styles.sort}>
              <input type="hidden" name="tab" value={tab} />
              <label>
                Ordenar por{" "}
                <select name="sort" defaultValue={sort}>
                  <option value="titulo">Nome (A–Z)</option>
                  <option value="prazo">Prazo mais próximo</option>
                  <option value="recompensa">Maior recompensa</option>
                </select>
              </label>
              <button className="button secondary">Ordenar</button>
            </form>
          )}
          {(tab === "ativas" || tab === "foto") && (
            <section className={styles.section} aria-label="Missões ativas">
              <div className={styles.heading}>
                <div>
                  <h2>
                    <Target size={24} /> Missões ativas
                  </h2>
                  <p className={styles.muted}>
                    Participe das missões, envie suas evidências e acumule
                    Amazonitos.
                  </p>
                </div>
              </div>
              {photos.length ? (
                <div className={styles.grid}>
                  {ordered(
                    photos.map((p) => ({ ...p.mission, config: p })),
                  ).map((m) => (
                    <MissionActivity
                      key={m.id}
                      id={m.id}
                      title={m.title}
                      description={m.description}
                      reward={m.reward}
                      endsAt={m.endsAt.toISOString()}
                      photo={{
                        id: m.config.id,
                        maxPhotos: m.config.maxPhotos,
                        coverId: m.config.media[0]?.id,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Nenhuma missão com foto disponível"
                  text="Novas atividades aparecerão aqui quando forem publicadas."
                />
              )}
            </section>
          )}
          {(tab === "ativas" || tab === "quizzes") && (
            <section className={styles.section} aria-label="Quizzes ativos">
              <div className={styles.heading}>
                <div>
                  <h2>Quizzes ativos</h2>
                  <p className={styles.muted}>
                    Responda aos quizzes e teste seus conhecimentos. Cada acerto
                    vale Amazonitos.
                  </p>
                </div>
              </div>
              {quizzes.length ? (
                <div className={styles.grid}>
                  {ordered(quizzes).map((q) => (
                    <MissionActivity
                      key={q.id}
                      id={q.id}
                      title={q.title}
                      description={q.description}
                      reward={q.reward}
                      endsAt={q.endsAt.toISOString()}
                      quiz={{
                        question: q.question,
                        options: q.options as string[],
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Nenhum quiz disponível"
                  text="Você verá novos quizzes aqui quando forem publicados."
                />
              )}
            </section>
          )}
          {tab === "regras" && (
            <section className={styles.support}>
              <h2>Regras de participação</h2>
              <p>
                Participe dentro do prazo e respeite o limite de fotografias.
                Evidências passam por avaliação antes da concessão da
                recompensa. Quizzes concedem a recompensa uma única vez, após
                resposta correta.
              </p>
              <p>
                Com sua autorização explícita, as fotos, a legenda e seu nome
                são publicados automaticamente em Momentos VBJ2, sem aprovação
                manual. Essa publicação não indica aprovação da recompensa. Sem
                autorização, as evidências ficam privadas.
              </p>
              <p>
                Não envie informações confidenciais ou imagens de pessoas sem
                autorização. Amazonitos são moedas fictícias, sem valor
                monetário real.
              </p>
              <Link href="/momentos">
                Ver participações e conquistas em Momentos VBJ2 →
              </Link>
            </section>
          )}
          {pending.length > 0 && (
            <details className={styles.history}>
              <summary>Participações em análise ({pending.length})</summary>
              {pending.map((e) => (
                <div key={e.id}>
                  {e.photoMission.mission.title} · Enviada em{" "}
                  {date(e.submittedAt)} · Recompensa aguardando validação
                  <CommunityForm action="cancel" label="Cancelar participação">
                    <input type="hidden" name="id" value={e.id} />
                  </CommunityForm>
                </div>
              ))}
            </details>
          )}
          <p className={styles.muted}>
            Suas atividades concluídas e autorizações estão em{" "}
            <Link href="/momentos#minhas-conquistas">Momentos VBJ2</Link>.
          </p>
        </div>
        <aside className={styles.aside}>
          <section className={styles.support}>
            <h2>
              <Lightbulb size={20} /> Como funciona?
            </h2>
            <ol>
              <li>Participe das missões e quizzes.</li>
              <li>Envie suas evidências.</li>
              <li>Acumule Amazonitos após a validação.</li>
              <li>Troque por recompensas.</li>
            </ol>
            <Link href={url("regras")}>Ver regras completas →</Link>
          </section>
          <section className={styles.support}>
            <h2>Boas práticas</h2>
            <ul>
              {[
                "Envie apenas fotos reais e autorizadas.",
                "Mantenha um bom enquadramento e qualidade.",
                "Respeite os prazos da missão.",
                "Siga as orientações de cada atividade.",
                "Evite informações confidenciais nas imagens.",
              ].map((t) => (
                <li key={t}>
                  <CheckCircle2 size={15} /> {t}
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.support}>
            <h2>
              <CalendarDays size={20} /> Próximos prazos
            </h2>
            {upcoming.length ? (
              upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={url("ativas") + "#atividade-" + m.id}
                  className={styles.deadline}
                >
                  <small>{date(m.endsAt)}</small>
                  <strong>{m.title}</strong>
                  <span className={styles.reward}>+{m.reward} Amazonitos</span>
                </Link>
              ))
            ) : (
              <p className={styles.muted}>
                Não há prazos de atividades disponíveis.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
