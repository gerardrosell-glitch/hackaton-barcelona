import test from "node:test";
import assert from "node:assert/strict";
import {
  createCalaPriceQuery,
  estimateBasket,
  getBasketEstimate,
  getCalaPrices,
  normaliseCalaPrices,
  validateBasketItems,
} from "../server/basket-pricing.js";

const requestedBasket = [
  { name: "Greek yogurt", amount: 1200 },
  { name: "eggs", amount: 12 },
];

test("weekly basket falls back to transparent Spain-market reference prices", () => {
  const items = validateBasketItems(requestedBasket);
  const estimate = estimateBasket(items);

  assert.equal(estimate.currency, "EUR");
  assert.equal(estimate.source, "reference");
  assert.equal(estimate.items[0].price, 7.18);
  assert.equal(estimate.items[1].price, 3.6);
  assert.equal(estimate.total, 10.78);
});

test("Cala rows must match a requested product and its expected pricing unit", () => {
  const items = validateBasketItems(requestedBasket);
  const prices = normaliseCalaPrices({
    data: [
      { item: "Greek yogurt", price_per_unit_eur: 0.006, unit: "g" },
      { item: "eggs", price_per_unit_eur: 0.31, unit: "each" },
      { item: "salmon", price_per_unit_eur: 14.99, unit: "kg" },
    ],
  }, items);

  assert.equal(prices.get("Greek yogurt"), 0.006);
  assert.equal(prices.get("eggs"), 0.31);
  assert.equal(prices.has("salmon"), false);
  assert.equal(estimateBasket(items, prices).total, 10.92);
});

test("Cala query asks for an exact per-requested-unit EUR result", () => {
  const items = validateBasketItems(requestedBasket);
  const query = createCalaPriceQuery(items);

  assert.match(query, /price_per_unit_eur/);
  assert.match(query, /Greek yogurt/);
  assert.match(query, /EUR-per-gram/);
});

test("Cala price requests keep the API key server-side and accept structured rows", async () => {
  const items = validateBasketItems(requestedBasket);
  let request;
  const prices = await getCalaPrices({
    apiKey: "server-only-test-key",
    items,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ results: [{ item: "Greek yogurt", price_per_unit_eur: 0.0061, unit: "g" }] }),
      };
    },
  });

  assert.equal(request.url, "https://api.cala.ai/v1/knowledge/query");
  assert.equal(request.options.headers["X-API-KEY"], "server-only-test-key");
  assert.match(request.options.body, /Greek yogurt/);
  assert.equal(prices.get("Greek yogurt"), 0.0061);
});

test("unavailable Cala data still returns a complete reference estimate", async () => {
  const estimate = await getBasketEstimate({
    items: requestedBasket,
    calaApiKey: "configured-but-unavailable",
    fetchImpl: async () => { throw new Error("temporary outage"); },
  });

  assert.equal(estimate.source, "reference");
  assert.equal(estimate.calaAvailable, false);
  assert.equal(estimate.total, 10.78);
});

test("basket endpoint validation rejects unrecognised or duplicated product rows", () => {
  assert.throws(() => validateBasketItems([{ name: "unknown", amount: 1 }]), /valid weekly basket/);
  assert.throws(() => validateBasketItems([{ name: "eggs", amount: 12 }, { name: "eggs", amount: 12 }]), /valid weekly basket/);
});
