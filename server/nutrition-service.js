const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

const RESTRICTED_CARE_FLAGS = new Set([
  "under_18",
  "pregnant",
  "diabetes",
  "kidney_disease",
  "eating_disorder_history",
]);

export function requiresProfessionalGuidance(flags = []) {
  return flags.some((flag) => RESTRICTED_CARE_FLAGS.has(flag));
}

export function calculateDailyTarget(profile) {
  const { age, sex, heightCm, weightKg, activity = "light", goal = "maintain" } = profile;
  if (!Number.isFinite(age) || age < 18 || age > 100) throw new Error("Age must be between 18 and 100.");
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) throw new Error("Height must be between 120 and 230 cm.");
  if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 300) throw new Error("Weight must be between 35 and 300 kg.");
  if (!ACTIVITY_FACTORS[activity]) throw new Error("Unknown activity level.");

  // Mifflin–St Jeor estimate. Sex can be omitted; use a conservative midpoint in that case.
  const sexAdjustment = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexAdjustment;
  const goalAdjustment = goal === "lose" ? -300 : goal === "gain" ? 250 : 0;
  const calories = Math.round((bmr * ACTIVITY_FACTORS[activity] + goalAdjustment) / 25) * 25;
  const proteinPerKg = goal === "lose" ? 1.4 : activity === "high" ? 1.5 : 1.2;
  const proteinG = Math.round(weightKg * proteinPerKg);
  const fatG = Math.round((calories * 0.28) / 9);
  const carbohydrateG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    calories,
    proteinG,
    carbohydrateG,
    fatG,
    fibreG: sex === "male" ? 30 : 25,
    hydrationMl: Math.round(weightKg * 30 / 100) * 100,
    disclaimer: "Estimated general-wellbeing target; it is not medical advice.",
  };
}

export function activityAdjustment({ durationMinutes, intensity = "moderate", competition = false }) {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 600) {
    throw new Error("Duration must be between 0 and 600 minutes.");
  }
  const kcalPerMinute = intensity === "high" ? 9 : intensity === "light" ? 4 : 6;
  const energyKcal = Math.round(durationMinutes * kcalPerMinute / 25) * 25;
  return {
    energyKcal,
    carbohydrateG: durationMinutes >= 60 ? Math.round(durationMinutes * (competition ? 0.8 : 0.5)) : 0,
    hydrationMl: durationMinutes >= 45 ? Math.round(durationMinutes * 8 / 50) * 50 : 0,
    note: competition
      ? "Use familiar foods and hydration strategies on competition day."
      : "This is an optional estimate for a substantial activity session.",
  };
}
