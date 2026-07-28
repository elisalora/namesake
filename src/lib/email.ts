// Namesake — outbound email.
//
// Resend when a key is present; a console fallback otherwise, so the whole
// sign-in loop stays walkable locally without an account. Same spirit as the
// consultant's mock replies: the app is fully usable with an empty .env.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailIsLive() {
  return Boolean(process.env.RESEND_API_KEY);
}

/// True only in the one case where a send that never reached a provider is
/// still an acceptable outcome: local development with no key, where the link
/// is printed to the console on purpose.
///
/// The distinction matters because there are no passwords here. A deployed box
/// with no key would otherwise log every magic link to a file only the operator
/// can read, while cheerfully telling each person to check an inbox nothing was
/// ever sent to — a sign-in that fails silently and blames the user's spam
/// folder. Better to refuse loudly.
export function emailFallsBackToConsole() {
  return !emailIsLive() && process.env.NODE_ENV !== "production";
}

function fromAddress() {
  return process.env.NAMESAKE_FROM_EMAIL || "Namesake <onboarding@resend.dev>";
}

/// The one address a customer is ever told to write to.
///
/// It lives here rather than at each use because the refunds policy and the
/// order receipts have to name the *same* inbox — two files each inventing
/// their own fallback is how a published policy ends up pointing somewhere
/// nobody reads. `NAMESAKE_SUPPORT_EMAIL` overrides it; the default is the
/// address the deployed site already publishes.
export const SUPPORT_EMAIL_DEFAULT = "hello@namesake.alora.tech";

export function supportAddress() {
  return process.env.NAMESAKE_SUPPORT_EMAIL || SUPPORT_EMAIL_DEFAULT;
}

/// Where a reply goes. A transactional address nobody reads is both unkind and
/// a small negative signal to spam filters — mail from a domain that never
/// accepts a reply looks more like bulk than correspondence.
function replyTo() {
  return process.env.NAMESAKE_REPLY_TO || supportAddress();
}

type Sent = { delivered: boolean; error?: string };

async function send(to: string, subject: string, html: string, text: string): Promise<Sent> {
  if (!emailIsLive()) {
    if (!emailFallsBackToConsole()) {
      console.error(
        `[namesake] RESEND_API_KEY is not set, so "${subject}" for ${to} was never sent. ` +
          `Set it — without it nobody can sign in.`,
      );
      return { delivered: false, error: "Email isn't set up on this server yet." };
    }
    console.log(`\n📮 [namesake] email to ${to} — ${subject}\n${text}\n`);
    return { delivered: false };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject,
        html,
        text,
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[namesake] Resend rejected the send (${res.status}): ${detail}`);
      return { delivered: false, error: "We couldn't send that email just now." };
    }
    return { delivered: true };
  } catch (err) {
    console.error("[namesake] email send failed", err);
    return { delivered: false, error: "We couldn't send that email just now." };
  }
}

/// The small print under the button, and it has to match the link above it.
///
/// Two kinds of link go out from here and they behave nothing alike. A magic
/// link is minted by `issueLink` in `auth.ts`: single-use, thirty minutes, and
/// safe to ignore because the person asked for it a moment ago. A redeem link
/// is `/redeem/<Purchase.redeemCode>` — a bearer token with no expiry column at
/// all, often for something bought *for* someone who never asked for anything.
///
/// Telling a gift recipient their link expires in half an hour and that they
/// can ignore it if they weren't expecting it is wrong twice, and the second
/// half throws the present away.
const FOOTERS = {
  magic:
    "This link works once and expires in 30 minutes. If you didn't ask for it, you can ignore this email.",
  redeem:
    "This link doesn't expire, but it only opens once — and it opens for whoever holds it. Worth keeping this email until it's been claimed.",
} as const;

// The email in the same clothes as the site: oyster paper, pewter ink, a sage
// button. Georgia stands in for Cormorant — mail clients can't load webfonts,
// and a serif that exists everywhere beats one that silently becomes Arial.
function shell(
  heading: string,
  body: string,
  url: string,
  cta: string,
  footer: keyof typeof FOOTERS,
) {
  return `
  <div style="margin:0;padding:32px 16px;background:#f5f2e9;font-family:ui-sans-serif,-apple-system,'Segoe UI',Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fdfcf7;border:1px solid #ded8c9;border-radius:22px;padding:38px;">
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#9aa1a2;font-weight:600;">Namesake</div>
      <h1 style="margin:16px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#262b26;font-weight:500;">${heading}</h1>
      <p style="margin:16px 0 30px;font-size:16px;line-height:1.65;color:#5f655d;">${body}</p>
      <a href="${url}" style="display:inline-block;background:#55654f;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-size:16px;font-weight:600;">${cta}</a>
      <p style="margin:30px 0 0;font-size:13px;line-height:1.6;color:#8b918a;">
        ${FOOTERS[footer]}
      </p>
    </div>
  </div>`;
}

export function sendSignInLink(to: string, url: string) {
  return send(
    to,
    "Your Namesake sign-in link",
    shell(
      "Welcome back.",
      "Tap below to pick your journey back up, right where you left it.",
      url,
      "Sign in to Namesake",
      "magic",
    ),
    `Sign in to Namesake: ${url}\n\n${FOOTERS.magic}`,
  );
}

export function sendInviteLink(to: string, url: string, fromName: string, babyLabel: string) {
  return send(
    to,
    `${fromName} invited you to name ${babyLabel}`,
    shell(
      `${escapeHtml(fromName)} saved you a seat.`,
      `You've been invited into the naming journey for <strong>${escapeHtml(babyLabel)}</strong> — somewhere the two of you can talk it through, shortlist together, and land on a name you both adore.`,
      url,
      "Join the journey",
      "magic",
    ),
    `${fromName} invited you to name ${babyLabel}: ${url}\n\n${FOOTERS.magic}`,
  );
}

