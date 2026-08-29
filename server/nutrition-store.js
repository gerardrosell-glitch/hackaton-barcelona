import { supabaseRequest, todayInMadrid } from "./supabase-rest.js";
import { calculateDailyTarget, requiresProfessionalGuidance } from "./nutrition-service.js";

/**
 * server/nutrition-store.js — every read and write of a customer's nutrition
 * record, in one place.
 *
 * Two doors lead here: the Shopify App Proxy, which is trusted because Shopify
 * signed the request, and the Coach's own API, which is trusted because it holds
 * a session token this app minted. They must agree on what consent means and on
 * what a saved profile looks like, so neither owns the SQL.
 */

const encode = (value) => encodeURIComponent(String(value));

export async function activeConsent(customerId) {
  const records = await supabaseRequest(
    `consents?customer_id=eq.${encode(customerId)}&kind=eq.nutrition_coaching&granted_at=not.is.null&revoked_at=is.null&order=granted_at.desc&limit=1`,
  );
  return records[0] ?? null;
}

export async function requireConsent(customerId) {
  if (!await activeConsent(customerId)) throw new Error("Nutrition consent is required before saving data.");
}

export async function getProfile(customerId) {
  const records = await supabaseRequest(`nutrition_profiles?customer_id=eq.${encode(customerId)}&select=*&limit=1`);
  return records[0] ?? null;
}

export async function grantConsent(customerId) {
  await supabaseRequest("consents", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      customer_id: String(customerId),
      kind: "nutrition_coaching",
      policy_version: process.env.NUTRITION_POLICY_VERSION ?? "v1",
      granted_at: new Date().toISOString(),
    }),
  });
}

/**
 * Saving a profile is also the moment consent is recorded, because there is no
 * legitimate way to hold this data without it. A caller that has not passed
 * `consent: true` is refused rather than quietly stored.
 */
export async function saveProfile(customerId, shopDomain, body) {
  if (body?.consent !== true) throw new Error("Explicit nutrition consent is required.");

  const medicalFlags = Array.isArray(body.medicalFlags) ? body.medicalFlags : [];
  const needsProfessionalGuidance = requiresProfessionalGuidance(medicalFlags);
  const target = needsProfessionalGuidance ? null : calculateDailyTarget(body);

  await grantConsent(customerId);
  const records = await supabaseRequest("nutrition_profiles?on_conflict=customer_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      customer_id: String(customerId),
      shop_domain: String(shopDomain ?? ""),
      age: body.age,
      sex: body.sex ?? null,
      height_cm: body.heightCm,
      weight_kg: body.weightKg,
      activity: body.activity,
      goal: body.goal,
      medical_flags: medicalFlags,
      target,
      needs_professional_guidance: needsProfessionalGuidance,
      updated_at: new Date().toISOString(),
    }),
  });

  return { profile: records[0], target, needsProfessionalGuidance };
}

export async function dayTotals(customerId, date = todayInMadrid()) {
  const meals = await supabaseRequest(
    `meal_entries?customer_id=eq.${encode(customerId)}&eaten_on=eq.${encode(date)}&select=calories,protein_g,carbohydrate_g,fat_g,fibre_g`,
  );
  const totals = meals.reduce((sum, item) => ({
    calories: sum.calories + (item.calories ?? 0),
    proteinG: sum.proteinG + (item.protein_g ?? 0),
    carbohydrateG: sum.carbohydrateG + (item.carbohydrate_g ?? 0),
    fatG: sum.fatG + (item.fat_g ?? 0),
    fibreG: sum.fibreG + (item.fibre_g ?? 0),
  }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 });
  return { date, totals, meals: meals.length };
}

export async function addMeal(customerId, body) {
  const records = await supabaseRequest("meal_entries", {
    method: "POST",
    body: JSON.stringify({
      customer_id: String(customerId),
      eaten_on: body.eatenOn ?? todayInMadrid(),
      name: body.name,
      source: body.source ?? "manual",
      calories: body.calories ?? null,
      protein_g: body.proteinG ?? null,
      carbohydrate_g: body.carbohydrateG ?? null,
      fat_g: body.fatG ?? null,
      fibre_g: body.fibreG ?? null,
      confirmed_at: new Date().toISOString(),
    }),
  });
  return records[0];
}

/**
 * Erasure. The meal and activity rows cascade from the profile, so deleting the
 * profile removes the record; the consent rows are kept but marked revoked,
 * because the fact that consent was once given and withdrawn is itself the
 * evidence that the withdrawal was honoured.
 */
