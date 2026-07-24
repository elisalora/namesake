-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "expiresAt" DATETIME;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "months" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "purchaserEmail" TEXT NOT NULL,
    "purchaserName" TEXT,
    "recipientEmail" TEXT,
    "giftMessage" TEXT,
    "draft" TEXT,
    "redeemCode" TEXT NOT NULL,
    "workspaceId" TEXT,
    "stripeSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "redeemedAt" DATETIME,
    CONSTRAINT "Purchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_redeemCode_key" ON "Purchase"("redeemCode");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_recipientEmail_idx" ON "Purchase"("recipientEmail");
