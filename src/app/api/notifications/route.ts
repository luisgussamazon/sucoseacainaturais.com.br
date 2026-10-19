import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { productPhotoSrc } from "@/lib/product-photo";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json(
      { error: "Entre novamente." },
      { status: 401, headers },
    );
  if (!["HR", "ADMIN"].includes(user.role))
    return Response.json(
      { error: "Acesso não autorizado." },
      { status: 403, headers },
    );
  const requested = Number(new URL(request.url).searchParams.get("page"));
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 100000)
      : 1;
  const where = {
    userId: user.id,
    order: { status: { not: "CANCELLED" as const } },
  };
  const [unread, total, notices] = await Promise.all([
    db.redemptionNotice.count({ where: { ...where, readAt: null } }),
    db.redemptionNotice.count({ where }),
    db.redemptionNotice.findMany({
      where,
      include: {
        order: { include: { product: true, user: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      skip: (page - 1) * 10,
    }),
  ]);
  return Response.json(
    {
      unread,
      page,
      pages: Math.max(1, Math.ceil(total / 10)),
      items: notices.map((n) => ({
        id: n.id,
        read: !!n.readAt,
        createdAt: n.createdAt,
        orderId: n.orderId,
        owner: n.order.user.name,
        product: n.order.product.name,
        image: productPhotoSrc(n.order.product),
        quantity: n.order.quantity,
        cost: n.order.cost,
        status: n.order.status,
      })),
    },
    { headers },
  );
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin"),
    host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
  let allowed = false;
  try {
    allowed = !!origin && new URL(origin).host === host;
  } catch {}
  if (!allowed)
    return Response.json(
      { error: "Origem inválida." },
      { status: 403, headers },
    );
  const user = await currentUser();
  if (!user)
    return Response.json(
      { error: "Entre novamente." },
      { status: 401, headers },
    );
  if (!["HR", "ADMIN"].includes(user.role))
    return Response.json(
      { error: "Acesso não autorizado." },
      { status: 403, headers },
    );
  try {
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2048) {
          await reader.cancel();
          return Response.json(
            { error: "Requisição inválida." },
            { status: 413, headers },
          );
        }
        chunks.push(value);
      }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (typeof body.id !== "string" || body.id.length > 100)
      return Response.json(
        { error: "Notificação inválida." },
        { status: 400, headers },
      );
    const notice = await db.redemptionNotice.findFirst({
      where: { id: body.id, userId: user.id },
    });
    if (!notice)
      return Response.json(
        { error: "Notificação indisponível." },
        { status: 404, headers },
      );
    await db.redemptionNotice.updateMany({
      where: { id: notice.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      { error: "Requisição inválida." },
      { status: 400, headers },
    );
  }
}
