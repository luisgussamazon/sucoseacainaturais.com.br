-- Additive only: existing orders, balances, allocations and media remain intact.
ALTER TABLE "Order" ADD COLUMN "pickupCode" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
 ADD COLUMN "collectedAt" TIMESTAMP(3), ADD COLUMN "collectedById" TEXT,
 ADD COLUMN "collectedByName" TEXT, ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledByName" TEXT;
CREATE UNIQUE INDEX "Order_pickupCode_key" ON "Order"("pickupCode");
CREATE TABLE "RedemptionShare" ("orderId" TEXT NOT NULL PRIMARY KEY, "postId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "RedemptionShare_postId_key" ON "RedemptionShare"("postId");
ALTER TABLE "RedemptionShare" ADD CONSTRAINT "RedemptionShare_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedemptionShare" ADD CONSTRAINT "RedemptionShare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "RedemptionReport" ("postId" TEXT NOT NULL, "reporterId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RedemptionReport_pkey" PRIMARY KEY ("postId", "reporterId"));
ALTER TABLE "RedemptionReport" ADD CONSTRAINT "RedemptionReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "RedemptionShare"("postId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PickupAttempt" ("actorId" TEXT NOT NULL PRIMARY KEY, "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0);
