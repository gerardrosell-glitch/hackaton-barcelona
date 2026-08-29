/**
 * server/openapi.js — the published contract of the Coach's HTTP surface.
 *
 * Written to be usable as an LLM function-calling toolset without a human in
 * between, which sets the bar for every operation: a unique `operationId`, a
 * description that says when to call it rather than what it is named, typed
 * parameters with bounds, and a response schema for every status an integrator
 * can actually receive.
 *
 * It describes the routes that exist. Endpoints whose provider is disabled are
 * documented with the `503 service_not_configured` they really return, because
 * an agent that discovers that from the spec wastes no call finding out.
 */

import { SITE, ORGANISATION } from "./site.js";

/** Bumped whenever the shape of a request or a response changes. */
export const API_VERSION = "1.1.0";

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const jsonBody = (schema, description) => ({
  description,
  required: true,
  content: { "application/json": { schema } },
});

const jsonResponse = (description, schema) => ({
  description,
  content: { "application/json": { schema } },
});

/** The failure responses every route can produce, so each operation lists them. */
const errorResponse = (description) => jsonResponse(description, ref("Error"));

const ERRORS = {
  400: errorResponse("The request body is malformed or fails validation."),
  403: errorResponse("The request origin is not allowed for this endpoint."),
  404: errorResponse("No route serves this path."),
  405: errorResponse("The HTTP method is not supported on this path."),
  406: errorResponse("No representation acceptable under the request's Accept header."),
  422: errorResponse("The request is well formed but a value is unusable."),
  502: errorResponse("An upstream provider failed."),
  503: errorResponse("The provider this endpoint depends on is not configured."),
};

const pick = (...codes) => Object.fromEntries(codes.map((code) => [String(code), ERRORS[code]]));

