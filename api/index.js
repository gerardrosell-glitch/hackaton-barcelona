import { SITE } from "../server/site.js";
import { negotiate, applyVary } from "../server/negotiate.js";
import { head, methodNotAllowed, sendError, ASSET_VERSION } from "../server/http.js";
import { homeHtml, homeMarkdown } from "../server/home.js";

/**
 * The Coach shell.
 *
 * Two things changed here beyond the markup. The `<main>` is no longer empty:
 * it carries the whole homepage server-side, which `coach.js` overwrites on
 * boot, so an AI crawler that does not run scripts still reads a real page.
 * And the same page is served as Markdown to a caller that asks for it, with
 * `Vary: Accept` so a CDN cannot hand the wrong variant to the wrong client.
 *
 * A wildcard `Accept` still resolves to HTML. That is deliberate: it is what
 * every browser and the app's own fetches send.
 */

/** Styling for the pre-hydration content only. The design system does the rest. */
const INTRO_CSS = `
    .view--intro{max-width:74ch;margin:0 auto}
    .view--intro h2{font-family:var(--display);font-size:1.5rem;margin:var(--s6) 0 var(--s3)}
    .view--intro h3{font-size:1rem;margin:0 0 var(--s1)}
    .view--intro p{color:var(--on-shell);line-height:1.6}
    .view--intro .card p{color:var(--ink)}
    .view--intro a{color:var(--accent-soft)}
    .view--intro ol,.view--intro ul{padding-left:1.2em}
    .view--intro li{margin:0 0 var(--s3);color:var(--on-shell)}
    .view--intro .ssr-links a{color:var(--accent-soft)}`;

function page() {
  return `<!doctype html>
<html lang="${SITE.locale}">
<head>
${head({ title: SITE.name, description: SITE.description, path: "/", ogType: "website" })}
  <style>
    /* Critical shell only. The design system lives in /coach.css */
    html{-webkit-text-size-adjust:100%;color-scheme:light}
    body{margin:0;min-height:100dvh;background:#fdfaf3;color:#2b2320;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .app{display:flex;flex-direction:column;min-height:100dvh}
    .main{flex:1;padding:24px 16px 96px}
  </style>
  <link rel="stylesheet" href="/coach.css?v=${ASSET_VERSION}">
  <style>${INTRO_CSS}</style>
</head>
<body>
  <div class="app">
    <header class="topbar" id="topbar"><div class="topbar-inner"><a class="brand" href="/" aria-label="Quota Vita Coach"><img class="brand-logo brand-logo--ink" src="/assets/logo-quota-vita.png" width="578" height="120" alt="Quota Vita"><img class="brand-logo brand-logo--light" src="/assets/logo-quota-vita-light.png" width="621" height="120" alt="" aria-hidden="true"><em>Coach</em></a></div></header>
    <main class="main" id="coach">
    ${homeHtml()}
    </main>
    <nav class="tabbar" id="tabbar" aria-label="Sections" hidden></nav>
  </div>
  <script src="/coach.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>`;
}

export default function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(response, ["GET", "HEAD"]);

  const chosen = negotiate(request.headers?.accept, ["text/html", "text/markdown"]);
  if (!chosen) {
    response.setHeader("Vary", "Accept, Accept-Encoding");
    return sendError(response, 406, "not_acceptable", "This URL is available as text/html or text/markdown only.");
  }

  applyVary(response, chosen);
  response.setHeader("Cache-Control", "no-store");
  if (chosen === "text/markdown") return response.status(200).send(homeMarkdown());
  return response.status(200).send(page());
}
