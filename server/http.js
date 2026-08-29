/**
 * server/http.js — one error envelope and one page shell for the whole site.
 *
 * Two problems this solves.
 *
 * An agent cannot parse an HTML error page, and it cannot branch on an English
 * sentence either. So every failure on every route answers with the same JSON
 * envelope and a stable snake_case `code`. `error` stays a plain string because
 * the Coach's front end already reads `data.error`; the structure is added
 * beside it, not in place of it.
 *
 * And every static page exists twice — as HTML for a person and as Markdown for
 * an agent — at one URL, chosen by `Accept`. Both variants are built here from
 * the same Markdown source so they cannot disagree.
 */

import { SITE, ORGANISATION } from "./site.js";
import { renderMarkdown, escapeHtml } from "./markdown.js";
import { negotiate, applyVary } from "./negotiate.js";

export const ASSET_VERSION = "light-only-1";
export const DOCS_URL = `${SITE.origin}/openapi.json`;

/** What a caller should do about each failure. Empty means the message says it. */
const HINTS = {
  method_not_allowed: "Use one of the methods listed for this path in the OpenAPI document.",
  not_found: `No route serves this path. The published routes are listed in ${SITE.origin}/openapi.json and ${SITE.origin}/sitemap.xml.`,
  not_acceptable: "This URL is served as text/html and text/markdown. Ask for one of those, or send no Accept header.",
  invalid_request: "Check the request body against the schema for this operation in the OpenAPI document.",
  service_not_configured: "This endpoint depends on a third-party provider that is not enabled. Read-only endpoints are unaffected.",
  upstream_unavailable: "A provider this endpoint depends on failed. Retry with backoff.",
  forbidden: "This endpoint is served only for the Quota Vita Coach front end.",
};

/**
 * The single error response. `status` and `code` are the contract; `message` and
 * `error` carry the same sentence, one for machines that expect `message` and
 * one for the client that has always read `error`.
 */
export function sendError(response, status, code, message, hint) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(status).json({
    error: message,
    code,
    message,
    hint: hint ?? HINTS[code] ?? "See the OpenAPI document for this operation.",
    documentation: DOCS_URL,
    status,
  });
}

/** `405` for the wrong verb, used identically by every handler. */
export const methodNotAllowed = (response, allowed) => {
  response.setHeader("Allow", allowed.join(", "));
  return sendError(response, 405, "method_not_allowed", "Method not allowed.");
};

/**
 * The JSON-LD identity graph. `SoftwareApplication` is what the Coach is;
 * `Organization` is who stands behind it, with the contact point and postal
 * address an agent needs to decide the business is real.
 */
export function identityGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.origin}/#coach`,
        name: SITE.name,
        alternateName: SITE.shortName,
        url: `${SITE.origin}/`,
        description: SITE.description,
        applicationCategory: "HealthApplication",
        applicationSubCategory: "Nutrition planning",
        operatingSystem: "Any modern web browser",
        browserRequirements: "Requires JavaScript for the interactive planner. All content is also served as text/markdown.",
        inLanguage: SITE.languages,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
        featureList: [
          "Daily calorie and macronutrient targets from height, weight, age, sex, activity and goal",
          "Three Catalan Mediterranean meals a day that meet the target",
          "Seven-day meal plan",
          "Costed weekly shopping basket",
          "Restaurant meal photo suggestions",
          "Plan and basket delivered by email",
        ],
        softwareHelp: { "@type": "CreativeWork", url: `${SITE.origin}/docs` },
        publisher: { "@id": `${ORGANISATION.url}/#organization` },
        provider: { "@id": `${ORGANISATION.url}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${ORGANISATION.url}/#organization`,
        name: ORGANISATION.name,
        legalName: ORGANISATION.legalName,
        url: ORGANISATION.url,
        email: ORGANISATION.email,
        description: ORGANISATION.description,
        areaServed: ORGANISATION.areaServed,
        sameAs: [...ORGANISATION.sameAs],
        address: {
          "@type": "PostalAddress",
          streetAddress: ORGANISATION.streetAddress,
          addressLocality: ORGANISATION.addressLocality,
          addressRegion: ORGANISATION.addressRegion,
          postalCode: ORGANISATION.postalCode,
          addressCountry: ORGANISATION.addressCountry,
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: ORGANISATION.email,
            url: `${SITE.origin}/contact`,
            areaServed: ORGANISATION.areaServed,
            availableLanguage: ["ca", "es", "en"],
          },
          {
            "@type": "ContactPoint",
            contactType: "technical support",
            email: ORGANISATION.email,
            url: `${SITE.origin}/developers`,
            areaServed: ORGANISATION.areaServed,
            availableLanguage: ["en", "ca"],
          },
        ],
      },
    ],
  };
}

