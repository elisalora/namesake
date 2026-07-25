-- Reserve the family-suggestion slug at purchase rather than at redemption, so
-- the shower card can be printed and packed before the journey exists.
-- Nullable: extensions never carry one, and purchases made before this change
-- have none. Postgres permits many NULLs under a unique index.
ALTER TABLE "Purchase" ADD COLUMN "suggestSlug" TEXT;
CREATE UNIQUE INDEX "Purchase_suggestSlug_key" ON "Purchase"("suggestSlug");