export async function eraseCustomer(customerId) {
  await supabaseRequest(`nutrition_profiles?customer_id=eq.${encode(customerId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  await eraseProgress(customerId);
  await supabaseRequest(`consents?customer_id=eq.${encode(customerId)}&revoked_at=is.null`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
}

/** Everything held about one customer, for the export the GDPR requires. */
export async function exportCustomer(customerId) {
  const [profile, consents, meals, activities, progress] = await Promise.all([
    getProfile(customerId),
    supabaseRequest(`consents?customer_id=eq.${encode(customerId)}&select=*`),
    supabaseRequest(`meal_entries?customer_id=eq.${encode(customerId)}&select=*&order=eaten_on.desc`),
    supabaseRequest(`activity_entries?customer_id=eq.${encode(customerId)}&select=*&order=activity_on.desc`),
    getProgress(customerId),
  ]);
  return { profile, consents, meals, activities, progress, exportedAt: new Date().toISOString() };
}

// ── Progress ────────────────────────────────────────────────────────────────
// XP, streak, freezes and badges. Held here so the streak survives a cache
// clear and follows the customer from phone to laptop; a streak that cannot do
// either is not worth showing.

const clampInt = (value, min, max) => {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
};

const isDayKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value));

/**
 * The counters only ever go up, so a merge takes the larger of the two sides
 * and the union of the badges. That is not proof against a hand-written
 * request, and is not meant to be: nothing here is redeemable, and the cost of
 * an inflated streak is smaller than the cost of silently losing a real one
 * when two devices disagree.
 */
export function mergeProgress(stored, incoming) {
  const left = stored ?? {};
  const right = incoming ?? {};

  const days = {};
  for (const source of [left.days, right.days]) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (!isDayKey(key) || !value || typeof value !== "object") continue;
      const existing = days[key] ?? { xp: 0, quests: {}, goal: false };
      days[key] = {
        xp: Math.max(clampInt(existing.xp, 0, 100000), clampInt(value.xp, 0, 100000)),
        quests: { ...existing.quests, ...(value.quests && typeof value.quests === "object" ? value.quests : {}) },
        goal: Boolean(existing.goal || value.goal),
      };
    }
  }
  // The client keeps sixty days; the server has no reason to keep more.
  const keptDays = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-60));

  const badges = [...new Set([
    ...(Array.isArray(left.badges) ? left.badges : []),
    ...(Array.isArray(right.badges) ? right.badges : []),
  ])].filter((id) => typeof id === "string" && /^[a-z0-9-]{1,32}$/.test(id)).slice(0, 64);

  const lastGoalDay = [left.lastGoalDay, right.lastGoalDay].filter(isDayKey).sort().pop() ?? null;
  const streak = Math.max(clampInt(left.streak, 0, 10000), clampInt(right.streak, 0, 10000));

  return {
    xp: Math.max(clampInt(left.xp, 0, 10000000), clampInt(right.xp, 0, 10000000)),
    streak,
    bestStreak: Math.max(clampInt(left.bestStreak, 0, 10000), clampInt(right.bestStreak, 0, 10000), streak),
    freezes: Math.max(clampInt(left.freezes, 0, 2), clampInt(right.freezes, 0, 2)),
    proteinDays: Math.max(clampInt(left.proteinDays, 0, 100000), clampInt(right.proteinDays, 0, 100000)),
    lastGoalDay,
    badges,
    days: keptDays,
  };
}

const rowToProgress = (row) => row && {
  xp: row.xp ?? 0,
  streak: row.streak ?? 0,
  bestStreak: row.best_streak ?? 0,
  freezes: row.freezes ?? 0,
  proteinDays: row.protein_days ?? 0,
  lastGoalDay: row.last_goal_day ?? null,
  badges: row.badges ?? [],
  days: row.days ?? {},
  updatedAt: row.updated_at ?? null,
};

export async function getProgress(customerId) {
  const records = await supabaseRequest(`coach_progress?customer_id=eq.${encode(customerId)}&select=*&limit=1`);
  return rowToProgress(records[0]) ?? null;
}

/** Reads, merges and writes back, so no device can overwrite another's progress. */
export async function saveProgress(customerId, shopDomain, incoming) {
  const merged = mergeProgress(await getProgress(customerId), incoming);
  const records = await supabaseRequest("coach_progress?on_conflict=customer_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      customer_id: String(customerId),
      shop_domain: String(shopDomain ?? ""),
      xp: merged.xp,
      streak: merged.streak,
      best_streak: merged.bestStreak,
      freezes: merged.freezes,
      protein_days: merged.proteinDays,
      last_goal_day: merged.lastGoalDay,
      badges: merged.badges,
      days: merged.days,
      updated_at: new Date().toISOString(),
    }),
  });
  return rowToProgress(records[0]) ?? merged;
}

export async function eraseProgress(customerId) {
  await supabaseRequest(`coach_progress?customer_id=eq.${encode(customerId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}