export function sendJourneyReadyLink(to: string, url: string) {
  return send(
    to,
    "Your Namesake journey is ready",
    shell(
      "Thank you — let's begin.",
      "Your payment went through. Tap below to open your journey and invite your partner in.",
      url,
      "Open your journey",
      "redeem",
    ),
    `Open your Namesake journey: ${url}\n\n${FOOTERS.redeem}`,
  );
}

export function sendGiftLink(to: string, url: string, fromName: string, message?: string | null) {
  const note = message
    ? `<div style="margin:20px 0;padding:16px 20px;border-left:2px solid #ded8c9;font-style:italic;color:#5f655d;">${escapeHtml(message)}</div>`
    : "";
  return send(
    to,
    `${fromName} gave you a Namesake journey`,
    shell(
      `A gift from ${escapeHtml(fromName)}.`,
      `Somewhere to choose a name together, without the whole world weighing in. It's yours to set up however you like.${note}`,
      url,
      "Open your gift",
      "redeem",
    ),
    `${fromName} gave you a Namesake journey${message ? ` — "${message}"` : ""}: ${url}\n\n${FOOTERS.redeem}`,
  );
}

/// Sent to whoever bought a boxed tier. When there's no recipient address, they
/// are holding the only copy of the redeem link until the box arrives — so say
/// so plainly rather than burying it.
export function sendBoxOnItsWay(to: string, url: string, recipientWasEmailed: boolean) {
  const body = recipientWasEmailed
    ? "Your box is being packed and will be on its way shortly. We've already emailed them their link, so they can start whenever they like — the card in the box has it too."
    : "Your box is being packed and will be on its way shortly. The card inside carries their link, so it's ready to hand over. Keep this email as your own copy, just in case.";
  return send(
    to,
    "Your Namesake box is on its way",
    shell("Thank you — it's on its way.", body, url, "See what they'll open", "redeem"),
    `Your Namesake box is on its way. Their link: ${url}\n\n${FOOTERS.redeem}`,
  );
}

/// Sent when a keepsake is ordered after the name is chosen. The link is a
/// permanent one — their journey — not a single-use magic link, so it uses its
/// own footer rather than shell's expiry note.
export function sendKeepsakeOrdered(to: string, url: string) {
  const html = `
  <div style="margin:0;padding:32px 16px;background:#f5f2e9;font-family:ui-sans-serif,-apple-system,'Segoe UI',Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fdfcf7;border:1px solid #ded8c9;border-radius:22px;padding:38px;">
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#9aa1a2;font-weight:600;">Namesake</div>
      <h1 style="margin:16px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#262b26;font-weight:500;">Thank you — we're making it.</h1>
      <p style="margin:16px 0 30px;font-size:16px;line-height:1.65;color:#5f655d;">Your keepsake is being made with the name you chose, and will ship once it's ready. We'll be in touch if we need anything.</p>
      <a href="${url}" style="display:inline-block;background:#55654f;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:999px;font-size:16px;font-weight:600;">See the keepsake</a>
      <p style="margin:30px 0 0;font-size:13px;line-height:1.6;color:#8b918a;">Keep this as your receipt. Questions about your order? Reply to this email, or write to ${escapeHtml(supportAddress())}.</p>
    </div>
  </div>`;
  return send(
    to,
    "Your Namesake keepsake is on its way",
    html,
    `Thank you — your Namesake keepsake is being made with the name you chose, and will ship once it's ready. Your journey: ${url}\n\nQuestions about your order? Reply to this email, or write to ${supportAddress()}.`,
  );
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
