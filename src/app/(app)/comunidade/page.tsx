import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rights, categories, photoGuidance } from "@/lib/community";
import { communityActor } from "@/components/community-server";
import {
  CommunityForm,
  PhotoUpload,
  PhotoGallery,
} from "@/components/community-client";
import { PageTitle, Stats, date } from "@/components/ui";
function Input({
  name,
  label,
  type = "text",
  value,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={5000}
      />
    </label>
  );
}
const iso = (d?: Date) =>
  d ? new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16) : "";
export default async function Management({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    id?: string;
    q?: string;
    status?: string;
    page?: string;
    evidence?: string;
  }>;
}) {
  const u = await communityActor(),
    r = rights(u),
    p = await searchParams;
  if (!r.publish && !r.review && !r.moderate && !r.manage) notFound();
  const q = p.q?.slice(0, 100) ?? "",
    page = Math.max(1, Math.min(100, Number(p.page) || 1));
  const kind = [
    "post",
    "album",
    "event",
    "photo-mission",
    "comments",
    "access",
  ].includes(p.kind ?? "")
    ? p.kind!
    : "post";
  const [
    posts,
    albums,
    events,
    missions,
    comments,
    users,
    counts,
    approved,
    grants,
  ] = await Promise.all([
    r.publish
      ? db.communityPost.findMany({
          where:
            p.id && kind === "post"
              ? { id: p.id }
              : q
                ? { title: { contains: q, mode: "insensitive" } }
                : {},
          orderBy: { createdAt: "desc" },
          take: 30,
          skip: p.id && kind === "post" ? 0 : (page - 1) * 30,
          include: {
            media: { select: { id: true } },
            author: { select: { name: true } },
          },
        })
      : [],
    r.publish
      ? db.communityAlbum.findMany({
          where:
            kind === "album"
              ? p.id
                ? { id: p.id }
                : q
                  ? { title: { contains: q, mode: "insensitive" } }
                  : {}
              : {},
          skip: kind === "album" && !p.id ? (page - 1) * 50 : 0,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { media: { select: { id: true } } },
        })
      : [],
    r.publish
      ? db.communityEvent.findMany({
          where:
            kind === "event"
              ? p.id
                ? { id: p.id }
                : q
                  ? { title: { contains: q, mode: "insensitive" } }
                  : {}
              : {},
          skip: kind === "event" && !p.id ? (page - 1) * 50 : 0,
          orderBy: { startsAt: "desc" },
          take: 50,
        })
      : [],
    r.publish
      ? db.photoMission.findMany({
          where:
            kind === "photo-mission"
              ? p.id
                ? { id: p.id }
                : q
                  ? { mission: { title: { contains: q, mode: "insensitive" } } }
                  : {}
              : {},
          skip: kind === "photo-mission" && !p.id ? (page - 1) * 50 : 0,
          orderBy: { startsAt: "desc" },
          take: 50,
          include: { mission: true },
        })
      : [],
    r.moderate
      ? db.communityComment.findMany({
          where: q ? { text: { contains: q, mode: "insensitive" } } : {},
          orderBy: { createdAt: "desc" },
          take: 30,
          skip: (page - 1) * 30,
          include: {
            user: { select: { name: true } },
            post: { select: { title: true } },
          },
        })
      : [],
    r.manage
      ? db.user.findMany({
          where: {
            active: true,
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { name: "asc" },
          take: 50,
          skip: (page - 1) * 50,
          include: { communityGrant: true },
        })
      : [],
    Promise.all([
      db.communityPost.count({ where: { status: "PUBLISHED" } }),
      db.photoEvidence.count(),
      db.photoEvidence.count({ where: { status: "PENDING" } }),
      db.photoEvidence.count({ where: { status: "APPROVED" } }),
      db.photoEvidence.count({ where: { status: "REJECTED" } }),
      db.communityLike.count(),
      db.communityComment.count({ where: { hidden: false } }),
    ]),
    db.photoEvidence.findMany({
      where: { status: "APPROVED" },
      select: {
        photoMission: { select: { mission: { select: { reward: true } } } },
      },
    }),
    r.publish
      ? db.communityGrant.findMany({
          where: { review: true, user: { active: true } },
          include: { user: { select: { name: true } } },
        })
      : [],
  ]);
  const post = posts.find((x) => x.id === p.id),
    album = albums.find((x) => x.id === p.id),
    event = events.find((x) => x.id === p.id),
    pm = missions.find((x) => x.id === p.id);
  const item =
    kind === "post"
      ? post
      : kind === "album"
        ? album
        : kind === "event"
          ? event
          : null;
  const title = item?.title ?? pm?.mission.title,
    description = item?.description ?? pm?.mission.description;
  return (
    <div className="community-management">
      <PageTitle
        eyebrow="COMUNICAÇÃO E ENGAJAMENTO"
        title="Comunidade e Eventos"
        description="Publicações, momentos e evidências com privacidade e controle de acesso."
      />
      <nav className="community-tabs" aria-label="Gestão da comunidade">
        {r.publish && (
          <>
            <Link href="/comunidade?kind=post">Gerenciar publicações</Link>
            <Link href="/comunidade?kind=post#editor">Criar publicação</Link>
            <Link href="/comunidade?kind=album">Galeria de fotos</Link>
            <Link href="/comunidade?kind=event">Eventos</Link>
            <Link href="/comunidade?kind=photo-mission">Missões com foto</Link>
            <Link href="/mural?category=Reconhecimento">Reconhecimentos</Link>
          </>
        )}
        {r.moderate && (
          <Link href="/comunidade?kind=comments">Comentários</Link>
        )}
        {r.review && (
          <Link href="/comunidade/evidencias">Evidências pendentes</Link>
        )}
        {r.manage && <Link href="/comunidade?kind=access">Permissões</Link>}
      </nav>
      <Stats
        items={[
          {
            label: "Publicações realizadas",
            value: String(counts[0]),
            detail: "Conteúdos publicados",
          },
          {
            label: "Participações em fotos",
            value: String(counts[1]),
            detail: "Participantes reais",
          },
          {
            label: "Evidências pendentes",
            value: String(counts[2]),
            detail: "Aguardando avaliação",
          },
          {
            label: "Evidências aprovadas",
            value: String(counts[3]),
            detail: "Com recompensa",
          },
        ]}
      />
      <div className="panel">
        <p>
          {counts[4]} reprovadas ·{" "}
          {approved.reduce((n, e) => n + e.photoMission.mission.reward, 0)}{" "}
          Amazonitos concedidos por missões fotográficas · {counts[5]} curtidas
          · {counts[6]} comentários visíveis.
        </p>
        <small>
          Indicadores de engajamento; não representam saldo de carteira.
        </small>
      </div>
      <form className="community-filters">
        <input type="hidden" name="kind" value={kind} />
        <label>
          Buscar
          <input name="q" defaultValue={q} />
        </label>
        <button className="button">Buscar</button>
      </form>
      {r.publish &&
        ["post", "album", "event", "photo-mission"].includes(kind) && (
          <section id="editor" className="panel">
            <h2>
              {p.id ? "Editar" : "Criar"}{" "}
              {kind === "post"
                ? "publicação"
                : kind === "album"
                  ? "álbum"
                  : kind === "event"
                    ? "evento"
                    : "missão com foto"}
            </h2>
            {p.id && !item && !pm && (
              <p className="notice error">
                Registro fora da listagem atual. Busque pelo título para editar.
              </p>
            )}
            <CommunityForm
              key={kind + (p.id ?? "new") + (p.evidence ?? "")}
              action={kind}
              label="Salvar conteúdo"
            >
              <input type="hidden" name="id" value={p.id ?? ""} />
              {kind === "post" && (
                <input
                  type="hidden"
                  name="evidenceId"
                  value={p.evidence ?? ""}
                />
              )}
              <Input name="title" label="Título" value={title} />
              <label className="field">
                Descrição
                <textarea
                  name="description"
                  defaultValue={description}
                  required
                  maxLength={5000}
                />
              </label>
              <div className="community-form-grid">
                <label className="field">
                  Status
                  <select
                    name="status"
                    defaultValue={item?.status ?? pm?.status ?? "DRAFT"}
                  >
                    <option value="DRAFT">Rascunho</option>
                    <option value="PUBLISHED">Publicado</option>
                    <option value="ARCHIVED">Arquivado</option>
                  </select>
                </label>
                <label className="field">
                  Visibilidade
                  <select
                    name="visibility"
                    defaultValue={item?.visibility ?? "INTERNAL"}
                  >
                    <option value="INTERNAL">Associados autenticados</option>
                    <option value="MANAGEMENT">Somente gestão</option>
                  </select>
                </label>
              </div>
              {kind === "post" && (
                <>
                  <label className="field">
                    Categoria
                    <select
                      name="category"
                      defaultValue={
                        post?.category ??
                        (p.evidence ? "Reconhecimento" : categories[0])
                      }
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <Input
                    name="publishedAt"
                    label="Data de publicação (horário de Brasília)"
                    type="datetime-local"
                    value={iso(post?.publishedAt ?? new Date())}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      name="pinned"
                      defaultChecked={post?.pinned}
                    />
                    Fixar no topo
                  </label>
                  <label className="field">
                    Álbum associado
                    <select name="albumId" defaultValue={post?.albumId ?? ""}>
                      <option value="">Nenhum</option>
                      {albums.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {(kind === "post" || kind === "album") && (
                <label className="field">
                  Evento associado
                  <select
                    name="eventId"
                    defaultValue={
                      (kind === "post" ? post?.eventId : album?.eventId) ?? ""
                    }
                  >
                    <option value="">Nenhum</option>
                    {events.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "album" && (
                <Input
                  name="eventDate"
                  label="Data do evento (Brasília)"
                  type="datetime-local"
                  value={iso(album?.eventDate ?? new Date())}
                />
              )}
              {kind === "event" && (
                <>
                  <Input
                    name="location"
                    label="Local"
                    value={event?.location}
                  />
                  <Input
                    name="startsAt"
                    label="Início (Brasília)"
                    type="datetime-local"
                    value={iso(event?.startsAt)}
                  />
                  <Input
                    name="endsAt"
                    label="Término (Brasília)"
                    type="datetime-local"
                    value={iso(event?.endsAt)}
                  />
                </>
              )}
              {kind === "photo-mission" && (
                <>
                  <Input
                    name="category"
                    label="Categoria"
                    value={pm?.category}
                  />
                  <Input
                    name="reward"
                    label="Recompensa em Amazonitos"
                    type="number"
                    value={pm?.mission.reward ?? 10}
                  />
                  <Input
                    name="startsAt"
                    label="Início (Brasília)"
                    type="datetime-local"
                    value={iso(pm?.startsAt)}
                  />
                  <Input
                    name="endsAt"
                    label="Encerramento (Brasília)"
                    type="datetime-local"
                    value={iso(pm?.mission.endsAt)}
                  />
                  <Input
                    name="maxPhotos"
                    label="Quantidade máxima de fotos (1 a 5)"
                    type="number"
                    value={pm?.maxPhotos ?? 3}
                  />
                  <Input
                    name="participationLimit"
                    label="Limite de participações"
                    type="number"
                    value={pm?.participationLimit ?? 100}
                  />
                  <label className="field">
                    Responsável pela avaliação
                    <select
                      name="reviewerId"
                      defaultValue={pm?.reviewerId ?? ""}
                    >
                      <option value="">Qualquer avaliador autorizado</option>
                      {grants.map((g) => (
                        <option key={g.userId} value={g.userId}>
                          {g.user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input
                      name="allowResubmit"
                      type="checkbox"
                      defaultChecked={pm?.allowResubmit}
                    />
                    Permitir reenvio após reprovação dentro do prazo
                  </label>
                  <p>
                    Comprovação: fotografia obrigatória. Quizzes continuam sendo
                    criados em Pessoas e campanhas.
                  </p>
                </>
              )}
              {(kind === "post" || kind === "album") &&
              (kind === "post" ? post?.media : album?.media)?.length ? (
                <label className="field">
                  Foto de capa
                  <select name="coverId">
                    <option value="">Manter capa atual</option>
                    {(kind === "post" ? post!.media : album!.media).map(
                      (m, i) => (
                        <option key={m.id} value={m.id}>
                          Foto {i + 1}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : null}
              {kind !== "event" && (
                <>
                  <p className="notice">{photoGuidance}</p>
                  <PhotoUpload max={kind === "photo-mission" ? 1 : 8} />
                  <label className="check">
                    <input
                      type="checkbox"
                      name="imageAuthorization"
                      defaultChecked={post?.imageAuthorization}
                    />
                    Confirmo autorização válida para uso das imagens.
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      name="restrictedChecked"
                      defaultChecked={post?.restrictedChecked}
                    />
                    Revisei e confirmei a ausência de informações restritas.
                  </label>
                  <p className="muted">
                    Capa: primeira foto do envio. Fotos publicadas: retenção de
                    até 365 dias. Evidências: 90 dias. O destaque não publica
                    automaticamente o nome do associado.
                  </p>
                </>
              )}
            </CommunityForm>
          </section>
        )}
      {r.publish && kind === "post" && (
        <section className="panel">
          <h2>Publicações</h2>
          {!posts.length && <p>Nenhuma publicação cadastrada.</p>}
          {posts.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.title}</strong>
              <span>
                {x.status} · {x.author.name}
              </span>
              <Link href={"?kind=post&id=" + x.id + "#editor"}>
                Editar / arquivar
              </Link>
            </div>
          ))}
        </section>
      )}
      {r.publish && kind === "album" && (
        <section className="panel">
          <h2>Álbuns</h2>
          {albums.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.title}</strong>
              <span>{x.status}</span>
              <PhotoGallery photos={x.media} title={x.title} />
              <Link href={"?kind=album&id=" + x.id + "#editor"}>
                Editar / arquivar
              </Link>
            </div>
          ))}
        </section>
      )}
      {r.publish && kind === "event" && (
        <section className="panel">
          <h2>Eventos</h2>
          {events.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.title}</strong>
              <span>
                {date(x.startsAt)} · {x.status}
              </span>
              <Link href={"?kind=event&id=" + x.id + "#editor"}>
                Editar / arquivar
              </Link>
            </div>
          ))}
        </section>
      )}
      {r.publish && kind === "photo-mission" && (
        <section className="panel">
          <h2>Missões com foto</h2>
          {missions.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.mission.title}</strong>
              <span>{x.status}</span>
              <Link href={"?kind=photo-mission&id=" + x.id + "#editor"}>
                Editar regras (antes da participação)
              </Link>
              <CommunityForm
                action="close-photo-mission"
                label="Encerrar missão"
              >
                <input type="hidden" name="id" value={x.id} />
              </CommunityForm>
            </div>
          ))}
        </section>
      )}
      {r.moderate && kind === "comments" && (
        <section className="panel">
          <h2>Moderação de comentários</h2>
          {comments.map((c) => (
            <article className="community-comment" key={c.id}>
              <strong>
                {c.user.name} · {c.post.title}
              </strong>
              <p>{c.text}</p>
              <span>{c.hidden ? "Oculto" : "Visível"}</span>
              <CommunityForm
                action="moderate"
                label={c.hidden ? "Restaurar comentário" : "Ocultar comentário"}
              >
                <input type="hidden" name="id" value={c.id} />
                <input
                  type="hidden"
                  name="hidden"
                  value={c.hidden ? "false" : "true"}
                />
                <Input name="reason" label="Motivo da moderação" />
              </CommunityForm>
            </article>
          ))}
        </section>
      )}
      {r.manage && kind === "access" && (
        <section className="panel">
          <h2>Permissões explícitas</h2>
          <p>
            Ninguém recebe novas permissões automaticamente. A liderança é uma
            atribuição exclusiva deste módulo e não concede acesso aos demais
            painéis.
          </p>
          {users.map((x) => (
            <div className="community-management-row" key={x.id}>
              <h3>{x.name}</h3>
              <small>{x.role}</small>
              <CommunityForm action="grant" label="Salvar permissões">
                <input type="hidden" name="userId" value={x.id} />
                {(["leadership", "publish", "review", "moderate"] as const).map(
                  (key, i) => (
                    <label className="check" key={key}>
                      <input
                        type="checkbox"
                        name={key}
                        defaultChecked={x.communityGrant?.[key] ?? false}
                      />
                      {
                        [
                          "Liderança autorizada",
                          "Publicar e gerenciar conteúdo",
                          "Avaliar evidências",
                          "Moderar comentários",
                        ][i]
                      }
                    </label>
                  ),
                )}
              </CommunityForm>
            </div>
          ))}
          <CommunityForm action="purge" label="Remover somente fotos expiradas">
            <p>
              Esta ação remove somente arquivos cujo prazo de retenção já
              expirou. Os registros, avaliações e extratos são mantidos.
            </p>
          </CommunityForm>
        </section>
      )}
      <div className="community-links">
        {page > 1 && (
          <Link
            href={
              "?kind=" +
              kind +
              "&page=" +
              (page - 1) +
              "&q=" +
              encodeURIComponent(q)
            }
          >
            Anteriores
          </Link>
        )}
        <Link
          href={
            "?kind=" +
            kind +
            "&page=" +
            (page + 1) +
            "&q=" +
            encodeURIComponent(q)
          }
        >
          Próxima página
        </Link>
      </div>
    </div>
  );
}