const SCHEMAS = {
  Error: {
    type: "object",
    description:
      "The failure envelope used by every endpoint. Branch on `code`, never on the sentence in `message`; `error` repeats `message` for older clients.",
    required: ["error", "code", "message", "status"],
    properties: {
      error: { type: "string", description: "The human-readable failure sentence. Identical to `message`." },
      code: {
        type: "string",
        description: "A stable machine-readable identifier for the failure.",
        enum: [
          "invalid_request",
          "method_not_allowed",
          "not_found",
          "not_acceptable",
          "forbidden",
          "service_not_configured",
          "upstream_unavailable",
        ],
      },
      message: { type: "string", description: "The human-readable failure sentence." },
      hint: { type: "string", description: "What the caller should do next to succeed." },
      documentation: { type: "string", format: "uri", description: "URL of this OpenAPI document." },
      status: { type: "integer", description: "The HTTP status code, repeated in the body.", minimum: 400, maximum: 599 },
    },
  },
  Health: {
    type: "object",
    description: "Liveness and the version of the contract the service is currently serving.",
    required: ["status", "service", "apiVersion"],
    properties: {
      status: { type: "string", enum: ["ok"], description: "`ok` whenever the function responded at all." },
      service: { type: "string", description: "The service name." },
      apiVersion: { type: "string", description: "Semantic version of this OpenAPI contract." },
      time: { type: "string", format: "date-time", description: "Server time when the response was produced." },
      documentation: { type: "string", format: "uri" },
      endpoints: {
        type: "array",
        description: "The endpoints that need no credentials and are safe to call repeatedly.",
        items: { type: "string" },
      },
    },
  },
  ShopProduct: {
    type: "object",
    description: "One sellable Quota Vita whey tub, with a checkout link that carries Coach attribution.",
    required: ["key", "sku", "grams", "servings", "label", "cartUrl"],
    properties: {
      key: { type: "string", description: "Stable identifier for the tub, e.g. `whey-cc-750`." },
      sku: { type: "string", description: "Quota Vita stock-keeping unit." },
      grams: { type: "integer", description: "Powder in the tub, in grams.", minimum: 1 },
      servings: { type: "integer", description: "100 ml milkshake servings the tub yields at 30 g of powder each.", minimum: 1 },
      priceEurHint: {
        type: "number",
        description: "Indicative shop price in euro. The checkout price is authoritative if the two disagree.",
        minimum: 0,
      },
      label: { type: "string", description: "Display name in the requested language." },
      productUrl: { type: "string", format: "uri", description: "Product page in the Quota Vita shop." },
      cartUrl: { type: "string", format: "uri", description: "Shopify cart permalink that adds this tub to a checkout." },
    },
  },
  ShopOffer: {
    type: "object",
    description:
      "How much milkshake covers a daily protein gap, which tub covers that for the requested period, and what it costs per day.",
    required: ["millilitresPerDay", "days", "product"],
    properties: {
      millilitresPerDay: { type: "integer", description: "Prepared milkshake per day, in millilitres.", minimum: 100 },
      powderGramsPerDay: { type: "integer", description: "Powder per day, in grams, at 30 g per 100 ml.", minimum: 1 },
      proteinPer100Ml: { type: "integer", description: "Protein in 100 ml of prepared milkshake, in grams." },
      days: { type: "integer", description: "The period the offer was sized for.", minimum: 1, maximum: 120 },
      coversRequestedPeriod: { type: "boolean", description: "False when even the largest eligible tub is short of the period." },
      coverageDays: { type: "integer", description: "Days the recommended tub actually lasts at this rate.", minimum: 0 },
      costPerDayEurHint: { type: "number", description: "Indicative cost per day in euro.", minimum: 0 },
      cartUrl: { type: "string", format: "uri", description: "Shopify cart permalink for the recommended tub." },
      product: ref("ShopProduct"),
    },
  },
  ShopResponse: {
    type: "object",
    description: "The Coach's sellable catalogue, plus a sized offer when a protein gap or a volume was supplied.",
    required: ["offer", "offers"],
    properties: {
      offer: { description: "The sized offer, or null when no gap was supplied.", oneOf: [ref("ShopOffer"), { type: "null" }] },
      offers: { type: "array", description: "Every sellable tub, in display order.", items: ref("ShopProduct") },
    },
  },
  FoodItem: {
    type: "object",
    description: "One food returned by the FatSecret catalogue.",
    required: ["id", "name"],
    properties: {
      id: { type: "string", description: "FatSecret food identifier." },
      name: { type: "string", description: "Food name." },
      brand: { type: "string", nullable: true, description: "Brand, when the food is a branded product." },
      description: { type: "string", nullable: true, description: "Serving and macronutrient summary as supplied by FatSecret." },
      type: { type: "string", nullable: true, description: "FatSecret food type, e.g. `Generic` or `Brand`." },
    },
  },
  FoodSearchResponse: {
    type: "object",
    required: ["items", "provider"],
    properties: {
      items: { type: "array", items: ref("FoodItem") },
      provider: { type: "string", description: "The catalogue the results came from." },
      retention: { type: "string", description: "What Quota Vita keeps of this search. Nothing." },
    },
  },
  BasketItem: {
    type: "object",
    description: "One line of a weekly shopping basket. Names outside the supported list are ignored.",
    required: ["name", "amount"],
    properties: {
      name: { type: "string", description: "Food name, e.g. `chicken breast`, `oats`, `eggs`.", maxLength: 80 },
      amount: { type: "number", description: "Quantity in the unit the food is measured in.", minimum: 0 },
      unit: { type: "string", description: "`g`, `each`, `slice` or `ml`, matching the food.", enum: ["g", "each", "slice", "ml"] },
    },
  },
  BasketEstimateResponse: {
    type: "object",
    description: "An indicative supermarket cost for a basket. Not a checkout quote.",
    required: ["currency", "total", "items"],
    properties: {
      currency: { type: "string", enum: ["EUR"] },
      source: { type: "string", description: "Where the unit prices came from: live Cala data or the built-in reference table." },
      total: { type: "number", description: "Estimated basket total.", minimum: 0 },
      calaAvailable: { type: "boolean", description: "Whether live Cala prices were reachable for this request." },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "amount", "price"],
          properties: {
            name: { type: "string" },
            amount: { type: "number", minimum: 0 },
            unit: { type: "string" },
            source: { type: "string" },
            price: { type: "number", minimum: 0 },
          },
        },
      },
    },
  },
  NutritionTarget: {
    type: "object",
    description: "A day's energy and macronutrient target. Values outside these bounds are rejected.",
    required: ["calories", "proteinG", "carbohydrateG", "fatG"],
    properties: {
      calories: { type: "number", minimum: 1000, maximum: 6000 },
      proteinG: { type: "number", minimum: 40, maximum: 300 },
      carbohydrateG: { type: "number", minimum: 0, maximum: 1000 },
      fatG: { type: "number", minimum: 20, maximum: 250 },
    },
  },
  Meal: {
    type: "object",
    required: ["slot", "title", "portions", "hint"],
    properties: {
      slot: { type: "string", enum: ["Breakfast", "Lunch", "Dinner"] },
      title: { type: "string", maxLength: 140, description: "The dish, in the requested language." },
      portions: { type: "string", maxLength: 280, description: "Ingredient line with amounts." },
      hint: { type: "string", maxLength: 180, description: "One practical preparation or timing note." },
      catalanName: { type: "string", maxLength: 120, description: "The Catalan name of the dish, when it has one." },
      milkshakeEligible: {
        type: "boolean",
        description: "True for the single meal whose protein component may be swapped for a Batut Quota Vita.",
      },
    },
  },
  DailyMealsResponse: {
    type: "object",
    required: ["meals"],
    properties: {
      meals: { type: "array", minItems: 3, maxItems: 3, items: ref("Meal") },
      calaAvailable: { type: "boolean", description: "Whether Catalan dish context from Cala was used for this generation." },
    },
  },
  ChatMessage: {
    type: "object",
    required: ["role", "text"],
    properties: {
      role: { type: "string", enum: ["user", "assistant"] },
      text: { type: "string", maxLength: 1400 },
    },
  },
  ChatResponse: {
    type: "object",
    required: ["reply"],
    properties: { reply: { type: "string", description: "The Coach's answer, at most about 140 words." } },
  },
  MealImageResponse: {
    type: "object",
    required: ["imageUrl"],
    properties: {
      imageUrl: { type: "string", format: "uri", description: "A generated illustration of the meal, hosted by the image provider." },
    },
  },
  MealPhotoResponse: {
    type: "object",
    required: ["provider", "result"],
    properties: {
      provider: { type: "string", enum: ["LogMeal"] },
      result: { type: "object", additionalProperties: true, description: "The provider's segmentation payload, to be shown as an editable suggestion." },
      retention: { type: "string", description: "What Quota Vita keeps of the photo. Nothing." },
    },
  },
  EmailDeliveryResponse: {
    type: "object",
    required: ["delivered"],
    properties: { delivered: { type: "boolean", enum: [true] } },
  },
};

