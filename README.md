# Namesake

A warm, collaborative baby-name journey for expecting parents — talk it through with a
thoughtful consultant, shortlist together (rate, comment, gently veto), gather ideas from
family & friends, and end with a keepsake page you keep for the baby book.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Prisma 7 + Postgres** (via the `@prisma/adapter-pg` driver adapter)
- **Claude** (Anthropic SDK) powers the consultant chat, streaming, model set in `.env`
- **Stripe Checkout** for one-time payments — no subscriptions, no customer portal

## Run it locally

```bash
# A throwaway Postgres to develop against
docker run -d --name namesake-pg -e POSTGRES_PASSWORD=namesake \
  -e POSTGRES_DB=namesake -p 55432:5432 postgres:17-alpine

cp .env.example .env      # the default DATABASE_URL matches the container above
npm install               # also generates the Prisma client
npx prisma migrate dev    # creates the schema
npm run dev               # http://localhost:3000
```

The app is fully usable with an otherwise empty `.env`: the consultant runs on graceful
mock replies, magic links print to the console, and checkout routes to a page that can
simulate a payment. Only the database is genuinely required.

To deploy it, see **[DEPLOY.md](./DEPLOY.md)**.

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
- `src/app/gift` — buy a journey for someone else; `src/app/redeem/[code]` — open one
- `src/app/api/*` — route handlers (auth, checkout, redeem, Stripe webhook, workspaces,
  invite, chat stream, names, ratings, comments, suggestions, decide)
- `src/lib/purchase.ts` — the money path: create, fulfill (idempotent), redeem
- `src/lib/pricing.ts` — what things cost
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

## Billing

Everything is paid for once. Nothing auto-renews, so there's nothing to cancel and no
way to quietly bill a family after the naming is over.

Two audiences: **the gifter buys, the couple uses.** The ladder is built around that,
anchored on Bloom — the boxed tier meant to be handed over at a shower.

| Tier | Who buys | Lasts | Arrives | Price |
|---|---|---|---|---|
| **Sprout** | a gifter | 1 month | by email | $59 |
| **Bloom** ★ | a gifter | 3 months | in a box | $109 |
| **The Whole Journey** | a gifter | until the due date + 7 days | in a box | $159 |
| A journey of your own | a parent | 3 months | by email | $49 |
| *One week past due?* | a member | +1 month | — | $19 |

Add-ons ride along on any gift and are made once there's a name to put on them:
engraved rattle $28, embroidered blanket $58, framed keepsake $30.
Every price is env-overridable — see `.env.example`.

**The Whole Journey's window can't be known when it's bought.** A gifter rarely knows the
due date, so that tier stores a *rule* rather than a date, and it's resolved at redemption
from what the couple enters — falling back to nine months if they'd rather not say.

**A boxed gift doesn't need the recipient's email.** The redeem code travels on the card
inside the box, which is the whole mechanic — so `recipientEmail` is optional on the
physical tiers and the buyer gets the link instead, since until the box arrives they're
holding the only copy.

**A purchase is the thing that's bought; a journey is what a purchase becomes.** Keeping
those separate is what makes gifting work without a second concept — a gift is simply a
grant redeemed by someone other than the person who paid.

| Kind | Bought by | Redeemed by | Becomes |
|---|---|---|---|
| `journey` | a parent, describing their journey first | the same person | that journey |
| `gift` | anyone, for a couple | whoever holds the code — from an email or off the card | their journey |
| `extend` | a member of an existing journey | nothing to redeem | more time |

A purchase also carries its **line items** — the tier plus any add-ons. That list is the
packing slip, which is what `/admin/orders` renders.

Because payment comes first, **a journey can only exist by redeeming a paid grant** —
there is no code path that mints one for free. Extending measures from the current end
date rather than from today, so buying more time early never throws away time already
paid for.

### When the window closes

Expired journeys go **read-only, never away**. The shortlist, the conversation and the
keepsake all stay readable; adding names, rating, commenting, chatting, deciding, and
family suggestions all refuse with `402`. Extending is deliberately still allowed while
expired — it's the one thing someone in that state needs to do.

### Payments in development

With no `STRIPE_SECRET_KEY`, checkout routes to a local page with a **Simulate a
successful payment** button that calls the *same* fulfillment function the real webhook
calls — so what you exercise locally is the production path, not a parallel one. Setting
a key removes that page and its endpoint entirely.

With a key set you also need `STRIPE_WEBHOOK_SECRET`; the webhook refuses anything it
can't verify, and the webhook — not the browser's return from Stripe — is what actually
grants access. Locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Shipping the boxes

Boxed tiers and add-ons make Stripe collect a shipping address, and each purchase records
what has to go in the box. `/admin/orders` lists what's outstanding with the packing list
and the address, and marks things shipped. It's a list, not an integration — deliberately,
since no supplier is chosen yet, and a real dropship integration would replace exactly
this. Gate it by setting `NAMESAKE_ADMIN_EMAILS`; empty means nobody.

## The baby-shower QR

Every journey has a suggestion link that anyone can post a name into. `/w/[id]/shower`
turns it into a QR with a print-ready card and table sign — the thing that goes on the
gift table, and what the card in the Bloom box points at.

It does three things at once: it spares the couple a day of opinions delivered in person,
it activates the product at the moment everyone's paying attention, and every guest who
scans it sees what Namesake is.

## Cost

Inference is the main variable cost per journey, so the two calls are split by what
they're actually for: the consultant chat is the product and gets a capable model, while
name enrichment returns a few words of JSON and doesn't. Both are set in `.env`
(`NAMESAKE_MODEL`, `NAMESAKE_ENRICH_MODEL`).

## Not yet built (planned)

- Announcement emails to contributors when a name is chosen (Resend)
- A per-journey token cap, so a runaway conversation can't outrun its tier
- Add-on upsell at the end of a self-serve journey, once there's a name to put on things
- Registry integration (Babylist / MyRegistry), which is where the gifter demand is

### Naming a pet — parked, with a note on what it would take

A small, silly version for naming a pet is appealing for two real reasons: it's a
low-stakes way to meet people before they're expecting, and it gives a past customer
something to come back for.

**It isn't a tier, though — it's a second product mode.** The parts that make Namesake
good are specifically about naming a human child:

- the consultant's persona is built around two people who may disagree, family
  expectation, sibling names, and how a name sits with a surname
- `nameChecks.ts` looks for unfortunate monograms, teasing potential, and surname flow —
  a dog has no school locker
- the journey itself assumes a due date, two parent seats, and a keepsake for the baby book

So a pet mode needs its own persona, its own checks, a different draft, and a different
keepsake. That's a branch through the core, not a row in the catalog.

**The strategic cost is the bigger one.** The positioning is the baby-shower gift, and
the first channel is baby registries. Pet naming shares neither: there's no pet shower to
put a QR card on, and no registry to sit inside — so the growth engine doesn't come with
it. The conversion story is also weaker than it sounds; someone who names a puppy may be
years from a baby, with nothing bringing them back in between.

**What would make it worth building:** evidence that the *gifting* occasion exists — that
people buy presents to mark a new pet the way they do a new baby. If that's real, the
right move is probably a sibling product sharing this codebase's engine, with its own
wedge and its own channel, rather than a tier bolted into this ladder. Worth ten minutes
looking at what Etsy's "new puppy gift" listings actually sell before spending more.
- Server-rendered PDF (currently "Save as PDF" via the browser print dialog)
- Optional mailed print of the keepsake
