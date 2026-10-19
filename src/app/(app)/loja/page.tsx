import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, Flash } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
import { storePriceRanges } from "@/lib/store-presentation";
import { Search } from "lucide-react";
export default async function Store({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    price?: string;
    availability?: string;
    sort?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser(),
    p = await searchParams,
    q = typeof p.q === "string" ? p.q.slice(0, 100) : undefined,
    category =
      typeof p.category === "string" ? p.category.slice(0, 60) : undefined;
  const price =
    typeof p.price === "string" && Object.hasOwn(storePriceRanges, p.price)
      ? (p.price as keyof typeof storePriceRanges)
      : "";
  const sort = ["price-asc", "price-desc", "name"].includes(p.sort ?? "")
    ? p.sort!
    : "price-asc";
  const liveBatch = { quantity: { gt: 0 }, expiresAt: { gt: new Date() } };
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
        ...(price ? { price: storePriceRanges[price] } : {}),
        ...(p.availability === "available"
          ? { batches: { some: liveBatch } }
          : p.availability === "unavailable"
            ? { batches: { none: liveBatch } }
            : {}),
      },
      include: { batches: { where: liveBatch, orderBy: { expiresAt: "asc" } } },
      orderBy:
        sort === "name"
          ? { name: "asc" }
          : [
              { price: sort === "price-desc" ? "desc" : "asc" },
              { name: "asc" },
            ],
    }),
    db.product.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  return (
    <div className="store-page">
      <section className="store-banner" aria-labelledby="store-title">
        <div className="store-banner-copy">
          <span>ESCOLHAS QUE VALEM MAIS</span>
          <h1 id="store-title">SSD VBJ2</h1>
          <h2>Surpresas que resgatam, inspiram e conectam.</h2>
          <p>Troque seus Amazonitos por produtos e viva novas experiências.</p>
        </div>
        <div className="store-banner-art">
          <img
            src="/images/store/hero.webp"
            alt="Caixa Misteriosa VBJ2"
            width={1254}
            height={1254}
            fetchPriority="high"
          />
        </div>
        <strong className="store-banner-message">
          Surpresas <br />
          deliciosas <br />
          para você!
        </strong>
      </section>
      <Flash error={p.error} />
      <form className="store-filters">
        <label className="store-search">
          <Search size={20} />
          <input
            aria-label="Buscar produtos"
            name="q"
            placeholder="Buscar um produto..."
            defaultValue={q}
          />
        </label>
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
        <select name="price" aria-label="Preço" defaultValue={price}>
          <option value="">Todos os preços</option>
          <option value="up-to-20">Até 20 Amazonitos</option>
          <option value="21-50">21 a 50 Amazonitos</option>
          <option value="over-50">Acima de 50 Amazonitos</option>
        </select>
        <select
          name="availability"
          aria-label="Disponibilidade"
          defaultValue={p.availability ?? ""}
        >
          <option value="">Disponibilidade</option>
          <option value="available">Disponíveis</option>
          <option value="unavailable">Esgotados</option>
        </select>
        <select name="sort" aria-label="Ordenação" defaultValue={sort}>
          <option value="price-asc">Menor preço</option>
          <option value="price-desc">Maior preço</option>
          <option value="name">Nome A–Z</option>
        </select>
        <button className="button">Buscar</button>
      </form>
      <p className="store-results">
        <strong>
          {products.length}{" "}
          {products.length === 1
            ? "produto encontrado"
            : "produtos encontrados"}
        </strong>{" "}
        • Retirada presencial • Vencimentos exibidos por lote
      </p>
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              balance={user.balance}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Nenhum produto encontrado"
          text="Tente outra busca ou aguarde o cadastro de novos produtos pela administração."
        />
      )}
    </div>
  );
}
