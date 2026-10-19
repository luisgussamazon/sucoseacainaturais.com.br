"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { X, ShieldCheck, Wallet } from "lucide-react";
import { redeem } from "@/lib/actions";
import { ProductImage } from "./product-image";
import styles from "./purchase-confirmation.module.css";
type Quote = { price: number; balance: number; stock: number };
export function PurchaseConfirmation({
  productId,
  name,
  image,
  price,
  balance,
  disabled,
  label,
}: {
  productId: string;
  name: string;
  image: string;
  price: number;
  balance: number;
  disabled: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    async (_previous: { error: string }, form: FormData) => redeem(form),
    { error: "" },
  );
  const [dismissServerError, setDismissServerError] = useState(false);
  useEffect(() => setDismissServerError(false), [state]);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    inquiry = useRef(0);
  const [quote, setQuote] = useState<Quote | null>(null),
    [quantity, setQuantity] = useState(1),
    [key, setKey] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!pending) lock.current = false;
  }, [pending, state]);
  async function open() {
    if (pending) return;
    setQuote(null);
    setDismissServerError(true);
    setQuantity(1);
    setError("");
    setKey(crypto.randomUUID());
    setLoading(true);
    const current = ++inquiry.current;
    dialog.current?.showModal();
    try {
      const r = await fetch(
        "/api/purchase-quote?productId=" + encodeURIComponent(productId),
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok)
        throw Error(data.error ?? "Não foi possível conferir o produto.");
      if (current === inquiry.current) setQuote(data);
    } catch (e) {
      if (current === inquiry.current)
        setError(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      if (current === inquiry.current) setLoading(false);
    }
  }
  function close() {
    if (pending || lock.current) return;
    inquiry.current++;
    dialog.current?.close();
  }
  const unit = quote?.price ?? price,
    currentBalance = quote?.balance ?? balance,
    total = unit * quantity;
  const valid =
    !!quote &&
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    quantity <= quote.stock &&
    quantity <= 100000 &&
    total <= quote.balance;
  return (
    <>
      <button
        type="button"
        className="button compact"
        disabled={disabled}
        onClick={open}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className={styles.modal}
        aria-labelledby={"purchase-title-" + productId}
        onCancel={(e) => {
          if (pending || lock.current) e.preventDefault();
          else inquiry.current++;
        }}
      >
        <button
          className={styles.close}
          type="button"
          disabled={pending}
          onClick={close}
          aria-label="Fechar confirmação"
        >
          <X size={20} />
        </button>
        <div className={styles.heading}>
          <ShieldCheck size={22} />
          <span>RESGATE SEGURO · SSD VBJ2</span>
        </div>
        <h2 id={"purchase-title-" + productId}>
          Deseja realmente confirmar este resgate?
        </h2>
        <div className={styles.product}>
          <div className={styles.image}>
            <ProductImage src={image} alt={name} />
          </div>
          <div>
            <h3>{name}</h3>
            <p>{unit.toLocaleString("pt-BR")} Amazonitos por unidade</p>
            <label>
              Quantidade
              <input
                name="selectedQuantity"
                aria-label="Quantidade do resgate"
                type="number"
                min={1}
                max={Math.min(quote?.stock ?? 1, 100000)}
                value={quantity}
                disabled={pending || loading}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
        <dl className={styles.summary}>
          <dt>Valor unitário</dt>
          <dd>{unit.toLocaleString("pt-BR")} Amazonitos</dd>
          <dt>Total da compra</dt>
          <dd>{total.toLocaleString("pt-BR")} Amazonitos</dd>
          <dt>
            <Wallet size={15} /> Saldo atual
          </dt>
          <dd>{currentBalance.toLocaleString("pt-BR")} Amazonitos</dd>
          <dt>Saldo após o resgate</dt>
          <dd
            className={
              currentBalance - total < 0 ? styles.negative : styles.remaining
            }
          >
            {(currentBalance - total).toLocaleString("pt-BR")} Amazonitos
          </dd>
        </dl>
        <p className={styles.explanation}>
          Após a confirmação, os Amazonitos serão descontados da sua carteira e
          o produto ficará reservado para retirada com o RH.
        </p>
        {loading && <p role="status">Conferindo saldo, preço e estoque...</p>}
        {(error || (!dismissServerError && state.error)) && (
          <p className={styles.error} role="alert">
            {error || state.error}
          </p>
        )}
        {quote && !valid && (
          <p className={styles.error} role="alert">
            {total > quote.balance
              ? "Saldo insuficiente para esta quantidade."
              : "Quantidade indisponível no estoque."}
          </p>
        )}
        <form
          action={action}
          onSubmit={(e) => {
            if (lock.current || !valid) {
              e.preventDefault();
              return;
            }
            lock.current = true;
          }}
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="quantity" value={quantity} />
          <input type="hidden" name="expectedPrice" value={unit} />
          <input type="hidden" name="requestKey" value={key} />
          <input type="hidden" name="confirmed" value="yes" />
          <div className={styles.actions}>
            <button
              className={styles.cancel}
              type="button"
              disabled={pending}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              className={styles.confirm}
              disabled={pending || loading || !valid || !!error}
              type="submit"
            >
              {pending ? "Confirmando…" : "Confirmar resgate"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