const PATHS = {
  "/api/health": {
    get: {
      operationId: "getServiceHealth",
      summary: "Check that the Coach API is up",
      description:
        "Call this before a batch of requests, or as a connectivity check from an integration. It takes no parameters, needs no credentials, touches no personal data and is safe to call repeatedly.",
      tags: ["Service"],
      security: [],
      responses: { 200: jsonResponse("The service is up.", ref("Health")), ...pick(405) },
    },
  },
  "/api/shop": {
    get: {
      operationId: "getShopOffers",
      summary: "Get the sellable Quota Vita catalogue and a sized milkshake offer",
      description:
        "Call this to answer 'how much Batut Quota Vita covers this protein gap, which tub should I buy, and what does it cost per day'. Supply `proteinG` or `millilitres` to get a sized `offer`; supply neither to get the catalogue alone. Public, unauthenticated and cacheable for an hour.",
      tags: ["Shop"],
      security: [],
      parameters: [
        {
          name: "proteinG",
          in: "query",
          required: false,
          description: "Grams of protein the milkshake should replace on a single day.",
          schema: { type: "number", minimum: 1, maximum: 300 },
          example: 30,
        },
        {
          name: "millilitres",
          in: "query",
          required: false,
          description: "Prepared milkshake per day in millilitres, when the volume is already known. Overrides `proteinG`.",
          schema: { type: "number", minimum: 100, maximum: 2000 },
        },
        {
          name: "days",
          in: "query",
          required: false,
          description: "The period the tub should cover. Defaults to 28.",
          schema: { type: "integer", minimum: 1, maximum: 120, default: 28 },
        },
        {
          name: "language",
          in: "query",
          required: false,
          description: "Language of the product labels.",
          schema: { type: "string", enum: ["en", "ca"], default: "en" },
        },
        {
          name: "campaign",
          in: "query",
          required: false,
          description: "Attribution campaign written into the checkout link.",
          schema: { type: "string", maxLength: 40 },
        },
      ],
      responses: { 200: jsonResponse("The catalogue, and the sized offer when one was requested.", ref("ShopResponse")), ...pick(405) },
    },
  },
  "/api/foods": {
    get: {
      operationId: "searchFoods",
      summary: "Search the food catalogue",
      description:
        "Look a food up in the FatSecret catalogue to resolve a name a person typed into a catalogue entry. Returns at most eight results and stores nothing. Answers 503 where the FatSecret credentials are not enabled for this deployment.",
      tags: ["Nutrition"],
      security: [],
      parameters: [
        {
          name: "q",
          in: "query",
          required: true,
          description: "The search expression. Between 2 and 100 characters.",
          schema: { type: "string", minLength: 2, maxLength: 100 },
          example: "truita de patates",
        },
        { name: "region", in: "query", required: false, description: "ISO 3166-1 alpha-2 market.", schema: { type: "string", default: "ES" } },
        { name: "language", in: "query", required: false, description: "ISO 639-1 result language.", schema: { type: "string", default: "es" } },
      ],
      responses: { 200: jsonResponse("Matching foods.", ref("FoodSearchResponse")), ...pick(405, 422, 503) },
    },
  },
  "/api/basket-prices": {
    post: {
      operationId: "estimateBasketCost",
      summary: "Estimate what a weekly shopping basket costs",
      description:
        "Turn a list of foods and quantities into an indicative euro cost, using live Cala supermarket data where it is reachable and a built-in reference table otherwise. This is an estimate for planning, not a checkout quote.",
      tags: ["Nutrition"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["items"],
          properties: { items: { type: "array", minItems: 1, maxItems: 40, items: ref("BasketItem") } },
        },
        "The basket to price."
      ),
      responses: { 200: jsonResponse("The estimated cost of the basket.", ref("BasketEstimateResponse")), ...pick(400, 405) },
    },
  },
  "/api/daily-meals": {
    post: {
      operationId: "generateDailyMeals",
      summary: "Generate a day of meals for a nutrition target",
      description:
        "Produce breakfast, lunch and dinner that meet a daily energy and macronutrient target, drawn from Catalan and Mediterranean cooking. Exactly one meal is marked `milkshakeEligible`. General wellbeing guidance only: it is not clinical nutrition and handles no allergy, pregnancy or medical condition.",
      tags: ["Coach"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["target", "activity"],
          properties: {
            target: ref("NutritionTarget"),
            activity: { type: "string", enum: ["rest", "walk", "pilates", "strength", "run"], description: "Today's training." },
            goal: { type: "string", enum: ["lose", "gain", "maintain"], default: "maintain" },
            usualActivity: { type: "string", enum: ["sedentary", "light", "moderate", "high"], default: "light" },
            language: { type: "string", enum: ["en", "ca"], default: "en" },
            variationSeed: { type: "number", description: "Change this to get a materially different menu for the same target." },
          },
        },
        "The target and the day's context."
      ),
      responses: { 200: jsonResponse("Three meals for the day.", ref("DailyMealsResponse")), ...pick(400, 405, 502, 503) },
    },
  },
  "/api/coach-chat": {
    post: {
      operationId: "askCoach",
      summary: "Ask the Quota Vita Coach a nutrition question",
      description:
        "Send the recent turns of a conversation and get the Coach's reply. Scope is general wellbeing and Catalan Mediterranean food: swaps, training fuel, restaurant choices, grocery tips and habit support. It declines clinical questions. At most 12 messages of 1400 characters each are considered.",
      tags: ["Coach"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["messages"],
          properties: {
            messages: { type: "array", minItems: 1, maxItems: 12, items: ref("ChatMessage") },
            language: { type: "string", enum: ["en", "ca"], default: "en" },
          },
        },
        "The conversation so far."
      ),
      responses: { 200: jsonResponse("The Coach's reply.", ref("ChatResponse")), ...pick(400, 405, 502, 503) },
    },
  },
  "/api/meal-image": {
    post: {
      operationId: "generateMealImage",
      summary: "Generate an illustration for a meal",
      description:
        "Produce an editorial food photograph for a meal title, for a plan card. The title is the only input; no personal data is sent to the image provider.",
      tags: ["Coach"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", minLength: 1, maxLength: 180, description: "The meal to illustrate." } },
        },
        "The meal to illustrate."
      ),
      responses: { 200: jsonResponse("A generated image URL.", ref("MealImageResponse")), ...pick(400, 405, 502, 503) },
    },
  },
  "/api/meal-photo": {
    post: {
      operationId: "analyseRestaurantMealPhoto",
      summary: "Turn a photo of a restaurant meal into an editable suggestion",
      description:
        "Send a JPEG, PNG or WebP data URL under 8 MB and get LogMeal's reading of what is on the plate. `logmealConsent` must be true: the caller has to have taken explicit authorisation from the person whose photo it is. The result is a suggestion to edit, never a measurement, and the image is not stored by Quota Vita.",
      tags: ["Coach"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["imageBase64", "logmealConsent"],
          properties: {
            imageBase64: {
              type: "string",
              description: "A `data:image/jpeg;base64,...`, `data:image/png;base64,...` or `data:image/webp;base64,...` URL under 8 MB.",
            },
            logmealConsent: { type: "boolean", enum: [true], description: "Explicit authorisation for third-party photo analysis." },
          },
        },
        "The photo and the consent that permits analysing it."
      ),
      responses: { 200: jsonResponse("The provider's suggestion.", ref("MealPhotoResponse")), ...pick(405, 422, 503) },
    },
  },
  "/api/shopify-email": {
    post: {
      operationId: "emailCoachPlan",
      summary: "Email a weekly plan or shopping basket",
      description:
        "Deliver a prepared plan or basket to an email address through the Quota Vita email service. `marketingConsent` must be true, because the address enters Quota Vita's mailing system. Served only for the Coach's own front end.",
      tags: ["Coach"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["email", "checklist", "marketingConsent"],
          properties: {
            email: { type: "string", format: "email", description: "The recipient." },
            kind: { type: "string", enum: ["plan", "basket"], default: "plan" },
            checklist: { type: "string", maxLength: 45000, description: "The prepared body of the email, as plain text. It is also the text/plain part of the message." },
            sections: {
              description:
                "The same week, structured, so the email can lay it out: an array of days for `plan`, an object with `items` and an optional `estimate` for `basket`. Optional — without it the email is rebuilt from `checklist`.",
              oneOf: [
                {
                  type: "array",
                  maxItems: 14,
                  items: {
                    type: "object",
                    properties: {
                      day: { type: "string" },
                      activity: { type: "string" },
                      meals: {
                        type: "array",
                        maxItems: 8,
                        items: {
                          type: "object",
                          properties: {
                            slot: { type: "string" },
                            title: { type: "string" },
                            portions: { type: "string" },
                            catalanName: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      maxItems: 120,
                      items: { type: "object", properties: { amount: { type: "string" }, name: { type: "string" } } },
                    },
                    estimate: {
                      type: "object",
                      properties: {
                        source: { type: "string" },
                        items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, price: { type: "string" } } } },
                        total: { type: "string" },
                        note: { type: "string" },
                      },
                    },
                  },
                },
              ],
            },
            language: { type: "string", enum: ["en", "ca"], default: "en" },
            marketingConsent: { type: "boolean", enum: [true], description: "Explicit consent from the recipient." },
          },
        },
        "The recipient, the content and the consent."
      ),
      responses: { 200: jsonResponse("The email was accepted for delivery.", ref("EmailDeliveryResponse")), ...pick(403, 405, 422, 502, 503) },
    },
  },
  "/api/events": {
    post: {
      operationId: "recordCoachEvent",
      summary: "Record an anonymous product event",
      description:
        "Count that something happened in the Coach. It carries no name, no email and no nutrition or health value, and it never fails the caller: an unknown event name and a storage outage both answer 204.",
      tags: ["Service"],
      security: [],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "One of the allowed event names. Anything else is discarded.",
              enum: [
                "coach_opened",
                "onboarding_started",
                "onboarding_completed",
                "targets_shown",
                "plan_generated",
                "meal_logged",
                "restaurant_photo_used",
                "weekly_plan_opened",
                "basket_created",
                "basket_emailed",
                "plan_emailed",
                "shop_offer_shown",
                "shop_checkout_opened",
                "returned_day_two",
              ],
            },
            sessionId: { type: "string", maxLength: 64, description: "A random client-generated string. Not a user identifier." },
            language: { type: "string", maxLength: 5 },
            props: {
              type: "object",
              description: "At most 12 scalar counters. Strings are truncated to 64 characters.",
              additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
            },
          },
        },
        "The event to count."
      ),
      responses: { 204: { description: "Recorded, or deliberately discarded. There is no body." }, ...pick(405) },
    },
  },
  "/openapi.json": {
    get: {
      operationId: "getOpenApiDocument",
      summary: "Fetch this OpenAPI document",
      description: "The full contract, as JSON. The same document is served as YAML at /api/openapi.yaml. Take it once and cache it.",
      tags: ["Service"],
      security: [],
      responses: {
        200: jsonResponse("The OpenAPI 3.1 document.", { type: "object", additionalProperties: true }),
        ...pick(405),
      },
    },
  },
};

