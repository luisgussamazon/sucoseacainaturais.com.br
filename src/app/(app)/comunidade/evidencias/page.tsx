import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rights } from "@/lib/community";
import { communityActor } from "@/components/community-server";
import { CommunityForm, PhotoGallery } from "@/components/community-client";
import { Empty, PageTitle, date } from "@/components/ui";
export default async function Evidence({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const u = await communityActor(),
    r = rights(u);
  if (!r.review) notFound();
  const p = await searchParams;
  const status = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(
    p.status ?? "",
  )
    ? (p.status as "PENDING")
    : "PENDING";
  const q = p.q?.slice(0, 100),
    page = Math.max(1, Math.min(100, Number(p.page) || 1));
  const evidence = await db.photoEvidence.findMany({
    where: {
      status,
      photoMission: { OR: [{ reviewerId: null }, { reviewerId: u.id }] },
      ...(q
        ? {
            OR: [
              { user: { name: { contains: q, mode: "insensitive" } } },
              {
                photoMission: {
                  mission: { title: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { submittedAt: "asc" },
    take: 20,
    skip: (page - 1) * 20,
    include: {
      post: { select: { id: true } },
      user: { select: { name: true, email: true } },
      photoMission: { include: { mission: true } },
      media: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true, attempt: true },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });
  return (
    <>
      <PageTitle
        eyebrow="GESTÃO DE MISSÕES"
        title="Evidências Pendentes"
        description="Avalie as imagens antes de conceder a recompensa. A divulgação é um processo separado."
      />
      <Link href="/comunidade">← Comunidade e Eventos</Link>
      <form className="community-filters">
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="PENDING">Em análise</option>
            <option value="APPROVED">Aprovadas</option>
            <option value="REJECTED">Reprovadas</option>
            <option value="CANCELLED">Canceladas</option>
          </select>
        </label>
        <label>
          Buscar associado ou missão
          <input name="q" defaultValue={q} />
        </label>
        <button className="button">Filtrar</button>
      </form>
      {!evidence.length && (
        <Empty
          title="Nenhuma evidência nesta seleção"
          text="As participações enviadas e atribuídas a você aparecerão aqui."
        />
      )}
      {evidence.map((e) => (
        <article className="panel community-evidence" key={e.id}>
          <h2>{e.photoMission.mission.title}</h2>
          <p>
            <strong>{e.user.name}</strong> · {e.user.email}
          </p>
          <p>
            {date(e.submittedAt)}{" "}
            {e.submittedAt.toLocaleTimeString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            · {e.status} · Tentativa {e.attempts} · +
            {e.photoMission.mission.reward} Amazonitos
          </p>
          <PhotoGallery
            photos={e.media.filter((m) => m.attempt === e.attempts)}
            title={"Evidência de " + e.user.name}
          />
          {e.status === "PENDING" && e.userId !== u.id && (
            <div className="community-form-grid">
              <CommunityForm
                action="review"
                label="Aprovar e conceder recompensa"
              >
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="approved" value="true" />
              </CommunityForm>
              <CommunityForm action="review" label="Reprovar sem recompensa">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="approved" value="false" />
                <label className="field">
                  Motivo obrigatório
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
              </CommunityForm>
            </div>
          )}
          {e.status === "APPROVED" &&
            r.publish &&
            e.shareConsent &&
            !e.post && (
              <Link
                className="button secondary"
                href={"/comunidade?kind=post&evidence=" + e.id + "#editor"}
              >
                Destacar esta conquista no mural
              </Link>
            )}
          {!e.shareConsent && (
            <p className="muted">
              Sem autorização do participante para divulgação.
            </p>
          )}
          <details>
            <summary>Histórico de avaliações</summary>
            {e.reviews.map((v) => (
              <p key={v.id}>
                {v.reviewer.name} · {date(v.createdAt)} · {v.status} ·{" "}
                {v.reason}
              </p>
            ))}
          </details>
        </article>
      ))}
      <div className="community-links">
        {page > 1 && (
          <Link href={"?status=" + status + "&page=" + (page - 1)}>
            Anteriores
          </Link>
        )}
        {evidence.length === 20 && (
          <Link href={"?status=" + status + "&page=" + (page + 1)}>
            Próximas
          </Link>
        )}
      </div>
    </>
  );
}
