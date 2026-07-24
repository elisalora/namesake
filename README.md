# Namesake

A warm, collaborative baby-name journey for expecting parents — talk it through with a
thoughtful consultant, shortlist together (rate, comment, gently veto), gather ideas from
family & friends, and end with a keepsake page you keep for the baby book.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Prisma 7 + SQLite** (via the `better-sqlite3` driver adapter) — swaps to Postgres for prod
- **Claude** (Anthropic SDK) powers the consultant chat, streaming, model set in `.env`

## Run it locally

```bash
npm install
npx prisma migrate dev   # creates dev.db (already done once)
npm run dev              # http://localhost:3000
```

The app is fully usable without an API key — the consultant runs on graceful mock replies
and shows a "preview mode" note.

## Turn the consultant fully on

Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
NAMESAKE_MODEL="claude-opus-4-8"   # warmth & nuance; swap to claude-sonnet-5 for speed/cost
```

Restart `npm run dev`. That's the only change needed — the chat streams live from Claude.

## How it fits together

- `src/app/page.tsx` — landing + start-a-journey form
- `src/app/w/[id]` — the shared dashboard (chat + shortlist), `keepsake/` — printable page
- `src/app/signin`, `src/app/journeys` — magic-link sign-in, and the picker for people
  with more than one journey
- `src/app/auth/verify/[token]` — the other end of every magic link
- `src/app/join/[token]` — partner's seat-claim invitation
- `src/app/s/[slug]` — public suggestion form for family & friends
- `src/app/api/*` — route handlers (auth, workspaces, invite, chat stream, names, ratings,
  comments, suggestions, decide)
- `src/lib/auth.ts` — sessions, magic-link issue + redeem
- `src/lib/session.ts` — the one authorization question, asked the same way everywhere
- `src/lib/email.ts` — Resend, with a console fallback
- `src/lib/consultant.ts` — the consultant persona + streaming
- `src/lib/nameChecks.ts` — the gentle red-flag checker (initials, rhymes, run-on sounds)

## Identity model

Parents sign in with **email magic links** — no passwords, no OAuth.

- A `User` is a verified email address. A `Member` is one parent's *seat* in one journey.
- Starting a journey doesn't create anything: the form draft rides inside the signup link,
  and the workspace is born when the owner opens it. No orphaned journeys from stray posts.
- The partner's seat sits empty (`Member.userId` null) until they verify. They can be
  invited by email, or handed the unguessable seat link (`/join/<token>`) to claim.
- Session and link tokens are 256-bit random values; only their SHA-256 hashes are stored,
  so a leaked database yields nothing replayable. Links are single-use and last 30 minutes;
  sessions roll forward for 60 days. Requests are capped at 5 per address per 15 minutes.

Authorization stays where it was — `getMemberForWorkspace(id)` in `src/lib/session.ts`,
called by every route handler and page that touches a journey.

### Email in development

With no `RESEND_API_KEY` set, nothing is sent: links are printed to the server console and
offered as an **Open the link →** button in the UI, so the whole flow is walkable offline.
Set the key (and `NAMESAKE_FROM_EMAIL`) and real mail goes out instead — the dev button
disappears on its own.

## Not yet built (planned)

- Stripe short-term subscription + "extend"
- Announcement emails to contributors when a name is chosen (Resend)
- Server-rendered PDF (currently "Save as PDF" via the browser print dialog)
- Optional mailed print of the keepsake
