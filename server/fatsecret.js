const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const SEARCH_URL = "https://platform.fatsecret.com/rest/foods/search/v5";

let tokenCache;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function accessToken() {
  if (tokenCache?.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const credentials = Buffer.from(`${required("FATSECRET_CLIENT_ID")}:${required("FATSECRET_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("FatSecret authentication failed.");
  const payload = await response.json();
  tokenCache = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
  return tokenCache.value;
}

function foodResults(payload) {
  const foods = payload?.foods_search?.results?.food ?? payload?.foods?.food ?? [];
  return (Array.isArray(foods) ? foods : [foods]).filter(Boolean).map((food) => ({
    id: String(food.food_id),
    name: food.food_name,
    brand: food.brand_name ?? null,
    description: food.food_description ?? null,
    type: food.food_type ?? null,
  }));
}

export async function searchFoods({ search, region = "ES", language = "es", limit = 8 }) {
  const expression = String(search ?? "").trim();
  if (expression.length < 2 || expression.length > 100) throw new Error("Enter between 2 and 100 characters to search foods.");
  const params = new URLSearchParams({
    search_expression: expression,
    region: String(region).toUpperCase(),
    language: String(language).toLowerCase(),
    max_results: String(Math.min(Math.max(Number(limit) || 8, 1), 20)),
    format: "json",
  });
  const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (response.status === 401 || response.status === 403) throw new Error("Food search is not enabled for this FatSecret plan.");
  if (!response.ok) throw new Error("Food search is temporarily unavailable.");
  const payload = await response.json();
  if (payload?.error) throw new Error("Food search is not enabled for this FatSecret plan.");
  return { items: foodResults(payload), provider: "FatSecret", retention: "No search terms or results are stored by Quota Vita." };
}
