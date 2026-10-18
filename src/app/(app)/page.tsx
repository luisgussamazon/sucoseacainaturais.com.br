import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Leaf,
  ShoppingBag,
  Coins,
  ArrowUpRight,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, number, SectionHeading, Stats, date } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
export default async function Home() {
  const user = await requireUser();
  const now = new Date();
  const [products, orders, rewards, missions, ledger] = await Promise.all([
    db.product.findMany({
      where: {
        active: true,
        batches: { some: { quantity: { gt: 0 }, expiresAt: { gt: now } } },
      },
      include: {
        batches: {
          where: { quantity: { gt: 0 }, expiresAt: { gt: now } },
          orderBy: { expiresAt: "asc" },
        },
      },
      take: 3,
      orderBy: { name: "asc" },
    }),
    db.order.count({
      where: { userId: user.id, status: { not: "CANCELLED" } },
    }),
    db.ledger.aggregate({
      where: { userId: user.id, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.mission.count({
      where: {
        active: true,
        endsAt: { gt: now },
        completions: { none: { userId: user.id } },
      },
    }),
    db.ledger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);
  return (
    <>
      <div className="welcome-line">
        <span>
          <span className="live-dot" />
          BOM TER VOCÊ POR AQUI
        </span>
        <span>
          {new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "long",
            timeZone: "America/Sao_Paulo",
          }).format(now)}
        </span>
      </div>
      <div className="home-title">
        <h1>
          Olá, {user.name.split(" ")[0]} <span>☀</span>
        </h1>
        <p>Um novo dia para conquistar, aproveitar e fazer a diferença.</p>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag">
            <Leaf size={14} />
            CONSUMO CONSCIENTE, RECOMPENSAS REAIS
          </div>
          <h2>
            Suas conquistas merecem
            <br />
            novas possibilidades.
          </h2>
          <p>
            Transforme seus Amazonitos em produtos.
            <br />
            Você ganha. O planeta também.
          </p>
          <Link href="/loja" className="button lime">
            Explorar a loja
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="spark s1">✦</span>
          <span className="spark s2">✦</span>
          <div className="floating-tag">
            <Leaf size={16} /> Menos desperdício
          </div>
          <div className="hero-coin">
            a<span>AMAZONITOS</span>
          </div>
          <div className="floating-bottom">
            <ShoppingBag size={17} /> Mais oportunidades
          </div>
        </div>
      </section>
      <Stats
        items={[
          {
            label: "Seu saldo disponível",
            value: number(user.balance),
            detail: "Amazonitos para novas escolhas",
          },
          {
            label: "Amazonitos conquistados",
            value: number(rewards._sum.amount ?? 0),
            detail: "Créditos recebidos na sua carteira",
          },
          {
            label: "Seus resgates",
            value: number(orders),
            detail: "Produtos reservados ou retirados",
          },
          {
            label: "Missões disponíveis",
            value: number(missions),
            detail: "Novas chances de conquistar",
          },
        ]}
      />
      <div className="section-intro">
        <SectionHeading
          title="Boas escolhas, por menos Amazonitos"
          href="/loja"
          label="Explorar produtos"
        />
        <p>Produtos próximos ao vencimento. Aproveite com consciência.</p>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} balance={user.balance} />
          ))}
        </div>
      ) : (
        <Empty
          title="Novidades estão a caminho"
          text="Os produtos aparecerão aqui assim que a administração cadastrar produtos e lotes disponíveis."
        />
      )}
      <div className="bottom-grid">
        <section className="mission-promo">
          <div className="promo-icon">
            <Sparkles size={24} />
          </div>
          <div className="eyebrow">CADA PARTICIPAÇÃO CONTA</div>
          <h2>Faça parte. Conquiste mais.</h2>
          <p>
            Participe das campanhas e quizzes da equipe e transforme
            conhecimento em Amazonitos.
          </p>
          <Link href="/missoes">
            Conhecer as missões
            <ArrowUpRight size={17} />
          </Link>
        </section>
        <section className="panel">
          <SectionHeading
            title="Sua atividade recente"
            href="/carteira"
            label="Ver extrato"
          />
          {ledger.length ? (
            ledger.map((l) => (
              <div className="activity-row" key={l.id}>
                <div className={`activity-icon ${l.amount < 0 ? "debit" : ""}`}>
                  <Coins size={18} />
                </div>
                <div>
                  <strong>{l.description}</strong>
                  <small>{date(l.createdAt)}</small>
                </div>
                <b className={l.amount > 0 ? "positive" : ""}>
                  {l.amount > 0 ? "+" : ""}
                  {number(l.amount)}
                </b>
              </div>
            ))
          ) : (
            <p className="muted padded">
              Seu extrato aparecerá aqui após o primeiro crédito ou resgate.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
