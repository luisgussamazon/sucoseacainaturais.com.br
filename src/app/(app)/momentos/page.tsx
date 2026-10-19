import { communityActor } from "@/components/community-server";
import { PhotoGallery } from "@/components/community-client";
import { publishedWhere } from "@/lib/community";
import { db } from "@/lib/db";
import { Empty, PageTitle, date } from "@/components/ui";
export default async function Moments({
  searchParams,
}: {
  searchParams: Promise<{ album?: string; page?: string }>;
}) {
  const user = await communityActor(),
    params = await searchParams;
  const page = Math.max(1, Math.min(100, Number(params.page) || 1));
  const albums = await db.communityAlbum.findMany({
    where: {
      ...publishedWhere(user),
      ...(params.album ? { id: params.album } : {}),
    },
    orderBy: { eventDate: "desc" },
    take: 12,
    skip: (page - 1) * 12,
    include: {
      media: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true },
        orderBy: [{ cover: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  return (
    <>
      <PageTitle
        eyebrow="NOSSA EQUIPE, NOSSAS CONQUISTAS"
        title="Momentos VBJ2"
        description="Ações, eventos e conquistas registrados pela equipe."
      />
      {!albums.length && (
        <Empty
          title="Novos momentos estão por vir"
          text="Os álbuns publicados e autorizados aparecerão aqui."
        />
      )}
      <div className="community-albums">
        {albums.map((a) => (
          <article className="panel" key={a.id}>
            <PhotoGallery photos={a.media} title={a.title} />
            <h2>{a.title}</h2>
            <small>{date(a.eventDate)}</small>
            <p>{a.description}</p>
          </article>
        ))}
      </div>
      <div className="community-links">
        {page > 1 && <a href={"?page=" + (page - 1)}>Anteriores</a>}
        {albums.length === 12 && (
          <a href={"?page=" + (page + 1)}>Mais álbuns</a>
        )}
      </div>
    </>
  );
}
