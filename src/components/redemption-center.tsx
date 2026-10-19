"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  CheckCircle2,
  Coins,
  Search,
  CalendarDays,
  ChevronRight,
  Camera,
  X,
  Copy,
  ReceiptText,
  ShieldCheck,
  ImageIcon,
} from "lucide-react";
import type { RedemptionView } from "@/lib/redemption-view";
import styles from "./redemptions.module.css";
const labels = {
  RESERVED: "Aguardando retirada",
  COLLECTED: "Retirado",
  CANCELLED: "Cancelado",
};
const when = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
export async function redemptionRequest(data: FormData) {
  const response = await fetch("/api/redemptions", {
    method: "POST",
    body: data,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Não foi possível concluir.");
  return result;
}
export function OrderPhoto({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={styles.photo}>
      {src && !failed ? (
        <img src={src} alt={name} onError={() => setFailed(true)} />
      ) : (
        <Package aria-label="Produto sem fotografia" size={45} />
      )}
    </div>
  );
}
export function SharePostActions({
  postId,
  own,
  admin,
}: {
  postId: string;
  own: boolean;
  admin: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function run(action: string) {
    let reason = "";
    if (action === "report-share") {
      reason =
        window.prompt("Descreva o motivo da denúncia (sem dados pessoais):") ??
        "";
      if (!reason) return;
    } else if (
      !window.confirm(
        "Remover esta publicação do mural? O resgate será preservado.",
      )
    )
      return;
    setPending(true);
    try {
      const f = new FormData();
      f.set("action", action);
      f.set("postId", postId);
      if (reason) f.set("reason", reason);
      const r = await redemptionRequest(f);
      setMessage(r.message);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.postActions}>
      <span>Conquista de resgate</span>
      {own && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("remove-share")}
        >
          Excluir minha publicação
        </button>
      )}
      {!own && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("report-share")}
        >
          Denunciar publicação
        </button>
      )}
      {admin && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("moderate-share")}
        >
          Moderar: remover do mural
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function RedemptionCenter({
  orders,
  waiting,
  collected,
  total,
  canConfirm,
  filters,
}: {
  orders: RedemptionView[];
  waiting: number;
  collected: number;
  total: number;
  canConfirm: boolean;
  filters: {
    q: string;
    status: string;
    period: string;
    page: number;
    pages: number;
    count: number;
  };
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<"details" | "receipt" | "share">("details"),
    [preview, setPreview] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false);
  const router = useRouter();
  const order = orders.find((o) => o.id === selected);
  useEffect(() => {
    if (selected && !order) {
      dialog.current?.close();
      setSelected(null);
      setPreview("");
    }
  }, [selected, order]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [selected]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    let previous = "";
    let active = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/redemptions", { cache: "no-store" });
        if (!r.ok) return;
        const value = await r.text();
        if (!active) return;
        if (previous && previous !== value) router.refresh();
        previous = value;
      } catch {}
    }
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [router]);
  function open(o: RedemptionView) {
    setSelected(o.id);
    setMode("details");
    setMessage("");
    setError(false);
    setPreview("");
  }
  function close() {
    dialog.current?.close();
    setSelected(null);
    setPreview("");
  }
  async function run(action: string, data?: FormData) {
    if (lock.current || !order) return;
    if (
      action === "cancel" &&
      !window.confirm("Cancelar este resgate e estornar os Amazonitos?")
    )
      return;
    lock.current = true;
    setPending(true);
    setMessage("");
    try {
      const f = data ?? new FormData();
      f.set("action", action);
      f.set("orderId", order.id);
      const r = await redemptionRequest(f);
      setError(false);
      setMessage(r.message);
      if (action === "share") setMode("details");
      router.refresh();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const href = (page: number) =>
    "/resgates?" +
    new URLSearchParams({
      q: filters.q,
      status: filters.status,
      period: filters.period,
      page: String(page),
    });
  return (
    <div className={styles.center}>
      <header className={styles.heading}>
        <div>
          <small>MEUS RESGATES</small>
          <h1>
            Meus resgates <Package size={27} />
          </h1>
          <p>
            Acompanhe suas reservas, veja os detalhes e compartilhe suas
            conquistas.
          </p>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <Coins />
          <Package />
        </div>
      </header>
      <div className={styles.stats}>
        <article>
          <span>
            <Package />
          </span>
          <div>
            <h2>Aguardando retirada</h2>
            <strong>{waiting}</strong>
            <p>produtos para retirar</p>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 />
          </span>
          <div>
            <h2>Produtos retirados</h2>
            <strong>{collected}</strong>
            <p>já confirmados</p>
          </div>
        </article>
        <article>
          <span>
            <Coins />
          </span>
          <div>
            <h2>Total utilizado</h2>
            <strong>{total.toLocaleString("pt-BR")}</strong>
            <p>Amazonitos em resgates</p>
          </div>
        </article>
      </div>
      {canConfirm && (
        <Link className={styles.staffLink} href="/resgates/conferir">
          <ShieldCheck size={19} /> Conferir comprovante e confirmar retirada
          (RH)
        </Link>
      )}
      <form className={styles.filters} action="/resgates">
        <label>
          <Search size={17} />
          <span className={styles.srOnly}>Buscar por produto</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar por produto..."
            maxLength={100}
          />
        </label>
        <label>
          <CalendarDays size={17} />
          <span className={styles.srOnly}>Período</span>
          <select name="period" defaultValue={filters.period}>
            <option value="">Todos os períodos</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </label>
        <label>
          <span className={styles.srOnly}>Status</span>
          <select name="status" defaultValue={filters.status}>
            <option value="">Todos os status</option>
            <option value="RESERVED">Aguardando retirada</option>
            <option value="COLLECTED">Retirado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <button className={styles.primary}>Filtrar</button>
      </form>
      <div className={styles.list}>
        {orders.map((o) => (
          <article className={styles.card} key={o.id}>
            <OrderPhoto src={o.image} name={o.name} />
            <div className={styles.cardCopy}>
              <span className={styles[o.status]}>{labels[o.status]}</span>
              <h2>{o.name}</h2>
              <p>
                {o.quantity} unidade(s) · {o.cost.toLocaleString("pt-BR")}{" "}
                Amazonitos
              </p>
              <p>
                <CalendarDays size={13} /> Resgatado em {when(o.createdAt)}
              </p>
              {o.status === "COLLECTED" && (
                <p>
                  Retirado{" "}
                  {o.collectedAt
                    ? "em " + when(o.collectedAt)
                    : "em registro anterior"}
                  {o.collectedByName ? " por " + o.collectedByName : ""}
                </p>
              )}
              {o.status === "CANCELLED" && o.cancelledAt && (
                <p>Cancelado em {when(o.cancelledAt)}</p>
              )}
              <p className={styles.codeLine}>
                Código: <code>{o.code}</code>
              </p>
            </div>
            <button
              className={
                o.status === "RESERVED" ? styles.primary : styles.secondary
              }
              onClick={() => open(o)}
            >
              Ver detalhes <ChevronRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {!orders.length && (
        <div className={styles.empty}>
          <Package size={38} />
          <h2>
            {filters.q || filters.status || filters.period
              ? "Nenhum resgate encontrado"
              : "Seu primeiro resgate está esperando"}
          </h2>
          <p>
            Explore a loja ou ajuste os filtros para consultar seu histórico.
          </p>
          <Link href="/loja">Explorar a loja →</Link>
        </div>
      )}
      <nav className={styles.pagination} aria-label="Paginação de resgates">
        <span>
          {filters.count} resgate(s) · Página {filters.page} de {filters.pages}
        </span>
        {filters.page > 1 && (
          <Link href={href(filters.page - 1)}>Anterior</Link>
        )}
        {filters.page < filters.pages && (
          <Link href={href(filters.page + 1)}>Próxima</Link>
        )}
      </nav>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={() => {
          setSelected(null);
          setPreview("");
        }}
        aria-labelledby="redemption-dialog-title"
      >
        {order && (
          <>
            <button
              className={styles.close}
              onClick={close}
              aria-label="Fechar detalhes"
            >
              <X />
            </button>
            {mode === "receipt" ? (
              <div className={styles.receipt}>
                <span className={styles.eyebrow}>
                  SSD VBJ2 · COMPROVANTE DE RETIRADA
                </span>
                <h2 id="redemption-dialog-title">Apresentar ao RH</h2>
                <OrderPhoto src={order.image} name={order.name} />
                <h3>{order.name}</h3>
                <p>{order.ownerName}</p>
                <p>
                  {order.quantity} unidade(s) · {when(order.createdAt)}
                </p>
                <span className={styles[order.status]}>
                  {labels[order.status]}
                </span>
                <p>Código de retirada</p>
                <code>{order.code}</code>
                <p>
                  Este comprovante não confirma a entrega. A validação e a
                  confirmação são realizadas pelo RH no sistema.
                </p>
                <button
                  className={styles.secondary}
                  onClick={() => setMode("details")}
                >
                  Voltar aos detalhes
                </button>
              </div>
            ) : (
              <>
                <div className={styles.detailTop}>
                  <OrderPhoto src={order.image} name={order.name} />
                  <div>
                    <span className={styles[order.status]}>
                      {labels[order.status]}
                    </span>
                    <h2 id="redemption-dialog-title">{order.name}</h2>
                    <p className={styles.description}>{order.description}</p>
                    <dl>
                      <dt>Código de retirada</dt>
                      <dd>
                        <code>{order.code}</code>
                        <button
                          className={styles.copy}
                          aria-label="Copiar código de retirada"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(order.code);
                              setMessage("Código copiado.");
                              setError(false);
                            } catch {
                              setMessage("Selecione o código para copiar.");
                            }
                          }}
                        >
                          <Copy size={17} />
                        </button>
                      </dd>
                      <dt>Data do resgate</dt>
                      <dd>{when(order.createdAt)}</dd>
                      <dt>Quantidade</dt>
                      <dd>{order.quantity} unidade(s)</dd>
                      <dt>Valor unitário do resgate</dt>
                      <dd>
                        {(order.cost / order.quantity).toLocaleString("pt-BR")}{" "}
                        Amazonitos
                      </dd>
                      <dt>Total utilizado</dt>
                      <dd>{order.cost.toLocaleString("pt-BR")} Amazonitos</dd>
                    </dl>
                  </div>
                </div>
                <ol className={styles.timeline}>
                  <li className={styles.done}>
                    <Package />
                    <b>Resgate realizado</b>
                    <small>{when(order.createdAt)}</small>
                  </li>
                  <li
                    className={order.status === "CANCELLED" ? "" : styles.done}
                  >
                    <ReceiptText />
                    <b>
                      {order.status === "CANCELLED"
                        ? "Reserva cancelada"
                        : "Aguardando RH"}
                    </b>
                    <small>
                      {order.status === "RESERVED"
                        ? "Produto reservado para retirada"
                        : "Reserva registrada"}
                    </small>
                  </li>
                  <li
                    className={order.status === "COLLECTED" ? styles.done : ""}
                  >
                    <CheckCircle2 />
                    <b>
                      {order.status === "CANCELLED"
                        ? "Cancelado"
                        : "Retirada confirmada"}
                    </b>
                    <small>
                      {order.status === "COLLECTED"
                        ? (order.collectedAt
                            ? when(order.collectedAt)
                            : "Registro anterior") +
                          (order.collectedByName
                            ? " · " + order.collectedByName
                            : "")
                        : order.status === "CANCELLED"
                          ? order.cancelledAt
                            ? when(order.cancelledAt)
                            : "Registro anterior"
                          : "Aguardando confirmação do responsável"}
                    </small>
                  </li>
                </ol>
                <details className={styles.lots}>
                  <summary>Lotes e validades</summary>
                  {order.lots.map((l, i) => (
                    <p key={i}>
                      Lote {l.code} · {l.quantity} un. · validade{" "}
                      {new Intl.DateTimeFormat("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(l.expiresAt))}
                    </p>
                  ))}
                </details>
                {mode === "share" ? (
                  <form
                    className={styles.shareForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("share", new FormData(e.currentTarget));
                    }}
                  >
                    <h3>Compartilhar minha conquista</h3>
                    <p>{order.name}</p>
                    <label>
                      Fotografia da conquista
                      <input
                        type="file"
                        name="photos"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setPreview(f ? URL.createObjectURL(f) : "");
                        }}
                      />
                    </label>
                    {preview && (
                      <img
                        className={styles.preview}
                        src={preview}
                        alt="Pré-visualização da fotografia"
                      />
                    )}
                    <label>
                      Legenda
                      <textarea
                        name="caption"
                        minLength={3}
                        maxLength={1000}
                        required
                        placeholder="Conte sua conquista, sem códigos ou informações pessoais."
                      />
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        name="imageAuthorization"
                        required
                      />
                      Tenho autorização para publicar esta imagem e as pessoas
                      nela retratadas.
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        name="restrictedChecked"
                        required
                      />
                      Revisei a foto e a legenda: não contêm códigos, etiquetas,
                      dados pessoais ou informações confidenciais.
                    </label>
                    <p className={styles.guidance}>
                      JPG, PNG ou WEBP até 4 MB. Escolha uma imagem da câmera ou
                      galeria. Nunca fotografe em condições inseguras. A
                      publicação será imediata após as validações técnicas.
                    </p>
                    <button className={styles.primary} disabled={pending}>
                      Publicar no Mural SSD VBJ2
                    </button>
                  </form>
                ) : (
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      onClick={() => setMode("receipt")}
                    >
                      <ReceiptText size={19} /> Apresentar ao RH
                    </button>
                    {order.status === "RESERVED" && (
                      <button
                        disabled={pending}
                        className={styles.danger}
                        onClick={() => run("cancel")}
                      >
                        Cancelar resgate
                      </button>
                    )}
                    {order.status === "COLLECTED" && !order.postId && (
                      <button
                        className={styles.secondary}
                        onClick={() => setMode("share")}
                      >
                        <Camera size={18} /> Compartilhar minha conquista
                      </button>
                    )}
                    {order.postId && order.postVisible && (
                      <Link
                        className={styles.secondary}
                        href={"/mural?post=" + order.postId}
                      >
                        Ver minha conquista no mural
                      </Link>
                    )}
                    {order.postId && !order.postVisible && (
                      <p>
                        Esta conquista já foi compartilhada e a publicação foi
                        removida do mural.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {message && (
              <p
                className={error ? styles.error : styles.success}
                role={error ? "alert" : "status"}
              >
                {message}
              </p>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
