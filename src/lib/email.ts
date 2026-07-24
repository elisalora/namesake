// Namesake — outbound email.
//
// Resend when a key is present; a console fallback otherwise, so the whole
// sign-in loop stays walkable locally without an account. Same spirit as the
// consultant's mock replies: the app is fully usable with an empty .env.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailIsLive() {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress() {
  return process.env.NAMESAKE_FROM_EMAIL || "Namesake <onboarding@resend.dev>";
}

type Sent = { delivered: boolean; error?: string };

async function send(to: string, subject: string, html: string, text: string): Promise<Sent> {
  if (!emailIsLive()) {
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
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, text }),
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

// A soft, keepsake-ish wrapper so the emails feel like the rest of the app.
function shell(heading: string, body: string, url: string, cta: string) {
  return `
  <div style="margin:0;padding:32px 16px;background:#fbf7f4;font-family:ui-sans-serif,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fffdfc;border:1px solid #ecdfd9;border-radius:24px;padding:36px;">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b0798f;font-weight:600;">Namesake</div>
      <h1 style="margin:14px 0 0;font-size:26px;line-height:1.25;color:#4a3340;font-weight:600;">${heading}</h1>
      <p style="margin:16px 0 28px;font-size:16px;line-height:1.6;color:#6d5b65;">${body}</p>
      <a href="${url}" style="display:inline-block;background:#b0798f;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:16px;font-weight:600;">${cta}</a>
      <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#9b8791;">
        This link works once and expires in 30 minutes. If you didn't ask for it, you can ignore this email.
      </p>
    </div>
  </div>`;
}

export function sendSignupLink(to: string, url: string, babyLabel: string) {
  return send(
    to,
    "Your Namesake journey is ready",
    shell(
      "Let's find their name.",
      `Tap below to open the naming journey for <strong>${escapeHtml(babyLabel)}</strong> and invite your partner in.`,
      url,
      "Begin the journey",
    ),
    `Open your Namesake journey for ${babyLabel}: ${url}`,
  );
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
    ),
    `Sign in to Namesake: ${url}`,
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
    ),
    `${fromName} invited you to name ${babyLabel}: ${url}`,
  );
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
