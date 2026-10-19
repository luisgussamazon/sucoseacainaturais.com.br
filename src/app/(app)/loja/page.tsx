import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageTitle, Flash } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
export default async function Store({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { q, category, error } = await searchParams;
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category ? { category } : {}),
      },
      include: {
        batches: {
          where: { quantity: { gt: 0 }, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="ESCOLHAS QUE VALEM MAIS"
        title="SSD VBJ2"
        description="Encontre seu próximo resgate e ajude a reduzir o desperdício."
      />
      <Flash error={error} />
      <form className="filter-bar">
        <input
          aria-label="Buscar produtos"
          name="q"
          placeholder="Buscar um produto..."
          defaultValue={q}
        />
        <select
          name="category"
          aria-label="Categoria"
          defaultValue={category ?? ""}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.category}>{c.category}</option>
          ))}
        </select>
        <button className="button">Buscar</button>
      </form>
      <p className="muted small">
        {products.length} produtos encontrados · Retirada presencial ·
        Vencimentos exibidos por lote
      </p>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} balance={user.balance} />
          ))}
        </div>
      ) : (
        <Empty
          title="Nenhum produto encontrado"
          text="Tente outra busca ou aguarde o cadastro de novos produtos pela administração."
        />
      )}
    </>
  );
}
