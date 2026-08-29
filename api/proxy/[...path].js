import { verifyShopifyProxySignature } from "../../server/app-proxy.js";
import { activityAdjustment, calculateDailyTarget, requiresProfessionalGuidance } from "../../server/nutrition-service.js";
import { supabaseRequest, todayInMadrid } from "../../server/supabase-rest.js";

const json = (response, status, body) => response.status(status).json(body);
const parseBody = (request) => typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
const allowedRoutes = new Set(["profile", "day", "meals", "activity", "shopping-list", "meal-photo"]);

function proxyIdentity(request) {
  if (!verifyShopifyProxySignature(request.query, process.env.SHOPIFY_APP_PROXY_SECRET)) {
    throw new Error("Invalid Shopify App Proxy signature.");
  }
  const customerId = request.query.logged_in_customer_id;
  if (!customerId) throw new Error("Sign in to your Quota Vita account to use Nutrition Coach.");
  return { customerId: String(customerId), shop: String(request.query.shop) };
}

async function activeConsent(customerId) {
  const records = await supabaseRequest(`consents?customer_id=eq.${encodeURIComponent(customerId)}&kind=eq.nutrition_coaching&granted_at=not.is.null&order=granted_at.desc&limit=1`);
  return records[0] ?? null;
}

async function requireConsent(customerId) {
  if (!await activeConsent(customerId)) throw new Error("Nutrition consent is required before saving data.");
}

async function profile(customerId) {
  const records = await supabaseRequest(`nutrition_profiles?customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`);
  return records[0] ?? null;
}

export default async function handler(request, response) {
  try {
    const route = Array.isArray(request.query.path) ? request.query.path[0] : request.query.path;
    if (!allowedRoutes.has(route)) return json(response, 404, { error: "Route not found." });
    const { customerId, shop } = proxyIdentity(request);
    const body = parseBody(request);

    if (route === "profile" && request.method === "GET") return json(response, 200, { profile: await profile(customerId) });

    if (route === "profile" && request.method === "POST") {
      if (body.consent !== true) return json(response, 422, { error: "Explicit nutrition consent is required." });
      const flags = Array.isArray(body.medicalFlags) ? body.medicalFlags : [];
      const needsProfessionalGuidance = requiresProfessionalGuidance(flags);
      const target = needsProfessionalGuidance ? null : calculateDailyTarget(body);
      await supabaseRequest("consents", {
        method: "POST",
        body: JSON.stringify({ customer_id: customerId, kind: "nutrition_coaching", policy_version: process.env.NUTRITION_POLICY_VERSION ?? "v1", granted_at: new Date().toISOString() }),
      });
      const records = await supabaseRequest("nutrition_profiles?on_conflict=customer_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ customer_id: customerId, shop_domain: shop, age: body.age, sex: body.sex ?? null, height_cm: body.heightCm, weight_kg: body.weightKg, activity: body.activity, goal: body.goal, medical_flags: flags, target, needs_professional_guidance: needsProfessionalGuidance, updated_at: new Date().toISOString() }),
      });
      return json(response, 200, { profile: records[0], target, needsProfessionalGuidance });
    }

    if (route === "profile" && request.method === "DELETE") {
      await supabaseRequest(`nutrition_profiles?customer_id=eq.${encodeURIComponent(customerId)}`, { method: "DELETE", prefer: "return=minimal" });
      return response.status(204).end();
    }

    await requireConsent(customerId);
    if (route === "day" && request.method === "GET") {
      const day = String(request.query.date ?? todayInMadrid());
      const meals = await supabaseRequest(`meal_entries?customer_id=eq.${encodeURIComponent(customerId)}&eaten_on=eq.${day}&select=calories,protein_g,carbohydrate_g,fat_g,fibre_g`);
      const totals = meals.reduce((sum, item) => ({ calories: sum.calories + (item.calories ?? 0), proteinG: sum.proteinG + (item.protein_g ?? 0), carbohydrateG: sum.carbohydrateG + (item.carbohydrate_g ?? 0), fatG: sum.fatG + (item.fat_g ?? 0), fibreG: sum.fibreG + (item.fibre_g ?? 0) }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 });
      return json(response, 200, { date: day, totals, profile: await profile(customerId) });
    }

    if (route === "meals" && request.method === "POST") {
      const entry = await supabaseRequest("meal_entries", { method: "POST", body: JSON.stringify({ customer_id: customerId, eaten_on: body.eatenOn ?? todayInMadrid(), name: body.name, source: body.source ?? "manual", calories: body.calories ?? null, protein_g: body.proteinG ?? null, carbohydrate_g: body.carbohydrateG ?? null, fat_g: body.fatG ?? null, fibre_g: body.fibreG ?? null, confirmed_at: new Date().toISOString() }) });
      return json(response, 201, { meal: entry[0] });
    }

    if (route === "activity" && request.method === "POST") {
      const adjustment = activityAdjustment(body);
      const records = await supabaseRequest("activity_entries", { method: "POST", body: JSON.stringify({ customer_id: customerId, activity_on: body.activityOn ?? todayInMadrid(), duration_minutes: body.durationMinutes, intensity: body.intensity, competition: Boolean(body.competition), adjustment }) });
      return json(response, 201, { activity: records[0], adjustment });
    }

    if (route === "shopping-list" && request.method === "GET") {
      return json(response, 200, { items: ["Chickpeas", "Greek yogurt or skyr", "Cherry tomatoes", "Wholegrain bread", "Hummus"], note: "Generated from your estimated gaps; always check labels for allergens." });
    }

    if (route === "meal-photo" && request.method === "POST") {
      return json(response, 501, { error: "Restaurant photo analysis is not enabled until the EU provider DPA and retention terms are configured." });
    }

    return json(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = /signature|Sign in|consent/i.test(error.message) ? 401 : /Age|Height|Weight|Unknown activity|Duration/.test(error.message) ? 422 : 500;
    return json(response, status, { error: status === 500 ? "Unable to process the request." : error.message });
  }
}
