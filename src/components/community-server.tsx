import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  publishedWhere,
  rights,
  photoGuidance,
  type Actor,
} from "@/lib/community";
import { CommunityForm, PhotoGallery, PhotoUpload } from "./community-client";
import { Empty, date } from "./ui";
export async function communityActor() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return db.user.findUniqueOrThrow({
    where: { id: u.id },
    include: { communityGrant: true },
  });
}
const photoSelect = () => ({
  where: { expiresAt: { gt: new Date() } },
  select: { id: true },
  orderBy: [{ cover: "desc" as const }, { createdAt: "asc" as const }],
});
export async function CommunityFeed({
  user,
  page = 1,
  category,
  q,
}: {
  user: Actor;
  page?: number;
  category?: string;
  q?: string;
}) {
  const pageHref = (n: number) =>
    "/mural?" +
    new URLSearchParams({
      page: String(n),
      ...(category ? { category } : {}),
      ...(q ? { q } : {}),
    }).toString();
  const where = {
    ...publishedWhere(user),
    publishedAt: { lte: new Date() },
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const posts = await db.communityPost.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 10,
    skip: (page - 1) * 10,
    include: {
      author: { select: { name: true } },
      media: photoSelect(),
      _count: { select: { likes: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
      comments: {
        where: { hidden: false },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
  return (
    <section aria-label="Mural de ações e eventos" className="community-feed">
      <div className="section-heading">
        <h2>Mural SSD VBJ2</h2>
        <Link href="/momentos">Momentos VBJ2 →</Link>
      </div>
      {!posts.length && (
        <Empty
          title="Nossa próxima conquista começa aqui"
          text="As ações, comunicados e reconhecimentos publicados pela equipe aparecerão neste mural."
        />
      )}
      {posts.map((p) => (
        <article className="panel community-post" key={p.id}>
          <div className="community-post-meta">
            <span className="badge">{p.category}</span>
            <small>
              {p.pinned ? "📌 Fixado · " : ""}
              {date(p.publishedAt)}
            </small>
          </div>
          <h2>{p.title}</h2>
          <small className="muted">Publicado por {p.author.name}</small>
          <p className="community-text">{p.description}</p>
          <PhotoGallery photos={p.media} title={p.title} />
          {p.albumId && (
            <Link href={"/momentos?album=" + p.albumId}>
              Ver álbum associado →
            </Link>
          )}
          <div className="post-interactions">
            <CommunityForm
              action="like"
              label={p.likes.length ? "Descurtir" : "Curtir"}
            >
              <input type="hidden" name="postId" value={p.id} />
              <input
                type="hidden"
                name="liked"
                value={p.likes.length ? "false" : "true"}
              />
            </CommunityForm>
            <span>{p._count.likes} curtidas</span>
          </div>
          <details>
            <summary>Comentários</summary>
            {p.comments.length === 0 && (
              <p className="muted">Seja a primeira pessoa a comentar.</p>
            )}
            {p.comments.map((c) => (
              <div className="community-comment" key={c.id}>
                <strong>{c.user.name}</strong>
                <small>{date(c.createdAt)}</small>
                <p>{c.text}</p>
              </div>
            ))}
            {p.comments.length === 20 && (
              <p className="muted">Exibindo os 20 comentários mais recentes.</p>
            )}
            <CommunityForm action="comment" label="Comentar" reset>
              <input type="hidden" name="postId" value={p.id} />
              <label className="field">
                Seu comentário
                <textarea name="text" required maxLength={1000} />
              </label>
            </CommunityForm>
          </details>
        </article>
      ))}
      <div className="community-links">
        {page > 1 && <Link href={pageHref(page - 1)}>← Anteriores</Link>}
        {posts.length === 10 && (
          <Link href={pageHref(page + 1)}>Mais publicações →</Link>
        )}
      </div>
    </section>
  );
}
export async function CommunityAside({ user }: { user: Actor }) {
  const now = new Date();
  const [missions, events, recognition] = await Promise.all([
    db.mission.findMany({
      where: {
        active: true,
        endsAt: { gt: now },
        completions: { none: { userId: user.id } },
        OR: [
          { photoConfig: null },
          { photoConfig: { status: "PUBLISHED", startsAt: { lte: now } } },
        ],
      },
      orderBy: { endsAt: "asc" },
      take: 4,
      include: { photoConfig: { select: { id: true, media: photoSelect() } } },
    }),
    db.communityEvent.findMany({
      where: { ...publishedWhere(user), endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    db.communityPost.findMany({
      where: {
        ...publishedWhere(user),
        category: "Reconhecimento",
        publishedAt: { lte: now },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
  ]);
  return (
    <aside className="community-aside">
      <section className="panel">
        <h2>Missões disponíveis</h2>
        {!missions.length && (
          <p className="muted">
            Novas missões aparecerão aqui quando publicadas.
          </p>
        )}
        {missions.map((m) => (
          <Link className="community-mini" href="/missoes" key={m.id}>
            {m.photoConfig?.media[0] && (
              <img
                src={"/api/community/media/" + m.photoConfig.media[0].id}
                alt="Capa da missão"
              />
            )}
            <strong>{m.title}</strong>
            <span>
              {m.photoConfig ? "📷 Missão com foto" : "Quiz"} · +{m.reward}{" "}
              Amazonitos
            </span>
            <small>Até {date(m.endsAt)}</small>
          </Link>
        ))}
      </section>
      <section className="panel">
        <h2>Próximos eventos</h2>
        {!events.length && (
          <p className="muted">Nenhum evento publicado para este período.</p>
        )}
        {events.map((e) => (
          <div className="community-mini" key={e.id}>
            <strong>{e.title}</strong>
            <span>
              {date(e.startsAt)} · {e.location}
            </span>
            <p>{e.description}</p>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Reconhecimento</h2>
        {!recognition.length && (
          <p className="muted">
            As conquistas reconhecidas pela equipe aparecerão aqui.
          </p>
        )}
        {recognition.map((p) => (
          <Link
            className="community-mini"
            href="/mural?category=Reconhecimento"
            key={p.id}
          >
            {p.title}
          </Link>
        ))}
      </section>
      <section className="panel">
        <h2>Seu próximo passo</h2>
        <div className="community-links">
          <Link className="button" href="/loja">
            Explorar a loja
          </Link>
          <Link className="button secondary" href="/carteira">
            Minha carteira
          </Link>
        </div>
      </section>
      {(rights(user).publish ||
        rights(user).review ||
        rights(user).moderate ||
        rights(user).manage) && (
        <Link className="button secondary" href="/comunidade">
          Comunidade e Eventos
        </Link>
      )}
    </aside>
  );
}
export async function PhotoMissions({ user }: { user: Actor }) {
  const now = new Date();
  const missions = await db.photoMission.findMany({
    where: {
      OR: [
        { status: "PUBLISHED", mission: { active: true, endsAt: { gt: now } } },
        { evidence: { some: { userId: user.id } } },
      ],
    },
    include: {
      mission: true,
      media: photoSelect(),
      evidence: {
        where: { userId: user.id },
        include: {
          media: {
            where: { expiresAt: { gt: now } },
            select: { id: true, attempt: true },
          },
          reviews: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  if (!missions.length) return null;
  const labels = {
    PENDING: "Em análise",
    APPROVED: "Aprovada",
    REJECTED: "Reprovada",
    CANCELLED: "Cancelada",
  };
  return (
    <section className="photo-missions">
      <h2>Missões com foto</h2>
      <p className="notice">{photoGuidance}</p>
      <div className="mission-grid">
        {missions.map((pm) => {
          const e = pm.evidence[0],
            m = pm.mission;
          const open =
            pm.startsAt <= now &&
            m.endsAt > now &&
            m.active &&
            pm.status === "PUBLISHED";
          const canSubmit =
            open && (!e || (e.status === "REJECTED" && pm.allowResubmit));
          return (
            <article className="panel mission-card" key={pm.id}>
              <PhotoGallery photos={pm.media} title={m.title} />
              <span className="badge">
                📷 {pm.category} · +{m.reward} Amazonitos
              </span>
              <h2>{m.title}</h2>
              <p>{m.description}</p>
              <p className="muted">
                {date(pm.startsAt)} a {date(m.endsAt)} · Até {pm.maxPhotos}{" "}
                fotos
              </p>
              <p>
                <strong>Status: {e ? labels[e.status] : "Não iniciada"}</strong>
              </p>
              {e && (
                <PhotoGallery
                  photos={e.media.filter((p) => p.attempt === e.attempts)}
                  title="Minhas fotos enviadas"
                />
              )}
              {e?.reason && <p className="notice error">Motivo: {e.reason}</p>}
              {e?.reviewedAt && <small>Avaliada em {date(e.reviewedAt)}</small>}
              {canSubmit && (
                <details>
                  <summary>{e ? "Reenviar evidência" : "Participar"}</summary>
                  <CommunityForm action="submit" label="Confirmar envio">
                    <input type="hidden" name="photoMissionId" value={pm.id} />
                    <PhotoUpload max={pm.maxPhotos} />
                    <label className="check">
                      <input type="checkbox" name="safeImage" required />
                      Li as orientações e confirmo que as imagens são
                      autorizadas e seguras.
                    </label>
                    <label className="check">
                      <input type="checkbox" name="shareConsent" />
                      Autorizo opcionalmente o uso destas imagens em
                      reconhecimento interno. O RH ainda deverá revisar e
                      publicar separadamente.
                    </label>
                  </CommunityForm>
                </details>
              )}
              {e?.status === "PENDING" && (
                <CommunityForm action="cancel" label="Cancelar participação">
                  <input type="hidden" name="id" value={e.id} />
                </CommunityForm>
              )}
              {e && (
                <details>
                  <summary>Histórico de avaliação</summary>
                  {e.reviews.map((r) => (
                    <p key={r.id}>
                      {date(r.createdAt)} · {labels[r.status]} {r.reason ?? ""}
                    </p>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
