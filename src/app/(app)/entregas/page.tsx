import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { deliveryInclude, deliveryViews } from "@/lib/delivery-data";
import { DeliveryCenter } from "@/components/delivery-center";
import type { Prisma } from "@prisma/client";
export default async function Deliveries({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole(["HR", "ADMIN"]);
  const params = await searchParams;
  const text = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const q = text("q").trim().slice(0, 150),
    status = ["RESERVED", "COLLECTED", "CANCELLED"].includes(text("status"))
      ? text("status")
      : "",
    period = ["7", "30", "90"].includes(text("period")) ? text("period") : "",
    sort = ["newest", "oldest"].includes(text("sort"))
      ? text("sort")
      : "pending";
  const where: Prisma.OrderWhereInput = {
    ...(status
      ? { status: status as "RESERVED" | "COLLECTED" | "CANCELLED" }
      : {}),
    ...(period
      ? { createdAt: { gte: new Date(Date.now() - Number(period) * 86400000) } }
      : {}),
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { product: { name: { contains: q, mode: "insensitive" } } },
            { id: { contains: q, mode: "insensitive" } },
            { pickupCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [count, counts, total] = await Promise.all([
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { cost: true },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(count / 20)),
    page = Math.min(
      pages,
      Math.max(1, /^\d{1,8}$/.test(text("page")) ? Number(text("page")) : 1),
    );
  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    sort === "pending"
      ? [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }]
      : [
          { createdAt: sort === "oldest" ? "asc" : "desc" },
          { id: sort === "oldest" ? "asc" : "desc" },
        ];
  const rows = await db.order.findMany({
    where,
    include: deliveryInclude,
    orderBy,
    take: 20,
    skip: (page - 1) * 20,
  });
  let selectedId = text("order").slice(0, 100);
  if (params.notification) {
    const notification = text("notification");
    const notice =
      notification && notification.length <= 100
        ? await db.redemptionNotice.findFirst({
            where: { id: notification, userId: actor.id },
            select: { orderId: true },
          })
        : null;
    if (!notice) notFound();
    selectedId = notice.orderId;
  }
  const extra =
    selectedId && !rows.some((o) => o.id === selectedId)
      ? await db.order.findUnique({
          where: { id: selectedId },
          include: deliveryInclude,
        })
      : null;
  if (selectedId && !extra && !rows.some((o) => o.id === selectedId))
    notFound();
  const views = await deliveryViews(extra ? [...rows, extra] : rows);
  const current = views.find((o) => o.id === selectedId) ?? null;
  return (
    <DeliveryCenter
      orders={views.filter((o) => rows.some((r) => r.id === o.id))}
      initialOrder={current}
      canCancel={actor.role === "ADMIN"}
      stats={{
        waiting: counts.find((c) => c.status === "RESERVED")?._count._all ?? 0,
        collected:
          counts.find((c) => c.status === "COLLECTED")?._count._all ?? 0,
        cancelled:
          counts.find((c) => c.status === "CANCELLED")?._count._all ?? 0,
        total: total._sum.cost ?? 0,
      }}
      filters={{ q, status, period, sort, page, pages, count }}
    />
  );
}
