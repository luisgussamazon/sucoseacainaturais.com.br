"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { UserAvatar, type AvatarIdentity } from "./user-avatar";
import { CommentComposer } from "./mural-comment-composer";
import styles from "./mural-interactions.module.css";
type Comment = {
  id: string;
  userId: string;
  name: string;
  avatarUpdatedAt: string | null;
  text: string;
  createdAt: string;
  own: boolean;
  hidden: boolean;
  liked: boolean;
  likeCount: number;
  replyToName: string | null;
};
type Root = Comment & { replies: Comment[]; replyCount: number };
type Data = {
  viewer: AvatarIdentity;
  likers: AvatarIdentity[];
  liked: boolean;
  likeCount: number;
  commentCount: number;
  comments: Root[];
  totalRoots: number;
  canModerate: boolean;
};
type Mutate = (
  action: string,
  values: Record<string, string>,
) => Promise<boolean>;
function relative(date: string) {
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  const fmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (seconds < 60) return "agora";
  if (seconds < 3600) return fmt.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return fmt.format(-Math.floor(seconds / 3600), "hour");
  return fmt.format(-Math.floor(seconds / 86400), "day");
}
export function MuralSocial({
  targetId,
  downloadAction,
}: {
  targetId: string;
  downloadAction?: ReactNode;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [body, setBody] = useState(""),
    [version, setVersion] = useState(0);
  const [moderating, setModerating] = useState<Comment | null>(null),
    [reason, setReason] = useState("");
  const alive = useRef(true),
    pages = useRef(1),
    lock = useRef(false),
    requestId = useRef(""),
    dialog = useRef<HTMLDialogElement>(null),
    section = useRef<HTMLElement>(null),
    source = useId(),
    sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const parts: Data[] = [];
      for (let page = 1; page <= pages.current; page++) {
        const r = await fetch(
          "/api/community/interactions?" +
            new URLSearchParams({ kind: "POST", targetId, page: String(page) }),
          { cache: "no-store" },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        parts.push(d);
      }
      if (alive.current && seq === sequence.current) {
        setData({ ...parts[0], comments: parts.flatMap((d) => d.comments) });
        setVersion((v) => v + 1);
        setError("");
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Falha de conexão.");
    }
  }, [targetId]);
  useEffect(() => {
    alive.current = true;
    pages.current = 1;
    void load();
    const update = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || (d.targetId === targetId && d.source !== source)) void load();
    };
    window.addEventListener("community:updated", update);
    window.addEventListener("mural:updated", update);
    return () => {
      alive.current = false;
      sequence.current++;
      window.removeEventListener("community:updated", update);
      window.removeEventListener("mural:updated", update);
    };
  }, [load, source, targetId]);
  useEffect(() => {
    if (moderating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [moderating]);
  const mutate: Mutate = async (action, values) => {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const f = new FormData();
      f.set("kind", "POST");
      f.set("targetId", targetId);
      Object.entries(values).forEach(([k, v]) => f.set(k, v));
      const r = await fetch("/api/community/" + action, {
          method: "POST",
          body: f,
          cache: "no-store",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      window.dispatchEvent(
        new CustomEvent("mural:updated", { detail: { targetId, source } }),
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha de conexão. Tente novamente.",
      );
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  return (
    <section
      ref={section}
      className={"social-interactions " + styles.root}
      aria-label="Interações da publicação"
    >
      <div className={styles.actions}>
        <button
          className={styles.action}
          aria-label={data?.liked ? "Descurtir" : "Curtir"}
          aria-pressed={data?.liked ?? false}
          disabled={!data || pending}
          onClick={() => void mutate("like", { liked: String(!data?.liked) })}
        >
          <Heart size={24} fill={data?.liked ? "currentColor" : "none"} />
          <span>{data?.likeCount ?? 0}</span>
        </button>
        <button
          className={styles.action}
          aria-label="Comentários"
          onClick={() =>
            section.current
              ?.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Seu comentário"]',
              )
              ?.focus()
          }
        >
          <MessageCircle size={24} />
          <span>{data?.commentCount ?? 0}</span>
        </button>
        {downloadAction && (
          <span className={styles.download}>{downloadAction}</span>
        )}
      </div>
      {!!data?.likers.length && (
        <div className={styles.likers}>
          <div className={styles.avatars} aria-hidden="true">
            {data.likers.map((l) => (
              <UserAvatar key={l.id} {...l} size={28} />
            ))}
          </div>
          <span>
            {data.likers
              .slice(0, 2)
              .map((l) => l.name)
              .join(", ")}
            {data.likeCount > 2
              ? " e " +
                (data.likeCount === 3
                  ? "outra 1 pessoa"
                  : "outras " + (data.likeCount - 2) + " pessoas")
              : ""}{" "}
            {data.likeCount === 1 ? "curtiu isso" : "curtiram isso"}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando interações…</p>}
      {data && (
        <>
          <div className={styles.comments} aria-live="polite">
            {data.comments.map((c) => (
              <Conversation
                key={c.id}
                root={c}
                targetId={targetId}
                viewer={data.viewer}
                canModerate={data.canModerate}
                pending={pending}
                mutate={mutate}
                version={version}
                moderate={(c) => {
                  setReason("");
                  setModerating(c);
                }}
              />
            ))}
          </div>
          {data.comments.length < data.totalRoots && (
            <button
              className={styles.more}
              disabled={pending}
              onClick={() => {
                if (lock.current) return;
                pages.current++;
                void load();
              }}
            >
              Ver mais comentários <ChevronDown size={18} />
            </button>
          )}
          <CommentComposer
            viewerName={data.viewer.name}
            viewer={data.viewer}
            value={body}
            pending={pending}
            onChange={(v) => {
              setBody(v);
              requestId.current = "";
            }}
            onSubmit={() => {
              if (!requestId.current) requestId.current = crypto.randomUUID();
              void mutate("comment", {
                text: body,
                requestId: requestId.current,
              }).then((ok) => {
                if (ok) {
                  setBody("");
                  requestId.current = "";
                }
              });
            }}
          />
        </>
      )}
      <dialog
        className={styles.moderation}
        ref={dialog}
        aria-label="Moderar comentário"
        onCancel={() => setModerating(null)}
        onClose={() => setModerating(null)}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Fechar moderação"
          onClick={() => setModerating(null)}
        >
          <X size={20} />
        </button>
        <h3>
          {moderating?.hidden ? "Restaurar comentário" : "Ocultar comentário"}
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (moderating)
              void mutate("moderate", {
                id: moderating.id,
                hidden: String(!moderating.hidden),
                reason,
              }).then((ok) => {
                if (ok) setModerating(null);
              });
          }}
        >
          <label className="field">
            Motivo da moderação
            <textarea
              autoFocus
              required
              minLength={5}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="button" disabled={pending}>
            {pending ? "Salvando…" : "Confirmar moderação"}
          </button>
        </form>
      </dialog>
    </section>
  );
}
function Conversation({
  root,
  targetId,
  viewer,
  canModerate,
  pending,
  mutate,
  version,
  moderate,
}: {
  root: Root;
  targetId: string;
  viewer: AvatarIdentity;
  canModerate: boolean;
  pending: boolean;
  mutate: Mutate;
  version: number;
  moderate: (c: Comment) => void;
}) {
  const [replyTo, setReplyTo] = useState<Comment | null>(null),
    [body, setBody] = useState(""),
    [replies, setReplies] = useState(root.replies),
    [replyPage, setReplyPage] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef("");
  useEffect(() => {
    let live = true;
    async function refresh() {
      if (replyPage === 1) {
        setReplies(root.replies);
        return;
      }
      setLoading(true);
      try {
        const parts: Comment[][] = [];
        for (let page = 1; page <= replyPage; page++) {
          const r = await fetch(
              "/api/community/interactions?" +
                new URLSearchParams({
                  kind: "POST",
                  targetId,
                  parentId: root.id,
                  page: String(page),
                }),
              { cache: "no-store" },
            ),
            d = await r.json();
          if (!r.ok) throw Error(d.error);
          parts.push(d.comments);
        }
        if (live) {
          setReplies(parts.flat());
          setError("");
        }
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar respostas.",
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    void refresh();
    return () => {
      live = false;
    };
  }, [root.replies, root.id, targetId, replyPage, version]);
  function comment(c: Comment, nested = false) {
    return (
      <div
        key={c.id}
        data-comment-id={c.id}
        className={
          "community-comment " +
          styles.comment +
          (nested ? " " + styles.reply : "")
        }
      >
        <UserAvatar
          id={c.userId}
          name={c.name}
          avatarUpdatedAt={c.avatarUpdatedAt}
          size={nested ? 34 : 40}
        />
        <div className={styles.commentBody}>
          <div className={styles.commentHeading}>
            <strong>{c.name}</strong>
            <time
              dateTime={c.createdAt}
              title={new Date(c.createdAt).toLocaleString("pt-BR")}
            >
              {relative(c.createdAt)}
            </time>
            {c.hidden && (
              <small className={styles.hidden}>Oculto · moderação</small>
            )}
          </div>
          <p>
            {nested && c.replyToName && (
              <span className={styles.replyTo}>Para {c.replyToName}: </span>
            )}
            {c.text}
          </p>
          <div className={styles.commentActions}>
            <button
              aria-label={
                c.liked ? "Descurtir comentário" : "Curtir comentário"
              }
              aria-pressed={c.liked}
              disabled={pending || c.hidden}
              onClick={() =>
                void mutate("comment-like", {
                  id: c.id,
                  liked: String(!c.liked),
                })
              }
            >
              <Heart size={18} fill={c.liked ? "currentColor" : "none"} />
              <span>{c.likeCount}</span>
            </button>
            {!c.hidden && !root.hidden && (
              <button
                disabled={pending}
                onClick={() => {
                  setReplyTo(c);
                  setBody("");
                  requestId.current = "";
                }}
              >
                Responder
              </button>
            )}
            {(c.own || canModerate) && (
              <details className={styles.commentMenu}>
                <summary aria-label="Opções do comentário">
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  {c.own && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        void mutate("delete-comment", { id: c.id })
                      }
                    >
                      Excluir meu comentário
                    </button>
                  )}
                  {canModerate && (
                    <button
                      disabled={pending}
                      onClick={(e) => {
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        moderate(c);
                      }}
                    >
                      {c.hidden ? "Restaurar comentário" : "Ocultar comentário"}
                    </button>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.conversation}>
      {comment(root)}
      <div className={styles.replies}>
        {replies.map((c) => comment(c, true))}
        {replies.length < root.replyCount && (
          <button
            disabled={loading}
            className={styles.more}
            onClick={() => setReplyPage((p) => p + 1)}
          >
            {loading ? "Carregando…" : "Ver mais respostas"}
            <ChevronDown size={16} />
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {replyTo && (
        <div className={styles.replyComposer}>
          <div className={styles.replyLabel}>
            Respondendo a {replyTo.name}
            <button
              aria-label="Cancelar resposta"
              onClick={() => setReplyTo(null)}
            >
              <X size={16} />
            </button>
          </div>
          <CommentComposer
            reply
            viewerName={viewer.name}
            viewer={viewer}
            value={body}
            pending={pending}
            onChange={(v) => {
              setBody(v);
              requestId.current = "";
            }}
            onSubmit={() => {
              if (!requestId.current) requestId.current = crypto.randomUUID();
              void mutate("comment", {
                text: body,
                replyToId: replyTo.id,
                requestId: requestId.current,
              }).then((ok) => {
                if (ok) {
                  setBody("");
                  setReplyTo(null);
                  requestId.current = "";
                  setReplyPage(
                    Math.max(1, Math.ceil((root.replyCount + 1) / 3)),
                  );
                }
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
