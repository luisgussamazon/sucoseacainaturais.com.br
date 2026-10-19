import {
  ProductForm,
  ProductPhotoField,
} from "@/components/product-photo-field";
import { ProductManagement } from "@/components/management";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createBatch, saveProduct } from "@/lib/actions";
import { PageTitle, Field, date, Empty } from "@/components/ui";
export default async function Inventory() {
  await requireRole(["ADMIN"]);
  const [products, batches] = await Promise.all([
    db.product.findMany({ orderBy: { name: "asc" } }),
    db.batch.findMany({
      include: { product: true },
      orderBy: { expiresAt: "asc" },
    }),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="MENOS DESPERDÍCIO"
        title="Estoque e vencimentos"
        description="Resgates seguem FEFO: o primeiro lote a vencer é o primeiro a sair. Lotes vencidos ficam indisponíveis."
      />
      <section className="panel">
        <h2>Lotes em ordem de vencimento</h2>
        {batches.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Produto</th>
                  <th>Validade</th>
                  <th>Estoque</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.code}</td>
                    <td>{b.product.name}</td>
                    <td>{date(b.expiresAt)}</td>
                    <td>{b.quantity}</td>
                    <td>
                      <span
                        className={`badge ${b.expiresAt < new Date() ? "danger" : ""}`}
                      >
                        {b.expiresAt < new Date()
                          ? "Vencido"
                          : b.quantity
                            ? "Disponível"
                            : "Esgotado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Nenhum lote cadastrado"
            text="Cadastre um produto e, em seguida, registre seu primeiro lote."
          />
        )}
      </section>
      <div className="management-grid">
        <section className="panel">
          <h2>Cadastrar produto</h2>
          <ProductForm action={saveProduct}>
            <Field label="Nome do produto" name="name" />
            <Field label="Descrição" name="description" />
            <Field label="Categoria" name="category" />
            <ProductPhotoField />
            <Field
              label="Preço em Amazonitos"
              name="price"
              type="number"
              min={1}
              max={100000}
            />
            <button className="button">Cadastrar produto</button>
          </ProductForm>
        </section>
        <section className="panel">
          <h2>Registrar entrada de lote</h2>
          <form action={createBatch} className="form-stack">
            <label className="field">
              Produto
              <select name="productId" required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Código único do lote" name="code" />
            <Field label="Validade" name="expiresAt" type="datetime-local" />
            <Field
              label="Quantidade"
              name="quantity"
              type="number"
              min={1}
              max={100000}
            />
            <button className="button" disabled={!products.length}>
              Registrar entrada
            </button>
          </form>
        </section>
      </div>
      <ProductManagement />
    </>
  );
}
