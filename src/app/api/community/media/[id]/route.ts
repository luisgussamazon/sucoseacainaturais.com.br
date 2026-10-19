import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaAllowed } from "@/lib/community";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (!user) return new Response(null, { status: 401, headers });
  const actor = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { communityGrant: true },
  });
  const m = await mediaAllowed((await params).id, actor);
  if (!m) return new Response(null, { status: 404, headers });
  return new Response(Buffer.from(m.bytes), {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
    },
  });
}
