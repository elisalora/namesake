-- The free tier: ten consultant turns per person, and a journey that exists
-- before anybody has paid for one.
--
-- Two columns, and the interesting thing about both is where they *aren't*.
--
-- The allowance sits on the person, not on the journey. Per-journey, the trial
-- renews every time someone starts a new one, which is a limit that isn't a
-- limit — and, worse, a promise the schema doesn't keep, sitting under a
-- counter that tells people what they have left.
ALTER TABLE "User" ADD COLUMN "freeTurnsUsed" INTEGER NOT NULL DEFAULT 0;

-- And "has anyone paid for this" sits on the journey, not on the person.
-- Otherwise a parent who buys one journey quietly stops spending free turns in
-- a different one they're only a guest in.
--
-- Defaults to false, which is the right answer for every row that already
-- exists: every journey in the database today came from a redeemed grant.
ALTER TABLE "Workspace" ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false;
