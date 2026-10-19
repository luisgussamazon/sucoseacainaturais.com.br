"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function CommunityForm({
  action,
  children,
  label = "Salvar",
  reset = false,
}: {
  action: string;
  children: React.ReactNode;
  label?: string;
  reset?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/community/" + action, {
        method: "POST",
        body: data,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível concluir.");
      setError(false);
      setMessage(result.message);
      if (reset) form.reset();
      router.refresh();
    } catch (e) {
      setError(true);
      setMessage(
        e instanceof Error ? e.message : "Falha de conexão. Tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="community-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        {children}
        <button className="button" type="submit">
          {pending ? "Aguarde…" : label}
        </button>
      </fieldset>
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
export function PhotoUpload({
  required = false,
  max = 8,
}: {
  required?: boolean;
  max?: number;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => () => photos.forEach(URL.revokeObjectURL), [photos]);
  function preview(input: HTMLInputElement) {
    const all = Array.from(
      input
        .closest(".photo-upload")!
        .querySelectorAll<HTMLInputElement>("input[type=file]"),
    ).flatMap((el) => Array.from(el.files ?? []));
    setPhotos(all.map((f) => URL.createObjectURL(f)));
  }
  return (
    <div className="photo-upload">
      <label className="field">
        Selecionar fotos da galeria (até {max})
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp"
          multiple={max > 1}
          required={required}
          onChange={(e) => preview(e.currentTarget)}
        />
      </label>
      <label className="field">
        Ou usar a câmera
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => preview(e.currentTarget)}
        />
      </label>
      <small>
        JPEG, PNG ou WebP. Até 4 MB por foto e 20 MB por envio. A primeira foto
        será a capa.
      </small>
      <div className="photo-previews">
        {photos.map((p) => (
          <img key={p} src={p} alt="Prévia da fotografia selecionada" />
        ))}
      </div>
    </div>
  );
}
export function PhotoGallery({
  photos,
  title,
}: {
  photos: { id: string }[];
  title: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = index === null ? null : photos[index];
  useEffect(() => {
    if (index !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [index]);
  if (!photos.length) return null;
  return (
    <div className="community-gallery">
      <button
        className="gallery-cover"
        onClick={() => setIndex(0)}
        aria-label={"Abrir fotos: " + title}
      >
        <img
          src={"/api/community/media/" + photos[0].id}
          alt={title}
          loading="lazy"
        />
      </button>
      <button className="gallery-count" onClick={() => setIndex(0)}>
        Ver todas as fotos ({photos.length})
      </button>
      <dialog
        ref={dialog}
        onCancel={() => setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight")
            setIndex((i) => ((i ?? 0) + 1) % photos.length);
          if (e.key === "ArrowLeft")
            setIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length);
        }}
        aria-label={"Galeria: " + title}
      >
        <button className="button secondary" onClick={() => setIndex(null)}>
          Fechar galeria
        </button>
        {current && (
          <img
            src={"/api/community/media/" + current.id}
            alt={title + " — foto " + ((index ?? 0) + 1)}
          />
        )}
        <div className="gallery-controls">
          <button
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
            className="button secondary"
            onClick={() => setIndex((i) => ((i ?? 0) + 1) % photos.length)}
          >
            Próxima
          </button>
        </div>
      </dialog>
    </div>
  );
}
