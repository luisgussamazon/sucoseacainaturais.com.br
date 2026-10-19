import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publishedWhere, mediaConsent, rights } from "@/lib/community";
import { communityActor } from "@/components/community-server";
import { PhotoGallery } from "@/components/community-client";
import { PageTitle } from "@/components/ui";
export default async function EventDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await communityActor();
  const event = await db.communityEvent.findFirst({
    where: { id: (await params).id, ...publishedWhere(user) },
    include: {
      media: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true },
        orderBy: [{ cover: "desc" }, { position: "asc" }],
      },
    },
  });
  if (!event) notFound();
  const format = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(d);
  return (
    <>
      <PageTitle
        eyebrow="COMUNIDADE E EVENTOS"
        title={event.title}
        description="Informações do evento publicado para a nossa comunidade."
      />
      <article className="panel event-details">
        <span className="badge">
          {event.endsAt < new Date()
            ? "Evento encerrado"
            : event.startsAt <= new Date()
              ? "Em andamento"
              : "Próximo evento"}
        </span>
        <p className="community-text">{event.description}</p>
        <dl>
          <dt>Início (Brasília)</dt>
          <dd>{format(event.startsAt)}</dd>
          <dt>Término (Brasília)</dt>
          <dd>{format(event.endsAt)}</dd>
          <dt>Local</dt>
          <dd>{event.location}</dd>
        </dl>
        <PhotoGallery
          photos={(await mediaConsent(event, "EVENT")) ? event.media : []}
          title={event.title}
          interactive
        />
        <div className="community-links">
          <Link href="/">← Visão geral</Link>
          {rights(user).events && (
            <Link href={"/comunidade?kind=event&id=" + event.id + "#editor"}>
              Editar evento
            </Link>
          )}
        </div>
      </article>
    </>
  );
}
