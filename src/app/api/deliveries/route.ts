import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serial, CommunityError } from "@/lib/community";
import { finalizeOrder } from "@/lib/order-transition";
import { revalidatePath } from "next/cache";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";
export async function GET() {
  const actor = await currentUser();
  if (!actor)
    return Response.json(
      { error: "Entre novamente." },
      { status: 401, headers },
    );
  if (!["HR", "ADMIN"].includes(actor.role))
    return Response.json(
      { error: "Acesso não autorizado." },
      { status: 403, headers },
    );
  const [version, counts] = await Promise.all([
    db.order.aggregate({
      _count: { _all: true },
      _max: { createdAt: true, collectedAt: true, cancelledAt: true },
    }),
    db.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
  ]);
  return Response.json({ version, counts }, { headers });
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"),
      host =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host") ??
        new URL(request.url).host;
    let allowed = false;
    try {
      allowed = !!origin && new URL(origin).host === host;
    } catch {}
    if (!allowed) throw new CommunityError("Origem inválida.", 403);
    const actor = await currentUser();
    if (!actor) throw new CommunityError("Entre novamente.", 401);
    if (actor.role !== "ADMIN")
      throw new CommunityError(
        "Somente administradores podem cancelar pedidos.",
        403,
      );
    const reader = request.body?.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2048) {
          await reader.cancel();
          throw new CommunityError("Requisição inválida.", 413);
        }
        chunks.push(value);
      }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (
      body.action !== "cancel" ||
      typeof body.orderId !== "string" ||
      body.orderId.length > 100 ||
      body.checked !== true
    )
      throw new CommunityError("Confira o pedido e confirme o cancelamento.");
    await serial(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: body.orderId } });
      if (!order) throw new CommunityError("Pedido indisponível.", 404);
      if (order.status !== "RESERVED")
        throw new CommunityError("Pedido já finalizado.", 409);
      await finalizeOrder(tx, order.id, "CANCELLED", actor);
    });
    revalidatePath("/", "layout");
    return Response.json(
      { message: "Pedido cancelado e Amazonitos estornados uma única vez." },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CommunityError
            ? error.message
            : "Não foi possível concluir. Atualize a página e tente novamente.",
      },
      { status: error instanceof CommunityError ? error.status : 400, headers },
    );
  }
}
