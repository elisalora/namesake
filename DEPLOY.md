# Deploying Namesake

Written for putting it on `namesake.alora.tech` as a demo you can show people. Everything
in the app is ready; what's left needs your accounts, so it's yours to click through.

Do it in this order — each step produces something the next one needs.

---

## 1. A database

> ✅ **Already done.** A Neon database exists at `ep-sweet-sound-a6rfnfz6.us-west-2.aws.neon.tech`,
> and its schema is current — all 5 migrations applied, checked 2026-07-25. Both connection
> strings are in `.env.neon.local` (gitignored). You only need to copy them into Vercel in
> step 5; skip the rest of this section.
>
> ⚠️ **One naming trap.** `.env.neon.local` calls the unpooled string `DIRECT_URL`, but the
> build reads it as **`MIGRATE_DATABASE_URL`**. Copy the *value*, not the name, or migrations
> will run over the pooler and can hang on an advisory lock.

Anything that speaks Postgres works. Two easy options:

- **[Prisma Postgres](https://console.prisma.io)** — same people as the ORM, has a free tier
- **[Neon](https://neon.tech)** — free tier, very fast to set up

Create a database and copy the connection string. It looks like:

```
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

> **Why not SQLite:** Vercel's filesystem is ephemeral. A SQLite file would be thrown away
> on every deploy and every cold start, taking every journey, user and purchase with it.

**Neon gives you two connection strings and the difference matters.** The *pooled* one
(host contains `-pooler`) is what the app should use — serverless opens a lot of short
connections and the pooler is what keeps that from exhausting Postgres. The *direct* one
is what migrations should use, because the pooler runs in transaction mode and doesn't
reliably support the session-level advisory locks Prisma Migrate needs.

The build handles this: it applies migrations over `MIGRATE_DATABASE_URL` when set, and
falls back to `DATABASE_URL` otherwise. So set both (see step 5).

You don't need to run migrations by hand — the build command does it.

---

## 2. Email — required, or nobody can sign in

Namesake has no passwords. Without a mail provider, magic links are only printed to the
server log, which on a deployed box means **only you can read them, so only you can log
in**. This is the step people skip and then wonder why their demo doesn't work.

1. Sign up at [Resend](https://resend.com) and create an API key.
2. **Verify the same subdomain the site runs on** — `namesake.alora.tech`. Resend puts its
   records on `send.namesake.alora.tech` and `resend._domainkey.namesake.alora.tech`,
   which sit *below* the CNAME pointing at Vercel rather than at it, so they coexist
   happily with the site.
3. Add the records Resend gives you at whoever hosts DNS for the root domain, then hit
   **Verify**.
4. Note the address you'll send from. **It has to be on the verified domain** —
   `Namesake <hello@namesake.alora.tech>`. A from-address on a different domain is the
   most common reason sending fails after everything else looks green.

> ⚠️ **Do not add a second SPF record to the root domain.** If the root already has one —
> Google Workspace publishes `v=spf1 include:_spf.google.com ~all` — adding another makes
> **both invalid** and breaks all mail on that domain. Verifying a subdomain, as above,
> avoids the question entirely.

---

## 3. Stripe — test mode

1. In the Stripe dashboard, make sure you're in **test mode** (the toggle, top right).
2. Copy the **secret key** (`sk_test_…`).
3. Leave the webhook for step 6 — it needs the live URL first.

In test mode, card `4242 4242 4242 4242` with any future expiry and any CVC completes a
purchase and charges nothing. That's what you want for a demo.

> Checkout refuses outright if `STRIPE_SECRET_KEY` is missing, rather than sending buyers
> to a dead link. So you can deploy without it — you just won't be able to demo buying.

---

## 4. Vercel, and the DNS record

1. Import `github.com/elisalora/namesake` at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js**. Leave the build settings alone — `package.json` already
   runs migrations before the build.
3. Add the environment variables from step 5 **before** the first deploy, or it will fail
   at `prisma migrate deploy` with no `DATABASE_URL`.
4. Deploy.
5. In **Settings → Domains**, add `namesake.alora.tech`. Vercel will show you the record
   to create at whoever hosts DNS for `alora.tech`:

   ```
   Type    Name        Value
   CNAME   namesake    cname.vercel-dns.com
   ```

   (Use whatever value Vercel actually shows — it occasionally differs.)

---

## 5. Environment variables

Set these in Vercel under **Settings → Environment Variables**. Mark them for Production
(and Preview, if you want preview deploys to work).

| Variable | Value | Required? |
|---|---|---|
| `DATABASE_URL` | **pooled** connection string from step 1 | **yes** |
| `MIGRATE_DATABASE_URL` | **direct** (unpooled) connection string | with Neon |
| `NAMESAKE_URL` | `https://namesake.alora.tech` | **yes** |
| `RESEND_API_KEY` | from step 2 | yes, to let anyone sign in |
| `NAMESAKE_FROM_EMAIL` | `Namesake <hello@namesake.alora.tech>` — must match the verified domain | with Resend |
| `NAMESAKE_SUPPORT_EMAIL` | where refund requests go; shown on `/refunds` | no |
| `STRIPE_SECRET_KEY` | `sk_test_…` from step 3 | to demo buying |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 6 | with Stripe |
| `ANTHROPIC_API_KEY` | your key | no — falls back to mock replies |
| `NAMESAKE_ADMIN_EMAILS` | your email | to reach `/admin/orders` and `/admin/codes` |

**The build checks these for you.** `scripts/preflight.mjs` runs first and, on Vercel,
*refuses the build* for settings that would leave the site broken in ways that look fine
from the outside — a missing `RESEND_API_KEY`, or a Stripe key with no webhook secret.
Everything else it warns about and continues. Run `npm run preflight` locally any time to
see where you stand.

`NAMESAKE_URL` matters more than it looks: it's what every magic link, gift link and
shower QR is built from. Get it wrong and the QR on a printed card points somewhere dead.

Everything else — prices, shipping countries, model choice — has a working default. See
`.env.example`.

---

## 6. The Stripe webhook

Only possible once the URL exists, which is why it's last.

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://namesake.alora.tech/api/stripe/webhook`
3. Event: **`checkout.session.completed`** (that's the only one it listens for).
4. Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` in Vercel, and redeploy.

**The webhook is what grants access, not the browser coming back from Stripe.** Without
this secret the endpoint refuses everything — someone can pay and never receive what they
bought. Worth testing once with a real test purchase.

---

## 7. Check it works

Walk the whole loop once as a stranger would:

1. Open `https://namesake.alora.tech` and start a journey.
2. Pay with `4242 4242 4242 4242`.
3. Check the email arrives, open the link, and land in the dashboard.
4. Open **Share → Having a shower?** and confirm the QR points at
   `https://namesake.alora.tech/s/…` and not `localhost`.
5. If you bought a boxed tier, check `/admin/orders` shows it with an address.

---

## 8. Letting friends in for free

Steps 3 and 6 are only about *selling*. To hand the whole experience to a friend for
nothing — no card, real or fake — use **`/admin/codes`**.

1. Sign in with an address listed in `NAMESAKE_ADMIN_EMAILS`.
2. Go to `https://namesake.alora.tech/admin/codes`. (There's also a **Free codes** link in
   the header of `/journeys` when you're an admin.)
3. Optionally fill in **Send it to** with their email, a note, and how many months of
   access. Leave the email blank and you get a link to pass on however you like — a text
   message, a card, in person.
4. Press **Generate**. If you gave an address, they get the gift email; either way the link
   comes back for you to copy.

They open the link, sign in with **their own** email, describe the baby they're naming, and
start. The code is single-use, so a link that's already been opened can't be reused.

> **A comp is a `Purchase` that's born already paid**, so it never touches Stripe — which
> is why this works with no payment configuration at all. It grants the journey only; the
> keepsake add-ons still sit at full price at the end, which is useful if you want honest
> feedback on whether people would actually buy them.
>
> The page tells you whether the email really went out. If it says it didn't, send the
> link by hand — the code is valid regardless.

---

## Things worth knowing

**It's a public URL.** Anyone who finds it can create a journey. In Stripe test mode that
costs nobody anything, but don't switch to live keys until you actually want to sell.

**The Neon database is not empty.** As of 2026-07-25 it holds 3 users, 2 workspaces and 4
purchases left over from earlier testing — nothing from your local Postgres is carried
over, but Neon itself was already used. None of it is real. Wipe it if you'd rather start
clean before showing anyone; leave it if you don't mind, since it costs nothing.

**Two pages are reachable without signing in, by design.** `/s/<slug>` (family suggestions)
and `/w/<id>/keepsake` (the finished keepsake) have no session check — that's the point of
both: the shower QR has to work for guests, and a keepsake you can't send to a grandparent
isn't a keepsake. Neither is enumerable, since the slug and the workspace id are random,
but anyone *holding* a keepsake URL can read the chosen name and the parents' names without
being a member. Worth knowing before you paste one into a group chat. The dashboard itself
(`/w/<id>`) is properly gated by `getMemberForWorkspace()`.

**Journeys expire.** Anything you create for a demo runs out on its tier's schedule. If a
demo journey goes read-only mid-conversation, that's the paywall working — extend it, or
adjust `expiresAt` directly in the database.

**Watch the Anthropic spend.** The consultant is the main variable cost and there's no
per-journey token cap yet. On a public demo URL that's worth an eye on your usage; leaving
`ANTHROPIC_API_KEY` unset makes the chat run on mock replies, which is enough to show the
shape of the product without spending anything.
