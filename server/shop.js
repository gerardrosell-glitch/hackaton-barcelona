/**
 * server/shop.js — what the Coach is allowed to sell, and how a plan becomes a cart.
 *
 * The Coach shows a "Batut Quota Vita" protein swap on meal cards. Until now
 * that was a label with nothing behind it. This module turns it into a checkout.
 *
 * Identity only, like xatquotavita's lib/catalog.mjs: which variants we sell, in
 * what order, and what to call them. `priceEurHint` exists so a card can render
 * synchronously without waiting on Shopify — if it ever disagrees with the
 * checkout, the checkout is right, because it reads the live price.
 *
 * Out-of-stock and pre-order variants are deliberately absent. Offering a tub
 * Shopify would refuse at the last step is worse than offering nothing.
 */

/** Prepared milkshake strength quoted throughout the Coach interface. */
export const MILKSHAKE_PROTEIN_G_PER_100ML = 24;

/**
 * Whey Protein 80% — 30 g of powder carries 24 g of protein, so 30 g of powder
 * is exactly one 100 ml serving. This is also why the Shopify variants are
 * titled "10 cullerades" for 300 g and "50 cullerades" for 1500 g.
 */
export const POWDER_G_PER_100ML = 30;

const STORE_URL = () => (process.env.SHOP_STORE_URL || "https://www.quotavita.com").replace(/\/+$/, "");

/**
 * A Coach-specific discount code, set in the app environment once it exists in
 * the Shopify admin. Empty means no code is appended, and attribution falls back
 * to the `ref` and UTM parameters alone.
 */
const DISCOUNT_CODE = () => (process.env.COACH_DISCOUNT_CODE || "").trim();

/**
 * Where in the Coach a shop link was rendered. This is the whole point of the
 * `utm_content` slot: `utm_campaign` says what was sold, the surface says which
 * placement sold it, so "the meal card converts, the basket does not" becomes a
 * readable row in Shopify Analytics instead of a guess.
 *
 * The same strings are sent to `/api/events` as the `surface` prop, so the
 * internal funnel and Shopify's session report can be joined on one vocabulary.
 * A closed list, because an unrecognised surface silently splits a report in two.
 */
export const ATTRIBUTION_SURFACES = Object.freeze([
  "meal_card",
  "weekly_basket",
  "daily_basket",
]);

const SURFACES = new Set(ATTRIBUTION_SURFACES);

/** An unknown surface is dropped, never forwarded: no `utm_content` beats a wrong one. */
export function attributionSurface(value) {
  const surface = String(value ?? "").trim().toLowerCase();
  return SURFACES.has(surface) ? surface : null;
}