/** The links every page carries, in the HTML footer and in the Markdown twin. */
export const FOOTER_LINKS = Object.freeze([
  ["/docs", "Documentation"],
  ["/developers", "Developer portal & API"],
  ["/openapi.json", "OpenAPI 3.1"],
  ["/llms.txt", "llms.txt"],
  ["/about", "About"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
]);

const footerHtml = () =>
  `<footer class="site-footer"><nav aria-label="Site and developer resources"><ul>${FOOTER_LINKS.map(
    ([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`
  ).join("")}</ul></nav><p>&copy; ${new Date().getUTCFullYear()} ${escapeHtml(ORGANISATION.name)} &middot; ${escapeHtml(
    ORGANISATION.addressLocality
  )}, ${escapeHtml(ORGANISATION.addressRegion)} &middot; <a href="mailto:${SITE.email}">${SITE.email}</a></p></footer>`;

/**
 * `<head>` for every HTML response. The four metadata signals an agent uses for
 * entity resolution — canonical, `lang`, `og:image`, `og:type` — are all here,
 * plus the discovery links (`alternate` Markdown, `service-desc` OpenAPI) that
 * let a crawler find the machine-readable surface without guessing URLs.
 */
export function head({ title, description, path, jsonLd, ogType = "website" }) {
  const canonical = `${SITE.origin}${path}`;
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#fdfaf3">
  <!-- The Coach is a light-ground product: cream paper, terracotta, and food
       photography lit for it. "light" is declared rather than left open so a
       device in dark mode cannot auto-invert form controls, scrollbars and the
       canvas behind the page. -->
  <meta name="color-scheme" content="light">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/assets/icon-180.png">
  <link rel="icon" href="/assets/icon-192.png" type="image/png" sizes="192x192">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;600;700&family=Inter:wght@400;500;600;700;800&display=swap">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${escapeHtml(SITE.name)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE.origin}/assets/og-coach.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Quota Vita Nutrition Coach">
  <meta property="og:locale" content="en_GB">
  <meta property="og:locale:alternate" content="ca_ES">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE.origin}/assets/og-coach.png">
  <link rel="alternate" type="text/markdown" href="${canonical}" title="Markdown version of this page">
  <link rel="service-desc" type="application/json" href="${SITE.origin}/openapi.json">
  <link rel="author" href="${SITE.origin}/about">
  <link rel="license" href="${SITE.origin}/privacy">
  <script type="application/ld+json">${JSON.stringify(jsonLd ?? identityGraph())}</script>`;
}

/** Shared prose styling for the static pages, on top of the Coach design system. */
const PROSE_CSS = `
    .doc{max-width:74ch;margin:0 auto;padding:var(--s5) var(--s4) var(--s8)}
    .doc h1{font-family:var(--display);font-size:clamp(2rem,5vw,3rem);line-height:1.05;margin:0 0 var(--s4)}
    .doc h2{font-family:var(--display);font-size:1.5rem;margin:var(--s6) 0 var(--s3)}
    .doc h3{font-size:1.1rem;margin:var(--s5) 0 var(--s2)}
    .doc p,.doc li{color:var(--on-shell);line-height:1.6}
    .doc a{color:var(--accent-soft)}
    .doc ul{padding-left:1.1em}
    .doc li{margin:0 0 var(--s2)}
    .doc code{background:rgba(247,239,227,.1);padding:.1em .35em;border-radius:var(--radius-xs);font-size:.9em}
    .doc pre{background:var(--shell-sunk);padding:var(--s4);border-radius:var(--radius-sm);overflow-x:auto}
    .doc pre code{background:none;padding:0}
    .doc table{width:100%;border-collapse:collapse;margin:var(--s4) 0;display:block;overflow-x:auto}
    .doc th,.doc td{text-align:left;padding:var(--s2) var(--s3);border-bottom:1px solid var(--line-on-shell);white-space:nowrap}
    .doc blockquote{margin:var(--s4) 0;padding-left:var(--s4);border-left:3px solid var(--accent)}
    .site-footer{border-top:1px solid var(--line-on-shell);margin-top:var(--s7);padding:var(--s5) var(--s4);color:var(--on-shell-soft);font-size:.85rem}
    .site-footer ul{list-style:none;display:flex;flex-wrap:wrap;gap:var(--s3);padding:0;margin:0 0 var(--s3)}
    .site-footer a{color:var(--on-shell-soft)}
    .doc-topbar{display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-bottom:1px solid var(--line-on-shell)}
    .doc-topbar a{color:var(--on-shell);text-decoration:none;font-weight:700}`;

/** A complete static page: the Coach's shell, the rendered Markdown, the footer. */
export function documentHtml({ title, description, path, markdown, ogType }) {
  return `<!doctype html>
<html lang="${SITE.locale}">
<head>
${head({ title, description, path, ogType })}
  <link rel="stylesheet" href="/coach.css?v=${ASSET_VERSION}">
  <style>${PROSE_CSS}</style>
</head>
<body>
  <div class="app">
    <header class="doc-topbar"><a href="/">&larr; Quota Vita Coach</a></header>
    <main class="doc">
${renderMarkdown(markdown)}
    </main>
${footerHtml()}
  </div>
</body>
</html>`;
}

/**
 * Serve one document as HTML or Markdown, whichever the caller asked for.
 *
 * `format` short-circuits the negotiation for the explicit `.md` URLs. A caller
 * that accepts neither variant gets 406 rather than a guess.
 */
export function sendDocument(request, response, { title, description, path, markdown, status = 200, format, ogType }) {
  const chosen = format === "md" ? "text/markdown" : negotiate(request.headers?.accept, ["text/html", "text/markdown"]);

  if (!chosen) {
    response.setHeader("Vary", "Accept, Accept-Encoding");
    return sendError(response, 406, "not_acceptable", "This URL is available as text/html or text/markdown only.");
  }

  applyVary(response, chosen);
  if (chosen === "text/markdown") return response.status(status).send(markdown);
  return response.status(status).send(documentHtml({ title, description, path, markdown, ogType }));
}

/** Plain-text and XML surfaces (llms.txt, robots.txt, the sitemap). */
export function sendText(response, body, contentType, cacheControl = "public, max-age=3600") {
  response.setHeader("Content-Type", `${contentType}; charset=utf-8`);
  response.setHeader("Cache-Control", cacheControl);
  return response.status(200).send(body);
}
