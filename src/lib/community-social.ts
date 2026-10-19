import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  Actor,
  CommunityError,
  mediaConsent,
  readable,
  rights,
  serial,
  audit,
  text,
  flag,
  optional,
} from "./community";
export type TargetKind = "POST" | "ALBUM" | "PHOTO";
export function targetInput(f: FormData) {
  const kind = String(f.get("kind") ?? "POST");
  if (!["POST", "ALBUM", "PHOTO"].includes(kind))
    throw new CommunityError("Conteúdo inválido.");
  return {
    kind: kind as TargetKind,
    id: String(f.get("targetId") ?? f.get("postId") ?? ""),
  };
}
export async function targetAllowed(
  kind: TargetKind,
  id: string,
  u: Actor,
  tx: Prisma.TransactionClient = db,
) {
  if (kind === "POST") {
    const p = await tx.communityPost.findUnique({ where: { id } });
    if (p && readable(p, u)) return;
  }
  if (kind === "ALBUM") {
    const a = await tx.communityAlbum.findUnique({ where: { id } });
    if (a && readable(a, u)) return;
  }
  if (kind === "PHOTO") {
    const m = await tx.communityMedia.findUnique({
      where: { id },
      select: {
        expiresAt: true,
        post: true,
        album: true,
        event: true,
        evidenceId: true,
        photoMissionId: true,
      },
    });
    const p = m?.post ?? m?.album ?? m?.event;
    if (
      m &&
      m.expiresAt > new Date() &&
      !m.evidenceId &&
      !m.photoMissionId &&
      p &&
      readable(p, u) &&
      (await mediaConsent(p, m.album ? "ALBUM" : m.post ? "POST" : "EVENT", tx))
    )
      return;
  }
  throw new CommunityError("Conteúdo não publicado ou indisponível.", 404);
}
async function thread(
  kind: TargetKind,
  id: string,
  tx: Prisma.TransactionClient,
) {
  if (kind === "ALBUM")
    return tx.communityThread.upsert({
      where: { albumId: id },
      create: { albumId: id },
      update: {},
    });
  return tx.communityThread.upsert({
    where: { mediaId: id },
    create: { mediaId: id },
    update: {},
  });
}
export async function socialRead(
  kind: TargetKind,
  id: string,
  u: Actor,
  page = 1,
) {
  await targetAllowed(kind, id, u);
  const t =
    kind === "POST"
      ? null
      : await db.communityThread.findUnique({
          where: kind === "ALBUM" ? { albumId: id } : { mediaId: id },
        });
  const where =
    kind === "POST" ? { postId: id } : { threadId: t?.id ?? "none" };
  const [likeCount, liked, comments, commentCount] =
    kind === "POST"
      ? await Promise.all([
          db.communityLike.count({ where: { postId: id } }),
          db.communityLike.count({ where: { postId: id, userId: u.id } }),
          db.communityComment.findMany({
            where: { postId: id, hidden: false, deletedAt: null },
            include: { user: { select: { name: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            skip: (page - 1) * 20,
          }),
          db.communityComment.count({
            where: { postId: id, hidden: false, deletedAt: null },
          }),
        ])
      : await Promise.all([
          db.mediaLike.count({ where: { threadId: t?.id ?? "none" } }),
          db.mediaLike.count({
            where: { threadId: t?.id ?? "none", userId: u.id },
          }),
          db.mediaComment.findMany({
            where: {
              threadId: t?.id ?? "none",
              hidden: false,
              deletedAt: null,
            },
            include: { user: { select: { name: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
            skip: (page - 1) * 20,
          }),
          db.mediaComment.count({
            where: {
              threadId: t?.id ?? "none",
              hidden: false,
              deletedAt: null,
            },
          }),
        ]);
  return {
    liked: liked > 0,
    likeCount,
    commentCount,
    comments: comments.map((c) => ({
      id: c.id,
      name: c.user.name,
      text: c.text,
      createdAt: c.createdAt,
      own: c.userId === u.id,
    })),
    canModerate: rights(u).moderate,
    page,
  };
}
export async function socialMutation(action: string, f: FormData, u: Actor) {
  const { kind, id } = targetInput(f);
  await serial(async (tx) => {
    if (action === "like" || action === "comment")
      await targetAllowed(kind, id, u, tx);
    if (action === "like") {
      if (kind === "POST") {
        if (flag(f, "liked"))
          await tx.communityLike.upsert({
            where: { postId_userId: { postId: id, userId: u.id } },
            create: { postId: id, userId: u.id },
            update: {},
          });
        else
          await tx.communityLike.deleteMany({
            where: { postId: id, userId: u.id },
          });
      } else {
        const t = await thread(kind, id, tx);
        if (flag(f, "liked"))
          await tx.mediaLike.upsert({
            where: { threadId_userId: { threadId: t.id, userId: u.id } },
            create: { threadId: t.id, userId: u.id },
            update: {},
          });
        else
          await tx.mediaLike.deleteMany({
            where: { threadId: t.id, userId: u.id },
          });
      }
      return;
    }
    if (action === "comment") {
      const body = text(f, "text", 1, 1000),
        requestId = optional(f, "requestId");
      if (requestId && requestId.length > 100)
        throw new CommunityError("Envio inválido.");
      const since = new Date(Date.now() - 60000),
        existing = requestId
          ? kind === "POST"
            ? await tx.communityComment.findUnique({ where: { requestId } })
            : await tx.mediaComment.findUnique({ where: { requestId } })
          : null;
      if (existing) {
        if (existing.userId !== u.id)
          throw new CommunityError("Envio inválido.", 403);
        return;
      }
      const recent =
        (await tx.communityComment.count({
          where: { userId: u.id, createdAt: { gt: since } },
        })) +
        (await tx.mediaComment.count({
          where: { userId: u.id, createdAt: { gt: since } },
        }));
      if (recent >= 5)
        throw new CommunityError(
          "Aguarde um minuto antes de comentar novamente.",
          429,
        );
      if (kind === "POST") {
        if (
          await tx.communityComment.count({
            where: {
              userId: u.id,
              postId: id,
              text: body,
              createdAt: { gt: since },
            },
          })
        )
          throw new CommunityError("Este comentário já foi enviado.");
        await tx.communityComment.create({
          data: { postId: id, userId: u.id, text: body, requestId },
        });
      } else {
        const t = await thread(kind, id, tx);
        if (
          await tx.mediaComment.count({
            where: {
              userId: u.id,
              threadId: t.id,
              text: body,
              createdAt: { gt: since },
            },
          })
        )
          throw new CommunityError("Este comentário já foi enviado.");
        await tx.mediaComment.create({
          data: { threadId: t.id, userId: u.id, text: body, requestId },
        });
      }
      return;
    }
    const commentId = text(f, "id");
    const c =
      kind === "POST"
        ? await tx.communityComment.findUnique({ where: { id: commentId } })
        : await tx.mediaComment.findUnique({ where: { id: commentId } });
    if (!c || c.deletedAt)
      throw new CommunityError("Comentário indisponível.", 404);
    if (action === "delete-comment") {
      if (c.userId !== u.id)
        throw new CommunityError(
          "Você só pode excluir seus próprios comentários.",
          403,
        );
      const data = { deletedAt: new Date(), hidden: true };
      if (kind === "POST")
        await tx.communityComment.update({ where: { id: commentId }, data });
      else await tx.mediaComment.update({ where: { id: commentId }, data });
      await audit(tx, u, "DELETE_OWN_COMMENT", kind + ":" + commentId);
      return;
    }
    if (!rights(u).moderate)
      throw new CommunityError("Sem permissão para moderar.", 403);
    const reason = text(f, "reason", 5, 300),
      data = {
        hidden: flag(f, "hidden"),
        moderatedBy: u.id,
        moderationReason: reason,
      };
    if (kind === "POST")
      await tx.communityComment.update({ where: { id: commentId }, data });
    else await tx.mediaComment.update({ where: { id: commentId }, data });
    await audit(
      tx,
      u,
      "MODERATE_COMMENT",
      JSON.stringify({ kind, id: commentId, reason, hidden: data.hidden }),
    );
  });
  return action === "comment"
    ? "Comentário publicado."
    : action === "like"
      ? "Interação atualizada."
      : "Comentário atualizado.";
}
