import Link from "next/link";
import {
  Wallet,
  Coins,
  FileText,
  ArrowUp,
  ArrowDown,
  Search,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, date, number } from "@/components/ui";
import styles from "./wallet.module.css";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const text = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const q = text("q").trim().slice(0, 200);
  const period = ["7", "30", "90"].includes(text("period"))
    ? text("period")
    : "";
  const type = ["credit", "out"].includes(text("type")) ? text("type") : "";
  const requested = /^\d{1,8}$/.test(text("page"))
    ? Math.max(1, Number(text("page")))
    : 1;
  const where: Prisma.LedgerWhereInput = {
    userId: user.id,
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    ...(period
      ? { createdAt: { gte: new Date(Date.now() - Number(period) * 86400000) } }
      : {}),
    ...(type ? { amount: type === "credit" ? { gt: 0 } : { lte: 0 } } : {}),
  };
  const [credits, latest, total] = await Promise.all([
    db.ledger.aggregate({
      where: { userId: user.id, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.ledger.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.ledger.count({ where }),
  ]);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pages);
  const entries = await db.ledger.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const pageHref = (next: number) => {
    const values = new URLSearchParams();
    if (q) values.set("q", q);
    if (period) values.set("period", period);
    if (type) values.set("type", type);
    values.set("page", String(next));
    return "/carteira?" + values;
  };
  const signed = (amount: number) => (amount > 0 ? "+" : "") + number(amount);
  return (
    <div className={styles.wallet}>
      <div className={styles.heading}>
        <div className={styles.eyebrow}>SEU RECONHECIMENTO</div>
        <h1>Minha carteira</h1>
        <p>Acompanhe suas conquistas e cada movimento dos seus Amazonitos.</p>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.coinSmall}>
            <Coins />
          </span>
          <span className={styles.coin}>
            <Coins />
          </span>
          <span className={styles.spark}>✦</span>
        </div>
      </div>
      <div className={styles.stats}>
        <article className={styles.balance}>
          <span className={styles.icon}>
            <Wallet size={30} />
          </span>
          <div>
            <h2>Saldo disponível</h2>
            <strong>{number(user.balance)}</strong>
            <p>Amazonitos para resgatar</p>
          </div>
        </article>
        <article className={styles.credits}>
          <span className={styles.icon}>
            <Coins size={30} />
          </span>
          <div>
            <h2>Total de créditos</h2>
            <strong>{number(credits._sum.amount ?? 0)}</strong>
            <p>Acumulado de todos os créditos</p>
          </div>
        </article>
        <article className={styles.latest}>
          <span className={styles.icon}>
            <FileText size={30} />
          </span>
          <div>
            <h2>Última movimentação</h2>
            {latest ? (
              <>
                <time dateTime={latest.createdAt.toISOString()}>
                  {date(latest.createdAt)}
                </time>
                <b
                  className={
                    latest.amount > 0 ? styles.positive : styles.negative
                  }
                >
                  {signed(latest.amount)} Amazonitos
                </b>
                <p className={styles.summary} title={latest.description}>
                  {latest.description}
                </p>
              </>
            ) : (
              <p>Nenhuma movimentação registrada.</p>
            )}
          </div>
        </article>
      </div>
      <section className={styles.statement} aria-labelledby="statement-title">
        <div className={styles.statementHeading}>
          <span className={styles.smallIcon}>
            <Wallet size={24} />
          </span>
          <div>
            <h2 id="statement-title">Extrato de movimentações</h2>
            <p>
              Seu histórico completo, da movimentação mais recente à mais
              antiga.
            </p>
          </div>
        </div>
        <form className={styles.filters} action="/carteira" method="get">
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <span className={styles.srOnly}>Buscar por descrição</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={200}
              placeholder="Buscar por descrição..."
            />
          </label>
          <label className={styles.select}>
            <CalendarDays size={18} aria-hidden="true" />
            <span className={styles.srOnly}>Período</span>
            <select name="period" defaultValue={period}>
              <option value="">Todos os períodos</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </label>
          <label>
            <span className={styles.srOnly}>Tipo</span>
            <select name="type" defaultValue={type}>
              <option value="">Todos os tipos</option>
              <option value="credit">Crédito</option>
              <option value="out">Saída</option>
            </select>
          </label>
          <button type="submit" className={styles.apply}>
            Filtrar
          </button>
        </form>
        {entries.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Amazonitos</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="Data">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {date(entry.createdAt)}
                    </time>
                  </td>
                  <td data-label="Descrição" className={styles.description}>
                    {entry.description}
                  </td>
                  <td data-label="Tipo">
                    <span
                      className={
                        entry.amount > 0 ? styles.creditBadge : styles.outBadge
                      }
                    >
                      {entry.amount > 0 ? (
                        <ArrowUp size={17} />
                      ) : (
                        <ArrowDown size={17} />
                      )}
                      {entry.amount > 0 ? "Crédito" : "Saída"}
                    </span>
                  </td>
                  <td
                    data-label="Amazonitos"
                    className={
                      entry.amount > 0 ? styles.positive : styles.negative
                    }
                  >
                    {signed(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            title={
              q || period || type
                ? "Nenhuma movimentação encontrada"
                : "Sua história começa aqui"
            }
            text={
              q || period || type
                ? "Ajuste os filtros para consultar outras movimentações."
                : "Os créditos, saídas e estornos serão registrados automaticamente."
            }
          />
        )}
        <footer className={styles.pagination}>
          <span>
            {total
              ? (page - 1) * pageSize +
                1 +
                "–" +
                Math.min(page * pageSize, total)
              : "0"}{" "}
            de {number(total)} movimentações
          </span>
          <nav aria-label="Paginação do extrato">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} aria-label="Página anterior">
                <ChevronLeft size={18} />
              </Link>
            ) : (
              <span aria-disabled="true">
                <ChevronLeft size={18} />
              </span>
            )}
            <span aria-current="page">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={pageHref(page + 1)} aria-label="Próxima página">
                <ChevronRight size={18} />
              </Link>
            ) : (
              <span aria-disabled="true">
                <ChevronRight size={18} />
              </span>
            )}
          </nav>
        </footer>
      </section>
    </div>
  );
}
