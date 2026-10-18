import Link from "next/link";
import {
  ArrowUpRight,
  Package,
  Coins,
  Leaf,
  Users,
  ShoppingBag,
} from "lucide-react";
export const number = (n: number) => n.toLocaleString("pt-BR");
export const date = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Package size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Stats({
  items,
}: {
  items: { label: string; value: string; detail: string }[];
}) {
  const icons = [ShoppingBag, Coins, Users, Leaf];
  return (
    <div className="stats-grid">
      {items.map((item, i) => {
        const Icon = icons[i % icons.length];
        return (
          <div className="stat-card" key={item.label}>
            <div className="stat-top">
              <span>{item.label}</span>
              <div className={`stat-icon tone-${i}`}>
                <Icon size={19} />
              </div>
            </div>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        );
      })}
    </div>
  );
}
export function SectionHeading({
  title,
  href,
  label = "Ver todos",
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {href && (
        <Link href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Flash({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error === "mission"
            ? "Resposta incorreta, missão encerrada ou recompensa já recebida."
            : "Não foi possível resgatar. Confira seu saldo e o estoque disponível."}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          Tudo certo! Operação concluída e carteira atualizada.
        </div>
      )}
    </>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = true,
  min,
  max,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        minLength={type === "password" ? 12 : undefined}
        placeholder={placeholder}
      />
    </label>
  );
}
