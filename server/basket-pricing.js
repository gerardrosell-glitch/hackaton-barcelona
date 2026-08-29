const CALA_QUERY_URL = "https://api.cala.ai/v1/knowledge/query";

const roundToCents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const normaliseName = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Reference prices are deliberately broad Spain-market estimates. They provide a
// useful result when Cala is not configured or has no applicable grocery data.
export const BASKET_CATALOG = Object.freeze([
  { name: "Greek yogurt", unit: "g", maxAmount: 2500, referenceUnitPriceEur: 0.00598 },
  { name: "oats", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.00195 },
  { name: "bananas", unit: "each", maxAmount: 20, referenceUnitPriceEur: 0.22 },
  { name: "apples or pears", unit: "each", maxAmount: 20, referenceUnitPriceEur: 0.28 },
  { name: "berries", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.0075 },
  { name: "eggs", unit: "each", maxAmount: 30, referenceUnitPriceEur: 0.3 },
  { name: "chicken breast", unit: "g", maxAmount: 2500, referenceUnitPriceEur: 0.00799 },
  { name: "turkey", unit: "g", maxAmount: 2500, referenceUnitPriceEur: 0.00999 },
  { name: "salmon", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.01499 },
  { name: "cod", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.01599 },
  { name: "tofu", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.00796 },
  { name: "tuna cans", unit: "each", maxAmount: 20, referenceUnitPriceEur: 1.2 },
  { name: "cooked lentils", unit: "g", maxAmount: 2500, referenceUnitPriceEur: 0.00289 },
  { name: "cooked chickpeas or beans", unit: "g", maxAmount: 2500, referenceUnitPriceEur: 0.0026 },
  { name: "dry rice or quinoa", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.00349 },
  { name: "dry wholegrain pasta", unit: "g", maxAmount: 1500, referenceUnitPriceEur: 0.0018 },
  { name: "potatoes or sweet potatoes", unit: "g", maxAmount: 5000, referenceUnitPriceEur: 0.00149 },
  { name: "mixed vegetables and salad", unit: "g", maxAmount: 5000, referenceUnitPriceEur: 0.00279 },
  { name: "olive oil", unit: "g", maxAmount: 1000, referenceUnitPriceEur: 0.00799 },
  { name: "slices wholegrain bread", unit: "slice", maxAmount: 40, referenceUnitPriceEur: 0.175 },
  { name: "nuts, seeds or peanut butter", unit: "g", maxAmount: 1000, referenceUnitPriceEur: 0.0139 },
]);

const catalogByName = new Map(BASKET_CATALOG.map((product) => [normaliseName(product.name), product]));

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function recordValue(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function parseJsonFromText(value) {
  if (typeof value !== "string") return [];
  const candidates = [value, ...value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi).map((match) => match[1])]
    .flatMap((candidate) => {
      const arrayStart = candidate.indexOf("[");
      const arrayEnd = candidate.lastIndexOf("]");
      const objectStart = candidate.indexOf("{");
      const objectEnd = candidate.lastIndexOf("}");
      return [candidate, arrayStart >= 0 && arrayEnd > arrayStart ? candidate.slice(arrayStart, arrayEnd + 1) : "", objectStart >= 0 && objectEnd > objectStart ? candidate.slice(objectStart, objectEnd + 1) : ""];
    });
  return candidates.flatMap((candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

function collectPotentialRows(value, rows = [], seen = new Set()) {
  if (value === null || value === undefined) return rows;
  if (typeof value === "string") {
    parseJsonFromText(value).forEach((parsed) => collectPotentialRows(parsed, rows, seen));
    return rows;
  }
  if (typeof value !== "object" || seen.has(value)) return rows;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPotentialRows(entry, rows, seen));
    return rows;
  }

  const name = recordValue(value, ["item", "name", "product", "product_name", "label"]);
  const price = recordValue(value, ["price_per_unit_eur", "unit_price_eur", "priceEur", "price_eur", "price"]);
  if (name !== undefined && price !== undefined) rows.push(value);
  Object.values(value).forEach((entry) => collectPotentialRows(entry, rows, seen));
  return rows;
}

function matchesExpectedUnit(calaUnit, expectedUnit) {
  if (!calaUnit) return true;
  const unit = normaliseName(calaUnit);
  const groups = {
    g: ["g", "gram", "grams"],
    each: ["each", "item", "unit", "count", "piece"],
    slice: ["slice", "slices"],
  };
  return groups[expectedUnit]?.includes(unit) ?? false;
}

export function validateBasketItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > BASKET_CATALOG.length) {
    throw new Error("Use a valid weekly basket.");
  }
  const seen = new Set();
  return items.map((item) => {
    const product = catalogByName.get(normaliseName(item?.name));
    const amount = Number(item?.amount);
    if (!product || seen.has(product.name) || !Number.isFinite(amount) || amount <= 0 || amount > product.maxAmount) {
      throw new Error("Use a valid weekly basket.");
    }
    seen.add(product.name);
    return { ...product, amount };
  });
}

