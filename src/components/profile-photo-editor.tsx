"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, Save } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import styles from "./profile.module.css";
export function ProfilePhotoEditor({
  id,
  name,
  avatarUpdatedAt,
}: {
  id: string;
  name: string;
  avatarUpdatedAt: string | null;
}) {
  const [current, setCurrent] = useState(avatarUpdatedAt),
    [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [dimensions, setDimensions] = useState({ width: 0, height: 0 }),
    [x, setX] = useState(0.5),
    [y, setY] = useState(0.5),
    [zoom, setZoom] = useState(1),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    router = useRouter();
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const side = Math.min(dimensions.width, dimensions.height) / zoom;
  function choose(selected: File | undefined) {
    setError("");
    setMessage("");
    if (!selected) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size > 4 * 1024 * 1024
    ) {
      setError("Selecione JPG, PNG ou WebP de até 4 MB.");
      return;
    }
    setFile(selected);
    setDimensions({ width: 0, height: 0 });
    setX(0.5);
    setY(0.5);
    setZoom(1);
    setConsent(false);
  }
  async function save(remove = false) {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      let body: FormData | undefined;
      if (!remove) {
        if (!file || !dimensions.width || !consent) return;
        body = new FormData();
        body.set("photo", file);
        body.set("x", String(x));
        body.set("y", String(y));
        body.set("zoom", String(zoom));
        body.set("consent", String(consent));
      }
      const response = await fetch("/api/profile-photo", {
          method: remove ? "DELETE" : "POST",
          body,
          cache: "no-store",
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      setCurrent(data.avatarUpdatedAt);
      window.dispatchEvent(
        new CustomEvent("profile-photo:updated", {
          detail: { userId: id, avatarUpdatedAt: data.avatarUpdatedAt },
        }),
      );
      setFile(null);
      if (input.current) input.current.value = "";
      setMessage(remove ? "Foto removida." : "Foto de perfil atualizada.");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar a foto.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className={styles.card + " " + styles.photo}
      aria-label="Foto do perfil"
    >
      <h2>Foto do perfil</h2>
      {!file && (
        <UserAvatar id={id} name={name} avatarUpdatedAt={current} size={144} />
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Selecionar foto de perfil"
        hidden
        disabled={pending}
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <div className={styles.buttons}>
        <button
          type="button"
          className="button"
          disabled={pending}
          onClick={() => {
            if (input.current) input.current.value = "";
            input.current?.click();
          }}
        >
          <Camera size={17} />
          Alterar foto
        </button>
        {current && (
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => save(true)}
          >
            <Trash2 size={17} />
            Remover foto
          </button>
        )}
      </div>
      {file && url && (
        <>
          <div
            className={styles.crop}
            aria-label="Prévia circular do recorte"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, px: x, py: y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current || !side) return;
              const size = e.currentTarget.clientWidth;
              setX(
                Math.max(
                  0,
                  Math.min(
                    1,
                    drag.current.px -
                      ((e.clientX - drag.current.x) * side) /
                        (size * Math.max(1, dimensions.width - side)),
                  ),
                ),
              );
              setY(
                Math.max(
                  0,
                  Math.min(
                    1,
                    drag.current.py -
                      ((e.clientY - drag.current.y) * side) /
                        (size * Math.max(1, dimensions.height - side)),
                  ),
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <img
              src={url}
              alt="Pré-visualização da foto de perfil"
              draggable={false}
              onLoad={(e) =>
                setDimensions({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              onError={() => {
                setError("Não foi possível ler a foto selecionada.");
                setDimensions({ width: 0, height: 0 });
              }}
              style={
                side
                  ? {
                      width: (dimensions.width / side) * 100 + "%",
                      height: (dimensions.height / side) * 100 + "%",
                      left:
                        ((-(dimensions.width - side) * x) / side) * 100 + "%",
                      top:
                        ((-(dimensions.height - side) * y) / side) * 100 + "%",
                    }
                  : { width: "100%", height: "100%", objectFit: "contain" }
              }
            />
          </div>
          <p>Arraste a foto ou use os controles para reposicionar o recorte.</p>
          <div className={styles.editor}>
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label>
              Posição horizontal
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label>
              Posição vertical
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Autorizo exibir esta foto de perfil aos usuários autenticados do
              SSD VBJ2.
            </label>
          </div>
          <div className={styles.buttons}>
            <button
              className="button"
              disabled={pending || !consent || !dimensions.width}
              onClick={() => save()}
            >
              <Save size={17} />
              {pending ? "Salvando…" : "Salvar foto"}
            </button>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setFile(null)}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
      <p>
        JPG, PNG ou WebP · até 4 MB. Sua foto ficará visível aos colegas
        autenticados.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.status}>
          {message}
        </p>
      )}
    </section>
  );
}
