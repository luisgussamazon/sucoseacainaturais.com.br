"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  CheckCircle2,
  XCircle,
  Coins,
  Search,
  CalendarDays,
  X,
  Copy,
  ReceiptText,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { OrderPhoto, redemptionRequest } from "./redemption-center";
import type { RedemptionView } from "@/lib/redemption-view";
import styles from "./delivery-center.module.css";
const labels = {
  RESERVED: "Aguardando retirada",
  COLLECTED: "Retirado",
  CANCELLED: "Cancelado",
};
const when = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(s));
const num = (n: number) => n.toLocaleString("pt-BR");
export function DeliveryCenter({
  orders,
  initialOrder,
  canCancel,
  stats,
  filters,
}: {
  orders: RedemptionView[];
  initialOrder: RedemptionView | null;
  canCancel: boolean;
  stats: {
    waiting: number;
    collected: number;
    cancelled: number;
    total: number;
  };
  filters: {
    q: string;
    status: string;
    period: string;
    sort: string;
    page: number;
    pages: number;
    count: number;
  };
}) {
  const router = useRouter(),
    [selected, setSelected] = useState<string | null>(initialOrder?.id ?? null),
    [confirmation, setConfirmation] = useState<"confirm" | "cancel" | null>(
      null,
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  const confirmDialog = useRef<HTMLDialogElement>(null),
    receiptDialog = useRef<HTMLDialogElement>(null),
    panel = useRef<HTMLElement>(null),
    lock = useRef(false);
  const order =
    orders.find((o) => o.id === selected) ??
    (initialOrder?.id === selected ? initialOrder : null);
  useEffect(() => setSelected(initialOrder?.id ?? null), [initialOrder?.id]);
  useEffect(() => {
    if (selected && panel.current) {
      panel.current.focus({ preventScroll: true });
      if (innerWidth <= 1250)
        panel.current.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [selected]);
  useEffect(() => {
    if (selected && !order) {
      setSelected(null);
      confirmDialog.current?.close();
      receiptDialog.current?.close();
      setConfirmation(null);
    }
  }, [selected, order]);
  useEffect(() => {
    if (confirmation) confirmDialog.current?.showModal();
  }, [confirmation]);
  useEffect(() => {
    let previous = "",
      active = true,
      busy = false;
    async function refresh() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch("/api/deliveries", { cache: "no-store" });
        if (!r.ok) return;
        const next = await r.text();
        if (active) {
          if (previous && next !== previous) router.refresh();
          previous = next;
        }
      } catch {
      } finally {
        busy = false;
      }
    }
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [router]);
  function close() {
    setSelected(null);
    setConfirmation(null);
    confirmDialog.current?.close();
    receiptDialog.current?.close();
  }
  async function finish() {
    if (!order || !confirmation || lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    try {
      let result;
      if (confirmation === "confirm") {
        const f = new FormData();
        f.set("action", "confirm");
        f.set("orderId", order.id);
        f.set("code", order.code);
        f.set("checked", "on");
        result = await redemptionRequest(f);
      } else {
        const r = await fetch("/api/deliveries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            orderId: order.id,
            checked: true,
          }),
        });
        result = await r.json();
        if (!r.ok) throw Error(result.error ?? "Não foi possível cancelar.");
      }
      setMessage(result.message);
      setError(false);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setPending(false);
      lock.current = false;
      setConfirmation(null);
      confirmDialog.current?.close();
      router.refresh();
    }
  }
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Código copiado.");
      setError(false);
    } catch {
      setMessage("Selecione o código para copiar.");
      setError(false);
    }
  }
  const href = (page: number) =>
    "/entregas?" +
    new URLSearchParams({
      q: filters.q,
      status: filters.status,
      period: filters.period,
      sort: filters.sort,
      page: String(page),
    });
  return (
    <div className={styles.center}>
      <header className={styles.heading}>
        <small>GESTÃO DE RESGATES</small>
        <h1>
          Entrega de Produtos <Package size={32} />
        </h1>
        <p>
          Gerencie os resgates, confira os comprovantes e confirme as entregas
          aos colaboradores.
        </p>
        <div className={styles.art} aria-hidden="true">
          <Package />
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
            <strong>{num(stats.waiting)}</strong>
            <p>pedidos pendentes</p>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 />
          </span>
          <div>
            <h2>Entregues</h2>
            <strong>{num(stats.collected)}</strong>
            <p>pedidos retirados</p>
          </div>
        </article>
        <article>
          <span>
            <XCircle />
          </span>
          <div>
            <h2>Cancelados</h2>
            <strong>{num(stats.cancelled)}</strong>
            <p>pedidos cancelados</p>
          </div>
        </article>
        <article>
          <span>
            <Coins />
          </span>
          <div>
            <h2>Amazonitos movimentados</h2>
            <strong>{num(stats.total)}</strong>
            <p>reservados e retirados; exclui cancelados</p>
          </div>
        </article>
      </div>
      <form className={styles.filters} action="/entregas">
        <label>
          <Search size={17} />
          <span className={styles.srOnly}>
            Buscar por colaborador, produto ou código
          </span>
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={150}
            placeholder="Buscar por colaborador, produto ou código..."
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
        <label>
          <span className={styles.srOnly}>Ordenar por</span>
          <select name="sort" defaultValue={filters.sort}>
            <option value="pending">Pendentes primeiro</option>
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
        </label>
        <button className={styles.primary}>Buscar</button>
      </form>
      <div className={styles.links}>
        <Link href="/resgates/conferir">
          Conferir código de retirada{canCancel ? " e denúncias" : ""}{" "}
          <ArrowRight size={14} />
        </Link>
      </div>
      {message && (
        <p
          className={error ? styles.error : styles.success}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div className={order ? styles.layoutOpen : styles.layout}>
        <section className={styles.list} aria-label="Lista de pedidos">
          <div className={styles.listHeading}>
            <h2>Pedidos</h2>
            <p>
              Histórico completo · {num(filters.count)} pedido(s) encontrado(s)
            </p>
          </div>
          {orders.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Colaborador</th>
                  <th>Código do pedido</th>
                  <th>Qtd.</th>
                  <th>Amazonitos</th>
                  <th>Data e hora</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className={selected === o.id ? styles.selected : undefined}
                  >
                    <td data-label="Produto">
                      <div className={styles.productCell}>
                        <OrderPhoto src={o.image} name={o.name} />
                        <strong>{o.name}</strong>
                      </div>
                    </td>
                    <td data-label="Colaborador">{o.ownerName}</td>
                    <td data-label="Código">
                      <code>{o.id}</code>
                    </td>
                    <td data-label="Quantidade">{o.quantity}</td>
                    <td data-label="Amazonitos">{num(o.cost)}</td>
                    <td data-label="Data e hora">
                      <time dateTime={o.createdAt}>{when(o.createdAt)}</time>
                    </td>
                    <td data-label="Status">
                      <span className={styles[o.status]}>
                        {labels[o.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.secondary}
                        onClick={() => {
                          setSelected(o.id);
                          setMessage("");
                        }}
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.empty}>
              <Package size={35} />
              <h3>Nenhum pedido encontrado</h3>
              <p>Ajuste os filtros para consultar o histórico de resgates.</p>
            </div>
          )}
          <footer className={styles.pagination}>
            <span>
              {filters.count
                ? (filters.page - 1) * 20 +
                  1 +
                  " a " +
                  Math.min(filters.page * 20, filters.count)
                : "0"}{" "}
              de {num(filters.count)} pedidos
            </span>
            <nav aria-label="Paginação de entregas">
              {filters.page > 1 && (
                <Link href={href(filters.page - 1)}>Anterior</Link>
              )}
              <span aria-current="page">
                {filters.page} / {filters.pages}
              </span>
              {filters.page < filters.pages && (
                <Link href={href(filters.page + 1)}>Próxima</Link>
              )}
            </nav>
          </footer>
        </section>
        {order && (
          <aside
            ref={panel}
            tabIndex={-1}
            className={styles.details}
            aria-label="Detalhes do pedido"
          >
            <button
              className={styles.close}
              aria-label="Fechar detalhes do pedido"
              onClick={close}
            >
              <X size={20} />
            </button>
            <h2>Detalhes do pedido</h2>
            <div className={styles.detailProduct}>
              <OrderPhoto src={order.image} name={order.name} />
              <div>
                <span className={styles[order.status]}>
                  {labels[order.status]}
                </span>
                <h3>{order.name}</h3>
                <p>{order.description}</p>
              </div>
            </div>
            <dl>
              <dt>Código do pedido</dt>
              <dd>
                <code>{order.id}</code>
                <button
                  className={styles.copy}
                  aria-label="Copiar código do pedido"
                  onClick={() => copy(order.id)}
                >
                  <Copy size={15} />
                </button>
              </dd>
              <dt>Colaborador</dt>
              <dd>{order.ownerName}</dd>
              <dt>Data do resgate</dt>
              <dd>{when(order.createdAt)}</dd>
              <dt>Quantidade</dt>
              <dd>{order.quantity} unidade(s)</dd>
              <dt>Valor unitário</dt>
              <dd>{num(order.cost / order.quantity)} Amazonitos</dd>
              <dt>Total utilizado</dt>
              <dd>{num(order.cost)} Amazonitos</dd>
            </dl>
            <ol className={styles.timeline}>
              <li className={styles.done}>
                <CheckCircle2 />
                <div>
                  <b>Resgate realizado</b>
                  <p>{when(order.createdAt)}</p>
                </div>
              </li>
              <li className={order.status !== "CANCELLED" ? styles.done : ""}>
                <Package />
                <div>
                  <b>
                    {order.status === "CANCELLED"
                      ? "Reserva cancelada"
                      : "Aguardando retirada no RH"}
                  </b>
                  <p>
                    {order.status === "RESERVED"
                      ? "Produto reservado para entrega"
                      : "Reserva registrada no histórico"}
                  </p>
                </div>
              </li>
              <li className={order.status === "COLLECTED" ? styles.done : ""}>
                <ShieldCheck />
                <div>
                  <b>
                    {order.status === "CANCELLED"
                      ? "Pedido cancelado"
                      : "Retirada confirmada"}
                  </b>
                  <p>
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
                        : "Aguardando conferência e entrega"}
                  </p>
                </div>
              </li>
            </ol>
            <details className={styles.lots}>
              <summary>Lotes e validades</summary>
              {order.lots.length ? (
                order.lots.map((l, i) => (
                  <p key={i}>
                    Lote {l.code} · {l.quantity} un. · validade{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(l.expiresAt))}
                  </p>
                ))
              ) : (
                <p>Não há alocações registradas para este pedido.</p>
              )}
            </details>
            <section className={styles.proof}>
              <h3>Comprovante de retirada</h3>
              <p>Código privado para conferência</p>
              <code>{order.code}</code>
              <div>
                <button
                  className={styles.secondary}
                  onClick={() => copy(order.code)}
                >
                  <Copy size={14} />
                  Copiar código
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => receiptDialog.current?.showModal()}
                >
                  <ReceiptText size={15} />
                  Tela cheia
                </button>
              </div>
            </section>
            {order.status === "RESERVED" && (
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={pending}
                  onClick={() => setConfirmation("confirm")}
                >
                  <CheckCircle2 size={18} />
                  Confirmar entrega
                </button>
                {canCancel && (
                  <button
                    className={styles.danger}
                    disabled={pending}
                    onClick={() => setConfirmation("cancel")}
                  >
                    <XCircle size={18} />
                    Cancelar pedido
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
      <dialog
        ref={confirmDialog}
        className={styles.dialog}
        aria-labelledby="delivery-confirm-title"
        onCancel={(e) => {
          if (pending) e.preventDefault();
          else setConfirmation(null);
        }}
      >
        <h2 id="delivery-confirm-title">
          {confirmation === "cancel"
            ? "Cancelar este pedido e estornar os Amazonitos?"
            : "Você confirma que entregou este produto ao colaborador?"}
        </h2>
        {order && (
          <p>
            {order.name} · {order.quantity} unidade(s) · {order.ownerName}
          </p>
        )}
        <p>
          {confirmation === "cancel"
            ? "O saldo e as quantidades reservadas serão devolvidos uma única vez."
            : "Confira o produto, a identidade do colaborador e o comprovante antes de registrar a entrega."}
        </p>
        <div className={styles.dialogActions}>
          <button
            className={styles.secondary}
            disabled={pending}
            onClick={() => {
              confirmDialog.current?.close();
              setConfirmation(null);
            }}
          >
            Cancelar
          </button>
          <button
            className={
              confirmation === "cancel" ? styles.danger : styles.primary
            }
            disabled={pending}
            onClick={finish}
          >
            {pending
              ? "Processando…"
              : confirmation === "cancel"
                ? "Confirmar cancelamento"
                : "Confirmar entrega"}
          </button>
        </div>
      </dialog>
      <dialog
        ref={receiptDialog}
        className={styles.receiptDialog}
        aria-label="Comprovante de retirada"
      >
        {order && (
          <>
            <button
              className={styles.close}
              aria-label="Fechar comprovante"
              onClick={() => receiptDialog.current?.close()}
            >
              <X />
            </button>
            <small>SSD VBJ2 · COMPROVANTE</small>
            <OrderPhoto src={order.image} name={order.name} />
            <h2>{order.name}</h2>
            <p>
              {order.ownerName} · {order.quantity} unidade(s)
            </p>
            <span className={styles[order.status]}>{labels[order.status]}</span>
            <p>{when(order.createdAt)}</p>
            <code>{order.code}</code>
            <p>
              A entrega só é confirmada após a conferência pelo responsável no
              sistema.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