/** A campaign is our own label; keep it to the shape Shopify reports cleanly. */
const campaignName = (value, fallback) => {
  const campaign = String(value ?? "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,31}$/.test(campaign) ? campaign : fallback;
};

/**
 * Every link the Coach points at the shop carries the same four parameters, so
 * a Coach session is identifiable in Shopify whether or not a discount code is
 * ever created. `ref` is the durable one — UTMs get stripped by link previews
 * and pasted-URL hygiene, `ref` usually survives.
 */
function attributionParams({ campaign, surface, fallbackCampaign = "milkshake" } = {}) {
  const params = new URLSearchParams();
  params.set("ref", "coach");
  params.set("utm_source", "coach");
  params.set("utm_medium", "app");
  params.set("utm_campaign", campaignName(campaign, fallbackCampaign));
  const content = attributionSurface(surface);
  if (content) params.set("utm_content", content);
  return params;
}

/**
 * The storefront page for a tub, attributed like the checkout is. Until now this
 * was the one commercial link in the Coach that arrived at the shop anonymous,
 * which made "browsed from the Coach, bought two days later" invisible.
 *
 * No `discount` here: a code on a product URL does nothing in Shopify. Codes
 * belong on the cart permalink, which is where they are applied.
 */
export function productUrl(handle, options = {}) {
  const slug = String(handle ?? "").trim();
  if (!slug) return STORE_URL();
  const params = attributionParams({ ...options, fallbackCampaign: "product" });
  return `${STORE_URL()}/products/${slug}?${params.toString()}`;
}

export const SHOP_CATALOG = Object.freeze([
  {
    key: "whey-cc-300",
    variantId: "51948724486491",
    sku: "QV-WHE-CC-0300",
    handle: "whey-protein-crema-catalana",
    grams: 300,
    servings: 10,
    priceEurHint: 16,
    order: 1,
    label: { en: "Whey Crema Catalana 300 g", ca: "Whey Crema Catalana 300 g" },
  },
  {
    key: "whey-cc-750",
    variantId: "51948700696923",
    sku: "QV-WHE-CC-0750",
    handle: "whey-protein-crema-catalana",
    grams: 750,
    servings: 25,
    priceEurHint: 39.5,
    order: 2,
    label: { en: "Whey Crema Catalana 750 g", ca: "Whey Crema Catalana 750 g" },
  },
  {
    key: "whey-cc-1500",
    variantId: "51948700729691",
    sku: "QV-WHE-CC-1500",
    handle: "whey-protein-crema-catalana",
    grams: 1500,
    servings: 50,
    priceEurHint: 71.9,
    order: 3,
    label: { en: "Whey Crema Catalana 1.5 kg", ca: "Whey Crema Catalana 1,5 kg" },
  },
  {
    key: "whey-cc-4000",
    variantId: "52006695731547",
    sku: "QV-WHE-CC-4000",
    handle: "whey-protein-4kg-xxl",
    grams: 4000,
    servings: 133,
    priceEurHint: 156,
    order: 4,
    label: { en: "Whey Crema Catalana 4 kg", ca: "Whey Crema Catalana 4 kg" },
  },
]);

/** A first order that is cheaper than committing to a 1.5 kg tub. */
export const STARTER_PACK = Object.freeze({
  key: "pack-iniciacio",
  variantId: "53822195138907",
  sku: "QV-PCK-INI-0300",
  handle: "pack-iniciacio-setembre",
  grams: 300,
  servings: 10,
  priceEurHint: 36,
  label: { en: "Starter pack · 300 g", ca: "Pack Iniciació · 300 g" },
});

const catalogByServings = [...SHOP_CATALOG].sort((a, b) => a.servings - b.servings);

/**
 * The heaviest tub the Coach will lead with. A plan that drinks 200 ml a day
 * needs 56 servings a month, which only the 4 kg tub covers — and opening with
 * a 156 EUR first order is how you lose the order. Recommend the 1.5 kg, quote
 * its honest coverage, and let the basket list carry the larger formats for
 * anyone who wants them.
 */
export const MAX_RECOMMENDED_GRAMS = 1500;

const asPositiveNumber = (value, fallback = null) => {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

/** Millilitres of prepared milkshake that cover a protein gap, rounded up to 10 ml. */
export function millilitresForProtein(proteinG) {
  const protein = asPositiveNumber(proteinG);
  if (protein === null) return null;
  return Math.max(100, Math.ceil((protein / MILKSHAKE_PROTEIN_G_PER_100ML) * 10) * 10);
}

/** Powder needed for a volume of prepared milkshake. */
export function powderGramsForMillilitres(millilitres) {
  const ml = asPositiveNumber(millilitres);
  if (ml === null) return null;
  return Math.round((ml / 100) * POWDER_G_PER_100ML);
}

/**
 * The smallest eligible tub that covers the requested period. When none does,
 * the largest eligible tub is offered with its true coverage rather than no
 * offer at all — a tub that lasts 25 of 28 days still sells.
 */
export function recommendTub(servingsNeeded, { maxGrams = MAX_RECOMMENDED_GRAMS } = {}) {
  const needed = asPositiveNumber(servingsNeeded);
  if (needed === null) return null;
  const eligible = catalogByServings.filter((product) => product.grams <= maxGrams);
  if (!eligible.length) return null;
  return eligible.find((product) => product.servings >= needed) ?? eligible[eligible.length - 1];
}

/**
 * A Shopify cart permalink. Drops the variant straight into checkout and carries
 * the attribution the Coach currently has no way to prove: every order opened
 * from here is identifiable as a Coach order, with or without a discount code.
 */
export function cartUrl(variantId, quantity = 1, options = {}) {
  const id = String(variantId ?? "").replace(/\D/g, "");
  if (!id) return STORE_URL();
  const qty = Math.min(10, Math.max(1, Math.round(asPositiveNumber(quantity, 1))));
  const params = attributionParams(options);
  const discount = options.discountCode ?? DISCOUNT_CODE();
  if (discount) params.set("discount", discount);
  return `${STORE_URL()}/cart/${id}:${qty}?${params.toString()}`;
}

/**
 * The offer behind a protein swap: how much milkshake the plan asks for, how
 * long a tub lasts at that rate, and the checkout that sells it.
 *
 * `dailyProteinG` is the protein the swap replaces on a single day.
 * `days` is the period the customer should be covered for; 28 keeps a monthly
 * rhythm without implying a subscription the shop cannot yet fulfil.
 */
export function coachOffer({ dailyProteinG, millilitres, days = 28, language = "en", campaign, surface, maxGrams } = {}) {
  const perDayMl = asPositiveNumber(millilitres) ?? millilitresForProtein(dailyProteinG);
  if (perDayMl === null) return null;

  const period = Math.min(120, Math.max(1, Math.round(asPositiveNumber(days, 28))));
  const servingsNeeded = (perDayMl / 100) * period;
  const product = recommendTub(servingsNeeded, maxGrams ? { maxGrams } : undefined);
  if (!product) return null;

  const servingsPerDay = perDayMl / 100;
  return {
    millilitresPerDay: perDayMl,
    powderGramsPerDay: powderGramsForMillilitres(perDayMl),
    proteinPer100Ml: MILKSHAKE_PROTEIN_G_PER_100ML,
    days: period,
    coversRequestedPeriod: product.servings >= servingsNeeded,
    product: {
      key: product.key,
      sku: product.sku,
      grams: product.grams,
      servings: product.servings,
      priceEurHint: product.priceEurHint,
      label: product.label[language] || product.label.en,
      productUrl: productUrl(product.handle, { campaign, surface }),
    },
    coverageDays: Math.floor(product.servings / servingsPerDay),
    costPerDayEurHint: Math.round(((product.priceEurHint / product.servings) * servingsPerDay + Number.EPSILON) * 100) / 100,
    cartUrl: cartUrl(product.variantId, 1, { campaign, surface }),
  };
}

/** The whole sellable list, for a basket view that offers more than one tub. */
export function shopOffers(language = "en", { surface } = {}) {
  return [...SHOP_CATALOG].sort((a, b) => a.order - b.order).map((product) => ({
    key: product.key,
    sku: product.sku,
    grams: product.grams,
    servings: product.servings,
    priceEurHint: product.priceEurHint,
    label: product.label[language] || product.label.en,
    productUrl: productUrl(product.handle, { campaign: "basket", surface }),
    cartUrl: cartUrl(product.variantId, 1, { campaign: "basket", surface }),
  }));
}
