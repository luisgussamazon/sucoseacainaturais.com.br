import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageTitle, Stats, date, number } from "@/components/ui";
export default async function Wallet() {
  const u = await requireUser();
  const entries = await db.ledger.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const sums = await db.ledger.groupBy({
    by: ["userId"],
    where: { userId: u.id, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  return (
    <>
      <PageTitle
        eyebrow="SEU RECONHECIMENTO"
        title="Minha carteira"
        description="Acompanhe suas conquistas e cada movimento dos seus Amazonitos."
      />
      <Stats
        items={[
          {
            label: "Saldo disponível",
            value: number(u.balance),
            detail: "Amazonitos para resgatar",
          },
          {
            label: "Total de créditos",
            value: number(sums[0]?._sum.amount ?? 0),
            detail: "Acumulado de todos os créditos",
          },
        ]}
      />
      <section className="panel">
        <h2>Extrato de movimentações</h2>
        <p className="muted small">
          Últimas 100 movimentações, da mais recente à mais antiga.
        </p>
        {entries.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Amazonitos</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{date(e.createdAt)}</td>
                    <td>{e.description}</td>
                    <td>
                      <span className="badge">
                        {e.amount > 0 ? "Crédito" : "Débito"}
                      </span>
                    </td>
                    <td className={e.amount > 0 ? "positive" : ""}>
                      {e.amount > 0 ? "+" : ""}
                      {number(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Sua história começa aqui"
            text="Os créditos, débitos e estornos serão registrados automaticamente."
          />
        )}
      </section>
    </>
  );
}
