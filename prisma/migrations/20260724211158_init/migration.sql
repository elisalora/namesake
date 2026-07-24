-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "babyLabel" TEXT NOT NULL DEFAULT 'Baby',
    "lastName" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "suggestSlug" TEXT NOT NULL,
    "chosenNameId" TEXT,
    "decidedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workspace_chosenNameId_fkey" FOREIGN KEY ("chosenNameId") REFERENCES "NameEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#c98ba5',
    "token" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NameEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT,
    "gender" TEXT,
    "origin" TEXT,
    "meaning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'considering',
    "source" TEXT NOT NULL DEFAULT 'parent',
    "suggestionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NameEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "veto" BOOLEAN NOT NULL DEFAULT false,
    "vetoReason" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rating_nameId_fkey" FOREIGN KEY ("nameId") REFERENCES "NameEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Rating_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "nameId" TEXT NOT NULL,
    "memberId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_nameId_fkey" FOREIGN KEY ("nameId") REFERENCES "NameEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "suggestedName" TEXT NOT NULL,
    "suggesterName" TEXT NOT NULL,
    "relationship" TEXT,
    "reason" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_suggestSlug_key" ON "Workspace"("suggestSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_chosenNameId_key" ON "Workspace"("chosenNameId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_token_key" ON "Member"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_nameId_memberId_key" ON "Rating"("nameId", "memberId");
