/**
 * server/negotiate.js — Accept negotiation, RFC 9110 §12.5.1.
 *
 * The Coach serves the same page to a person and to an agent. A browser asks
 * for `text/html`, an agent asks for `text/markdown`, and both must be able to
 * get what they asked for from one URL. That is the acceptmarkdown.com
 * convention, and it only works if three things hold:
 *
 * 1. `Accept: text/markdown` really returns Markdown.
 * 2. The response carries `Vary: Accept`, so a CDN never hands the cached HTML
 *    variant to an agent that asked for Markdown.
 * 3. A request for something we cannot produce is refused with 406 rather than
 *    quietly answered in the wrong format.
 *
 * Server preference decides ties. A wildcard `Accept` — what curl sends by
 * default — must keep returning HTML, or the existing app breaks.
 */

const parseParameters = (parts) => {
  let q = 1;
  for (const part of parts) {
    const [name, rawValue = ""] = part.split("=");
    if (name.trim().toLowerCase() !== "q") continue;
    const value = Number.parseFloat(rawValue.trim());
    q = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
  }
  return q;
};

/** `Accept` as a list of ranges, most specific first. */
export function parseAccept(header) {
  return String(header ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [range, ...parts] = entry.split(";");
      const [type = "*", subtype = "*"] = range.trim().toLowerCase().split("/");
      return { type, subtype, q: parseParameters(parts) };
    });
}

/** How well a range matches: 3 exact, 2 subtype wildcard, 1 full wildcard, 0 none. */
function specificity(range, type, subtype) {
  if (range.type === type && range.subtype === subtype) return 3;
  if (range.type === type && range.subtype === "*") return 2;
  if (range.type === "*" && range.subtype === "*") return 1;
  return 0;
}

/**
 * The best of `offers` for this `Accept`, or `null` when the client accepts
 * nothing we serve — which is a 406, not a silent fallback.
 *
 * `offers` is in server-preference order; the first one wins every tie.
 */
export function negotiate(header, offers) {
  const ranges = parseAccept(header);
  if (!ranges.length) return offers[0] ?? null;

  let best = null;
  for (const [index, offer] of offers.entries()) {
    const [type, subtype] = offer.toLowerCase().split("/");
    let match = null;
    for (const range of ranges) {
      const score = specificity(range, type, subtype);
      if (!score) continue;
      // A more specific range overrides a broader one, whatever its q value.
      if (!match || score > match.score) match = { score, q: range.q };
    }
    if (!match || match.q <= 0) continue;
    if (!best || match.q > best.q) best = { offer, q: match.q, index };
  }
  return best ? best.offer : null;
}

/** The two headers every negotiated response needs. */
export function applyVary(response, contentType) {
  response.setHeader("Content-Type", contentType.includes("charset") ? contentType : `${contentType}; charset=utf-8`);
  response.setHeader("Vary", "Accept, Accept-Encoding");
}
