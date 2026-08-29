/**
 * server/home.js — the homepage, before JavaScript runs.
 *
 * The Coach is a single-page application: `coach.js` replaces the contents of
 * `#coach` on boot, so until now the served HTML carried 26 characters of text
 * and an AI crawler saw an empty page. What is below is the same page written
 * out server-side. A person sees it for the moment before the app mounts over
 * it, styled with the Coach's own design system so nothing flashes wrong; an
 * agent, which does not run the script, sees the whole thing and nothing else.
 *
 * That makes it the one description of the product that has to be true without
 * anyone maintaining it separately — so it is generated from `site.js` and the
 * same copy is emitted as Markdown for `Accept: text/markdown`.
 */

import { SITE, ORGANISATION, PAGES } from "./site.js";
import { escapeHtml } from "./markdown.js";

const url = (path) => `${SITE.origin}${path}`;

const STEPS = [
  ["Your profile", "Height, weight, age, sex, how active you usually are, and whether you want to lose, gain or maintain."],
  ["Today's training", "Rest, a walk, pilates, strength or a run. The day's target moves with it."],
  ["Your target", "A daily energy figure and a protein, carbohydrate and fat split, calculated from the two answers above."],
  ["Three meals", "Breakfast, lunch and dinner from Catalan and Mediterranean cooking that add up to that target, with amounts."],
  ["The week and the basket", "Seven days at once, turned into a shopping list with an estimated supermarket cost in euro."],
];

const ANSWERS = [
  "What should I eat today, given my body and the training I am actually doing?",
  "How much protein am I short of, and what covers it?",
  "What does a week of eating like this cost at a Spanish supermarket?",
  "I am eating out tonight — what should I pick?",
];

/**
 * The pre-hydration homepage, in the Coach's own markup.
 *
 * `coach.js` overwrites this the moment it runs, so it must not carry any state
 * the app would then contradict: it is description, not interface.
 */
export function homeHtml() {
  const steps = STEPS.map(
    ([title, detail]) => `<li><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></li>`
  ).join("");
  const answers = ANSWERS.map((question) => `<li>${escapeHtml(question)}</li>`).join("");
  const pages = PAGES.map((page) => `<li><a href="/${page.slug}">${escapeHtml(page.title)}</a></li>`).join("");

  return `<div class="view view--intro" data-ssr-intro>
      <div class="view-head">
        <p class="eyebrow">${escapeHtml(ORGANISATION.name)} &middot; ${escapeHtml(ORGANISATION.addressLocality)}, ${escapeHtml(ORGANISATION.addressRegion)}</p>
        <h1>${escapeHtml(SITE.name)}</h1>
        <p class="view-lead">${escapeHtml(SITE.tagline)}</p>
      </div>
      <div class="card">
        <p>${escapeHtml(SITE.description)}</p>
        <p>It runs entirely in your browser. There is no account, no password and no sign-up: answer five short questions and the first day of your plan appears. Your profile stays in your own device's storage and is never sent to a Quota Vita server, so clearing this site's data removes it completely.</p>
      </div>
      <h2>How it works</h2>
      <ol class="ssr-steps">${steps}</ol>
      <h2>What it answers</h2>
      <ul class="ssr-answers">${answers}</ul>
      <h2>What it is not</h2>
      <p>The Coach is general wellbeing guidance, not medical treatment or clinical nutrition. It does not diagnose, does not handle allergies, pregnancy or a clinical condition, and does not replace a dietitian or a doctor. A photograph of a restaurant meal returns an editable suggestion, never a measurement. If you have a medical condition, speak to a clinician before changing what you eat.</p>
      <h2>Free, and how that works</h2>
      <p>There is no subscription and no advertising. One meal a day can optionally be met with a Batut Quota Vita, the protein powder ${escapeHtml(ORGANISATION.name)} makes and sells at <a href="${ORGANISATION.url}" rel="noopener">${escapeHtml(ORGANISATION.url.replace("https://", ""))}</a>. That is the whole business model, and the Coach works identically if you never use it.</p>
      <h2>For developers and AI agents</h2>
      <p>The Coach publishes a public, read-only, unauthenticated API and an OpenAPI 3.1 description of it, so an agent can size a protein gap, price a basket or generate a day of meals without a browser.</p>
      <ul class="ssr-links">
        <li><a href="/developers">Developer portal</a> &mdash; quickstart, authentication, errors, rate limits and the sandbox.</li>
        <li><a href="/openapi.json">OpenAPI 3.1 specification</a> &mdash; the full contract. Also as <a href="/api/openapi.yaml">YAML</a>.</li>
        <li><a href="/docs">Documentation index</a></li>
        <li><a href="/llms.txt">llms.txt</a> and <a href="/agents.md">agents.md</a> &mdash; when to use this site, and how to call it.</li>
        <li><a href="/api/health">Health check</a> and <a href="/api/shop">shop offers</a> &mdash; public endpoints, no key required.</li>
      </ul>
      <h2>Quota Vita</h2>
      <ul class="ssr-links">${pages}
        <li><a href="mailto:${SITE.email}">${SITE.email}</a></li>
      </ul>
    </div>`;
}

/** The same homepage as Markdown, for `Accept: text/markdown`. */
export function homeMarkdown() {
  return `# ${SITE.name}

> ${SITE.tagline}

${SITE.description}

It runs entirely in your browser. There is no account, no password and no sign-up: answer five short questions and the first day of your plan appears. Your profile stays in your own device's storage and is never sent to a Quota Vita server, so clearing this site's data removes it completely.

## How it works

${STEPS.map(([title, detail]) => `1. **${title}** — ${detail}`).join("\n")}

## What it answers

${ANSWERS.map((question) => `- ${question}`).join("\n")}

## What it is not

The Coach is general wellbeing guidance, not medical treatment or clinical nutrition. It does not diagnose, does not handle allergies, pregnancy or a clinical condition, and does not replace a dietitian or a doctor. A photograph of a restaurant meal returns an editable suggestion, never a measurement. If you have a medical condition, speak to a clinician before changing what you eat.

## Free, and how that works

There is no subscription and no advertising. One meal a day can optionally be met with a Batut Quota Vita, the protein powder ${ORGANISATION.name} makes and sells at [${ORGANISATION.url.replace("https://", "")}](${ORGANISATION.url}). That is the whole business model, and the Coach works identically if you never use it.

## For developers and AI agents

- [Developer portal](${url("/developers")}) — quickstart, authentication, errors, rate limits and the sandbox.
- [OpenAPI 3.1](${url("/openapi.json")}) — the full contract. Also as [YAML](${url("/api/openapi.yaml")}).
- [Documentation index](${url("/docs")})
- [llms.txt](${url("/llms.txt")}) and [agents.md](${url("/agents.md")}) — when to use this site, and how to call it.
- [Health check](${url("/api/health")}) and [shop offers](${url("/api/shop")}) — public endpoints, no key required.

## Quota Vita

${PAGES.map((page) => `- [${page.title}](${url(`/${page.slug}`)}) — ${page.description}`).join("\n")}
- ${ORGANISATION.name}, ${ORGANISATION.addressLocality}, ${ORGANISATION.addressRegion} (${ORGANISATION.addressCountry}) — ${SITE.email}
`;
}
