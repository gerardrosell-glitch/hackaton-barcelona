# Shopify email delivery for Nutrition Coach

The Coach now sends a server-side `Nutrition Coach email requested` event to Shopify Flow. It does not open the user's email app.

## One-time Shopify setup

1. In the Nutrition Coach custom app, approve the new `write_customers` scope after deploying this repository's app configuration.
2. Add these Vercel Production environment variables. Keep both values server-only:
   - `SHOPIFY_STORE_DOMAIN`: the permanent `your-store.myshopify.com` domain (not the storefront custom domain).
   - `SHOPIFY_CLIENT_ID`: the Nutrition Coach app Client ID from Shopify Dev Dashboard → Apps → nutrtition → Settings.
   - `SHOPIFY_CLIENT_SECRET`: the matching Client secret from the same screen.
   - Optional: `SHOPIFY_COACH_FLOW_HANDLE`: `nutrition-coach-email-requested` (this is the default already).

   The endpoint exchanges these client credentials for a short-lived Admin API token on the server. `SHOPIFY_ADMIN_ACCESS_TOKEN` is supported only as a legacy fallback for an older admin-created custom app.
3. Deploy the app extension, then create and turn on a Shopify Flow with the trigger **Nutrition Coach email requested**.
4. Add the email action used by your existing Quota Vita workflow. Its recipient is the trigger customer. Use the Flow variables:
   - `{{customer.email}}` for the recipient.
   - `{{emailType}}` for the subject/context.
   - `{{checklist}}` in the body.
   - `{{language}}` to choose Catalan or English copy if your workflow supports conditions.

The Coach only submits the event after the visitor checks the separate privacy/marketing-consent box. The server creates or finds the customer and records Shopify email marketing consent before triggering Flow. No Admin token reaches the browser.

## Checklist in the email

Use the `Checklist` Flow value inside a simple preformatted text block or list. It is deliberately plain text, so on iPhone a reader can use Share → Notes, and on Android they can use Share → Keep/Notes, then tick items as they shop. Mobile operating systems do not allow a website or email to silently create a note on the user's device.

## Store plan requirement

Custom-app Flow triggers are available to Shopify Plus stores (and Plus dev stores). If this store is not on Plus, keep the same consent/customer step but connect the email action through the existing Quota Vita email workflow using a webhook instead of the Flow trigger.
