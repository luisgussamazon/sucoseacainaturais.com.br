-- Additive only: no modification to existing orders, balances, batches or ledger.
CREATE TABLE "RedemptionRequest" ("userId" TEXT NOT NULL, "key" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "unitPrice" INTEGER NOT NULL, "orderId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RedemptionRequest_pkey" PRIMARY KEY ("userId","key"));
CREATE UNIQUE INDEX "RedemptionRequest_orderId_key" ON "RedemptionRequest"("orderId");
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "RedemptionNotice" ("id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT NOT NULL,"orderId" TEXT NOT NULL,"readAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "RedemptionNotice_userId_orderId_key" ON "RedemptionNotice"("userId","orderId");
CREATE INDEX "RedemptionNotice_userId_readAt_createdAt_idx" ON "RedemptionNotice"("userId","readAt","createdAt");
ALTER TABLE "RedemptionNotice" ADD CONSTRAINT "RedemptionNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedemptionNotice" ADD CONSTRAINT "RedemptionNotice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
