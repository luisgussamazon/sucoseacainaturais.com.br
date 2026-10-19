import { CommunityFeed, communityActor } from "@/components/community-server";
import { categories } from "@/lib/community";
export default async function Mural({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    category?: string;
    q?: string;
    post?: string;
  }>;
}) {
  const user = await communityActor();
  const p = await searchParams;
  const page = Math.max(1, Math.min(100, Number(p.page) || 1));
  return (
    <>
      <div className="page-heading">
        <h1>Mural SSD VBJ2</h1>
      </div>
      <form className="community-filters">
        <label>
          Buscar
          <input name="q" defaultValue={p.q} maxLength={100} />
        </label>
        <label>
          Categoria
          <select name="category" defaultValue={p.category}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="button">Filtrar</button>
      </form>
      <CommunityFeed
        user={user}
        page={page}
        postId={p.post}
        category={p.category}
        q={p.q?.slice(0, 100)}
      />
    </>
  );
}
