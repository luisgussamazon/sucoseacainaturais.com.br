"use client";
import { useState } from "react";
import { OrderPhoto, redemptionRequest } from "./redemption-center";
import styles from "./redemptions.module.css";
type CheckedOrder = {
  id: string;
  code: string;
  name: string;
  product: string;
  description: string;
  image: string;
  quantity: number;
  cost: number;
  status: string;
  createdAt: string;
  collectedAt: string | null;
  collectedByName: string | null;
};
export function PickupDesk({
  initialOrder = null,
}: {
  initialOrder?: CheckedOrder | null;
}) {
  const [order, setOrder] = useState<CheckedOrder | null>(initialOrder),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  async function lookup(form: FormData) {
    setPending(true);
    setOrder(null);
    setMessage("");
    try {
      form.set("action", "lookup");
      const r = await redemptionRequest(form);
      setOrder(r.order);
      setError(false);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      setPending(false);
    }
  }
  async function confirm(form: FormData) {
    if (!order || pending) return;
    setPending(true);
    setMessage("");
    try {
      form.set("action", "confirm");
      form.set("orderId", order.id);
      form.set("code", order.code);
      const r = await redemptionRequest(form);
      setMessage(r.message);
      setError(false);
      setOrder({ ...order, status: "COLLECTED" });
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Falha na confirmação.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(new FormData(e.currentTarget));
        }}
      >
        <label>
          Código de retirada
          <input
            name="code"
            required
            maxLength={100}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Cole ou digite o código apresentado pelo colaborador"
          />
        </label>
        <button className={styles.primary} disabled={pending}>
          Conferir comprovante
        </button>
      </form>
      {order && (
        <section className={styles.staffResult} aria-label="Pedido conferido">
          <OrderPhoto src={order.image} name={order.product} />
          <h2>{order.product}</h2>
          <p>
            Colaborador: <b>{order.name}</b>
          </p>
          <p>
            {order.quantity} unidade(s) · {order.cost} Amazonitos
          </p>
          <p>
            Código: <code>{order.code}</code>
          </p>
          <p>
            Resgatado em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(order.createdAt))}
          </p>
          <p>
            <b>
              {order.status === "RESERVED"
                ? "Aguardando retirada"
                : order.status === "COLLECTED"
                  ? "Retirado — comprovante já utilizado"
                  : "Cancelado — retirada bloqueada"}
            </b>
          </p>
          {order.collectedAt && (
            <p>
              Confirmado em{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(order.collectedAt))}
              {order.collectedByName ? " por " + order.collectedByName : ""}
            </p>
          )}
          {order.status === "RESERVED" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirm(new FormData(e.currentTarget));
              }}
            >
              <label>
                <input name="checked" type="checkbox" required />
                Conferi a identidade do colaborador, o produto e o comprovante e
                realizei a entrega.
              </label>
              <button className={styles.primary} disabled={pending}>
                Confirmar retirada
              </button>
            </form>
          )}
        </section>
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
  );
}
