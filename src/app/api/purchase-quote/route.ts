import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const user = await currentUser();
  if (!user)
    return Response.json(
      { error: "Entre novamente para continuar." },
      { status: 401, headers },
    );
  const id = new URL(request.url).searchParams.get("productId");
  if (!id || id.length > 100)
    return Response.json(
      { error: "Produto inválido." },
      { status: 400, headers },
    );
  const product = await db.product.findFirst({
    where: { id, active: true },
    select: {
      price: true,
      batches: {
        where: { expiresAt: { gt: new Date() }, quantity: { gt: 0 } },
        select: { quantity: true },
      },
    },
  });
  if (!product)
    return Response.json(
      { error: "Produto indisponível." },
      { status: 404, headers },
    );
  return Response.json(
    {
      balance: user.balance,
      price: product.price,
      stock: product.batches.reduce((n, b) => n + b.quantity, 0),
    },
    { headers },
  );
}
