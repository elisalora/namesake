-- Indexes for the paths that run on a timer, before there is any traffic to
-- make them matter.
--
-- `Dashboard.tsx` polls `GET /api/workspaces/[id]` every six seconds, and two
-- parents in one journey means about twenty `getWorkspaceState` calls a
-- minute. Every query underneath it filtered on a column Postgres had no
-- index for, so each one was a sequential scan — and a sequential scan grows
-- with the *total* size of the table across every customer, not with the size
-- of the one journey being read. At three journeys that is invisible. It is
-- the kind of thing that stops being invisible on the day the marketing works.
--
-- Postgres does not create an index for a foreign key. Every one of these is a
-- foreign key that has been read on a hot path since the first day.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: Prisma runs a migration inside
-- a transaction, which CONCURRENTLY cannot join. These tables are small enough
-- today that the brief write lock costs nothing; if that ever stops being
-- true, an index added later has to be run by hand outside the migration.

-- The poll's suggestion list: which journey, newest first.
CREATE INDEX "Suggestion_workspaceId_createdAt_idx" ON "Suggestion"("workspaceId", "createdAt");

-- Read three ways, all of them starting with the journey: the poll's newest
-- 200 messages, the consultant's newest 40, and the per-journey count that
-- enforces NAMESAKE_MSG_CAP on every single turn.
CREATE INDEX "ChatMessage_workspaceId_createdAt_idx" ON "ChatMessage"("workspaceId", "createdAt");

-- Comments arrive nested under every name on the same poll.
CREATE INDEX "Comment_nameId_idx" ON "Comment"("nameId");

-- Not read by workspace, but deleting a workspace cascades through this column.
CREATE INDEX "Comment_workspaceId_idx" ON "Comment"("workspaceId");

-- The one that isn't about the poll. `Member_workspaceId_userId_key` has
-- workspaceId as its leading column, so a `where: { userId }` lookup cannot
-- use it — and that is the lookup on the sign-in path and behind /journeys.
-- It was scanning every seat in the product for every signed-in user.
CREATE INDEX "Member_userId_idx" ON "Member"("userId");
