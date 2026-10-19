import { Flash } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { productPhotoSrc } from "@/lib/product-photo";
import { RedemptionCenter } from "@/components/redemption-center";
import type { Prisma } from "@prisma/client";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status =
    typeof params.status === "string" &&
    ["RESERVED", "COLLECTED", "CANCELLED"].includes(params.status)
      ? params.status
      : "";
  const period =
    typeof params.period === "string" &&
    ["7", "30", "90"].includes(params.period)
      ? params.period
      : "";
  const where: Prisma.OrderWhereInput = {
    userId: user.id,
    ...(q ? { product: { name: { contains: q, mode: "insensitive" } } } : {}),
    ...(status
      ? { status: status as "RESERVED" | "COLLECTED" | "CANCELLED" }
      : {}),
    ...(period
      ? { createdAt: { gte: new Date(Date.now() - Number(period) * 86400000) } }
      : {}),
  };
  const count = await db.order.count({ where });
  const pages = Math.max(1, Math.ceil(count / 20));
  const page = Math.min(
    pages,
    Math.max(
      1,
      typeof params.page === "string" && /^\d{1,8}$/.test(params.page)
        ? Number(params.page)
        : 1,
    ),
  );
  const [orders, waiting, collected, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        product: true,
        allocations: { include: { batch: true } },
        share: { include: { post: { select: { status: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.order.aggregate({
      where: { userId: user.id, status: "RESERVED" },
      _sum: { quantity: true },
    }),
    db.order.aggregate({
      where: { userId: user.id, status: "COLLECTED" },
      _sum: { quantity: true },
    }),
    db.order.aggregate({
      where: { userId: user.id, status: { not: "CANCELLED" } },
      _sum: { cost: true },
    }),
  ]);
  // Old finalized orders can display genuine audit timestamps without modifying historical data.
  const oldAudits = await db.audit.findMany({
    where: {
      details: {
        in: orders
          .filter(
            (o) => o.status !== "RESERVED" && !o.collectedAt && !o.cancelledAt,
          )
          .map((o) => o.id),
      },
      action: { in: ["COLLECTED", "CANCELLED"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const actors = await db.user.findMany({
    where: { id: { in: oldAudits.map((a) => a.actorId) } },
    select: { id: true, name: true },
  });
  const views = orders.map((o) => {
    const audit = oldAudits.find(
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
      ownerName: user.name,
      lots: o.allocations.map((a) => ({
        code: a.batch.code,
        quantity: a.quantity,
        expiresAt: a.batch.expiresAt.toISOString(),
      })),
      postId: o.share?.postId ?? null,
      postVisible: o.share?.post.status === "PUBLISHED",
    };
  });
  return (
    <>
      <Flash
        success={
          typeof params.success === "string" ? params.success : undefined
        }
      />
      <RedemptionCenter
        orders={views}
        waiting={waiting._sum.quantity ?? 0}
        collected={collected._sum.quantity ?? 0}
        total={total._sum.cost ?? 0}
        canConfirm={["HR", "ADMIN"].includes(user.role)}
        filters={{ q, status, period, page, pages, count }}
      />
    </>
  );
}
