-- Middle names join the shortlist as entries of their own, so a middle name
-- can be weighed the way a first name is: hearts from both parents, notes, a
-- veto, a meaning. Everything already on the list is a first name.
ALTER TABLE "NameEntry" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'first';

-- A baby has one chosen first name and one chosen middle name, so the slot is
-- only unique within a role now.
DROP INDEX IF EXISTS "NameEntry_workspaceId_chosenSlot_key";
CREATE UNIQUE INDEX "NameEntry_workspaceId_role_chosenSlot_key" ON "NameEntry"("workspaceId", "role", "chosenSlot");

CREATE INDEX "NameEntry_workspaceId_role_idx" ON "NameEntry"("workspaceId", "role");
