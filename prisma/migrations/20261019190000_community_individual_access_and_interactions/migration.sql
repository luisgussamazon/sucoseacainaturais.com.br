BEGIN;
-- AlterTable
ALTER TABLE "Completion" ADD COLUMN     "recognitionConsent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityGrant" ADD COLUMN     "albums" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "events" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recognize" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "imageAuthorization" BOOLEAN,
ADD COLUMN     "restrictedChecked" BOOLEAN;

-- AlterTable
ALTER TABLE "CommunityAlbum" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Eventos',
ADD COLUMN     "imageAuthorization" BOOLEAN,
ADD COLUMN     "restrictedChecked" BOOLEAN;

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "completionId" TEXT,
ADD COLUMN     "recognitionIdentified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityComment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "CommunityMedia" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CommunityThread" (
    "id" TEXT NOT NULL,
    "albumId" TEXT,
    "mediaId" TEXT,

    CONSTRAINT "CommunityThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaLike" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaLike_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "MediaComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "moderatedBy" TEXT,
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityThread_albumId_key" ON "CommunityThread"("albumId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityThread_mediaId_key" ON "CommunityThread"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaComment_requestId_key" ON "MediaComment"("requestId");

-- CreateIndex
CREATE INDEX "MediaComment_threadId_hidden_createdAt_idx" ON "MediaComment"("threadId", "hidden", "createdAt");

-- CreateIndex
CREATE INDEX "MediaComment_userId_createdAt_idx" ON "MediaComment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPost_completionId_key" ON "CommunityPost"("completionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityComment_requestId_key" ON "CommunityComment"("requestId");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "Completion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityThread" ADD CONSTRAINT "CommunityThread_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "CommunityAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityThread" ADD CONSTRAINT "CommunityThread_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "CommunityMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaLike" ADD CONSTRAINT "MediaLike_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunityThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaLike" ADD CONSTRAINT "MediaLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunityThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only replace a validation constraint to support the new event relationship.
ALTER TABLE "CommunityMedia" DROP CONSTRAINT "CommunityMedia_single_resource";
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_single_resource" CHECK (num_nonnulls("postId","albumId","eventId","photoMissionId","evidenceId")=1);
ALTER TABLE "CommunityThread" ADD CONSTRAINT "CommunityThread_single_target" CHECK (num_nonnulls("albumId","mediaId")=1);
COMMIT;
