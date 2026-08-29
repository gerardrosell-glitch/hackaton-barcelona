const MAX_CHECKLIST_LENGTH = 45000;
const XAT_EMAIL_ENDPOINT = process.env.XAT_COACH_EMAIL_ENDPOINT || "https://xat.quotavita.com/api/coach-email";

const parseBody = (request) => typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});

function allowedOrigin(request) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "coach.quotavita.com" || host.endsWith(".vercel.app") || host === "localhost";
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!allowedOrigin(request)) return response.status(403).json({ error: "This request is not allowed from this website." });
  if (!process.env.COACH_EMAIL_SHARED_SECRET) return response.status(503).json({ error: "Coach email delivery is not configured yet." });

  const body = parseBody(request);
  const email = String(body.email || "").trim().toLowerCase();
  const kind = body.kind === "basket" ? "basket" : "plan";
  const checklist = String(body.checklist || "").trim();
  const language = body.language === "ca" ? "ca" : "en";
  if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(422).json({ error: "Enter a valid email address." });
  if (body.marketingConsent !== true) return response.status(422).json({ error: "Email consent is required to send this through Quota Vita." });
  if (!checklist || checklist.length > MAX_CHECKLIST_LENGTH) return response.status(422).json({ error: "The checklist could not be prepared." });

  try {
    const upstream = await fetch(XAT_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Coach-Email-Secret": process.env.COACH_EMAIL_SHARED_SECRET
      },
      body: JSON.stringify({ email, kind, checklist, language, marketingConsent: true })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !result.delivered) throw new Error(result.error || "email_delivery");
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ delivered: true });
  } catch (error) {
    console.error("Coach email delivery failed", error);
    return response.status(502).json({ error: "Quota Vita could not send the email right now. Please try again shortly." });
  }
}
