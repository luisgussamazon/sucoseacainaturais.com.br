import { PublicationEditor } from "@/components/publication-editor";
import {
  Users,
  Plus,
  FileText,
  Heart,
  MessageCircle,
  Pencil,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rights, photoGuidance } from "@/lib/community";
import {
  categories,
  missionCategories,
  permissions,
} from "@/lib/community-options";
import { communityActor } from "@/components/community-server";
import {
  PublicationThumbnail,
  MissionTypeSelect,
  CommunityForm,
  PhotoUpload,
  PhotoGallery,
} from "@/components/community-client";
import { Stats, date } from "@/components/ui";
const iso = (d?: Date) =>
  d ? new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16) : "";
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
function Choice({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: readonly string[];
  value?: string;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value ?? options[0]}>
        {Array.from(new Set([...(value ? [value] : []), ...options])).map(
          (v) => (
            <option key={v}>{v}</option>
          ),
        )}
      </select>
    </label>
  );
}
export default async function Management({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    id?: string;
    q?: string;
    page?: string;
    completion?: string;
    evidence?: string;
    category?: string;
    sort?: string;
  }>;
}) {
  const u = await communityActor(),
    r = rights(u),
    p = await searchParams;
  if (!r.management) notFound();
  const q = p.q?.slice(0, 100) ?? "",
    page = Math.max(1, Math.min(100, Number(p.page) || 1));
  const allowed = {
    post: r.publish,
    album: r.albums,
    event: r.events,
    "photo-mission": r.missions,
    "quiz-mission": r.missions,
    recognition: r.recognize,
    photos: r.photos,
    comments: r.moderate,
    access: r.manage,
  };
  const fallback =
    (Object.keys(allowed) as (keyof typeof allowed)[]).find(
      (k) => allowed[k],
    ) ?? "access";
  const kind = (
    p.kind && p.kind in allowed ? p.kind : fallback
  ) as keyof typeof allowed;
  const permitted = allowed[kind];
  const search = q
    ? { title: { contains: q, mode: "insensitive" as const } }
    : {};
  const filter = p.id
    ? { id: p.id }
    : {
        ...search,
        ...(p.category ? { category: p.category.slice(0, 100) } : {}),
      };
  const brasiliaToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const monthStart = new Date(
    `${brasiliaToday.find((p) => p.type === "year")!.value}-${brasiliaToday.find((p) => p.type === "month")!.value}-01T00:00:00-03:00`,
  );
  const [
    posts,
    albums,
    events,
    missions,
    comments,
    mediaComments,
    users,
    counts,
    grants,
  ] = await Promise.all([
    r.publish || r.recognize || r.photos
      ? db.communityPost.findMany({
          where: kind === "post" || kind === "recognition" ? filter : {},
          orderBy: { createdAt: p.sort === "oldest" ? "asc" : "desc" },
          take: 30,
          skip: p.id ? 0 : (page - 1) * 30,
          include: {
            author: { select: { name: true } },
            _count: {
              select: {
                likes: true,
                comments: { where: { hidden: false, deletedAt: null } },
              },
            },
            media: {
              where: { expiresAt: { gt: new Date() } },
              select: { id: true },
              orderBy: [
                { cover: "desc" },
                { position: "asc" },
                { createdAt: "asc" },
              ],
            },
          },
        })
      : [],
    r.albums || r.photos || r.publish
      ? db.communityAlbum.findMany({
          where: kind === "album" ? filter : {},
          orderBy: { createdAt: "desc" },
          take: 30,
          skip: kind === "album" && !p.id ? (page - 1) * 30 : 0,
          include: {
            media: {
              where: { expiresAt: { gt: new Date() } },
              select: { id: true },
              orderBy: [
                { cover: "desc" },
                { position: "asc" },
                { createdAt: "asc" },
              ],
            },
          },
        })
      : [],
    r.events || r.photos || r.publish || r.albums
      ? db.communityEvent.findMany({
          where: kind === "event" ? filter : {},
          orderBy: { startsAt: "desc" },
          take: 30,
          skip: kind === "event" && !p.id ? (page - 1) * 30 : 0,
          include: {
            media: {
              where: { expiresAt: { gt: new Date() } },
              select: { id: true },
            },
          },
        })
      : [],
    r.missions
      ? db.photoMission.findMany({
          where:
            kind === "photo-mission"
              ? p.id
                ? { id: p.id }
                : q
                  ? { mission: { title: { contains: q, mode: "insensitive" } } }
                  : {}
              : {},
          orderBy: { startsAt: "desc" },
          take: 30,
          skip: p.id ? 0 : (page - 1) * 30,
          include: { mission: true },
        })
      : [],
    r.moderate
      ? db.communityComment.findMany({
          where: {
            deletedAt: null,
            ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          skip: (page - 1) * 30,
          include: {
            user: { select: { name: true } },
            post: { select: { title: true } },
          },
        })
      : [],
    r.moderate
      ? db.mediaComment.findMany({
          where: {
            deletedAt: null,
            ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          skip: (page - 1) * 30,
          include: {
            user: { select: { name: true } },
            thread: {
              include: {
                album: { select: { title: true } },
                media: { select: { id: true } },
              },
            },
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
      db.communityPost.count({
        where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
      }),
      db.photoEvidence.count({ where: { submittedAt: { gte: monthStart } } }),
      db.photoEvidence.count({ where: { status: "PENDING" } }),
      db.photoEvidence.count({ where: { status: "APPROVED" } }),
    ]),
    r.missions
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
  let completionId = p.completion;
  if (p.evidence && r.recognize) {
    const e = await db.photoEvidence.findUnique({
      where: { id: p.evidence },
      include: { photoMission: true },
    });
    if (e)
      completionId = (
        await db.completion.findUnique({
          where: {
            userId_missionId: {
              userId: e.userId,
              missionId: e.photoMission.missionId,
            },
          },
        })
      )?.id;
  }
  const completion =
    r.recognize && completionId
      ? await db.completion.findUnique({
          where: { id: completionId },
          include: {
            user: { select: { name: true } },
            mission: { select: { title: true, reward: true } },
          },
        })
      : null;
  const item =
    kind === "album"
      ? album
      : kind === "event"
        ? event
        : kind === "post" || kind === "recognition"
          ? post
          : null;
  const existingPhotos = item?.media ?? [];
  const canEdit = permitted && !(post?.completionId && !r.recognize);
  const creator = [
    "post",
    "recognition",
    "album",
    "event",
    "photo-mission",
    "quiz-mission",
  ].includes(kind);
  const action = kind === "recognition" ? "post" : kind;
  return (
    <div className="community-management">
      <div className="community-page-heading">
        <span className="community-heading-icon">
          <Users size={26} />
        </span>
        <div>
          <h1>Comunidade e Eventos</h1>
          <p>
            Acesso por permissões individuais, com imagens autorizadas e dados
            protegidos.
          </p>
        </div>
        {r.publish && (
          <Link className="button" href="/comunidade?kind=post#editor">
            <Plus size={18} /> Nova publicação
          </Link>
        )}
      </div>
      <nav className="community-primary-tabs" aria-label="Áreas da comunidade">
        {r.publish && (
          <Link
            aria-current={kind === "post" ? "page" : undefined}
            href="?kind=post"
          >
            Publicações
          </Link>
        )}
        {r.review && (
          <Link href="/comunidade/evidencias">Evidências pendentes</Link>
        )}
        {r.moderate && (
          <Link
            aria-current={kind === "comments" ? "page" : undefined}
            href="?kind=comments"
          >
            Comentários
          </Link>
        )}
      </nav>
      <details className="community-tools">
        <summary>Mais ferramentas</summary>
        <nav
          className="community-tabs community-secondary-tabs"
          aria-label="Gestão da comunidade"
        >
          {r.photos && <Link href="?kind=photos">Gerenciar fotos</Link>}
          {r.albums && <Link href="?kind=album">Álbuns</Link>}
          {r.events && <Link href="?kind=event">Eventos</Link>}
          {r.missions && (
            <>
              <Link href="?kind=photo-mission">Missões com foto</Link>
              <Link href="?kind=quiz-mission">Quizzes</Link>
            </>
          )}
          {r.recognize && (
            <Link href="/comunidade/conquistas">
              Conquistas aguardando publicação
            </Link>
          )}

          {r.manage && <Link href="?kind=access">Permissões</Link>}
        </nav>
      </details>
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
            detail: "Dados neste mês",
          },
          {
            label: "Evidências pendentes",
            value: String(counts[2]),
            detail: "Aguardando avaliação",
          },
          {
            label: "Evidências aprovadas",
            value: String(counts[3]),
            detail: "Recompensas registradas",
          },
        ]}
      />
      {kind !== "post" && (
        <form className="community-filters">
          <input type="hidden" name="kind" value={kind} />
          <label>
            Buscar
            <input name="q" defaultValue={q} maxLength={100} />
          </label>
          <button className="button">Buscar</button>
        </form>
      )}
      {!permitted && (
        <p className="notice error">
          Seu acesso a esta área não está concedido. O administrador pode
          habilitar a permissão individual.
        </p>
      )}
      {kind === "post" && canEdit && !post?.completionId && (
        <PublicationEditor
          post={post}
          albums={albums}
          events={events}
          photos={r.photos}
        />
      )}
      {creator && canEdit && (kind !== "post" || !!post?.completionId) && (
        <section className="panel" id="editor">
          <h2>
            {p.id ? "Editar" : "Criar"}{" "}
            {kind === "photo-mission"
              ? "missão fotográfica"
              : kind === "quiz-mission"
                ? "quiz"
                : kind === "recognition"
                  ? "reconhecimento"
                  : kind === "album"
                    ? "álbum"
                    : kind === "event"
                      ? "evento"
                      : "publicação"}
          </h2>
          {kind === "recognition" && !completion && !post && (
            <p className="notice">
              Selecione uma conquista em{" "}
              <Link href="/comunidade/conquistas">
                Conquistas aguardando publicação
              </Link>
              .
            </p>
          )}
          <CommunityForm
            key={kind + (p.id ?? "new") + (completion?.id ?? "")}
            action={action}
            label="Salvar conteúdo"
          >
            <input type="hidden" name="id" value={p.id ?? ""} />
            {(kind === "recognition" || post?.completionId) && (
              <input
                type="hidden"
                name="completionId"
                value={completion?.id ?? post?.completionId ?? ""}
              />
            )}
            <Input
              name="title"
              label="Título"
              value={
                item?.title ??
                pm?.mission.title ??
                (completion
                  ? "Conquista da equipe: " + completion.mission.title
                  : undefined)
              }
            />
            <label className="field">
              Descrição
              <textarea
                name="description"
                required
                maxLength={5000}
                defaultValue={
                  item?.description ??
                  pm?.mission.description ??
                  (completion
                    ? "Nossa equipe concluiu a missão " +
                      completion.mission.title +
                      ". Parabéns pela participação e pelo compromisso com nossas ações."
                    : undefined)
                }
              />
            </label>
            <label className="field">
              Status
              <select
                name="status"
                defaultValue={
                  post?.status === "PUBLISHED" && post.publishedAt > new Date()
                    ? "SCHEDULED"
                    : (item?.status ?? pm?.status ?? "DRAFT")
                }
              >
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicado</option>
                {(kind === "post" || kind === "recognition") && (
                  <option value="SCHEDULED">Agendado</option>
                )}
                <option value="ARCHIVED">Arquivado</option>
              </select>
            </label>
            {(kind === "post" || kind === "recognition") && (
              <>
                <Choice
                  name="category"
                  label="Categoria"
                  options={categories}
                  value={
                    post?.category ??
                    (kind === "recognition" ? "Reconhecimento" : undefined)
                  }
                />
                <Input
                  name="publishedAt"
                  label="Data de publicação (Brasília)"
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
                      <option value={a.id} key={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(kind === "post" ||
              kind === "album" ||
              kind === "recognition") && (
              <label className="field">
                Evento relacionado
                <select
                  name="eventId"
                  defaultValue={
                    item && "eventId" in item ? (item.eventId ?? "") : ""
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
              <>
                <Choice
                  name="category"
                  label="Categoria do álbum"
                  options={categories}
                  value={album?.category}
                />
                <Input
                  name="eventDate"
                  label="Data do evento (Brasília)"
                  type="datetime-local"
                  value={iso(album?.eventDate ?? new Date())}
                />
              </>
            )}
            {kind === "event" && (
              <>
                <Input name="location" label="Local" value={event?.location} />
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
            {(kind === "photo-mission" || kind === "quiz-mission") && (
              <>
                <MissionTypeSelect value={kind} />
                <p>
                  <Link href="?kind=photo-mission">
                    Criar missão fotográfica
                  </Link>{" "}
                  · <Link href="?kind=quiz-mission">Criar quiz</Link>
                </p>
                <Input
                  name="reward"
                  label="Recompensa em Amazonitos"
                  type="number"
                  value={pm?.mission.reward ?? 10}
                />
                <Input
                  name="endsAt"
                  label="Encerramento (Brasília)"
                  type="datetime-local"
                  value={iso(pm?.mission.endsAt)}
                />
              </>
            )}
            {kind === "photo-mission" && (
              <>
                <Choice
                  name="category"
                  label="Categoria da missão"
                  options={missionCategories}
                  value={pm?.category}
                />
                <Input
                  name="startsAt"
                  label="Início (Brasília)"
                  type="datetime-local"
                  value={iso(pm?.startsAt)}
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
                  Responsável pela aprovação
                  <select name="reviewerId" defaultValue={pm?.reviewerId ?? ""}>
                    <option value="">Qualquer avaliador autorizado</option>
                    {grants.map((g) => (
                      <option value={g.userId} key={g.userId}>
                        {g.user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="allowResubmit"
                    defaultChecked={pm?.allowResubmit}
                  />
                  Permitir reenvio após reprovação dentro do prazo
                </label>
              </>
            )}
            {kind === "quiz-mission" && (
              <>
                <Input name="question" label="Pergunta" />
                {[0, 1, 2].map((i) => (
                  <Input
                    name={"option" + i}
                    label={"Alternativa " + (i + 1)}
                    key={i}
                  />
                ))}
                <label className="field">
                  Resposta correta
                  <select name="answer">
                    {[0, 1, 2].map((i) => (
                      <option value={i} key={i}>
                        Alternativa {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(kind === "recognition" || post?.completionId) && (
              <>
                <p className="notice">
                  Sem autorização, use reconhecimento coletivo sem nomes ou
                  evidências privadas. A divulgação não concede novas moedas.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    name="identify"
                    defaultChecked={post?.recognitionIdentified}
                  />
                  O texto identifica o associado e há consentimento registrado
                  para isso.
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="includePhotos"
                    defaultChecked={!!post?.evidenceId}
                  />
                  Incluir a evidência aprovada com consentimento de imagem.
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="recognitionAuthorization"
                    required
                  />
                  Confirmo a ação administrativa de publicar esta conquista.
                </label>
              </>
            )}
            {kind !== "quiz-mission" && (
              <>
                <p className="notice">{photoGuidance}</p>
                {r.photos && (
                  <PhotoUpload
                    max={
                      kind === "photo-mission"
                        ? 1
                        : Math.max(0, 8 - existingPhotos.length)
                    }
                  />
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    name="imageAuthorization"
                    defaultChecked={
                      item && "imageAuthorization" in item
                        ? (item.imageAuthorization ?? false)
                        : false
                    }
                  />
                  Confirmo autorização válida para uso de todas as imagens.
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="restrictedChecked"
                    defaultChecked={
                      item && "restrictedChecked" in item
                        ? (item.restrictedChecked ?? false)
                        : false
                    }
                  />
                  Revisei a ausência de informações restritas.
                </label>
              </>
            )}
            {r.photos && existingPhotos.length > 0 && (
              <label className="field">
                Capa existente
                <select name="coverId">
                  <option value="">
                    Manter capa ou usar a capa selecionada no novo envio
                  </option>
                  {existingPhotos.map((m, i) => (
                    <option value={m.id} key={m.id}>
                      Foto {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </CommunityForm>
        </section>
      )}
      {canEdit && ["post", "recognition"].includes(kind) && (
        <section className="panel publication-list">
          <div className="publication-list-header">
            <div className="community-card-heading">
              <span className="community-heading-icon">
                <FileText size={23} />
              </span>
              <div>
                <h2>Publicações</h2>
                <p>
                  Gerencie as publicações da comunidade e acompanhe o
                  engajamento.
                </p>
              </div>
            </div>
            <form className="publication-filters">
              <input type="hidden" name="kind" value={kind} />
              <input
                name="q"
                aria-label="Buscar publicações"
                placeholder="Buscar publicações..."
                defaultValue={q}
              />
              <select
                aria-label="Filtrar categoria"
                name="category"
                defaultValue={p.category ?? ""}
              >
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                name="sort"
                aria-label="Ordenar publicações"
                defaultValue={p.sort ?? "newest"}
              >
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigas</option>
              </select>
              <button className="button secondary">Filtrar</button>
            </form>
          </div>
          <div
            className="publication-table"
            role="table"
            aria-label="Publicações"
          >
            <div className="publication-table-head" role="row">
              {[
                "Conteúdo",
                "Categoria",
                "Status",
                "Data de publicação",
                "Engajamento",
                "Ações",
              ].map((t) => (
                <span role="columnheader" key={t}>
                  {t}
                </span>
              ))}
            </div>
            {!posts.length && <p>Nenhuma publicação cadastrada.</p>}
            {posts.map((x) => {
              const scheduled =
                x.status === "PUBLISHED" && x.publishedAt > new Date();
              return (
                <article
                  role="row"
                  className="publication-table-row community-management-row"
                  key={x.id}
                >
                  <div role="cell" className="publication-content">
                    <PublicationThumbnail id={x.media[0]?.id} title={x.title} />
                    <div>
                      <strong>{x.title}</strong>
                      <p>{x.description.slice(0, 110)}</p>
                    </div>
                  </div>
                  <div role="cell">
                    <span className="publication-category">{x.category}</span>
                  </div>
                  <div role="cell">
                    <span
                      className={
                        "publication-status status-" +
                        (scheduled ? "SCHEDULED" : x.status)
                      }
                    >
                      {scheduled
                        ? "Agendado"
                        : x.status === "PUBLISHED"
                          ? "Publicado"
                          : x.status === "DRAFT"
                            ? "Rascunho"
                            : "Arquivado"}
                    </span>
                  </div>
                  <div role="cell">
                    <time>
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(x.publishedAt)}
                    </time>
                    <small>por {x.author.name}</small>
                  </div>
                  <div role="cell" className="publication-engagement">
                    <span>
                      <Heart size={16} />
                      {x._count.likes}
                    </span>
                    <span>
                      <MessageCircle size={16} />
                      {x._count.comments}
                    </span>
                  </div>
                  <div role="cell" className="publication-actions">
                    <Link
                      aria-label={"Editar / arquivar: " + x.title}
                      href={
                        "?kind=" +
                        (x.completionId ? "recognition" : "post") +
                        "&id=" +
                        x.id +
                        "#editor"
                      }
                    >
                      <Pencil size={16} />
                    </Link>
                    {x.status === "PUBLISHED" && !scheduled && (
                      <Link
                        aria-label={"Ver publicação: " + x.title}
                        href={"/mural?post=" + x.id}
                      >
                        <ExternalLink size={16} />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {canEdit && kind === "album" && (
        <section className="panel">
          <h2>Álbuns</h2>
          {albums.map((x) => (
            <div className="community-management-row" key={x.id}>
              <h3>{x.title}</h3>
              <PhotoGallery photos={x.media} title={x.title} />
              <Link href={"?kind=album&id=" + x.id + "#editor"}>
                Editar / acrescentar fotos
              </Link>
            </div>
          ))}
        </section>
      )}
      {canEdit && kind === "event" && (
        <section className="panel">
          <h2>Eventos</h2>
          {events.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.title}</strong>
              <p>
                {date(x.startsAt)} · {x.status}
              </p>
              <Link href={"?kind=event&id=" + x.id + "#editor"}>
                Editar evento e fotos
              </Link>
            </div>
          ))}
        </section>
      )}
      {canEdit && kind === "photo-mission" && (
        <section className="panel">
          <h2>Missões com foto</h2>
          {missions.map((x) => (
            <div className="community-management-row" key={x.id}>
              <strong>{x.mission.title}</strong>
              <p>{x.status}</p>
              <Link href={"?kind=photo-mission&id=" + x.id + "#editor"}>
                Editar regras
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
      {r.photos && kind === "photos" && (
        <section className="panel">
          <h2>Enviar e gerenciar fotos</h2>
          <p>
            Acrescente fotos a conteúdos publicados ou aos seus próprios
            rascunhos, preservando os textos e as permissões de edição.
          </p>
          {[
            ...albums.map((a) => ({
              id: a.id,
              title: a.title,
              kind: "ALBUM",
              authorId: a.authorId,
              status: a.status,
              media: a.media,
            })),
            ...posts.map((a) => ({
              id: a.id,
              title: a.title,
              kind: "POST",
              authorId: a.authorId,
              status: a.status,
              media: a.media,
            })),
            ...events.map((a) => ({
              id: a.id,
              title: a.title,
              kind: "EVENT",
              authorId: a.authorId,
              status: a.status,
              media: a.media,
            })),
          ]
            .filter((a) => a.status === "PUBLISHED" || a.authorId === u.id)
            .map((a) => (
              <details key={a.kind + a.id}>
                <summary>
                  {a.title} · {a.kind}
                </summary>
                <CommunityForm action="append-photos" label="Salvar fotos">
                  <input type="hidden" name="targetId" value={a.id} />
                  <input type="hidden" name="kind" value={a.kind} />
                  <PhotoUpload max={Math.max(0, 8 - a.media.length)} />
                  <label className="field">
                    Capa existente
                    <select name="coverId">
                      <option value="">
                        Manter ou selecionar nova capa no envio
                      </option>
                      {a.media.map((m, i) => (
                        <option value={m.id} key={m.id}>
                          Foto {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" name="imageAuthorization" required />
                    Confirmo autorização de uso de todas as fotos.
                  </label>
                  <label className="check">
                    <input type="checkbox" name="restrictedChecked" required />
                    Revisei informações restritas de todas as fotos.
                  </label>
                </CommunityForm>
              </details>
            ))}
        </section>
      )}
      {r.moderate && kind === "comments" && (
        <section className="panel">
          <h2>Moderação de comentários</h2>
          {[
            ...comments.map((c) => ({
              ...c,
              kind: "POST",
              context: c.post.title,
            })),
            ...mediaComments.map((c) => ({
              ...c,
              kind: c.thread.albumId ? "ALBUM" : "PHOTO",
              context: c.thread.album?.title ?? "Fotografia",
            })),
          ].map((c) => (
            <article className="community-comment" key={c.kind + c.id}>
              <strong>
                {c.user.name} · {c.context}
              </strong>
              <p>{c.text}</p>
              <span>{c.hidden ? "Oculto" : "Visível"}</span>
              <CommunityForm
                action="moderate"
                label={c.hidden ? "Restaurar comentário" : "Ocultar comentário"}
              >
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="kind" value={c.kind} />
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
          <h2>Permissões individuais</h2>
          <p>
            Selecione qualquer usuário ativo e conceda somente as ações
            necessárias. Cargo, setor e marcações de liderança não interferem
            neste módulo.
          </p>
          {users.map((x) => (
            <div className="community-management-row" key={x.id}>
              <h3>{x.name}</h3>
              <CommunityForm
                key={x.communityGrant?.updatedAt.toISOString() ?? "new"}
                action="grant"
                label="Salvar permissões"
              >
                <input type="hidden" name="userId" value={x.id} />
                {permissions.map(({ key, label }) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      name={key}
                      defaultChecked={x.communityGrant?.[key] ?? false}
                    />
                    {label}
                  </label>
                ))}
              </CommunityForm>
            </div>
          ))}
          <CommunityForm action="purge" label="Remover somente fotos expiradas">
            <p>
              Remove arquivos expirados, preservando registros, avaliações e
              extratos.
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
              encodeURIComponent(q) +
              "&category=" +
              encodeURIComponent(p.category ?? "") +
              "&sort=" +
              encodeURIComponent(p.sort ?? "newest")
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
            encodeURIComponent(q) +
            "&category=" +
            encodeURIComponent(p.category ?? "") +
            "&sort=" +
            encodeURIComponent(p.sort ?? "newest")
          }
        >
          Próxima página
        </Link>
      </div>
    </div>
  );
}
