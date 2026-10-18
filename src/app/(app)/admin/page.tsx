import { PasswordManagement } from "@/components/management";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createUser, updateUser, updateOrder } from "@/lib/actions";
import { PageTitle, Field, date } from "@/components/ui";
export default async function Admin() {
  const actor = await requireRole(["ADMIN"]);
  const [users, orders, audits] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.order.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.audit.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="CONTROLE E TRANSPARÊNCIA"
        title="Administração"
        description="Gerencie acessos, acompanhe pedidos e consulte a trilha de auditoria."
      />
      <section className="panel">
        <h2>Usuários e permissões</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>E-mail</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.id === actor.id ? (
                      <span className="badge">Seu acesso · ADMIN</span>
                    ) : (
                      <form action={updateUser} className="inline-form">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          aria-label={`Perfil de ${u.name}`}
                        >
                          <option value="EMPLOYEE">Colaborador</option>
                          <option value="HR">RH</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                        <select
                          name="active"
                          defaultValue={String(u.active)}
                          aria-label={`Situação de ${u.name}`}
                        >
                          <option value="true">Ativo</option>
                          <option value="false">Inativo</option>
                        </select>
                        <button className="button compact">Salvar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Novo colaborador</h2>
        <form action={createUser} className="user-form">
          <Field label="Nome" name="name" />
          <Field label="E-mail" name="email" type="email" />
          <Field
            label="Senha inicial (mín. 12 caracteres)"
            name="password"
            type="password"
          />
          <label className="field">
            Perfil
            <select name="role">
              <option value="EMPLOYEE">Colaborador</option>
              <option value="HR">RH</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <button className="button">Criar acesso</button>
        </form>
      </section>
      <section className="panel">
        <h2>Pedidos · últimos 100</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pedido / pessoa</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Status / ação</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.id}</code>
                    <br />
                    {o.user.name}
                  </td>
                  <td>{o.product.name}</td>
                  <td>{o.quantity}</td>
                  <td>
                    {o.status === "RESERVED" ? (
                      <form action={updateOrder} className="inline-form">
                        <input type="hidden" name="orderId" value={o.id} />
                        <select name="status" aria-label="Atualizar pedido">
                          <option value="COLLECTED">Confirmar retirada</option>
                          <option value="CANCELLED">Cancelar e estornar</option>
                        </select>
                        <button className="button compact">Confirmar</button>
                      </form>
                    ) : o.status === "COLLECTED" ? (
                      "Retirado"
                    ) : (
                      "Cancelado"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Auditoria · últimos 100 eventos</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Responsável (ID)</th>
                <th>Ação</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.createdAt)}</td>
                  <td>
                    <code>{a.actorId}</code>
                  </td>
                  <td>{a.action}</td>
                  <td className="audit-details">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PasswordManagement actorId={actor.id} />
    </>
  );
}
