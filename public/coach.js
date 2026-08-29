(() => {
  const root = document.querySelector("#coach");
  const storageKey = "quota-vita-coach-v2";
  const activityLabels = { rest: "Rest day", run: "Run", strength: "Strength", pilates: "Pilates", walk: "Walk" };
  let state;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const readState = () => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } };
  state = readState() || { profile: null, activity: "rest", meals: {} };
  const buttons = (items) => '<div class="options">' + items.map(([label, value]) => '<button class="option" data-choice="' + value + '">' + label + "</button>").join("") + "</div>";
  const stepper = (step) => '<div class="stepper" aria-label="Setup progress">' + [1, 2, 3].map((number) => '<i class="' + (number <= step ? "active" : "") + '"></i>').join("") + "</div>";
  const note = (text, isError = false) => '<p class="status' + (isError ? " error" : "") + '">' + esc(text) + "</p>";

  function dailyTarget(profile, activity) {
    const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[profile.activity];
    const sexAdjustment = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
    const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment;
    const goalAdjustment = profile.goal === "lose" ? -300 : profile.goal === "gain" ? 250 : 0;
    const trainingAdjustment = { rest: 0, walk: 100, pilates: 125, strength: 250, run: 350 }[activity];
    const calories = Math.round((bmr * factor + goalAdjustment + trainingAdjustment) / 25) * 25;
    const proteinG = Math.round(profile.weightKg * (activity === "strength" || profile.goal === "gain" ? 1.6 : profile.goal === "lose" ? 1.4 : 1.2));
    const fatG = Math.round(calories * 0.28 / 9);
    return { calories, proteinG, carbohydrateG: Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4)), fatG, fibreG: profile.sex === "male" ? 30 : 25 };
  }

  function mealPlan(target, activity) {
    const sport = ["run", "strength"].includes(activity);
    const share = [0.27, 0.38, 0.35];
    const foods = sport
      ? [
        ["Breakfast", "Oats with Greek yogurt, banana and berries", "70g oats · 250g Greek yogurt · 1 banana · 100g berries", "Start with carbohydrate and protein before the session."],
        ["Lunch", "Chicken, rice and colourful vegetables", "160g chicken · 100g dry rice · 250g vegetables · 10g olive oil", "Your main recovery meal."],
        ["Dinner", "Lentil bowl with wholegrain bread", "250g cooked lentils · 2 slices wholegrain bread · salad · ½ avocado", "Steady energy and fibre for tomorrow."]
      ]
      : [
        ["Breakfast", "Greek yogurt with oats, fruit and nuts", "250g Greek yogurt · 60g oats · 1 apple · 15g nuts", "Protein, fibre and a satisfying start."],
        ["Lunch", "Chicken, chickpea and vegetable plate", "150g chicken · 160g chickpeas · 250g vegetables · 10g olive oil", "Build the plate around protein and plants."],
        ["Dinner", "Salmon with potatoes and greens", "140g salmon · 300g potatoes · 250g greens · 1 slice wholegrain bread", "A simple balanced evening meal."]
      ];
    return foods.map(([slot, title, portions, hint], index) => ({
      id: slot.toLowerCase(),
      slot, title, portions, hint,
      calories: Math.round(target.calories * share[index] / 25) * 25,
      proteinG: Math.round(target.proteinG * share[index]),
      carbohydrateG: Math.round(target.carbohydrateG * share[index]),
      fatG: Math.round(target.fatG * share[index])
    }));
  }

  function currentPlan() {
    const target = dailyTarget(state.profile, state.activity);
    return { target, meals: mealPlan(target, state.activity) };
  }

  function welcome() {
    root.innerHTML = '<p class="eyebrow">Your daily nutrition coach</p><h1>Eat for the day you actually have.</h1><p class="lead">Build a daily meal plan around your body, goal and training. Start without an account; your plan is only stored on this device when you choose to save it.</p><div class="actions"><button class="button" id="begin">Build my daily plan</button></div><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p>';
    root.querySelector("#begin").onclick = profile;
  }

  function profile(error = "") {
    const existing = state.profile || {};
    root.innerHTML = stepper(1) + '<p class="eyebrow">1 / Your starting point</p><h2>First, a few basics.</h2><p class="lead">These give us a sensible daily calorie and macro estimate.</p><form id="profile-form" class="grid"><label class="field">Age<input name="age" type="number" min="18" max="100" value="' + esc(existing.age || "") + '" required></label><label class="field">Sex<select name="sex"><option value="">Prefer not to say</option><option value="female"' + (existing.sex === "female" ? " selected" : "") + '>Female</option><option value="male"' + (existing.sex === "male" ? " selected" : "") + '>Male</option></select></label><label class="field">Height (cm)<input name="heightCm" type="number" min="120" max="230" value="' + esc(existing.heightCm || "") + '" required></label><label class="field">Weight (kg)<input name="weightKg" type="number" min="35" max="300" step=".1" value="' + esc(existing.weightKg || "") + '" required></label><label class="field">Usual sport level<select name="activity"><option value="sedentary">Mostly sitting</option><option value="light"' + (!existing.activity || existing.activity === "light" ? " selected" : "") + '>Lightly active</option><option value="moderate"' + (existing.activity === "moderate" ? " selected" : "") + '>Regular training</option><option value="high"' + (existing.activity === "high" ? " selected" : "") + '>Frequent training</option></select></label><label class="field">Goal<select name="goal"><option value="lose"' + (existing.goal === "lose" ? " selected" : "") + '>Lose fat</option><option value="gain"' + (existing.goal === "gain" ? " selected" : "") + '>Gain muscle</option><option value="maintain"' + (!existing.goal || existing.goal === "maintain" ? " selected" : "") + '>Maintain</option></select></label><label class="field full"><input name="deviceConsent" type="checkbox" required> Store this plan privately on this device. You can delete it any time.</label><div class="actions"><button class="button">Continue</button><button class="button quiet" type="button" id="cancel">Cancel</button></div></form>' + error;
    root.querySelector("#cancel").onclick = welcome;
    root.querySelector("#profile-form").onsubmit = (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      state = {
        profile: { age: Number(values.get("age")), sex: values.get("sex"), heightCm: Number(values.get("heightCm")), weightKg: Number(values.get("weightKg")), activity: values.get("activity"), goal: values.get("goal") },
        activity: state.activity || "rest",
        meals: {}
      };
      save();
      training();
    };
  }

  function training() {
    root.innerHTML = stepper(2) + '<p class="eyebrow">2 / Today’s movement</p><h2>Are you going to train today?</h2><p class="lead">Choose what best describes today. We will adjust the meal plan, carbohydrate guidance and food quantities.</p>' + buttons([["Rest or recovery day", "rest"], ["Walk", "walk"], ["Pilates", "pilates"], ["Strength training", "strength"], ["Run", "run"]]) + '<button class="button quiet" id="back">Back</button>';
    root.querySelector("#back").onclick = profile;
    root.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => { state.activity = button.dataset.choice; state.meals = {}; save(); dashboard(); });
  }

  function totals(plan) {
    const eaten = Object.entries(state.meals).filter(([, item]) => item.status === "eaten" || item.status === "restaurant").map(([id]) => plan.meals.find((meal) => meal.id === id)).filter(Boolean);
    return eaten.reduce((sum, meal) => ({ calories: sum.calories + meal.calories, proteinG: sum.proteinG + meal.proteinG, carbohydrateG: sum.carbohydrateG + meal.carbohydrateG, fatG: sum.fatG + meal.fatG }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 });
  }

  function dashboard() {
    const plan = currentPlan();
    const eaten = totals(plan);
    const left = { calories: Math.max(0, plan.target.calories - eaten.calories), proteinG: Math.max(0, plan.target.proteinG - eaten.proteinG), carbohydrateG: Math.max(0, plan.target.carbohydrateG - eaten.carbohydrateG) };
    root.innerHTML = stepper(3) + '<p class="eyebrow">3 / Your daily plan</p><h2>' + esc(activityLabels[state.activity]) + ' meal plan.</h2><p class="lead">' + (state.activity === "run" ? "Add familiar carbohydrates and fluids around your run." : state.activity === "strength" ? "Spread protein across the day and include carbohydrates around training." : "A balanced plan for steady energy, protein and fibre.") + '</p><div class="day"><aside class="ledger"><span>Still to eat</span><b>' + left.calories.toLocaleString() + '</b><span>kcal remaining</span><hr><span>' + left.proteinG + 'g protein · ' + left.carbohydrateG + 'g carbs remaining</span></aside><section class="meal-list">' + plan.meals.map((meal) => mealCard(meal)).join("") + '</section></div><div class="actions"><button class="button" id="basket">My buying basket</button><button class="button quiet" id="change-training">Change training</button><a class="button quiet" href="/account">Sign in to save securely</a></div><p class="privacy">This anonymous plan is stored only in this browser. Sign in and give explicit consent before a plan is saved to your account.</p>';
    root.querySelector("#basket").onclick = basket;
    root.querySelector("#change-training").onclick = training;
    root.querySelectorAll("[data-meal]").forEach((button) => button.onclick = () => checkIn(button.dataset.meal));
  }

  function mealCard(meal) {
    const saved = state.meals[meal.id];
    const status = saved?.status;
    const label = status === "restaurant" ? "Restaurant meal logged" : status === "eaten" ? "Logged" : "Daily proposal";
    return '<article class="meal ' + (status || "") + '"><div class="meal-header"><div><p class="eyebrow">' + esc(meal.slot) + "</p><h3>" + esc(meal.title) + '</h3></div><span class="meta">' + meal.calories + " kcal<br>" + meal.proteinG + "g protein</span></div><p>" + esc(meal.portions) + '</p><p class="meta">' + esc(meal.hint) + '</p><div class="actions"><button class="button quiet" data-meal="' + esc(meal.id) + '">' + label + "</button></div></article>";
  }

  function checkIn(id, message = "") {
    const plan = currentPlan(); const meal = plan.meals.find((item) => item.id === id);
    root.innerHTML = `<p class="eyebrow">Daily check-in</p><h2>${esc(meal.slot)} check-in.</h2><p class="lead">${esc(meal.title)}</p><div class="actions"><button class="button" id="eaten">I ate this proposal</button><button class="button quiet" id="restaurant">I ate at a restaurant</button><button class="button quiet" id="skip">I skipped it</button></div>${message}<button class="button quiet" id="back">Back to plan</button>`;
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#eaten").onclick = () => { state.meals[id] = { status: "eaten" }; save(); dashboard(); };
    root.querySelector("#skip").onclick = () => { state.meals[id] = { status: "skipped" }; save(); dashboard(); };
    root.querySelector("#restaurant").onclick = () => restaurant(id, meal);
  }

  function restaurant(id, meal) {
    root.innerHTML = '<p class="eyebrow">Restaurant meal</p><h2>Scan the meal, then adapt the day.</h2><p class="lead">Upload a clear photo of the plate. We will estimate it and recalculate the remaining proposed meals. Photo processing only turns on after our EU data-processing agreement is approved.</p><input id="photo" type="file" accept="image/jpeg,image/png,image/webp"><div class="actions"><button class="button" id="scan">Scan meal</button><button class="button quiet" id="manual">Mark as restaurant meal without scanning</button></div><div id="feedback"></div><button class="button quiet" id="back">Back</button>';
    root.querySelector("#back").onclick = () => checkIn(id);
    root.querySelector("#manual").onclick = () => { state.meals[id] = { status: "restaurant" }; save(); dashboard(); };
    root.querySelector("#scan").onclick = async () => {
      const file = root.querySelector("#photo").files[0]; const feedback = root.querySelector("#feedback");
      if (!file) return feedback.innerHTML = note("Choose a JPEG, PNG, or WebP photo first.", true);
      if (file.size > 8 * 1024 * 1024) return feedback.innerHTML = note("Choose a photo smaller than 8 MB.", true);
      feedback.innerHTML = note("Checking photo-analysis availability…");
      try {
        const imageBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        const response = await fetch("/api/meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64 }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.meals[id] = { status: "restaurant", analysis: "scanned" }; save();
        feedback.innerHTML = note("Meal estimate received. Your remaining plan has been adjusted.");
        setTimeout(dashboard, 900);
      } catch (error) { feedback.innerHTML = note(error.message || "Photo analysis is unavailable.", true); }
    };
  }

  function basket() {
    const plan = currentPlan(); const scale = plan.target.calories / 2000; const round = (grams) => Math.round(grams * scale / 5) * 5;
    const sport = ["run", "strength"].includes(state.activity);
    const items = sport
      ? [[round(250), "Greek yogurt"], [round(70), "oats"], [1, "banana"], [round(100), "berries"], [round(160), "chicken"], [round(100), "dry rice"], [round(250), "cooked lentils"], [round(500), "vegetables and salad"], [round(30), "olive oil"], [round(100), "wholegrain bread"]]
      : [[round(250), "Greek yogurt"], [round(60), "oats"], [1, "apple"], [round(15), "nuts"], [round(150), "chicken"], [round(160), "cooked chickpeas"], [round(140), "salmon"], [round(300), "potatoes"], [round(500), "vegetables and salad"], [round(10), "olive oil"], [round(50), "wholegrain bread"]];
    root.innerHTML = '<p class="eyebrow">Your one-day basket</p><h2>Buy what today’s plan needs.</h2><p class="lead">Quantities are for one person and this specific plan. Check labels for allergens and adjust for household portions.</p><ul class="basket">' + items.map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(name) + "</li>").join("") + '</ul><div class="actions"><button class="button" id="back">Back to daily plan</button><button class="button quiet" id="clear">Delete this device plan</button></div>';
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = () => { localStorage.removeItem(storageKey); state = { profile: null, activity: "rest", meals: {} }; welcome(); };
  }

  if (state.profile) dashboard(); else welcome();
})();
