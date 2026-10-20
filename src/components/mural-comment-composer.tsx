"use client";
import { UserAvatar, type AvatarIdentity } from "./user-avatar";
import { useId, useRef, useState } from "react";
import { Smile } from "lucide-react";
import styles from "./mural-interactions.module.css";
const emojis = [
  "😀",
  "😊",
  "😍",
  "👏",
  "❤️",
  "💚",
  "🎉",
  "🙌",
  "💪",
  "🏆",
  "🚀",
  "🌱",
  "👍",
  "✨",
  "🙏",
  "🥳",
];
export function CommentComposer({
  viewerName,
  viewer,
  value,
  onChange,
  onSubmit,
  pending,
  reply = false,
}: {
  viewerName: string;
  viewer?: AvatarIdentity;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  reply?: boolean;
}) {
  const [open, setOpen] = useState(false),
    input = useRef<HTMLTextAreaElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    range = useRef({ start: 0, end: 0 }),
    id = useId();
  function insert(emoji: string) {
    const { start, end } = range.current;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > 1000) return;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        start + emoji.length,
        start + emoji.length,
      );
      range.current = {
        start: start + emoji.length,
        end: start + emoji.length,
      };
    });
  }
  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !pending) {
          onSubmit();
          setOpen(false);
        }
      }}
    >
      <span
        className={styles.avatar}
        aria-label={viewerName ? "Comentando como " + viewerName : "Seu avatar"}
      >
        <UserAvatar {...viewer} name={viewer?.name ?? viewerName} size={28} />
      </span>
      <div
        className={styles.inputArea}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <textarea
          ref={input}
          autoFocus={reply}
          aria-label={reply ? "Sua resposta" : "Seu comentário"}
          placeholder={
            reply ? "Escreva uma resposta..." : "Escreva um comentário..."
          }
          value={value}
          maxLength={1000}
          required
          disabled={pending}
          rows={1}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          onSelect={(e) => {
            range.current = {
              start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd,
            };
          }}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          ref={trigger}
          type="button"
          className={styles.emojiTrigger}
          disabled={pending}
          aria-label="Selecionar emoji"
          aria-expanded={open}
          aria-controls={id}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!open && input.current)
              range.current = {
                start: input.current.selectionStart,
                end: input.current.selectionEnd,
              };
            if (!open) input.current?.focus({ preventScroll: true });
            setOpen(!open);
          }}
        >
          <Smile size={21} />
        </button>
        {open && (
          <div
            id={id}
            role="group"
            aria-label="Emojis"
            className={styles.emojiPicker}
          >
            {emojis.map((emoji) => (
              <button
                type="button"
                key={emoji}
                aria-label={"Inserir " + emoji}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => insert(emoji)}
                disabled={
                  pending ||
                  value.length -
                    range.current.end +
                    range.current.start +
                    emoji.length >
                    1000
                }
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        className={styles.publish}
        disabled={pending || !value.trim()}
      >
        {pending ? "Enviando…" : reply ? "Responder" : "Publicar"}
      </button>
    </form>
  );
}
