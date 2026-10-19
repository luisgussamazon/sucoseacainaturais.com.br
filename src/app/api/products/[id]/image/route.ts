import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { storedProductPhoto } from "@/lib/product-photo";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (!(await currentUser()))
    return new Response(null, { status: 401, headers });
  const product = await db.product.findUnique({
    where: { id: (await params).id },
    select: { imageUrl: true },
  });
  if (!product || !storedProductPhoto(product.imageUrl))
    return new Response(null, { status: 404, headers });
  return new Response(
    Buffer.from(
      product.imageUrl.slice("data:image/webp;base64,".length),
      "base64",
    ),
    {
      headers: {
        ...headers,
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
      },
    },
  );
}
