import crypto from "node:crypto";

/**
 * server/session.js — carrying a Shopify identity off the storefront.
 *
 * The Coach runs on coach.quotavita.com. Shopify only signs a request, and only
 * fills in `logged_in_customer_id`, when the request goes through the App Proxy
 * on the shop's own domain. Those are two different origins, so the Coach cannot
 * simply call the proxy and be recognised: the shop's session cookie is not
 * reliably sent cross-origin, and a preflight through the proxy is not something
 * to build a login on.
 *
 * So the identity is handed over once, deliberately. The customer visits the
 * proxy, Shopify signs that request, and the proxy mints a short token naming
 * the customer and redirects back to the Coach with it. The Coach then presents
 * that token to its own API, on its own origin, with no cookies involved.
 *
 * The token is signed, not encrypted. It carries a customer id, a shop domain
 * and an expiry, and nothing else — no email, no name, no nutrition data.
 */

const DEFAULT_TTL_DAYS = 30;

const sign = (payload, secret) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

const timingSafeEqual = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export function mintSession({ customerId, shop, secret, ttlDays = DEFAULT_TTL_DAYS, now = Date.now() }) {
  if (!secret) throw new Error("Missing COACH_SESSION_SECRET.");
  if (!customerId) throw new Error("Missing customer id.");
  const claims = {
    cid: String(customerId),
    shop: String(shop ?? ""),
    exp: Math.floor(now / 1000) + Math.round(ttlDays * 86400),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the identity, or null for anything malformed, forged or expired. */
export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqual(signature, sign(payload, secret))) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims?.cid || !Number.isFinite(claims.exp)) return null;
  if (claims.exp <= Math.floor(now / 1000)) return null;
  return { customerId: String(claims.cid), shop: String(claims.shop || ""), expiresAt: claims.exp };
}

/** The bearer token on an incoming request, if there is one. */
export function bearerToken(request) {
  const header = request?.headers?.authorization || request?.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : null;
}
