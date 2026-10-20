import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { targetAllowed } from "@/lib/community-social";
import { audit, CommunityError } from "@/lib/community";
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
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401, headers });
  try {
    const actor = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { communityGrant: true },
    });
    const id = (await params).id;
    const media = await db.$transaction(
      async (tx) => {
        await targetAllowed("PHOTO", id, actor, tx);
        const m = await tx.communityMedia.findUniqueOrThrow({ where: { id } });
        await audit(
          tx,
          actor,
          "COMMUNITY_PHOTO_DOWNLOAD",
          JSON.stringify({ mediaId: m.id, postId: m.postId }),
        );
        return m;
      },
      { isolationLevel: "RepeatableRead" },
    );
    const filename =
      "SSD-VBJ2-FOTO-" +
      media.createdAt.toISOString().slice(0, 10) +
      "-" +
      media.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12) +
      ".webp";
    return new Response(Buffer.from(media.bytes), {
      headers: {
        ...headers,
        "Content-Type": "image/webp",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
      },
    });
  } catch (e) {
    return new Response(null, {
      status: e instanceof CommunityError ? e.status : 500,
      headers,
    });
  }
}
