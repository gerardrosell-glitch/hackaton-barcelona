# Quota Vita Nutrition Coach

A Shopify Theme App Extension starter for the Quota Vita Nutrition Coach. The storefront UI is mobile-first and sends personalised data to an authenticated Shopify App Proxy. Nutrition and health-profile data must be stored by the app backend in an EU region, not in Shopify metafields.

## What is included

- A Theme App Extension block (`extensions/nutrition-coach`) that can be placed on a Shopify page.
- A client-side, working MVP interface for onboarding, daily food logging, restaurant-photo selection, activity adjustments, and a gap-aware shopping list.
- A dependency-free nutrition-target service with tests.
- A secure App Proxy request-verification helper for the backend integration.

## Shopify setup

1. In Shopify Dev Dashboard, create a custom app named **Quota Vita Nutrition Coach**. Copy `shopify.app.toml.example` to `shopify.app.toml`, then replace the client ID and EU-hosted app URL.
2. Run `npx @shopify/cli@latest app deploy` from this directory to deploy the extension.
3. Configure an App Proxy at `/apps/nutrition-coach` pointing to the EU-hosted app backend. The backend must validate Shopify's HMAC signature before using `logged_in_customer_id`.
4. Add the **Nutrition Coach** app block to a dedicated page template and set its app-proxy path if it differs.
5. Implement the API routes named in `assets/nutrition-coach.js`: `/profile`, `/day`, `/meals`, `/activity`, `/shopping-list`, and `/meal-photo`.
6. Add a consent/deletion flow and a GDPR-compliant food data provider before collecting real customer data.

The block intentionally works with demonstrator data until an authenticated backend is configured. It never treats photo analysis as a precise nutritional measurement.

## Run verification

```sh
npm test
```

## Data-provider recommendation

Use **FatSecret Premier** as the primary Europe-wide barcode/search data source and **LogMeal** for restaurant-photo suggestions, subject to procurement review. Keep Open Food Facts out of a merged/cacheable database unless legal confirms an ODbL-compliant design. Food photos must return editable ingredient/portion suggestions only. See `NUTRITION_COACH_MVP.md` in the workspace for the product rules.
