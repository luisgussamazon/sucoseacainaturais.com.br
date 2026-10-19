-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('INTERNAL', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CommunityGrant" (
    "userId" TEXT NOT NULL,
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "review" BOOLEAN NOT NULL DEFAULT false,
    "moderate" BOOLEAN NOT NULL DEFAULT false,
    "leadership" BOOLEAN NOT NULL DEFAULT false,
    "assignedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityGrant_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CommunityVisibility" NOT NULL DEFAULT 'INTERNAL',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityAlbum" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CommunityVisibility" NOT NULL DEFAULT 'INTERNAL',
    "authorId" TEXT NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CommunityVisibility" NOT NULL DEFAULT 'INTERNAL',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "eventId" TEXT,
    "albumId" TEXT,
    "evidenceId" TEXT,
    "imageAuthorization" BOOLEAN NOT NULL DEFAULT false,
    "restrictedChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityLike" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "moderatedBy" TEXT,
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoMission" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "maxPhotos" INTEGER NOT NULL DEFAULT 3,
    "participationLimit" INTEGER NOT NULL DEFAULT 100,
    "allowResubmit" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewerId" TEXT,

    CONSTRAINT "PhotoMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoEvidence" (
    "id" TEXT NOT NULL,
    "photoMissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "shareConsent" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reason" TEXT,

    CONSTRAINT "PhotoEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceReview" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMedia" (
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/webp',
    "cover" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT,
    "albumId" TEXT,
    "photoMissionId" TEXT,
    "evidenceId" TEXT,

    CONSTRAINT "CommunityMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityEvent_status_startsAt_idx" ON "CommunityEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CommunityAlbum_status_eventDate_idx" ON "CommunityAlbum"("status", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPost_evidenceId_key" ON "CommunityPost"("evidenceId");

-- CreateIndex
CREATE INDEX "CommunityPost_status_pinned_publishedAt_idx" ON "CommunityPost"("status", "pinned", "publishedAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_hidden_createdAt_idx" ON "CommunityComment"("postId", "hidden", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoMission_missionId_key" ON "PhotoMission"("missionId");

-- CreateIndex
CREATE INDEX "PhotoMission_status_startsAt_idx" ON "PhotoMission"("status", "startsAt");

-- CreateIndex
CREATE INDEX "PhotoEvidence_status_submittedAt_idx" ON "PhotoEvidence"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoEvidence_photoMissionId_userId_key" ON "PhotoEvidence"("photoMissionId", "userId");

-- CreateIndex
CREATE INDEX "EvidenceReview_evidenceId_createdAt_idx" ON "EvidenceReview"("evidenceId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityMedia_expiresAt_idx" ON "CommunityMedia"("expiresAt");

-- CreateIndex
CREATE INDEX "CommunityMedia_postId_idx" ON "CommunityMedia"("postId");

-- CreateIndex
CREATE INDEX "CommunityMedia_albumId_idx" ON "CommunityMedia"("albumId");

-- CreateIndex
CREATE INDEX "CommunityMedia_evidenceId_idx" ON "CommunityMedia"("evidenceId");

-- AddForeignKey
ALTER TABLE "CommunityGrant" ADD CONSTRAINT "CommunityGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGrant" ADD CONSTRAINT "CommunityGrant_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAlbum" ADD CONSTRAINT "CommunityAlbum_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAlbum" ADD CONSTRAINT "CommunityAlbum_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "CommunityAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PhotoEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoMission" ADD CONSTRAINT "PhotoMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoMission" ADD CONSTRAINT "PhotoMission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoEvidence" ADD CONSTRAINT "PhotoEvidence_photoMissionId_fkey" FOREIGN KEY ("photoMissionId") REFERENCES "PhotoMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoEvidence" ADD CONSTRAINT "PhotoEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoEvidence" ADD CONSTRAINT "PhotoEvidence_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PhotoEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "CommunityAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_photoMissionId_fkey" FOREIGN KEY ("photoMissionId") REFERENCES "PhotoMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PhotoEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every photograph belongs to exactly one private resource.
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_single_resource" CHECK (num_nonnulls("postId", "albumId", "photoMissionId", "evidenceId") = 1);
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_size" CHECK (octet_length("bytes") <= 1048576 AND "width" > 0 AND "height" > 0);
ALTER TABLE "PhotoMission" ADD CONSTRAINT "PhotoMission_limits" CHECK ("maxPhotos" BETWEEN 1 AND 5 AND "participationLimit" > 0);
