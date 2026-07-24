/*
  Purchases gain a tier, a richer expiry rule, line items, and shipping.

  `tier` is required and has no default, so existing rows are backfilled from
  the `kind` they were bought under: a self-bought journey becomes the
  self-serve tier, a gift becomes Sprout (the digital gift — pre-existing gifts
  never shipped a box), and an extension stays an extension.
*/
-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "physical" BOOLEAN NOT NULL DEFAULT false,
    "shipsAfterNaming" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tier" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiryRule" TEXT NOT NULL DEFAULT 'months',
    "months" INTEGER,
    "graceDays" INTEGER,
    "fallbackMonths" INTEGER,
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
    "needsShipping" BOOLEAN NOT NULL DEFAULT false,
    "shippingName" TEXT,
    "shippingAddress" TEXT,
    "fulfilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "redeemedAt" DATETIME,
    CONSTRAINT "Purchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("amountCents", "createdAt", "currency", "draft", "giftMessage", "id", "kind", "tier", "expiryRule", "months", "paidAt", "purchaserEmail", "purchaserName", "recipientEmail", "redeemCode", "redeemedAt", "status", "stripeSessionId", "workspaceId")
SELECT "amountCents", "createdAt", "currency", "draft", "giftMessage", "id", "kind",
       CASE "kind"
         WHEN 'journey' THEN 'self_serve'
         WHEN 'gift'    THEN 'sprout'
         WHEN 'extend'  THEN 'extend'
         ELSE 'self_serve'
       END,
       'months',
       "months", "paidAt", "purchaserEmail", "purchaserName", "recipientEmail", "redeemCode", "redeemedAt", "status", "stripeSessionId", "workspaceId"
FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_redeemCode_key" ON "Purchase"("redeemCode");
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
CREATE INDEX "Purchase_recipientEmail_idx" ON "Purchase"("recipientEmail");
CREATE INDEX "Purchase_needsShipping_fulfilledAt_idx" ON "Purchase"("needsShipping", "fulfilledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
