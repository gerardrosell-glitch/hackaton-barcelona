# EU backend setup

## Architecture

`quotavita.com/apps/nutrition-coach` → Shopify signed App Proxy → Vercel Function in `fra1` → Supabase Postgres/Storage in `eu-central-1`.

The Shopify theme never receives Supabase credentials. The browser talks only to the Shopify-domain App Proxy; the function verifies Shopify's HMAC before it reads or writes a customer record.

## Required Vercel production secrets

Set these only in Vercel's project environment variables. Do not commit them or put them in Shopify.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
- `SHOPIFY_APP_PROXY_SECRET` (sensitive)
- `NUTRITION_POLICY_VERSION` (for example, `v1`)

## Database bootstrap

Run `supabase/migrations/202608290001_nutrition_coach.sql` in the Supabase SQL Editor. It enables RLS on every table, creates no public access policies, and creates a private `meal-photos` bucket.

## Before production

1. Upgrade from the Free plan and sign Supabase's DPA.
2. Implement the public privacy notice, explicit consent screen, export/deletion UX, and retention policy.
3. Configure the Shopify App Proxy with the deployed Vercel URL and `write_app_proxy` scope, then update and release the `coach` Shopify app version.
4. Sign DPAs with food-data and meal-photo providers; do not enable `meal-photo` before that.
