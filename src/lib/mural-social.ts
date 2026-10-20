import { Prisma } from "@prisma/client";
import { db } from "./db";
import { Actor, CommunityError, rights } from "./community";
import { targetAllowed } from "./community-social";
export async function muralRead(
  id: string,
  u: Actor,
  page = 1,
  parentId?: string,
) {
  await targetAllowed("POST", id, u);
  const canModerate = rights(u).moderate;
  const visible: Prisma.CommunityCommentWhereInput = {
    deletedAt: null,
    ...(canModerate ? {} : { hidden: false }),
  };
  const include = {
    user: { select: { id: true, name: true, avatarUpdatedAt: true } },
    likes: { where: { userId: u.id }, select: { userId: true } },
    _count: { select: { likes: true } },
    replyTo: {
      select: {
        hidden: true,
        deletedAt: true,
        user: { select: { name: true } },
      },
    },
  } satisfies Prisma.CommunityCommentInclude;
  const serialize = (
    c: Prisma.CommunityCommentGetPayload<{ include: typeof include }>,
  ) => ({
    id: c.id,
    userId: c.user.id,
    name: c.user.name,
    avatarUpdatedAt: c.user.avatarUpdatedAt?.toISOString() ?? null,
    text: c.text,
    createdAt: c.createdAt,
    own: c.userId === u.id,
    hidden: c.hidden,
    liked: !!c.likes.length,
    likeCount: c._count.likes,
    replyToName:
      c.replyTo && !c.replyTo.hidden && !c.replyTo.deletedAt
        ? c.replyTo.user.name
        : null,
  });
  if (parentId) {
    const root = await db.communityComment.findFirst({
      where: { id: parentId, postId: id, parentId: null, ...visible },
    });
    if (!root) throw new CommunityError("Conversa indisponível.", 404);
    const where = { postId: id, parentId, ...visible };
    const [comments, total] = await Promise.all([
      db.communityComment.findMany({
        where,
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 3,
        skip: (page - 1) * 3,
      }),
      db.communityComment.count({ where }),
    ]);
    return { comments: comments.map(serialize), total, page };
  }
  const [roots, totalRoots, commentCount, likeCount, liked, likers] =
    await Promise.all([
      db.communityComment.findMany({
        where: { postId: id, parentId: null, ...visible },
        include,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        skip: (page - 1) * 5,
      }),
      db.communityComment.count({
        where: { postId: id, parentId: null, ...visible },
      }),
      db.communityComment.count({
        where: {
          postId: id,
          hidden: false,
          deletedAt: null,
          OR: [
            { parentId: null },
            { parent: { hidden: false, deletedAt: null } },
          ],
        },
      }),
      db.communityLike.count({ where: { postId: id } }),
      db.communityLike.count({ where: { postId: id, userId: u.id } }),
      db.communityLike.findMany({
        where: { postId: id },
        orderBy: [{ createdAt: "desc" }, { userId: "asc" }],
        take: 3,
        select: {
          user: { select: { id: true, name: true, avatarUpdatedAt: true } },
        },
      }),
    ]);
  const comments = await Promise.all(
    roots.map(async (c) => {
      const where = { postId: id, parentId: c.id, ...visible };
      const [replies, replyCount] = await Promise.all([
        db.communityComment.findMany({
          where,
          include,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 3,
        }),
        db.communityComment.count({ where }),
      ]);
      return { ...serialize(c), replies: replies.map(serialize), replyCount };
    }),
  );
  return {
    viewer: {
      id: u.id,
      name: u.name,
      avatarUpdatedAt: u.avatarUpdatedAt?.toISOString() ?? null,
    },
    viewerName: u.name,
    likers: likers.map((l) => ({
      ...l.user,
      avatarUpdatedAt: l.user.avatarUpdatedAt?.toISOString() ?? null,
    })),
    liked: liked > 0,
    likeCount,
    commentCount,
    comments,
    totalRoots,
    canModerate,
    page,
  };
}
