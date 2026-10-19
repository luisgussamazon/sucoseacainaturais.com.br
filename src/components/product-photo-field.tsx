"use client";
import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
export function ProductForm({
  action,
  children,
  editing = false,
}: {
  action: (form: FormData) => Promise<{ error?: string; success?: string }>;
  children: React.ReactNode;
  editing?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [result, setResult] = useState<{ error?: string; success?: string }>({});
  const lock = useRef(false),
    router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    lock.current = true;
    setPending(true);
    setResult({});
    try {
      const response = await action(data);
      setResult(response);
      if (response.success) {
        if (!editing) form.reset();
        form.dispatchEvent(new Event("product:saved"));
        router.refresh();
      }
    } catch {
      setResult({
        error:
          "Não foi possível salvar. Verifique sua conexão e tente novamente.",
      });
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <form className="form-stack product-form" onSubmit={submit}>
      <fieldset disabled={pending}>{children}</fieldset>
      {pending && <p role="status">Enviando imagem e salvando produto…</p>}
      {result.error && (
        <p className="notice error" role="alert">
          {result.error}
        </p>
      )}
      {result.success && (
        <p className="notice success" role="status">
          {result.success}
        </p>
      )}
    </form>
  );
}
export function ProductPhotoField({
  initialUrl = "",
  initialPreview = "",
}: {
  initialUrl?: string;
  initialPreview?: string;
}) {
  const [url, setUrl] = useState(initialUrl),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [failed, setFailed] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null);
  const local = useRef("");
  function clear() {
    if (local.current) URL.revokeObjectURL(local.current);
    local.current = "";
    setPreview("");
    if (picker.current) picker.current.value = "";
    setError("");
    setFailed(false);
  }
  useEffect(() => {
    setUrl(initialUrl);
    clear();
  }, [initialUrl, initialPreview]);
  useEffect(() => {
    const form = root.current?.closest("form");
    const reset = () => {
      clear();
      setUrl(initialUrl);
    };
    form?.addEventListener("reset", reset);
    form?.addEventListener("product:saved", clear);
    return () => {
      form?.removeEventListener("reset", reset);
      form?.removeEventListener("product:saved", clear);
      if (local.current) URL.revokeObjectURL(local.current);
    };
  }, [initialUrl]);
  const src = preview || url || initialPreview;
  return (
    <div className="product-photo-field" ref={root}>
      <label className="field">
        Foto (URL HTTPS)
        <input
          name="imageUrl"
          type="url"
          placeholder="https://... (opcional ao enviar arquivo)"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setFailed(false);
          }}
        />
      </label>
      <div className="product-photo-buttons">
        <button
          className="button secondary"
          type="button"
          onClick={() => picker.current?.click()}
        >
          <ImagePlus size={18} /> Selecionar imagem
        </button>
        {preview && (
          <button type="button" className="button secondary" onClick={clear}>
            Remover seleção
          </button>
        )}
      </div>
      <input
        ref={picker}
        className="photo-picker"
        type="file"
        name="productPhoto"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Imagem do produto"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) {
            clear();
            return;
          }
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 4 * 1024 * 1024
          ) {
            clear();
            setError("Selecione JPG, PNG ou WEBP de até 4 MB.");
            return;
          }
          if (local.current) URL.revokeObjectURL(local.current);
          local.current = URL.createObjectURL(file);
          setPreview(local.current);
          setFailed(false);
          setError("");
        }}
      />
      <small>
        JPG, PNG ou WEBP, até 4 MB e 16 megapixels. O arquivo selecionado tem
        prioridade sobre a URL.
        {initialPreview ? " Sem nova seleção, a foto atual será mantida." : ""}
      </small>
      {src && !failed && (
        <img
          className="product-photo-preview"
          src={src}
          alt="Pré-visualização da imagem do produto"
          onError={() => setFailed(true)}
        />
      )}{" "}
      {failed && (
        <p role="status">
          Não foi possível pré-visualizar a imagem. Confira o endereço ou
          selecione um arquivo.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