export function createCalaPriceQuery(items) {
  const requestedItems = items.map((item) => ({ item: item.name, quantity: item.amount, unit: item.unit }));
  return [
    "Estimate the current standard (non-promotion) supermarket price in Spain for every requested grocery item.",
    "Use EUR. Treat the supplied quantity unit as the pricing unit; price_per_unit_eur must be the price for exactly one supplied unit.",
    "For example, if unit is g return a EUR-per-gram value, and if unit is each or slice return a EUR-per-item value.",
    "Return only a JSON array with one row per requested item using exactly: item, price_per_unit_eur, unit, source_note.",
    "If you do not have a credible estimate for an item, omit it. Do not invent a retailer, promotion, or source.",
    "Requested items: " + JSON.stringify(requestedItems),
  ].join(" ");
}

export function normaliseCalaPrices(payload, items) {
  const expectedByName = new Map(items.map((item) => [normaliseName(item.name), item]));
  const prices = new Map();
  for (const row of collectPotentialRows(payload)) {
    const name = normaliseName(recordValue(row, ["item", "name", "product", "product_name", "label"]));
    const expected = expectedByName.get(name);
    const rawPrice = recordValue(row, ["price_per_unit_eur", "unit_price_eur", "priceEur", "price_eur", "price"]);
    const pricePerUnitEur = asNumber(rawPrice);
    const unit = recordValue(row, ["unit", "price_unit", "priceUnit"]);
    if (!expected || !matchesExpectedUnit(unit, expected.unit) || !Number.isFinite(pricePerUnitEur) || pricePerUnitEur <= 0) continue;

    // Cala's answer is an estimate. A broad plausibility band prevents a
    // price quoted per kg or per pack being misread as a price per gram/item.
    if (pricePerUnitEur < expected.referenceUnitPriceEur * 0.2 || pricePerUnitEur > expected.referenceUnitPriceEur * 5) continue;
    prices.set(expected.name, pricePerUnitEur);
  }
  return prices;
}

export function estimateBasket(items, calaPrices = new Map()) {
  const priceSource = calaPrices.size === items.length ? "cala" : calaPrices.size ? "mixed" : "reference";
  const pricedItems = items.map((item) => {
    const calaUnitPrice = calaPrices.get(item.name);
    const source = calaUnitPrice ? "cala" : "reference";
    const pricePerUnitEur = calaUnitPrice ?? item.referenceUnitPriceEur;
    return {
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      source,
      price: roundToCents(item.amount * pricePerUnitEur),
    };
  });
  return {
    currency: "EUR",
    source: priceSource,
    total: roundToCents(pricedItems.reduce((sum, item) => sum + item.price, 0)),
    items: pricedItems,
  };
}

export async function getCalaPrices({ apiKey, items, fetchImpl = fetch }) {
  if (!apiKey) return new Map();
  const calaResponse = await fetchImpl(CALA_QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ input: createCalaPriceQuery(items) }),
  });
  const payload = await calaResponse.json().catch(() => ({}));
  if (!calaResponse.ok) throw new Error("Cala pricing request failed.");
  return normaliseCalaPrices(payload, items);
}

export async function getBasketEstimate({ items, calaApiKey, fetchImpl = fetch }) {
  const validatedItems = validateBasketItems(items);
  let calaPrices = new Map();
  let calaAvailable = Boolean(calaApiKey);
  if (calaApiKey) {
    try {
      calaPrices = await getCalaPrices({ apiKey: calaApiKey, items: validatedItems, fetchImpl });
    } catch {
      calaAvailable = false;
    }
  }
  return { ...estimateBasket(validatedItems, calaPrices), calaAvailable };
}
