# Quota Vita Nutrition Coach

A nutrition coach for the Quota Vita Shopify store. It works out what someone
should eat, logs what they actually ate, and turns the protein they are short of
into a specific tub with a checkout link. Checkout happens on Shopify's pages,
never here.

It is built to be read by agents as well as by people.

## Agent-readable by design

- **One URL, two representations.** A browser asking for `text/html` and an agent
  asking for `text/markdown` get the same page in the form each asked for
  (`server/negotiate.js`, RFC 9110 §12.5.1). Responses carry `Vary: Accept` so a
  CDN cannot hand the cached HTML back to an agent, and an `Accept` we cannot
  satisfy gets a `406` rather than a guess. A wildcard `Accept` still resolves to
  HTML, because that is what browsers and the app's own fetches send.
- **`/openapi.json`** — an OpenAPI 3.1 document written as an LLM
  function-calling toolset (`server/openapi.js`). Every operation has a unique
  `operationId`, a description that says *when* to call it rather than what it is
  named, typed parameters with bounds, and a response schema for every status an
  integrator can actually receive. Endpoints whose provider is disabled document
  the `503 service_not_configured` they really return, so an agent wastes no call
  finding out.
- **`/llms.txt`, `/docs`, `/developers`** — the same contract in prose.
- **`getShopOffers`** (`GET /api/shop`) is public, unauthenticated and cacheable:
  hand it a protein gap in grams, get back the tub that covers it, the cost per
  day, and a Shopify cart permalink carrying Coach attribution.

## What is included

- A Theme App Extension block (`extensions/nutrition-coach`) that can be placed
  on a Shopify page.
- A Node backend (`server/`, `api/`) deployed to Vercel in `fra1`, behind an
  authenticated Shopify App Proxy. No npm dependencies.
- Nutrition targets, basket pricing, food search (FatSecret), restaurant-photo
  suggestions (LogMeal), and the shop offer service, each with its own module.
- App Proxy HMAC verification (`server/app-proxy.js`) using a constant-time
  compare, called before anything trusts `logged_in_customer_id`.

Nutrition and health-profile data is stored by the backend in an EU region
(Supabase), not in Shopify metafields. Photo analysis returns editable
ingredient and portion suggestions; it is never treated as a precise
nutritional measurement.

## Shopify setup

1. In Shopify Dev Dashboard, create a custom app named **Quota Vita Nutrition
   Coach**. Copy `shopify.app.toml.example` to `shopify.app.toml`, then replace
   the client ID and EU-hosted app URL.
2. Run `npx @shopify/cli@latest app deploy` from this directory to deploy the
   extension.
3. Configure an App Proxy at `/apps/nutrition-coach` pointing to the EU-hosted
   backend. The backend validates Shopify's HMAC signature before using
   `logged_in_customer_id`.
4. Add the **Nutrition Coach** app block to a dedicated page template and set its
   app-proxy path if it differs.
5. Copy `.env.example` and fill in the provider credentials you intend to use.
   Endpoints whose provider is unset return `503 service_not_configured` rather
   than failing at the point of use.
6. Add a consent/deletion flow before collecting real customer data.

The storefront block works with demonstrator data until the authenticated
backend is configured.

## Run verification

```sh
npm test
```

## Data-provider recommendation

Use **FatSecret Premier** as the primary Europe-wide barcode/search data source
and **LogMeal** for restaurant-photo suggestions, subject to procurement review.
Keep Open Food Facts out of a merged/cacheable database unless legal confirms an
ODbL-compliant design. Food photos must return editable ingredient/portion
suggestions only. See `NUTRITION_COACH_MVP.md` in the workspace for the product
rules.
