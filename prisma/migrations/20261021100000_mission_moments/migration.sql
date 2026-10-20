CREATE TABLE "MissionMoment" ("id" TEXT NOT NULL, "evidenceId" TEXT NOT NULL, "attempt" INTEGER NOT NULL, "albumId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MissionMoment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "MissionMoment_albumId_key" ON "MissionMoment"("albumId");
CREATE UNIQUE INDEX "MissionMoment_evidenceId_attempt_key" ON "MissionMoment"("evidenceId", "attempt");
ALTER TABLE "MissionMoment" ADD CONSTRAINT "MissionMoment_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PhotoEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionMoment" ADD CONSTRAINT "MissionMoment_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "CommunityAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoEvidence" ADD COLUMN "caption" TEXT;
