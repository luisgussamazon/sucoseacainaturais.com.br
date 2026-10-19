"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Package,
} from "lucide-react";
import { ProductImage } from "./product-image";
import styles from "./notification-bell.module.css";
type Notice = {
  id: string;
  read: boolean;
  createdAt: string;
  orderId: string;
  owner: string;
  product: string;
  image: string;
  quantity: number;
  cost: number;
  status: "RESERVED" | "COLLECTED";
};
export function NotificationBell() {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [unread, setUnread] = useState(0),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [error, setError] = useState(""),
    [pending, setPending] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null),
    busy = useRef(false),
    router = useRouter();
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/notifications?page=" + page, {
        cache: "no-store",
      });
      if (r.status === 401 || r.status === 403) {
        setItems([]);
        setUnread(0);
        setOpen(false);
        return;
      }
      if (!r.ok) throw Error("Não foi possível carregar as notificações.");
      const data = await r.json();
      setItems(data.items);
      setUnread(data.unread);
      setPages(data.pages);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      busy.current = false;
    }
  }, [page]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const click = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  async function read(id: string, visit = false) {
    if (pending) return;
    setPending(id);
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw Error("Não foi possível atualizar a notificação.");
      setItems((old) =>
        old.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      await load();
      if (visit) {
        setOpen(false);
        router.push(
          "/resgates/conferir?notification=" + encodeURIComponent(id),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setPending(null);
    }
  }
  return (
    <div className={styles.root} ref={root}>
      <button
        className={styles.bell}
        type="button"
        aria-label={"Notificações: " + unread + " não lidas"}
        aria-expanded={open}
        aria-controls="redemption-notifications"
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
      >
        <Bell size={21} />
        {unread > 0 && (
          <span className={styles.counter}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <section
          className={styles.panel}
          id="redemption-notifications"
          aria-label="Central de notificações"
        >
          <header>
            <div>
              <h2>Notificações</h2>
              <p>{unread} não lida(s)</p>
            </div>
            <button
              type="button"
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
            >
              <X size={19} />
            </button>
          </header>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.list}>
            {!items.length && !error && (
              <div className={styles.empty}>
                <Package size={30} />
                <p>Nenhum novo resgate por aqui.</p>
              </div>
            )}
            {items.map((n) => (
              <article
                className={n.read ? styles.read : styles.unread}
                key={n.id}
              >
                <span className={styles.title}>
                  {!n.read && <i aria-label="Não lida" />}NOVO RESGATE
                  REALIZADO!
                </span>
                <div className={styles.body}>
                  <div className={styles.image}>
                    <ProductImage src={n.image} alt={n.product} />
                  </div>
                  <div>
                    <h3>{n.product}</h3>
                    <p>{n.owner}</p>
                    <p>
                      {n.quantity} unidade(s) · {n.cost.toLocaleString("pt-BR")}{" "}
                      Amazonitos
                    </p>
                    <time dateTime={n.createdAt}>
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(n.createdAt))}
                    </time>
                    <p className={styles.code}>Pedido: {n.orderId}</p>
                    <span className={styles.status}>
                      {n.status === "COLLECTED"
                        ? "Retirado"
                        : "Aguardando retirada"}
                    </span>
                  </div>
                </div>
                <footer>
                  {!n.read && (
                    <button
                      type="button"
                      disabled={!!pending}
                      onClick={() => read(n.id)}
                    >
                      <Check size={14} /> Marcar como lida
                    </button>
                  )}
                  <button
                    className={styles.view}
                    type="button"
                    disabled={!!pending}
                    onClick={() => read(n.id, true)}
                  >
                    Ver pedido <ChevronRight size={15} />
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {pages > 1 && (
            <nav aria-label="Paginação de notificações">
              <button
                type="button"
                disabled={page <= 1}
                aria-label="Notificações anteriores"
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                aria-label="Próximas notificações"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
