-- Twins and triplets: a journey can have more than one baby to name.
ALTER TABLE "Workspace" ADD COLUMN "babyCount" INTEGER NOT NULL DEFAULT 1;

-- The decision moves off the workspace and onto the name. A workspace could
-- only ever hold one chosen name and one story; twins need one of each per
-- baby, so both live on NameEntry now.
ALTER TABLE "NameEntry" ADD COLUMN "chosenSlot" INTEGER;
ALTER TABLE "NameEntry" ADD COLUMN "chosenReason" TEXT;

-- Carry every existing decision across before the old columns go: a journey
-- that has already chosen a name becomes that name in slot 1, keeping its
-- story. Nothing already decided should notice this happened.
UPDATE "NameEntry" AS n
SET "chosenSlot" = 1, "chosenReason" = w."decidedReason"
FROM "Workspace" AS w
WHERE w."chosenNameId" = n."id";

ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_chosenNameId_fkey";
DROP INDEX IF EXISTS "Workspace_chosenNameId_key";
ALTER TABLE "Workspace" DROP COLUMN "chosenNameId";
ALTER TABLE "Workspace" DROP COLUMN "decidedReason";

-- Two babies in one journey can't be given the same name by a double tap.
-- Postgres treats NULLs as distinct, so every undecided name is exempt.
CREATE UNIQUE INDEX "NameEntry_workspaceId_chosenSlot_key" ON "NameEntry"("workspaceId", "chosenSlot");
