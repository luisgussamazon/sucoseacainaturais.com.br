import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
  const photo = await db.profilePhoto.findFirst({
    where: { userId: (await params).id, user: { active: true } },
    select: { bytes: true },
  });
  if (!photo) return new Response(null, { status: 404, headers });
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Disposition": "inline; filename=profile.webp",
    },
  });
}
