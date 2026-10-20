import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { socialRead, TargetKind } from "@/lib/community-social";
import { CommunityError } from "@/lib/community";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const user = await currentUser();
    if (!user)
      return Response.json(
        { error: "Entre novamente." },
        { status: 401, headers },
      );
    const actor = await db.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { communityGrant: true },
      }),
      p = new URL(request.url).searchParams,
      kind = p.get("kind") ?? "POST";
    if (!["POST", "ALBUM", "PHOTO"].includes(kind))
      throw new CommunityError("Conteúdo inválido.");
    const page = Math.max(
      1,
      Math.min(1000000, Math.floor(Number(p.get("page"))) || 1),
    );
    return Response.json(
      await socialRead(
        kind as TargetKind,
        p.get("targetId") ?? "",
        actor,
        page,
        p.get("parentId") ?? undefined,
      ),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CommunityError
            ? e.message
            : "Não foi possível carregar as interações.",
      },
      { status: e instanceof CommunityError ? e.status : 400, headers },
    );
  }
}
