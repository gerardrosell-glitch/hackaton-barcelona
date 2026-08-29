const SHOPIFY_API_VERSION = "2025-10";
const MAX_CHECKLIST_LENGTH = 45000;
const FLOW_HANDLE = process.env.SHOPIFY_COACH_FLOW_HANDLE || "nutrition-coach-email-requested";
let cachedAccessToken;

const parseBody = (request) => typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});

function configured() {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)));
}

function allowedOrigin(request) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "coach.quotavita.com" || host.endsWith(".vercel.app") || host === "localhost";
  } catch {
    return false;
  }
}

function shopDomain() {
  return String(process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function adminAccessToken() {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (cachedAccessToken?.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const request = await fetch(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET
    })
  });
  const result = await request.json().catch(() => ({}));
  if (!request.ok || !result.access_token) throw new Error("Shopify authentication failed.");
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000
  };
  return cachedAccessToken.value;
}

async function shopify(query, variables) {
  const response = await fetch(`https://${shopDomain()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await adminAccessToken()
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) throw new Error("Shopify request failed.");
  return payload.data;
}

function errors(result) {
  const list = result?.userErrors || [];
  if (list.length) throw new Error(list.map((error) => error.message).join(" "));
  return result;
}

async function findOrCreateCustomer(email) {
  const existing = await shopify(`query FindCustomer($query: String!) { customers(first: 1, query: $query) { nodes { id legacyResourceId } } }`, { query: `email:${email}` });
  if (existing.customers.nodes[0]) return existing.customers.nodes[0];
  const created = await shopify(`mutation CreateCustomer($input: CustomerInput!) { customerCreate(input: $input) { customer { id legacyResourceId } userErrors { message } } }`, { input: { email } });
  return errors(created.customerCreate).customer;
}

async function recordConsent(customerId) {
  const result = await shopify(`mutation Consent($input: CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input: $input) { customer { id } userErrors { message } } }`, {
    input: {
      customerId,
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        marketingOptInLevel: "SINGLE_OPT_IN",
        consentUpdatedAt: new Date().toISOString()
      }
    }
  });
  errors(result.customerEmailMarketingConsentUpdate);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!allowedOrigin(request)) return response.status(403).json({ error: "This request is not allowed from this website." });
  if (!configured()) return response.status(503).json({ error: "Shopify email delivery is not configured yet." });

  const body = parseBody(request);
  const email = String(body.email || "").trim().toLowerCase();
  const kind = body.kind === "basket" ? "weekly basket" : "weekly plan";
  const checklist = String(body.checklist || "").trim();
  const language = body.language === "ca" ? "Catalan" : "English";
  if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(422).json({ error: "Enter a valid email address." });
  if (body.marketingConsent !== true) return response.status(422).json({ error: "Email consent is required to send this through Shopify." });
  if (!checklist || checklist.length > MAX_CHECKLIST_LENGTH) return response.status(422).json({ error: "The checklist could not be prepared." });

  try {
    const customer = await findOrCreateCustomer(email);
    await recordConsent(customer.id);
    const flow = await shopify(`mutation SendCoachEmail($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { message } } }`, {
      handle: FLOW_HANDLE,
      payload: {
        customer_id: Number(customer.legacyResourceId),
        "Email type": kind,
        Checklist: checklist,
        Language: language,
        "Consent recorded": true
      }
    });
    errors(flow.flowTriggerReceive);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ delivered: true });
  } catch (error) {
    console.error("Shopify coach email request failed", error);
    return response.status(502).json({ error: "Shopify could not start the email workflow. Check the Coach email Flow is active." });
  }
}
