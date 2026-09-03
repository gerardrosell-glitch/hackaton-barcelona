# Quota Vita Nutrition Coach

A Shopify Theme App Extension starter for the Quota Vita Nutrition Coach. The storefront UI is mobile-first and sends personalised data to an authenticated Shopify App Proxy. Nutrition and health-profile data must be stored by the app backend in an EU region, not in Shopify metafields.

## What is included

- A Theme App Extension block (`extensions/nutrition-coach`) that can be placed on a Shopify page.
- A client-side, working MVP interface for onboarding, daily food logging, restaurant-photo selection, activity adjustments, and a gap-aware shopping list.
- A dependency-free nutrition-target service with tests.
- A secure App Proxy request-verification helper for the backend integration.
- Hands-free voice control: a shared command grammar with an offline matcher, a lazily loaded browser controller, and a model-backed interpreter for everything the grammar cannot place.

## Shopify setup

1. In Shopify Dev Dashboard, create a custom app named **Quota Vita Nutrition Coach**. Copy `shopify.app.toml.example` to `shopify.app.toml`, then replace the client ID and EU-hosted app URL.
2. Run `npx @shopify/cli@latest app deploy` from this directory to deploy the extension.
3. Configure an App Proxy at `/apps/nutrition-coach` pointing to the EU-hosted app backend. The backend must validate Shopify's HMAC signature before using `logged_in_customer_id`.
4. Add the **Nutrition Coach** app block to a dedicated page template and set its app-proxy path if it differs.
5. Implement the API routes named in `assets/nutrition-coach.js`: `/profile`, `/day`, `/meals`, `/activity`, `/shopping-list`, and `/meal-photo`.
6. Add a consent/deletion flow and a GDPR-compliant food data provider before collecting real customer data.

The block intentionally works with demonstrator data until an authenticated backend is configured. It never treats photo analysis as a precise nutritional measurement.

## Voice control

The Coach can be driven entirely by speaking to it — a microphone in the top bar, `v` on a
keyboard, and a panel that listens, acts and reads the answer back.

Three files carry it:

| File | Role |
| --- | --- |
| `public/voice-commands.js` | The action catalogue, the validator, and an English/Catalan phrase matcher. Imported by the browser, by `api/voice.js` and by the tests, so the offline path and the model path cannot disagree. |
| `public/voice.js` | The browser controller: speech recognition, speech synthesis, the panel, and the listen-answer-listen loop. Fetched on demand the first time the microphone is tapped. |
| `api/voice.js` | Interprets the sentences the grammar does not recognise, against the same catalogue, and returns a spoken reply plus checked actions. Needs `OPENAI_API_KEY`. |

Two rules the code enforces rather than assumes. Every action is an allow-list entry with
typed arguments — an action the model invents is discarded before anything runs — and nothing
destructive is in the catalogue, so no misheard sentence can erase a profile. Commands the
matcher recognises never touch the network, which is what makes the shopping basket readable
aloud in a supermarket basement.

Without `OPENAI_API_KEY` the direct commands still work; only spoken questions need the
model. Browsers with no speech recognition get the same panel with a text field.

### The Catalan voice

Most phones ship no Catalan `speechSynthesis` voice, so the browser reads the Coach's Catalan
in a Spanish one. Every sentence the Coach says without consulting a live number is a fixed
set — thirty-six of them — so they are rendered once by **Matxa**, the Barcelona Supercomputing
Center's Catalan synthesiser from Projecte Aina, and shipped as static audio:

```sh
HF_TOKEN=hf_… npm run voice:ca          # render what is missing into public/audio/ca/
npm run voice:ca -- --check             # list what is missing, no token needed
```

`spokenPhrases()` in `public/voice-commands.js` is the single list; the script renders it and
the player looks a sentence up in the result by its own text. Commit the output — the files are
static assets, and `sw.js` caches them so Catalan stays in a Catalan voice offline.

This is a build step, never a request. No audio and no personal data leaves a device: the input
is the app's own copy, and the output is a file. The six sentences that carry live numbers —
the remaining macros, the basket, a match count — still use the device's voice, and so does
everything if the audio has not been rendered yet. Missing recordings are never fatal.

## Run verification

```sh
npm test
```

## Data-provider recommendation

Use **FatSecret Premier** as the primary Europe-wide barcode/search data source and **LogMeal** for restaurant-photo suggestions, subject to procurement review. Keep Open Food Facts out of a merged/cacheable database unless legal confirms an ODbL-compliant design. Food photos must return editable ingredient/portion suggestions only. See `NUTRITION_COACH_MVP.md` in the workspace for the product rules.
