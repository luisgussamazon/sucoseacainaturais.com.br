"use client";
import { UserAvatar } from "./user-avatar";
import { useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";
import { SocialInteractions } from "./community-client";
import styles from "./feed-post.module.css";
export function FeedPost({
  id,
  title,
  description,
  author,
  authorId,
  authorAvatarUpdatedAt,
  category,
  pinned,
  publishedAt,
  albumId,
  photos,
  children,
}: {
  id: string;
  title: string;
  description: string;
  author: string;
  authorId?: string;
  authorAvatarUpdatedAt?: string | null;
  category: string;
  pinned: boolean;
  publishedAt: string;
  albumId: string | null;
  photos: { id: string }[];
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false),
    [index, setIndex] = useState(0),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [viewing, setViewing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = photos[index];
  const move = (n: number) =>
    setIndex((i) => (i + n + photos.length) % photos.length);
  async function download() {
    if (!photo || pending) return;
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/community/media/" + photo.id + "/download", {
        cache: "no-store",
      });
      if (!r.ok)
        throw new Error("Foto indisponível ou sem autorização para download.");
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "SSD-VBJ2-FOTO-" +
        publishedAt.slice(0, 10) +
        "-" +
        (index + 1) +
        ".webp";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível baixar a foto.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <article id={id} className={styles.post}>
      <div className={styles.composition}>
        <div className={styles.copy}>
          <header className={styles.author}>
            <UserAvatar
              id={authorId}
              name={author}
              avatarUpdatedAt={authorAvatarUpdatedAt}
              size={44}
            />
            <div>
              <strong>{author}</strong>
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleString("pt-BR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Sao_Paulo",
                })}
              </time>
            </div>
            <span
              className={styles.category}
              data-green={category.toLowerCase().includes("sustent")}
            >
              {category}
            </span>
          </header>
          {pinned && <small className={styles.pinned}>Publicação fixada</small>}
          <h3>{title}</h3>
          <p
            className={
              expanded || description.length <= 240
                ? styles.full
                : styles.summary
            }
          >
            {description}
          </p>
          {description.length > 240 && (
            <button
              className={styles.textButton}
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {expanded ? "Ver menos" : "Ver mais"}
            </button>
          )}
          {albumId && (
            <Link href={"/momentos?album=" + albumId}>Ver álbum associado</Link>
          )}
        </div>
        {photo && (
          <div className={styles.media}>
            <button
              className={styles.photo}
              onClick={() => {
                setViewing(true);
                dialog.current?.showModal();
              }}
              aria-label={"Ampliar foto: " + title}
            >
              <img
                className={styles.backdrop}
                src={"/api/community/media/" + photo.id}
                alt=""
                aria-hidden="true"
                loading="lazy"
              />
              <img
                className={styles.foreground}
                src={"/api/community/media/" + photo.id}
                alt={title + " — foto " + (index + 1)}
                loading="lazy"
              />
            </button>
            {photos.length > 1 && (
              <div className={styles.carousel}>
                <button onClick={() => move(-1)} aria-label="Foto anterior">
                  <ChevronLeft size={19} />
                </button>
                <span>
                  {index + 1} / {photos.length}
                </span>
                <button onClick={() => move(1)} aria-label="Próxima foto">
                  <ChevronRight size={19} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <details className={styles.options}>
        <summary aria-label="Opções da publicação">
          <MoreHorizontal size={21} />
        </summary>
        <div>
          <Link href={"/mural?post=" + id}>Abrir publicação completa</Link>
          {children}
        </div>
      </details>
      <div className={styles.interactions}>
        <SocialInteractions
          kind="POST"
          targetId={id}
          composerAlways
          downloadAction={
            photo ? (
              <button disabled={pending} onClick={download}>
                <Download size={19} />
                {pending ? "Baixando…" : "Baixar foto"}
              </button>
            ) : null
          }
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <dialog
        ref={dialog}
        className={styles.modal}
        onClose={() => setViewing(false)}
        aria-label={"Fotografia: " + title}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).matches("input,textarea,select"))
            return;
          if (e.key === "ArrowLeft") move(-1);
          if (e.key === "ArrowRight") move(1);
        }}
      >
        <button
          className={styles.close}
          onClick={() => dialog.current?.close()}
          aria-label="Fechar fotografia"
        >
          <X />
        </button>
        {photo && (
          <img
            src={"/api/community/media/" + photo.id}
            alt={title + " — foto " + (index + 1)}
          />
        )}
        <div className={styles.carousel}>
          {photos.length > 1 && (
            <>
              <button onClick={() => move(-1)} aria-label="Foto anterior">
                <ChevronLeft />
              </button>
              <span>
                {index + 1} / {photos.length}
              </span>
              <button onClick={() => move(1)} aria-label="Próxima foto">
                <ChevronRight />
              </button>
            </>
          )}
          <button disabled={pending} onClick={download}>
            <Download size={18} /> Baixar foto
          </button>
        </div>
        {photo && viewing && (
          <SocialInteractions key={photo.id} kind="PHOTO" targetId={photo.id} />
        )}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </article>
  );
}
