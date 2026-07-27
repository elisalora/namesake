-- Only one question in flight per journey.
--
-- Two parents share one conversation, and a reply takes several seconds. Asked
-- at the same moment, each reply was composed from a transcript missing the
-- other's question, and the two were then stored in the order they finished —
-- so one parent's answer ended up filed under the other's question, and every
-- later turn read that back. These two columns are the lock that prevents it;
-- `turnStartedAt` also dates it, so a turn whose server died is treated as
-- wreckage rather than holding the conversation shut for good.
ALTER TABLE "Workspace" ADD COLUMN "turnMemberId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "turnStartedAt" TIMESTAMP(3);