/** The complete OpenAPI 3.1 document. */
export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE.name} API`,
      version: API_VERSION,
      summary: "Public, read-first HTTP API behind the Quota Vita Nutrition Coach.",
      description:
        "The Quota Vita Nutrition Coach turns a person's profile and today's training into a daily nutrition target, meals that meet it, a weekly plan and a costed shopping basket.\n\nThe read endpoints — `getServiceHealth`, `getShopOffers`, `getOpenApiDocument` — need no credentials and are safe to call repeatedly. The generative endpoints depend on paid third-party providers and answer `503` with `code: service_not_configured` where a provider is not enabled, so an agent can discover availability without a failed attempt.\n\nEvery failure on every route uses one JSON envelope with a stable `code`. Nothing here is medical advice.",
      termsOfService: `${SITE.origin}/about`,
      contact: { name: `${ORGANISATION.name} support`, email: ORGANISATION.email, url: `${SITE.origin}/contact` },
      license: { name: "Proprietary. Free to call within the documented fair use.", url: `${SITE.origin}/developers` },
    },
    servers: [{ url: SITE.origin, description: "Production" }],
    externalDocs: { description: "Developer portal", url: `${SITE.origin}/developers` },
    security: [],
    tags: [
      { name: "Service", description: "Health, discovery and anonymous usage counting." },
      { name: "Shop", description: "What Quota Vita may sell, and how a protein gap becomes a checkout." },
      { name: "Nutrition", description: "Food lookup and basket cost estimation." },
      { name: "Coach", description: "Meal generation, conversation and photo suggestions. General wellbeing only." },
    ],
    paths: PATHS,
    components: { schemas: SCHEMAS, securitySchemes: {} },
  };
}
