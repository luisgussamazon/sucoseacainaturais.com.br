import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageTitle, Stats, number } from "@/components/ui";
export default async function Reports() {
  await requireRole(["HR", "ADMIN"]);
  const [users, products, orders, ledger, batches, completed] =
    await Promise.all([
      db.user.count({ where: { active: true } }),
      db.product.count({ where: { active: true } }),
      db.order.groupBy({
        by: ["status"],
        _count: true,
        _sum: { cost: true, quantity: true },
      }),
      db.ledger.aggregate({
        where: { amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      db.batch.findMany({
        include: { product: true },
        orderBy: { expiresAt: "asc" },
      }),
      db.completion.count(),
    ]);
  return (
    <>
      <PageTitle
        eyebrow="DADOS PARA FAZER A DIFERENÇA"
        title="Relatórios e indicadores"
        description="Visão consolidada, calculada diretamente dos registros da operação."
      />
      <Stats
        items={[
          {
            label: "Produtos ativos",
            value: number(products),
            detail: "Itens cadastrados no catálogo",
          },
          {
            label: "Créditos distribuídos",
            value: number(ledger._sum.amount ?? 0),
            detail: "Inclui recompensas e estornos",
          },
          {
            label: "Colaboradores ativos",
            value: number(users),
            detail: "Contas habilitadas",
          },
          {
            label: "Missões concluídas",
            value: number(completed),
            detail: "Participações validadas",
          },
        ]}
      />
      <div className="management-grid">
        <section className="panel">
          <h2>Resgates por situação</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Situação</th>
                  <th>Pedidos</th>
                  <th>Unidades</th>
                  <th>Amazonitos</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.status}>
                    <td>
                      {
                        {
                          RESERVED: "Reservados",
                          COLLECTED: "Retirados",
                          CANCELLED: "Cancelados",
                        }[o.status]
                      }
                    </td>
                    <td>{o._count}</td>
                    <td>{o._sum.quantity ?? 0}</td>
                    <td>{number(o._sum.cost ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Saúde do estoque</h2>
          {[
            {
              label: "Unidades disponíveis",
              value: batches
                .filter((b) => b.expiresAt > new Date())
                .reduce((s, b) => s + b.quantity, 0),
            },
            {
              label: "Unidades vencidas (bloqueadas)",
              value: batches
                .filter((b) => b.expiresAt <= new Date())
                .reduce((s, b) => s + b.quantity, 0),
            },
            {
              label: "Vencem nos próximos 7 dias",
              value: batches
                .filter(
                  (b) =>
                    b.expiresAt > new Date() &&
                    b.expiresAt.getTime() < Date.now() + 7 * 86400000,
                )
                .reduce((s, b) => s + b.quantity, 0),
            },
          ].map((x) => (
            <div className="report-row" key={x.label}>
              <span>{x.label}</span>
              <strong>{number(x.value)}</strong>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
