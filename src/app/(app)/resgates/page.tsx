import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageTitle, date, Flash } from "@/components/ui";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const u = await requireUser();
  const orders = await db.order.findMany({
    where: { userId: u.id },
    include: { product: true, allocations: { include: { batch: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageTitle
        eyebrow="SUAS ESCOLHAS"
        title="Meus resgates"
        description="Acompanhe suas reservas. Apresente o código do pedido ao responsável pela retirada."
      />
      <Flash {...await searchParams} />
      {orders.length ? (
        <div className="order-list">
          {orders.map((o) => (
            <article className="panel order-card" key={o.id}>
              <div>
                <span className="badge">
                  {
                    {
                      RESERVED: "Aguardando retirada",
                      COLLECTED: "Retirado",
                      CANCELLED: "Cancelado",
                    }[o.status]
                  }
                </span>
                <h2>{o.product.name}</h2>
                <p>
                  {o.quantity} unidade(s) · {o.cost} Amazonitos ·{" "}
                  {date(o.createdAt)}
                </p>
                <code>{o.id}</code>
                <p className="muted small">
                  {o.allocations
                    .map(
                      (a) =>
                        `Lote ${a.batch.code} · ${a.quantity} un. · validade ${date(a.batch.expiresAt)}`,
                    )
                    .join(" / ")}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Seu primeiro resgate está esperando"
          text="Explore a loja e transforme seus Amazonitos em produtos."
        />
      )}
    </>
  );
}
