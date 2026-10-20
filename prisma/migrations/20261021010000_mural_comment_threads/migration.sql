ALTER TABLE "CommunityComment" ADD COLUMN "parentId" TEXT, ADD COLUMN "replyToId" TEXT;
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "CommunityComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CommunityComment_postId_parentId_createdAt_id_idx" ON "CommunityComment"("postId", "parentId", "createdAt", "id");
CREATE TABLE "CommunityCommentLike" ("commentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CommunityCommentLike_pkey" PRIMARY KEY ("commentId", "userId"));
ALTER TABLE "CommunityCommentLike" ADD CONSTRAINT "CommunityCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityCommentLike" ADD CONSTRAINT "CommunityCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
