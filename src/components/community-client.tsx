"use client";
import { MuralSocial } from "./mural-social";
import { UserAvatar, type AvatarIdentity } from "./user-avatar";
import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, X, FileText } from "lucide-react";
function updated() {
  window.dispatchEvent(new Event("community:updated"));
}
export function CommunityForm({
  action,
  children,
  label = "Salvar",
  reset = false,
  composer = false,
  onSuccess,
  publishLabel,
  draftLabel = "Salvar rascunho",
  preserveKind,
  archive = false,
}: {
  archive?: boolean;
  publishLabel?: string;
  draftLabel?: string;
  preserveKind?: string;
  action: string;
  children: React.ReactNode;
  label?: string;
  reset?: boolean;
  composer?: boolean;
  onSuccess?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [progress, setProgress] = useState<number | null>(null);
  const router = useRouter();
  const lock = useRef(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    const form = e.currentTarget;
    const data = new FormData(form);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    setPending(true);
    setMessage("");
    setProgress(0);
    try {
      const result = await new Promise<{ message: string; contentId?: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/community/" + action);
          xhr.responseType = "json";
          xhr.timeout = 120000;
          xhr.ontimeout = () => reject(new Error("O envio demorou mais que o esperado. Seus dados continuam preenchidos; confira a conexão e tente novamente."));
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setProgress(
                Math.min(100, Math.round((e.loaded / e.total) * 100)),
              );
          };
          xhr.onerror = () =>
            reject(
              new Error(
                "Falha de conexão. Seus arquivos continuam selecionados; tente novamente.",
              ),
            );
          xhr.onload = () => {
            const r = xhr.response;
            if (xhr.status < 200 || xhr.status >= 300)
              reject(new Error(r?.error ?? "Não foi possível concluir."));
            else resolve(r);
          };
          xhr.send(data);
        },
      );
      form.dataset.dirty = "false";
      if (result.contentId) {
        const id = form.querySelector<HTMLInputElement>('input[name="id"]');
        if (id) id.value = result.contentId;
      }
      setError(false);
      setMessage(result.message);
      onSuccess?.(result.message);
      form.dispatchEvent(new Event("community:saved"));
      if (reset) form.reset();
      updated();
      if (
        result.contentId &&
        ["post", "album", "event", "photo-mission"].includes(action) &&
        !String(data.get("id") ?? "")
      ) {
        router.replace(
          "/comunidade?kind=" + (preserveKind ?? action) + "&id=" + result.contentId,
        );
      }
      router.refresh();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setPending(false);
      setProgress(null);
      lock.current = false;
    }
  }
  return (
    <form
      className={"community-form" + (composer ? " publication-form" : "")}
      onInputCapture={(e) => { e.currentTarget.dataset.dirty = "true"; }}
      onChangeCapture={(e) => { e.currentTarget.dataset.dirty = "true"; }}
      onReset={(e) => { e.currentTarget.dataset.dirty = "false"; }}
      onSubmit={submit}
    >
      <fieldset disabled={pending}>
        {children}
        {composer && (
          <button className="button secondary clear-publication" type="reset">
            Limpar
          </button>
        )}
        <div className="community-form-footer">
          {publishLabel ? <>
            <button className="button secondary" type="submit" name="status" value="DRAFT">{pending ? "Aguarde…" : draftLabel}</button>
            <button className="button" type="submit" name="status" value="PUBLISHED">{pending ? "Aguarde…" : publishLabel}</button>
          </> : <button className="button" type="submit">{pending ? "Aguarde…" : label}</button>}
          {archive && <button className="button secondary" type="submit" name="status" value="ARCHIVED">Arquivar álbum</button>}
        </div>
      </fieldset>
      {pending && (
        <div role="status">
          <progress
            max={100}
            value={progress ?? 0}
            aria-label="Progresso do envio"
          />
          <span>
            {progress === 100
              ? "Envio concluído. Validando e salvando…"
              : `Enviando: ${progress ?? 0}%`}
          </span>
        </div>
      )}
      {message && (
        <p
          className={"notice " + (error ? "error" : "success")}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
type Selected = { key: string; file: File; url: string };
export function PhotoUpload({
  required = false,
  max = 8,
  compact = false,
  editorFields,
  existingPhotos = [],
  enabled = true,
}: {
  required?: boolean;
  max?: number;
  compact?: boolean;
  editorFields?: React.ReactNode;
  existingPhotos?: { id: string }[];
  enabled?: boolean;
}) {
  const [photos, setPhotos] = useState<Selected[]>([]),
    [error, setError] = useState(""),
    [cover, setCover] = useState(""),
    [drag, setDrag] = useState(false),
    [existingCover, setExistingCover] = useState(existingPhotos[0]?.id ?? "");
  const box = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    latest = useRef<Selected[]>([]);
  latest.current = photos;
  const savedCover = existingPhotos[0]?.id ?? "";
  useEffect(() => { if (!latest.current.length) setExistingCover(savedCover); }, [savedCover]);
  useEffect(() => {
    const form = box.current?.closest("form");
    const append = (e: Event) => {
      const data = (e as FormDataEvent).formData;
      latest.current.forEach((p) => data.append("photos", p.file));
      data.set(
        "coverIndex",
        String(
          Math.max(
            0,
            latest.current.findIndex(
              (p) => p.key === box.current?.dataset.cover,
            ),
          ),
        ),
      );
    };
    const clear = () => {
      latest.current.forEach((p) => URL.revokeObjectURL(p.url));
      latest.current = [];
      setPhotos([]);
      setCover("");
    };
    form?.addEventListener("formdata", append);
    form?.addEventListener("community:saved", clear);
    form?.addEventListener("reset", clear);
    return () => {
      form?.removeEventListener("formdata", append);
      form?.removeEventListener("community:saved", clear);
      form?.removeEventListener("reset", clear);
      latest.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);
  function dirty() { const form=box.current?.closest("form"); if(form) form.dataset.dirty="true"; }
  function add(files: File[]) {
    if (!enabled || box.current?.closest("fieldset")?.disabled) return;
    dirty();
    setError("");
    const next = [...photos];
    for (const file of files) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 4 * 1024 * 1024
      ) {
        setError("Use JPEG, PNG ou WebP de até 4 MB por foto.");
        continue;
      }
      if (
        next.length >= max ||
        next.reduce((n, p) => n + p.file.size, 0) + file.size > 20 * 1024 * 1024
      ) {
        setError(`Limite: ${max} fotos e 20 MB por envio.`);
        break;
      }
      next.push({
        key: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      });
    }
    setPhotos(next);
    if (!cover && next[0]) setCover(next[0].key);
  }
  function remove(key: string) {
    dirty();
    const p = photos.find((p) => p.key === key);
    if (p) URL.revokeObjectURL(p.url);
    const next = photos.filter((p) => p.key !== key);
    setPhotos(next);
    if (cover === key) setCover(next[0]?.key ?? "");
  }
  function move(index: number, delta: number) {
    dirty();
    const next = [...photos];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setPhotos(next);
  }
  return (
    <div
      ref={box}
      data-cover={cover}
      className={
        "photo-upload " + (editorFields ? "album-editor-grid " : "") +
        (compact ? "photo-upload-composer " : "") +
        (drag ? "is-dragging" : "")
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(Array.from(e.dataTransfer.files));
      }}
    >
      <div className={editorFields ? "album-editor-main" : "photo-upload-main"}>
      {editorFields}
      {!enabled && <p className="notice">O envio de fotos exige permissão individual do administrador.</p>}
      {enabled && max > 0 && <div className="photo-upload-actions">
        <button
          className="button"
          type="button"
          onClick={() => picker.current?.click()}
        >
          {compact ? "Selecionar arquivos" : "Adicionar fotos"}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => camera.current?.click()}
        >
          Usar câmera
        </button>
      </div>}
      <input
        disabled={!enabled}
        ref={picker}
        className="photo-picker"
        type="file"
        multiple={max > 1}
        accept="image/jpeg,image/png,image/webp"
        aria-label="Selecionar fotos da galeria"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        disabled={!enabled}
        ref={camera}
        className="photo-picker"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Selecionar foto da câmera"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {enabled && max > 0 && compact && (
        <button
          type="button"
          className="upload-dropzone"
          onClick={() => picker.current?.click()}
        >
          <CloudUpload size={36} color="#1688ff" aria-hidden="true" />
          <strong>Arraste e solte as imagens aqui</strong>
          <span>ou clique para selecionar arquivos</span>
        </button>
      )}
      <small>
        Arraste fotos para esta área ou use os botões. Até {max} fotos, 4 MB por
        foto e 20 MB por envio. Formatos: JPEG, PNG ou WebP.
        {required ? " É necessário enviar pelo menos uma foto." : ""}
      </small>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="selected-photos">
        {photos.map((p, i) => (
          <div className="selected-photo" key={p.key}>
            <img src={p.url} alt={"Prévia: " + p.file.name} />
            <span>{p.file.name}</span>
            <button
              type="button"
              className={
                cover === p.key && !existingCover ? "photo-cover selected" : "photo-cover"
              }
              onClick={() => { dirty(); setExistingCover(""); setCover(p.key); }}
              aria-pressed={cover === p.key && !existingCover}
            >
              {cover === p.key && !existingCover ? "✓ Capa" : "Escolher capa"}
            </button>
            <div className="photo-order-controls">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={"Mover foto " + (i + 1) + " para antes"}
              >
                ←
              </button>
              <button
                type="button"
                disabled={i === photos.length - 1}
                onClick={() => move(i, 1)}
                aria-label={"Mover foto " + (i + 1) + " para depois"}
              >
                →
              </button>
              <button
                type="button"
                onClick={() => remove(p.key)}
                aria-label={"Remover foto " + (i + 1)}
              >
                {compact ? <X size={12} /> : "Remover"}
              </button>
            </div>
          </div>
        ))}
        {enabled && compact && photos.length < max && (
          <button
            className="add-more-photos"
            type="button"
            onClick={() => picker.current?.click()}
          >
            ＋<small>Adicionar mais fotos</small>
          </button>
        )}
      </div>
      </div>
      {editorFields && <aside className="album-editor-sidebar">
        <h3>Capa do álbum</h3>
        {enabled && <label className="field">Selecionar capa<select aria-label="Selecionar capa" value={existingCover ? 'existing:'+existingCover : cover} onChange={e=>{dirty(); const v=e.target.value; if(v.startsWith('existing:')){setExistingCover(v.slice(9));}else{setExistingCover('');setCover(v);}}}>
          {!existingPhotos.length && !photos.length && <option value="">Selecione fotos primeiro</option>}
          {existingPhotos.map((p,i)=><option key={p.id} value={'existing:'+p.id}>Foto salva {i+1}</option>)}
          {photos.map((p,i)=><option key={p.key} value={p.key}>Foto {i+1} · {p.file.name}</option>)}
        </select></label>}
        <input type="hidden" name="coverId" value={enabled ? existingCover : ''}/>
        {(existingCover || photos.length>0) ? <img className="album-cover-preview" src={existingCover ? '/api/community/media/'+existingCover : photos.find(p=>p.key===cover)?.url ?? photos[0]?.url} alt="Prévia da capa do álbum"/> : <div className="album-cover-empty"><CloudUpload size={32}/><p>A capa aparecerá aqui.</p></div>}
        <div className="notice"><strong>Onde será publicado?</strong><p>Álbuns publicados ficam disponíveis em Momentos VBJ2 para usuários autenticados, conforme as regras atuais. Rascunhos não são publicados em Momentos VBJ2.</p></div>
        {!!existingPhotos.length && <><h3>Fotos já salvas</h3><PhotoGallery photos={existingPhotos} title="Fotos do álbum"/></>}
      </aside>}
    </div>
  );
}
export function SocialInteractions(props: {
  kind: "POST" | "ALBUM" | "PHOTO";
  targetId: string;
  composerAlways?: boolean;
  downloadAction?: React.ReactNode;
}) {
  if (props.kind === "POST")
    return (
      <MuralSocial
        targetId={props.targetId}
        downloadAction={props.downloadAction}
      />
    );
  return <LegacySocialInteractions {...props} />;
}
type SocialData = {
  viewer: AvatarIdentity;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  comments: {
    id: string;
    name: string;
    userId: string;
    avatarUpdatedAt: string | null;
    text: string;
    createdAt: string;
    own: boolean;
  }[];
  canModerate: boolean;
  page: number;
};
function LegacySocialInteractions({
  kind,
  targetId,
  composerAlways = false,
}: {
  kind: "POST" | "ALBUM" | "PHOTO";
  targetId: string;
  composerAlways?: boolean;
}) {
  const [data, setData] = useState<SocialData | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [body, setBody] = useState(""),
    [page, setPage] = useState(1);
  const router = useRouter(),
    formId = useId(),
    requestId = useRef(""),
    alive = useRef(true);
  const load = useCallback(
    async (p = 1) => {
      try {
        const r = await fetch(
            "/api/community/interactions?" +
              new URLSearchParams({ kind, targetId, page: String(p) }),
            { cache: "no-store" },
          ),
          d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive.current) {
          setData((previous) =>
            p === 1
              ? d
              : {
                  ...d,
                  comments: [...(previous?.comments ?? []), ...d.comments],
                },
          );
          setPage(p);
          setError("");
        }
      } catch (e) {
        if (alive.current)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar as interações.",
          );
      }
    },
    [kind, targetId],
  );
  useEffect(() => {
    alive.current = true;
    setData(null);
    void load();
    const refresh = () => void load();
    window.addEventListener("community:updated", refresh);
    return () => {
      alive.current = false;
      window.removeEventListener("community:updated", refresh);
    };
  }, [load]);
  async function mutate(action: string, values: Record<string, string>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const f = new FormData();
      f.set("kind", kind);
      f.set("targetId", targetId);
      Object.entries(values).forEach(([k, v]) => f.set(k, v));
      const r = await fetch("/api/community/" + action, {
          method: "POST",
          body: f,
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (action === "comment") {
        setBody("");
        requestId.current = "";
        setOpen(true);
      }
      await load();
      updated();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="social-interactions"
      aria-label={
        "Interações " +
        (kind === "POST"
          ? "da publicação"
          : kind === "ALBUM"
            ? "do álbum"
            : "da fotografia")
      }
    >
      <div className="social-actions">
        <button
          className="social-button"
          type="button"
          disabled={pending || !data}
          aria-pressed={data?.liked ?? false}
          onClick={() =>
            mutate("like", { liked: data?.liked ? "false" : "true" })
          }
        >
          {data?.liked ? "♥ Descurtir" : "♡ Curtir"}
        </button>
        <span>{data?.likeCount ?? 0} curtidas</span>
        <button
          className="social-button"
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={formId}
        >
          Comentar ({data?.commentCount ?? 0})
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <span role="status">Carregando interações…</span>}
      {(open || composerAlways) && (
        <div id={formId}>
          <div aria-live="polite">
            {(open ? data?.comments : [])?.map((c) => (
              <div className="community-comment" key={c.id}>
                <UserAvatar
                  id={c.userId}
                  name={c.name}
                  avatarUpdatedAt={c.avatarUpdatedAt}
                  size={28}
                />{" "}
                <strong>{c.name}</strong>
                <small>
                  {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                </small>
                <p>{c.text}</p>
                {c.own && (
                  <button
                    className="social-button"
                    disabled={pending}
                    onClick={() => mutate("delete-comment", { id: c.id })}
                  >
                    Excluir meu comentário
                  </button>
                )}
                {data?.canModerate && (
                  <CommunityForm action="moderate" label="Ocultar comentário">
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="hidden" value="true" />
                    <label className="field">
                      Motivo da moderação
                      <input
                        name="reason"
                        minLength={5}
                        maxLength={300}
                        required
                      />
                    </label>
                  </CommunityForm>
                )}
              </div>
            ))}
            {data && data.comments.length < data.commentCount && (
              <button
                className="social-button"
                type="button"
                onClick={() => load(page + 1)}
              >
                Mais comentários
              </button>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!requestId.current) requestId.current = crypto.randomUUID();
              void mutate("comment", {
                text: body,
                requestId: requestId.current,
              });
            }}
          >
            {data?.viewer && <UserAvatar {...data.viewer} size={32} />}
            <label className="field">
              Seu comentário
              <textarea
                required
                maxLength={1000}
                placeholder="Escreva um comentário..."
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  requestId.current = "";
                }}
              />
            </label>
            <button className="button" disabled={pending || !body.trim()}>
              Enviar comentário
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
export function PhotoGallery({
  photos,
  title,
  interactive = false,
  grid = false,
  srcPrefix = "/api/community/media/",
}: {
  photos: { id: string }[];
  title: string;
  interactive?: boolean;
  grid?: boolean;
  srcPrefix?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    current = index === null ? null : photos[index];
  useEffect(() => {
    if (index !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [index]);
  if (!photos.length) return null;
  return (
    <div className="community-gallery">
      {grid ? (
        <div className="recent-photo-grid">
          {photos.slice(0, 6).map((p, i) => (
            <button
              type="button"
              className="gallery-cover"
              key={p.id}
              onClick={() => setIndex(i)}
              aria-label={"Abrir foto " + (i + 1) + ": " + title}
            >
              <img
                src={srcPrefix + p.id}
                alt={title + " — foto " + (i + 1)}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="gallery-cover"
          onClick={() => setIndex(0)}
          aria-label={"Abrir fotos: " + title}
        >
          <img src={srcPrefix + photos[0].id} alt={title} loading="lazy" />
        </button>
      )}
      <button
        type="button"
        className="gallery-count"
        onClick={() => setIndex(0)}
      >
        Ver todas as fotos ({photos.length})
      </button>
      <dialog
        ref={dialog}
        onCancel={() => setIndex(null)}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).matches("input,textarea,select"))
            return;
          if (e.key === "ArrowRight")
            setIndex((i) => ((i ?? 0) + 1) % photos.length);
          if (e.key === "ArrowLeft")
            setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length);
        }}
        aria-label={"Galeria: " + title}
      >
        <button
          type="button"
          className="button secondary"
          onClick={() => setIndex(null)}
        >
          Fechar galeria
        </button>
        {current && (
          <img
            src={srcPrefix + current.id}
            alt={title + " — foto " + ((index ?? 0) + 1)}
          />
        )}
        <div className="gallery-controls">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length)
            }
          >
            Anterior
          </button>
          <span>
            {(index ?? 0) + 1} / {photos.length}
          </span>
          <button
            type="button"
            className="button secondary"
            onClick={() => setIndex((i) => ((i ?? 0) + 1) % photos.length)}
          >
            Próxima
          </button>
        </div>
        {current && interactive && (
          <SocialInteractions
            key={current.id}
            kind="PHOTO"
            targetId={current.id}
          />
        )}
      </dialog>
    </div>
  );
}

export function MissionTypeSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label className="field">
      Tipo de missão
      <select
        value={value}
        onChange={(e) => router.push("/comunidade?kind=" + e.target.value)}
      >
        <option value="photo-mission">Missão fotográfica</option>
        <option value="quiz-mission">Quiz</option>
      </select>
    </label>
  );
}

export function DescriptionField({ value = "" }: { value?: string }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    const reset = () => setText(value);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value]);
  return (
    <label className="field composer-description">
      Descrição{" "}
      <textarea
        ref={ref}
        name="description"
        required
        maxLength={5000}
        placeholder="Conte sobre o evento, conquista ou momento..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <small>{text.length}/5000</small>
    </label>
  );
}

export function PublicationThumbnail({
  id,
  title,
}: {
  id?: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  return id && !failed ? (
    <img
      className="publication-thumbnail"
      src={"/api/community/media/" + id}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="publication-placeholder"
      title="Fotografia protegida ou indisponível"
    >
      <FileText size={22} />
    </span>
  );
}
