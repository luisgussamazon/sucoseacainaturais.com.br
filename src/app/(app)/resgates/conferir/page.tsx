import { notFound } from "next/navigation";
import { productPhotoSrc } from "@/lib/product-photo";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PickupDesk } from "@/components/pickup-desk";
import { SharePostActions } from "@/components/redemption-center";
import styles from "@/components/redemptions.module.css";
export default async function Pickup({
  searchParams,
}: {
  searchParams: Promise<{ notification?: string }>;
}) {
  const actor = await requireRole(["HR", "ADMIN"]);
  const { notification } = await searchParams;
  const notice =
    typeof notification === "string" && notification.length <= 100
      ? await db.redemptionNotice.findFirst({
          where: { id: notification, userId: actor.id },
          include: {
            order: {
              include: { product: true, user: { select: { name: true } } },
            },
          },
        })
      : null;
  if (notification && !notice) notFound();
  const o = notice?.order;
  const initialOrder = o
    ? {
        id: o.id,
        code: o.pickupCode,
        name: o.user.name,
        product: o.product.name,
        description: o.product.description,
        image: productPhotoSrc(o.product),
        quantity: o.quantity,
        cost: o.cost,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        collectedAt: o.collectedAt?.toISOString() ?? null,
        collectedByName: o.collectedByName,
      }
    : null;
  const reports =
    actor.role === "ADMIN"
      ? await db.redemptionReport.findMany({
          where: { share: { post: { status: "PUBLISHED" } } },
          include: {
            share: {
              include: {
                post: { select: { id: true, title: true, authorId: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
  return (
    <div className={styles.staff}>
      <Link href="/resgates">← Meus resgates</Link>
      <h1>Conferir retirada</h1>
      <p>
        Confira o comprovante no sistema, a identidade do colaborador e o
        produto antes de registrar a entrega. A confirmação não movimenta
        estoque nem Amazonitos.
      </p>
      <PickupDesk
        key={initialOrder?.id ?? "manual"}
        initialOrder={initialOrder}
      />
      {actor.role === "ADMIN" && (
        <section className={styles.reports}>
          <h2>Denúncias de conquistas</h2>
          {!reports.length && (
            <p>Nenhuma denúncia pendente em publicações ativas.</p>
          )}
          {reports.map((r) => (
            <article key={r.postId + ":" + r.reporterId}>
              <Link href={"/mural?post=" + r.postId}>{r.share.post.title}</Link>
              <p>{r.reason}</p>
              <SharePostActions
                postId={r.postId}
                own={r.share.post.authorId === actor.id}
                admin
              />
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
