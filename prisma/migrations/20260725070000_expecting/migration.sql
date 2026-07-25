-- What they're expecting: girl | boy | surprise, or null if never asked.
-- "surprise" is a deliberate answer and behaves differently from null.
ALTER TABLE "Workspace" ADD COLUMN "expecting" TEXT;
