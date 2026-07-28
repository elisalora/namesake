-- The keepsake prints one historical fact — "chosen 12 March 2026" — and it
-- was reading Workspace.updatedAt, which means "when this row was last
-- touched". Every consultant message touches it, so the date on a printed
-- keepsake moved every time the couple came back to talk.
--
-- The day a name was chosen was never stored anywhere, so this is where it
-- starts being stored.
ALTER TABLE "NameEntry" ADD COLUMN "chosenAt" TIMESTAMP(3);

-- Deliberately not backfilled. Names already chosen have no record of the day
-- it happened: Workspace.updatedAt is the drifting value this column exists to
-- replace, and NameEntry.createdAt is the day the name joined the shortlist,
-- which is a different day and often a much earlier one. Both would put a
-- confident wrong date on something people print and keep. The keepsake drops
-- the line when this is null instead.
