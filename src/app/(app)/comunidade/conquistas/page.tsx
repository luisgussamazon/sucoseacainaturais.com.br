import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { rights } from "@/lib/community";
import { communityActor } from "@/components/community-server";
import { PhotoGallery } from "@/components/community-client";
import { PageTitle, Empty, date } from "@/components/ui";
export default async function Achievements({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  const u = await communityActor();
  if (!rights(u).recognize) notFound();
  const p = await searchParams,
    q = p.q?.slice(0, 100) ?? "",
    page = Math.max(1, Math.min(100, Number(p.page) || 1)),
    waiting = p.state !== "ALL";
  const completions = await db.completion.findMany({
    where: {
      ...(waiting
        ? {
            OR: [
              { recognitionPost: null },
              { recognitionPost: { status: { not: "PUBLISHED" } } },
              { recognitionPost: { publishedAt: { gt: new Date() } } },
            ],
          }
        : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { user: { name: { contains: q, mode: "insensitive" } } },
                  { mission: { title: { contains: q, mode: "insensitive" } } },
                ],
              },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { name: true } },
      mission: { include: { photoConfig: { select: { id: true } } } },
      recognitionPost: {
        select: { id: true, status: true, publishedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    skip: (page - 1) * 30,
  });
  const pairs = completions
    .filter((c) => c.mission.photoConfig)
    .map((c) => ({
      userId: c.userId,
      photoMissionId: c.mission.photoConfig!.id,
    }));
  const evidence = pairs.length
    ? await db.photoEvidence.findMany({
        where: { OR: pairs },
        include: {
          post: { select: { id: true, status: true, publishedAt: true } },
          media: {
            where: { expiresAt: { gt: new Date() } },
            select: { id: true, attempt: true },
          },
        },
      })
    : [];
  return (
    <>
      <PageTitle
        eyebrow="RECONHECIMENTO"
        title="Conquistas aguardando publicação"
        description="Localize conclusões antigas e recentes. Publicar reconhecimentos não altera saldo nem concede moedas novamente."
      />
      <Link href="/comunidade">← Comunidade e Eventos</Link>
      <form className="community-filters">
        <label>
          Buscar missão ou associado
          <input name="q" defaultValue={q} />
        </label>
        <label>
          Status de publicação
          <select name="state" defaultValue={waiting ? "WAITING" : "ALL"}>
            <option value="WAITING">Aguardando publicação</option>
            <option value="ALL">Todas as conquistas</option>
          </select>
        </label>
        <button className="button">Filtrar</button>
      </form>
      {!completions.length && (
        <Empty
          title="Nenhuma conquista nesta seleção"
          text="Conclusões registradas de quizzes e missões fotográficas serão listadas aqui."
        />
      )}
      {completions.map((c) => {
        const e = evidence.find(
            (e) =>
              e.userId === c.userId &&
              e.photoMissionId === c.mission.photoConfig?.id,
          ),
          post = c.recognitionPost ?? e?.post;
        return (
          <article className="panel community-evidence" key={c.id}>
            <h2>{c.mission.title}</h2>
            <p>
              {c.user.name} · Conclusão em {date(c.createdAt)} ·{" "}
              {c.mission.reward} Amazonitos
            </p>
            <p>
              Identificação:{" "}
              {c.recognitionConsent
                ? "autorizada pelo associado"
                : "não autorizada; use reconhecimento coletivo"}
              .
            </p>
            {e && (
              <>
                <p>
                  Evidência: {e.status} · Imagem:{" "}
                  {e.shareConsent
                    ? "divulgação autorizada pelo participante"
                    : "sem autorização para divulgar"}
                  .
                </p>
                {e.status === "APPROVED" && e.shareConsent && (
                  <PhotoGallery
                    photos={e.media.filter((m) => m.attempt === e.attempts)}
                    title="Evidência aprovada e consentida"
                    srcPrefix="/api/community/recognition/"
                  />
                )}
              </>
            )}
            {!e && (
              <p>
                Conclusão de quiz ou missão anterior, sem evidência fotográfica
                vinculada.
              </p>
            )}
            <p>
              Publicação:{" "}
              {post
                ? post.status === "PUBLISHED" && post.publishedAt > new Date()
                  ? "Agendada"
                  : post.status
                : "Não criada"}
              .
            </p>
            <Link
              className="button"
              href={
                post
                  ? "/comunidade?kind=recognition&id=" + post.id + "#editor"
                  : "/comunidade?kind=recognition&completion=" +
                    c.id +
                    "#editor"
              }
            >
              {post
                ? "Editar reconhecimento existente"
                : "Publicar conquista no mural"}
            </Link>
            <small>
              Sem consentimento de identificação ou imagem, publique somente
              reconhecimento coletivo sem dados pessoais.
            </small>
          </article>
        );
      })}
      <div className="community-links">
        {page > 1 && (
          <Link
            href={
              "?state=" +
              (waiting ? "WAITING" : "ALL") +
              "&page=" +
              (page - 1) +
              "&q=" +
              encodeURIComponent(q)
            }
          >
            Anteriores
          </Link>
        )}
        {completions.length === 30 && (
          <Link
            href={
              "?state=" +
              (waiting ? "WAITING" : "ALL") +
              "&page=" +
              (page + 1) +
              "&q=" +
              encodeURIComponent(q)
            }
          >
            Próximas
          </Link>
        )}
      </div>
    </>
  );
}
