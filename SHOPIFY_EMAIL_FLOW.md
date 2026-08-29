# Nutrition Coach email delivery

The Coach sends weekly plans and baskets directly to the existing xat.quotavita.com Vercel email service. It does not open a mail app or depend on Shopify Flow.

## One-time configuration

Set the same high-entropy value as the Vercel Production environment variable `COACH_EMAIL_SHARED_SECRET` in both projects:

- `quota-vita-nutrition-coach-api` (the Coach)
- `qv-chatbot` (xat.quotavita.com)

Optional in the Coach project: `XAT_COACH_EMAIL_ENDPOINT`, normally `https://xat.quotavita.com/api/coach-email`.

The Coach receives the visitor's explicit privacy/marketing consent, then calls xat server-to-server using this secret. xat upserts the Shopify customer, records `SUBSCRIBED` email consent, adds Nutrition Coach tags and metafields, sends through Resend, and uses its existing one-click unsubscribe endpoint.

## Checklist in the email

The email contains plain-text plan or basket lines prefixed with checkboxes. On iPhone the reader can share it to Notes or Reminders; on Android, to the preferred notes app. Mobile operating systems do not let a website silently create a note on the user's device.
