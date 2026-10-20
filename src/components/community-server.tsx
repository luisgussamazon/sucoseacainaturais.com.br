import { FeedPost } from "./feed-post";
import { SharePostActions } from "./redemption-center";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  publishedWhere,
  mediaConsent,
  rights,
  photoGuidance,
  type Actor,
} from "@/lib/community";
import {
  SocialInteractions,
  CommunityForm,
  PhotoGallery,
  PhotoUpload,
} from "./community-client";
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
  orderBy: [
    { cover: "desc" as const },
    { position: "asc" as const },
    { createdAt: "asc" as const },
  ],
});
export async function CommunityFeed({
  user,
  page = 1,
  category,
  q,
  postId,
  limit = 10,
}: {
  user: Actor;
  page?: number;
  category?: string;
  q?: string;
  postId?: string;
  limit?: number;
}) {
  const pageHref = (n: number) =>
    "/mural?" +
    new URLSearchParams({
      page: String(n),
      ...(category ? { category } : {}),
      ...(q ? { q } : {}),
    }).toString();
  const where = {
    ...(postId ? { id: postId } : {}),
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
    take: limit + 1,
    skip: (page - 1) * limit,
    include: {
      author: { select: { id: true, name: true, avatarUpdatedAt: true } },
      redemptionShare: { select: { postId: true } },
      media: photoSelect(),
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
      {posts.slice(0, limit).map((p) => (
        <FeedPost
          key={p.id}
          id={p.id}
          title={p.title}
          description={p.description}
          author={p.author.name}
          authorId={p.author.id}
          authorAvatarUpdatedAt={
            p.author.avatarUpdatedAt?.toISOString() ?? null
          }
          category={p.category}
          pinned={p.pinned}
          publishedAt={p.publishedAt?.toISOString() ?? ""}
          albumId={p.albumId}
          photos={p.imageAuthorization && p.restrictedChecked ? p.media : []}
        >
          {p.redemptionShare && (
            <SharePostActions
              postId={p.id}
              own={p.authorId === user.id}
              admin={user.role === "ADMIN"}
            />
          )}
        </FeedPost>
      ))}
      <div className="community-links">
        <Link href="/mural">Ver histórico do mural →</Link>
        {page > 1 && <Link href={pageHref(page - 1)}>← Anteriores</Link>}
        {posts.length > limit && (
          <Link href={pageHref(page + 1)}>Mais publicações →</Link>
        )}
      </div>
    </section>
  );
}
export async function CommunityAside({ user }: { user: Actor }) {
  const now = new Date();
  const missions = await db.mission.findMany({
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
  });
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
      {rights(user).management && (
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

export async function CommunityMoments({
  user,
  recent = false,
  albumId,
  page = 1,
}: {
  user: Actor;
  recent?: boolean;
  albumId?: string;
  page?: number;
}) {
  const albums = await db.communityAlbum.findMany({
    where: { ...publishedWhere(user), ...(albumId ? { id: albumId } : {}) },
    orderBy: { eventDate: "desc" },
    take: recent ? 1 : 12,
    skip: recent ? 0 : (page - 1) * 12,
    include: {
      media: photoSelect(),
      author: { select: { id: true, name: true, avatarUpdatedAt: true } },
      missionMoment: {
        select: {
          evidence: {
            select: {
              photoMission: {
                select: { mission: { select: { title: true } } },
              },
            },
          },
        },
      },
    },
  });
  const approvedAlbums = new Set(
    (
      await Promise.all(
        albums.map(async (a) =>
          (await mediaConsent(a, "ALBUM")) ? a.id : null,
        ),
      )
    ).filter(Boolean),
  );
  const candidates = recent
    ? await db.communityMedia.findMany({
        where: {
          album: { status: "PUBLISHED", visibility: "INTERNAL" },
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          album: {
            select: {
              id: true,
              imageAuthorization: true,
              restrictedChecked: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 24,
      })
    : [];
  const photos = (
    await Promise.all(
      candidates.map(async (m) =>
        m.album && (await mediaConsent(m.album, "ALBUM")) ? { id: m.id } : null,
      ),
    )
  )
    .filter((m): m is { id: string } => m !== null)
    .slice(0, 6);
  return (
    <section className="community-moments" aria-label="Momentos VBJ2">
      <div className="section-heading">
        <h2>Momentos VBJ2</h2>
        <Link href="/momentos">Ver todos os álbuns →</Link>
      </div>
      {!albums.length && (
        <Empty
          title="Novos momentos estão por vir"
          text="Os álbuns publicados e autorizados aparecerão aqui."
        />
      )}
      <div className={recent ? "latest-album" : "community-albums"}>
        {albums.map((a) => (
          <article className="panel album-card" key={a.id}>
            <PhotoGallery
              photos={approvedAlbums.has(a.id) ? a.media : []}
              title={a.title}
              interactive
            />
            <span className="badge">
              {a.missionMoment
                ? "Missão: " +
                  a.missionMoment.evidence.photoMission.mission.title
                : a.category}
            </span>
            <p className="muted">
              {a.author.name} · {date(a.eventDate)}
            </p>
            <h2>{a.title}</h2>
            <small>
              {date(a.eventDate)} ·{" "}
              {approvedAlbums.has(a.id) ? a.media.length : 0} fotografias
            </small>
            <p>{a.description}</p>
            <SocialInteractions kind="ALBUM" targetId={a.id} />
          </article>
        ))}
      </div>
      {recent && photos.length > 0 && (
        <section className="panel recent-photos">
          <h3>Fotografias recentes</h3>
          <PhotoGallery
            photos={photos}
            title="Momentos da equipe"
            interactive
            grid
          />
        </section>
      )}
      {!recent && (
        <div className="community-links">
          {page > 1 && (
            <Link href={"/momentos?page=" + (page - 1)}>Anteriores</Link>
          )}
          {albums.length === 12 && (
            <Link href={"/momentos?page=" + (page + 1)}>Mais álbuns →</Link>
          )}
        </div>
      )}
    </section>
  );
}
export async function MyRecognitionConsent({ user }: { user: Actor }) {
  const completions = await db.completion.findMany({
    where: { userId: user.id },
    include: { mission: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (!completions.length) return null;
  return (
    <section className="panel community-evidence">
      <h2>Minhas conquistas</h2>
      <p>
        A recompensa é independente da divulgação. Você pode autorizar a
        identificação em um reconhecimento interno; fotos continuam exigindo
        autorização própria.
      </p>
      {completions.map((c) => (
        <details key={c.id}>
          <summary>{c.mission.title}</summary>
          <CommunityForm
            action="consent-recognition"
            label="Salvar autorização"
          >
            <input type="hidden" name="id" value={c.id} />
            <label className="check">
              <input
                type="checkbox"
                name="consent"
                defaultChecked={c.recognitionConsent}
              />
              Autorizo o uso do meu nome de exibição neste reconhecimento
              interno.
            </label>
          </CommunityForm>
        </details>
      ))}
    </section>
  );
}

export async function MyPhotoParticipationHistory({ user }: { user: Actor }) {
  const entries = await db.photoEvidence.findMany({
    where: { userId: user.id },
    include: {
      photoMission: { include: { mission: { select: { title: true } } } },
      media: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true, attempt: true },
      },
      reviews: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });
  if (!entries.length)
    return (
      <p className="muted">
        Você ainda não enviou participações em missões com foto.
      </p>
    );
  const labels = {
    PENDING: "Em análise",
    APPROVED: "Aprovada",
    REJECTED: "Reprovada",
    CANCELLED: "Cancelada",
  };
  return (
    <section className="panel">
      <h2>Minhas participações em missões com foto</h2>
      <p>
        Seu histórico privado de participação e avaliação. Somente as fotos
        autorizadas para divulgação são publicadas na comunidade.
      </p>
      {entries.map((e) => (
        <details key={e.id}>
          <summary>
            {e.photoMission.mission.title} · {labels[e.status]} ·{" "}
            {date(e.submittedAt)}
          </summary>
          {e.caption && <p>{e.caption}</p>}
          <PhotoGallery
            photos={e.media.filter((m) => m.attempt === e.attempts)}
            title="Minhas evidências privadas"
          />
          {e.reason && <p>Motivo da avaliação: {e.reason}</p>}
          {e.reviews.map((r) => (
            <p key={r.id}>
              {date(r.createdAt)} · {labels[r.status]} · {r.reason ?? ""}
            </p>
          ))}
          {e.status === "PENDING" && (
            <CommunityForm action="cancel" label="Cancelar participação">
              <input type="hidden" name="id" value={e.id} />
            </CommunityForm>
          )}
        </details>
      ))}
    </section>
  );
}
