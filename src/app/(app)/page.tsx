import { CommunityLiveUpdates } from "@/components/community-live-updates";
import Link from "next/link";
import { ArrowRight, Sparkles, Leaf, Coins, ArrowUpRight } from "lucide-react";

import { db } from "@/lib/db";
import { Empty, number, SectionHeading, Stats, date } from "@/components/ui";

import {
  CommunityFeed,
  CommunityAside,
  CommunityMoments,
  communityActor,
} from "@/components/community-server";
export default async function Home() {
  const user = await communityActor();
  const now = new Date();
  const [orders, rewards, missions, ledger] = await Promise.all([
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
        OR: [
          { photoConfig: null },
          { photoConfig: { status: "PUBLISHED", startsAt: { lte: now } } },
        ],
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
      <CommunityLiveUpdates />
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
          <Link href="/loja" className="button hero-cta">
            Explorar a loja
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img
            className="hero-scene"
            src="/images/amazonitos-hero.webp"
            alt=""
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <div className="hero-art-note">
            <Leaf size={21} />
            <span>
              Menos desperdício.
              <br />
              Mais possibilidades.
            </span>
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
        <h1>Bem-vindo ao SSD VBJ2!</h1>
        <p>
          Acompanhe nossas conquistas, participe das missões e faça parte das
          ações da nossa equipe.
        </p>
      </div>
      <div className="community-layout">
        <div className="community-main">
          <CommunityFeed user={user} limit={5} />
          <CommunityMoments user={user} recent />
        </div>
        <CommunityAside user={user} />
      </div>
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
