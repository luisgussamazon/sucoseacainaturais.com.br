import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rights } from "@/lib/community";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  const current = await currentUser();
  if (!current) return new Response(null, { status: 401, headers });
  const u = await db.user.findUniqueOrThrow({
    where: { id: current.id },
    include: { communityGrant: true },
  });
  if (!rights(u).recognize) return new Response(null, { status: 403, headers });
  const m = await db.communityMedia.findUnique({
    where: { id: (await params).id },
    include: { evidence: true },
  });
  if (
    !m ||
    m.expiresAt <= new Date() ||
    !m.evidence ||
    m.evidence.status !== "APPROVED" ||
    !m.evidence.shareConsent ||
    m.attempt !== m.evidence.attempts
  )
    return new Response(null, { status: 404, headers });
  return new Response(Buffer.from(m.bytes), {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
    },
  });
}
