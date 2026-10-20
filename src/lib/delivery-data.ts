import { db } from "./db";
import { productPhotoSrc } from "./product-photo";
import type { Prisma } from "@prisma/client";
import type { RedemptionView } from "./redemption-view";
export const deliveryInclude = {
  product: true,
  user: { select: { name: true } },
  allocations: { include: { batch: true } },
} satisfies Prisma.OrderInclude;
export async function deliveryViews(
  rows: Prisma.OrderGetPayload<{ include: typeof deliveryInclude }>[],
): Promise<RedemptionView[]> {
  const old = rows
    .filter((o) => o.status !== "RESERVED" && !o.collectedAt && !o.cancelledAt)
    .map((o) => o.id);
  const audits = old.length
    ? await db.audit.findMany({
        where: {
          details: { in: old },
          action: { in: ["COLLECTED", "CANCELLED"] },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const actors = audits.length
    ? await db.user.findMany({
        where: { id: { in: audits.map((a) => a.actorId) } },
        select: { id: true, name: true },
      })
    : [];
  return rows.map((o) => {
    const audit = audits.find(
      (a) => a.details === o.id && a.action === o.status,
    );
    return {
      id: o.id,
      code: o.pickupCode,
      name: o.product.name,
      description: o.product.description,
      image: productPhotoSrc(o.product),
      quantity: o.quantity,
      cost: o.cost,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      collectedAt:
        (
          o.collectedAt ?? (o.status === "COLLECTED" ? audit?.createdAt : null)
        )?.toISOString() ?? null,
      collectedByName:
        o.collectedByName ??
        (o.status === "COLLECTED"
          ? actors.find((a) => a.id === audit?.actorId)?.name
          : null) ??
        null,
      cancelledAt:
        (
          o.cancelledAt ?? (o.status === "CANCELLED" ? audit?.createdAt : null)
        )?.toISOString() ?? null,
      ownerName: o.user.name,
      lots: o.allocations.map((a) => ({
        code: a.batch.code,
        quantity: a.quantity,
        expiresAt: a.batch.expiresAt.toISOString(),
      })),
      postId: null,
      postVisible: false,
    };
  });
}
