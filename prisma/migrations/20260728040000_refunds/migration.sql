-- Money can come back, and until now the app could not tell.
--
-- `Purchase.status` had no state past `redeemed`, and the Stripe webhook
-- acknowledged every event except `checkout.session.completed` without reading
-- it — so a refund issued in the Stripe dashboard gave the money back and
-- changed nothing here. The redeem link still worked, and a refunded boxed
-- tier stayed on the packing list waiting to be posted.
--
-- Two columns close that. `refundedAt` dates the money going back;
-- `stripePaymentIntentId` is what makes it findable at all, because a refund
-- arrives as a charge event carrying a payment intent and no session, and the
-- only Stripe id we stored was the session's.
--
-- Nullable and unbackfilled on purpose. A purchase fulfilled before this
-- migration has no payment intent recorded, so refunds on those fall back to
-- asking Stripe which session the intent belongs to (`purchase.ts`,
-- `findPurchaseForIntent`). Backfilling would mean walking every historical
-- session, and the fallback costs one API call on an event that is rare.
ALTER TABLE "Purchase" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX "Purchase_stripePaymentIntentId_key" ON "Purchase"("stripePaymentIntentId");
