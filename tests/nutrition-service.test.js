import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { activityAdjustment, calculateDailyTarget, requiresProfessionalGuidance } from "../server/nutrition-service.js";
import { verifyShopifyProxySignature } from "../server/app-proxy.js";

test("daily target returns usable general-wellbeing estimates", () => {
  const target = calculateDailyTarget({ age: 32, sex: "female", heightCm: 165, weightKg: 65, activity: "moderate", goal: "maintain" });
  assert.equal(target.calories, 2100);
  assert.equal(target.proteinG, 78);
  assert.equal(target.fibreG, 25);
});

test("clinical flags request professional guidance", () => {
  assert.equal(requiresProfessionalGuidance(["diabetes"]), true);
  assert.equal(requiresProfessionalGuidance(["none"]), false);
});

test("competition session adds a conservative refuelling suggestion", () => {
  const adjustment = activityAdjustment({ durationMinutes: 90, intensity: "high", competition: true });
  assert.deepEqual(adjustment, { energyKcal: 800, carbohydrateG: 72, hydrationMl: 700, note: "Use familiar foods and hydration strategies on competition day." });
});

test("app proxy signature must validate before a customer id is trusted", () => {
  const query = { shop: "quota-vita.myshopify.com", logged_in_customer_id: "42", timestamp: "123" };
  const message = "logged_in_customer_id=42shop=quota-vita.myshopify.comtimestamp=123";
  const signature = crypto.createHmac("sha256", "secret").update(message).digest("hex");
  assert.equal(verifyShopifyProxySignature({ ...query, signature }, "secret"), true);
  assert.equal(verifyShopifyProxySignature({ ...query, signature: "not-valid" }, "secret"), false);
});
