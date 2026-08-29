(() => {
  const root = document.querySelector("#coach");
  const storageKey = "quota-vita-coach-v2";
  const activityLabels = { rest: "Rest day", run: "Run", strength: "Strength", pilates: "Pilates", walk: "Walk" };
  let state;
  let cameraStream;
  let capturedMealImage;
  let language = localStorage.getItem("quota-vita-coach-language") || "en";
  const chatStyle = document.createElement("style");
  chatStyle.textContent = ".coach-workspace{position:relative;isolation:isolate;min-height:760px;overflow:hidden;border-radius:26px;padding:clamp(24px,4vw,48px) clamp(18px,7vw,96px);background:#1d6254;color:#fff}.coach-workspace::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(9,46,39,.9),rgba(20,91,77,.72) 48%,rgba(255,106,70,.58))}.coach-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.coach-workspace .stepper{margin:0 auto 20px;max-width:760px}.coach-workspace .eyebrow,.coach-workspace .lead{color:#fff}.coach-workspace h2{max-width:760px;margin:0 auto 5px;color:#fff;font-size:clamp(2rem,4vw,3.5rem);line-height:1.02;text-align:left}.coach-workspace>.eyebrow,.coach-workspace>.lead{max-width:760px;margin-left:auto;margin-right:auto;text-align:left}.coach-workspace>.lead{margin-top:0;margin-bottom:22px;font-size:1rem}.chat{max-width:760px;min-height:440px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.35);border-radius:24px;background:rgba(8,43,36,.44);display:grid;align-content:start;gap:13px;backdrop-filter:blur(10px)}.bubble{max-width:78%;padding:14px 17px;border-radius:19px;line-height:1.45;box-shadow:0 10px 24px rgba(4,37,31,.14)}.bubble.coach{justify-self:start;background:rgba(255,255,255,.97);color:#173e36;border-bottom-left-radius:5px}.bubble.user{justify-self:end;background:#123e35;color:#fff;border:1px solid rgba(255,255,255,.35);border-bottom-right-radius:5px}.bubble .meta{display:block;margin-top:6px;color:#55736d;font-size:.9em}.coach-intro{font-size:1.04rem}.composer{width:100%;box-sizing:border-box;margin:8px 0 0;padding:11px;border:1px solid rgba(255,255,255,.8);border-radius:22px;background:rgba(255,255,255,.98);box-shadow:0 18px 42px rgba(4,37,31,.2)}.composer-label{display:block;padding:2px 7px 9px;color:#41675f;font-weight:700;font-size:.88rem}.quick-replies{display:flex;flex-wrap:wrap;gap:8px}.quick-replies button{border:1px solid #8fb9ab;border-radius:999px;background:#f6fbf8;color:#173e36;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}.quick-replies button:hover{background:#dceee6}.chat-input{display:flex;gap:8px}.chat-input input{min-width:0;flex:1;border:0;background:transparent;padding:12px 10px;color:#173e36;font:inherit;font-size:1rem;outline:none}.chat-input .button{border-radius:15px}.chat-cancel{display:block;margin:16px auto 0;background:transparent!important;border-color:rgba(255,255,255,.8)!important;color:#fff!important}.coach-workspace .privacy{margin:16px auto 0;color:#fff;text-align:center}.coach-workspace .actions{justify-content:center}@media(max-width:600px){.coach-workspace{min-height:680px;border-radius:0;padding:28px 16px}.coach-workspace h2{font-size:2.25rem}.chat{min-height:455px;padding:13px}.bubble{max-width:92%}.chat-input .button{padding:11px 14px}}";
  document.head.append(chatStyle);
  const conversationOverflowStyle = document.createElement("style");
  conversationOverflowStyle.textContent = ".coach-workspace{overflow:visible!important}.chat-page{max-width:760px;margin:0 auto}.chat-page .bubble{max-width:100%;box-sizing:border-box}.chat-page .day{display:grid;gap:16px}.chat-page .meal-list{display:grid;gap:14px}.meal-image{width:100%;height:190px;object-fit:cover;border-radius:12px;margin:0 0 12px}.weekly-grid{display:grid;gap:12px}.week-day{padding:14px;border:1px solid #c9d7c7;border-radius:12px;background:#f7fbf8}.week-day h3{margin:0 0 6px}.chat-page .privacy{color:#55736d;text-align:left}";
  document.head.append(conversationOverflowStyle);

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const readState = () => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } };
  state = readState() || { profile: null, activity: "rest", meals: {} };
  const buttons = (items) => '<div class="options">' + items.map(([label, value]) => '<button class="option" data-choice="' + value + '">' + label + "</button>").join("") + "</div>";
  const stepper = (step) => '<div class="stepper" aria-label="Setup progress">' + [1, 2, 3].map((number) => '<i class="' + (number <= step ? "active" : "") + '"></i>').join("") + "</div>";
  const note = (text, isError = false) => '<p class="status' + (isError ? " error" : "") + '">' + esc(text) + "</p>";
  const catalan = {
    "Your daily nutrition coach": "El teu coach nutricional diari",
    "Eat for the day you actually have.": "Menja d'acord amb el dia que tens.",
    "Build a daily meal plan around your body, goal and training. Start without an account; your plan is only stored on this device when you choose to save it.": "Crea un pla d'àpats diari segons el teu cos, objectiu i entrenament. Pots començar sense compte; el pla només es desa en aquest dispositiu si ho decideixes.",
    "Build my daily plan": "Crea el meu pla diari",
    "Build my daily nutrition plan": "Crea el meu pla nutricional diari",
    "Start": "Comença",
    "General wellbeing guidance only. It does not provide medical advice.": "Orientació només per al benestar general. No ofereix assessorament mèdic.",
    "Your Coach": "El teu coach",
    "Let’s build today’s plan.": "Creem el pla d'avui.",
    "Let’s build your daily meal plan.": "Creem el teu pla d’àpats diari.",
    "I will ask one thing at a time. You can restart whenever you want.": "Et faré una pregunta cada vegada. Pots començar de nou quan vulguis.",
    "Hi, I’m your Quota Vita Coach. I’ll make a practical meal plan around you—not a generic diet.": "Hola, sóc el teu Coach de Quota Vita. Et prepararé un pla d’àpats pràctic per a tu, no una dieta genèrica.",
    "One question at a time. Your plan adapts to the day you actually have.": "Una pregunta cada vegada. El pla s’adapta al dia que tens de veritat.",
    "I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.": "Et crearé les calories i els macronutrients d’avui, tres idees d’àpats i una cistella de compra exacta per a un dia.",
    "Personal calories and macros, three meals and a one-day shopping basket.": "Calories i macronutrients personalitzats, tres àpats i una cistella de compra per a un dia.",
    "Hi, I’m your Quota Vita Coach. I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.": "Hola, soc el teu Coach de Quota Vita. Et crearé les calories i els macronutrients d’avui, tres idees d’àpats i una cistella de compra exacta per a un dia.",
    "I’ll tailor it to your body, usual activity, goal and today’s training—not give you a generic diet.": "L’adaptaré al teu cos, activitat habitual, objectiu i entrenament d’avui; no serà una dieta genèrica.",
    "Mostly sitting = little planned movement. Lightly active = walking or light exercise 1–2 days/week. Regular training = exercise 3–4 days/week. Frequent training = demanding exercise 5+ days/week.": "Principalment assegut = poc moviment planificat. Activitat lleugera = caminar o exercici suau 1–2 dies per setmana. Entrenament regular = exercici 3–4 dies per setmana. Entrenament freqüent = exercici exigent 5 o més dies per setmana.",
    "Lose fat = a gentle calorie reduction. Gain muscle = a small calorie increase and more protein. Maintain = steady energy and weight. These are general-wellbeing estimates, not clinical advice.": "Perdre greix = una reducció calòrica moderada. Guanyar múscul = un petit augment de calories i més proteïna. Mantenir = energia i pes estables. Són estimacions de benestar general, no assessorament clínic.",
    "How old are you?": "Quants anys tens?",
    "For adults aged 18 to 100.": "Per a adults de 18 a 100 anys.",
    "What is your height in centimetres?": "Quina alçada tens en centímetres?",
    "For example, 175.": "Per exemple, 175.",
    "What is your weight in kilograms?": "Quin pes tens en quilograms?",
    "This lets us estimate protein and energy needs.": "Això ens permet estimar les necessitats de proteïna i energia.",
    "Which option should we use for the energy estimate?": "Quina opció hem d'utilitzar per a l'estimació energètica?",
    "You can choose “prefer not to say”; we will use a midpoint estimate.": "Pots triar «prefereixo no dir-ho»; farem servir una estimació intermèdia.",
    "Female": "Dona", "Male": "Home", "Prefer not to say": "Prefereixo no dir-ho",
    "What does a usual week look like?": "Com és una setmana habitual per a tu?",
    "This is your normal week, not today: mostly sitting, light movement, regular training, or frequent training.": "És la teva setmana habitual, no només avui: principalment assegut, moviment lleuger, entrenament regular o entrenament freqüent.",
    "Mostly sitting": "Principalment assegut", "Lightly active": "Activitat lleugera", "Regular training": "Entrenament regular", "Frequent training": "Entrenament freqüent",
    "What would you like to work toward?": "Quin objectiu vols treballar?",
    "This applies only a gentle starting calorie adjustment. It is not a clinical prescription.": "Això només aplica un ajust calòric inicial moderat. No és una prescripció clínica.",
    "Lose fat": "Perdre greix", "Gain muscle": "Guanyar múscul", "Maintain": "Mantenir",
    "Send": "Envia", "Cancel": "Cancel·la", "Choose one reply": "Tria una resposta", "Type your answer…": "Escriu la resposta…", "Cancel and restart": "Cancel·la i torna a començar",
    "I have what I need. Would you like to keep this plan on this device?": "Ja tinc el que necessito. Vols conservar aquest pla en aquest dispositiu?",
    "It stays in this browser and can be deleted with Start over. Nothing is saved to an account.": "Es queda en aquest navegador i es pot eliminar amb «Comença de nou». No es desa en cap compte.",
    "Create and save my plan": "Crea i desa el meu pla", "Create a one-time plan": "Crea un pla puntual",
    "Today’s movement": "Moviment d'avui", "Are you going to train today?": "Entrenaràs avui?",
    "Choose what best describes today. We will adjust the meal plan, carbohydrate guidance and food quantities.": "Tria l'opció que descriu millor el dia d'avui. Ajustarem el pla d'àpats, la pauta d'hidrats de carboni i les quantitats.",
    "Rest or recovery day": "Dia de descans o recuperació", "Walk": "Caminar", "Pilates": "Pilates", "Strength training": "Entrenament de força", "Run": "Córrer", "Back": "Enrere",
    "Your daily plan": "El teu pla diari", "Still to eat": "Encara per menjar", "kcal remaining": "kcal pendents",
    "Download meal plan PDF": "Descarrega el PDF del pla", "My buying basket": "La meva cistella", "Change training": "Canvia l'entrenament", "Start over": "Comença de nou",
    "Sign in to your Quota Vita account": "Inicia sessió al teu compte de Quota Vita",
    "Your one-day basket": "La teva cistella d'un dia", "Buy what today’s plan needs.": "Compra el que necessita el pla d'avui.",
    "Quantities are for one person and this specific plan. Check labels for allergens and adjust for household portions.": "Les quantitats són per a una persona i per a aquest pla concret. Revisa les etiquetes d'al·lèrgens i ajusta-les a les porcions de casa.",
    "Download basket PDF": "Descarrega el PDF de la cistella", "Delete this device plan": "Elimina el pla d'aquest dispositiu",
    "Restaurant meal": "Àpat de restaurant", "Scan the meal, then adapt the day.": "Escaneja l'àpat i adapta la resta del dia.",
    "Take photo": "Fes una foto", "Choose photo": "Tria una foto", "Scan meal": "Escaneja l'àpat", "Mark as restaurant meal without scanning": "Marca com a àpat de restaurant sense escanejar",
    "How this plan is calculated": "Com es calcula aquest pla"
  };
  const translate = () => {
    if (language !== "ca") return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("[data-language-control]")) continue;
      const text = node.nodeValue.trim();
      if (catalan[text]) node.nodeValue = node.nodeValue.replace(text, catalan[text]);
    }
  };
  const languageControl = document.createElement("span");
  languageControl.dataset.languageControl = "true";
  languageControl.innerHTML = '<button type="button" data-language="en">EN</button> · <button type="button" data-language="ca">CA</button>';
  document.querySelector(".masthead").append(languageControl);
  languageControl.querySelectorAll("[data-language]").forEach((button) => button.onclick = () => { language = button.dataset.language; localStorage.setItem("quota-vita-coach-language", language); location.reload(); });
  new MutationObserver(() => translate()).observe(root, { childList: true, subtree: true });

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
    profile();
  }

  function profile() {
    const answers = { ...(state.profile || {}) };
    const questions = [
      { key: "age", label: "How old are you?", hint: "For adults aged 18 to 100.", type: "number", min: 18, max: 100 },
      { key: "heightCm", label: "What is your height in centimetres?", hint: "For example, 175.", type: "number", min: 120, max: 230 },
      { key: "weightKg", label: "What is your weight in kilograms?", hint: "This lets us estimate protein and energy needs.", type: "number", min: 35, max: 300, step: "0.1" },
      { key: "sex", label: "Which option should we use for the energy estimate?", hint: "You can choose “prefer not to say”; we will use a midpoint estimate.", choices: [["Female", "female"], ["Male", "male"], ["Prefer not to say", ""]] },
      { key: "activity", label: "What does a usual week look like?", hint: "Mostly sitting = little planned movement. Lightly active = walking or light exercise 1–2 days/week. Regular training = exercise 3–4 days/week. Frequent training = demanding exercise 5+ days/week.", choices: [["Mostly sitting", "sedentary"], ["Lightly active", "light"], ["Regular training", "moderate"], ["Frequent training", "high"]] },
      { key: "goal", label: "What would you like to work toward?", hint: "Lose fat = a gentle calorie reduction. Gain muscle = a small calorie increase and more protein. Maintain = steady energy and weight. These are general-wellbeing estimates, not clinical advice.", choices: [["Lose fat", "lose"], ["Gain muscle", "gain"], ["Maintain", "maintain"]] }
    ];
    let index = 0;
    const history = () => questions.slice(0, index).map((question) => '<div class="bubble coach">' + esc(question.label) + '<span class="meta">' + esc(question.hint) + '</span></div><div class="bubble user">' + esc(question.choices ? question.choices.find((item) => item[1] === answers[question.key])?.[0] || "Prefer not to say" : answers[question.key]) + "</div>").join("");
    const render = () => {
      const question = questions[index];
      const input = question.choices
        ? '<div class="composer"><span class="composer-label">Choose one reply</span><div class="quick-replies">' + question.choices.map(([label, value]) => '<button data-answer="' + esc(value) + '">' + esc(label) + "</button>").join("") + "</div></div>"
        : '<form class="composer chat-input" id="chat-form"><input id="chat-answer" aria-label="' + esc(question.label) + '" placeholder="' + (language === "ca" ? "Escriu la resposta…" : "Type your answer…") + '" type="number" min="' + question.min + '" max="' + question.max + '" step="' + (question.step || 1) + '" value="' + esc(answers[question.key] || "") + '" autofocus><button class="button" type="submit">Send</button></form>';
      const intro = index === 0 ? '<div class="bubble coach coach-intro">Hi, I’m your Quota Vita Coach. I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.<span class="meta">I’ll tailor it to your body, usual activity, goal and today’s training—not give you a generic diet.</span></div>' : "";
      root.innerHTML = '<section class="coach-workspace"><video class="coach-video" autoplay muted loop playsinline aria-hidden="true"><source src="https://cdn.shopify.com/videos/c/o/v/d73f2a51730245db9f2b5066a1638686.mp4" type="video/mp4"></video>' + stepper(1) + '<p class="eyebrow">Your Coach</p><h2>Let’s build your daily meal plan.</h2><p class="lead">Personal calories and macros, three meals and a one-day shopping basket.</p><section class="chat" aria-live="polite">' + intro + history() + `<div class="bubble coach">${esc(question.label)}<span class="meta">${esc(question.hint)}</span></div>` + input + '</section><button class="button quiet chat-cancel" id="cancel">Cancel and restart</button><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p></section>';
      root.querySelector("#cancel").onclick = welcome;
      root.querySelectorAll("[data-answer]").forEach((button) => button.onclick = () => advance(button.dataset.answer));
      document.onkeydown = (event) => {
        if (event.target.matches("input,textarea")) return;
        const choice = Number(event.key) - 1;
        const choices = [...root.querySelectorAll("[data-answer]")];
        if (choice >= 0 && choice < choices.length) { event.preventDefault(); advance(choices[choice].dataset.answer); }
      };
      const form = root.querySelector("#chat-form");
      if (form) form.onsubmit = (event) => { event.preventDefault(); advance(root.querySelector("#chat-answer").value); };
      requestAnimationFrame(() => {
        root.querySelector(".composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
        root.querySelector("#chat-answer")?.focus({ preventScroll: true });
      });
    };
    const advance = (value) => {
      const question = questions[index];
      if (!question.choices && (!Number.isFinite(Number(value)) || Number(value) < question.min || Number(value) > question.max)) return render();
      answers[question.key] = question.choices ? value : Number(value);
      index += 1;
      if (index < questions.length) return render();
      state = { profile: answers, activity: "rest", meals: {} };
      save();
      training();
    };
    render();
  }

  function coachShell(title, lead, content) {
    return '<section class="coach-workspace"><video class="coach-video" autoplay muted loop playsinline aria-hidden="true"><source src="https://cdn.shopify.com/videos/c/o/v/d73f2a51730245db9f2b5066a1638686.mp4" type="video/mp4"></video><p class="eyebrow">Your Coach</p><h2>' + esc(title) + '</h2><p class="lead">' + esc(lead) + '</p><section class="chat chat-page" aria-live="polite">' + content + '</section></section>';
  }

  function training() {
    root.innerHTML = coachShell("Are you going to train today?", "Your meals and quantities will adapt to today’s movement.", '<div class="bubble coach">Choose what best describes today. We will adjust the meal plan, carbohydrate guidance and food quantities.</div>' + buttons([["Rest or recovery day", "rest"], ["Walk", "walk"], ["Pilates", "pilates"], ["Strength training", "strength"], ["Run", "run"]]) + '<button class="button quiet" id="back">Back</button>');
    root.querySelector("#back").onclick = profile;
    root.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => { state.activity = button.dataset.choice; state.meals = {}; save(); dashboard(); });
  }

  function totals(plan) {
    const eaten = Object.entries(state.meals).filter(([, item]) => item.status === "eaten" || item.status === "restaurant").map(([id]) => plan.meals.find((meal) => meal.id === id)).filter(Boolean);
    return eaten.reduce((sum, meal) => ({ calories: sum.calories + meal.calories, proteinG: sum.proteinG + meal.proteinG, carbohydrateG: sum.carbohydrateG + meal.carbohydrateG, fatG: sum.fatG + meal.fatG }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 });
  }

  function methodology() {
    return '<details class="method"><summary>Where the meal ideas come from</summary><ul><li><strong>Meal ideas:</strong> Quota Vita’s practical meal templates are built from familiar whole foods, balanced-plate patterns and the general macro target calculated below. They are not recipes supplied by FatSecret, LogMeal, a restaurant or a dietitian.</li><li><strong>Energy:</strong> a Mifflin-St Jeor resting-energy estimate uses age, height, weight and sex; your selected usual activity, goal and today’s activity then make transparent fixed adjustments.</li><li><strong>Macros:</strong> protein is a general-wellbeing heuristic of 1.2-1.6g/kg; fat is set at 28% of energy; carbohydrates make up the remaining energy. Fibre aims for 25g/day (30g for the male option in this prototype).</li><li><strong>Food and photo data:</strong> FatSecret is only used for food lookup when enabled; LogMeal is only used for a restaurant-photo estimate after explicit consent. Neither is the source of the core calorie calculation.</li></ul><p class="meta">Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin et al. (1990)</a>; <a href="https://multimedia.efsa.europa.eu/drvs/index.htm" target="_blank" rel="noopener">EFSA Dietary Reference Values</a>. Estimates can be materially wrong for an individual. Seek a qualified clinician for medical conditions, pregnancy, eating-disorder history, kidney disease or diabetes.</p></details>';
  }

  function basketItems(plan) {
    const scale = plan.target.calories / 2000; const round = (grams) => Math.round(grams * scale / 5) * 5;
    return ["run", "strength"].includes(state.activity)
      ? [[round(250), "Greek yogurt"], [round(70), "oats"], [1, "banana"], [round(100), "berries"], [round(160), "chicken"], [round(100), "dry rice"], [round(250), "cooked lentils"], [round(500), "vegetables and salad"], [round(30), "olive oil"], [round(100), "wholegrain bread"]]
      : [[round(250), "Greek yogurt"], [round(60), "oats"], [1, "apple"], [round(15), "nuts"], [round(150), "chicken"], [round(160), "cooked chickpeas"], [round(140), "salmon"], [round(300), "potatoes"], [round(500), "vegetables and salad"], [round(10), "olive oil"], [round(50), "wholegrain bread"]];
  }

  function printPdf(kind) {
    const plan = currentPlan();
    const isBasket = kind === "basket";
    const title = isBasket ? "One-day buying basket" : "Daily meal plan";
    const content = isBasket
      ? "<ul>" + basketItems(plan).map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(name) + "</li>").join("") + "</ul>"
      : plan.meals.map((meal) => "<section><h2>" + esc(meal.slot) + ": " + esc(meal.title) + "</h2><p>" + esc(meal.portions) + "</p><p>" + meal.calories + " kcal · " + meal.proteinG + "g protein · " + meal.carbohydrateG + "g carbohydrates · " + meal.fatG + "g fat</p></section>").join("");
    const popup = window.open("", "_blank");
    if (!popup) return alert("Allow pop-ups to download your PDF.");
    popup.document.write("<!doctype html><title>" + title + "</title><style>body{max-width:760px;margin:48px auto;color:#183d39;font:16px/1.5 system-ui}h1,h2{font-family:Georgia,serif}h1{font-size:42px}h2{font-size:23px;border-top:1px solid #c9d7c7;padding-top:18px}li{margin:8px 0}.meta{color:#5c756f;font-size:13px;margin-top:32px}@page{margin:18mm}</style><h1>Quota Vita / " + title + "</h1><p>" + esc(activityLabels[state.activity]) + " · " + plan.target.calories + " kcal · " + plan.target.proteinG + "g protein · " + plan.target.carbohydrateG + "g carbohydrates · " + plan.target.fatG + "g fat</p>" + content + '<p class="meta">General wellbeing estimate. Method: Mifflin-St Jeor energy estimate plus transparent activity and goal adjustments. EFSA DRVs inform macro and fibre context. Not medical advice.</p>');
    popup.document.close();
    setTimeout(() => popup.print(), 250);
  }

  function dashboard() {
    const plan = currentPlan();
    const eaten = totals(plan);
    const left = { calories: Math.max(0, plan.target.calories - eaten.calories), proteinG: Math.max(0, plan.target.proteinG - eaten.proteinG), carbohydrateG: Math.max(0, plan.target.carbohydrateG - eaten.carbohydrateG) };
    root.innerHTML = coachShell(activityLabels[state.activity] + " daily meal plan.", state.activity === "run" ? "Extra familiar carbohydrates and fluids around your run." : state.activity === "strength" ? "Protein spread across the day, with carbohydrates around training." : "A balanced plan for steady energy, protein and fibre.", '<div class="bubble coach full-card"><div class="day"><aside class="ledger"><span>Still to eat</span><b>' + left.calories.toLocaleString() + '</b><span>kcal remaining</span><hr><span>' + left.proteinG + 'g protein · ' + left.carbohydrateG + 'g carbs remaining</span></aside><section class="meal-list">' + plan.meals.map((meal) => mealCard(meal)).join("") + '</section></div><div class="actions"><button class="button" id="meal-pdf">Download daily plan PDF</button><button class="button quiet" id="basket">Daily shopping basket</button><button class="button quiet" id="week-plan">Create weekly plan</button><button class="button quiet" id="change-training">Change training</button><button class="button quiet" id="start-over">Start over</button></div><p class="privacy">This plan is stored only in this browser.</p>' + methodology() + '</div>');
    root.querySelector("#meal-pdf").onclick = () => printPdf("plan");
    root.querySelector("#basket").onclick = basket;
    root.querySelector("#week-plan").onclick = weeklyPlan;
    root.querySelector("#change-training").onclick = training;
    root.querySelector("#start-over").onclick = () => { localStorage.removeItem(storageKey); state = { profile: null, activity: "rest", meals: {} }; welcome(); };
    root.querySelectorAll("[data-meal]").forEach((button) => button.onclick = () => checkIn(button.dataset.meal));
  }

  function mealCard(meal) {
    const saved = state.meals[meal.id];
    const status = saved?.status;
    const label = status === "restaurant" ? "Restaurant meal logged" : status === "eaten" ? "Logged" : "Daily proposal";
    const images = { breakfast: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1000&q=80", lunch: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1000&q=80", dinner: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1000&q=80" };
    return '<article class="meal ' + (status || "") + '"><img class="meal-image" src="' + images[meal.id] + '" alt="' + esc(meal.title) + '"><div class="meal-header"><div><p class="eyebrow">' + esc(meal.slot) + "</p><h3>" + esc(meal.title) + '</h3></div><span class="meta">' + meal.calories + " kcal<br>" + meal.proteinG + "g protein</span></div><p>" + esc(meal.portions) + '</p><p class="meta">' + esc(meal.hint) + '</p><div class="actions"><button class="button quiet" data-meal="' + esc(meal.id) + '">' + label + "</button></div></article>";
  }

  function weeklySetup() {
    root.innerHTML = coachShell("Let’s plan your week", "First, tell your Coach what you want from this week.", '<div class="bubble coach">What are your goals for the week?<span class="meta">For example: feel more energetic, lose fat steadily, prepare for a 10 km run, or build strength.</span></div><form class="composer chat-input" id="weekly-goal-form"><input id="weekly-goal" placeholder="Write your goal for this week" required><button class="button" type="submit">Continue</button></form><button class="button quiet" id="back">Back to daily plan</button>');
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#weekly-goal-form").onsubmit = (event) => { event.preventDefault(); weeklyTraining(root.querySelector("#weekly-goal").value.trim()); };
  }

  function weeklyTraining(weeklyGoal) {
    root.innerHTML = coachShell("Your training week", "Tell me how many strength and running days you plan.", '<div class="bubble coach">How will you train this week?<span class="meta">For example: two strength days and one running day. The remaining days are treated as recovery or light movement.</span></div><form class="composer" id="weekly-training-form"><label class="field">Strength days <select id="strength-days">' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === 2 ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label><label class="field">Running days <select id="run-days">' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === 1 ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label><div class="actions"><button class="button" type="submit">Create my seven-day meal plan</button></div></form><button class="button quiet" id="back">Back</button>');
    root.querySelector("#back").onclick = weeklySetup;
    root.querySelector("#weekly-training-form").onsubmit = (event) => {
      event.preventDefault(); const strength = Number(root.querySelector("#strength-days").value); const run = Number(root.querySelector("#run-days").value);
      if (strength + run > 7) return alert("Strength and running days cannot add up to more than seven.");
      state.weekly = { goal: weeklyGoal, strength, run }; save(); weeklyPlan();
    };
  }

  function weeklyActivities() {
    const patterns = {
      sedentary: ["rest", "walk", "rest", "rest", "walk", "rest", "rest"],
      light: ["walk", "rest", "pilates", "rest", "walk", "rest", "rest"],
      moderate: ["strength", "rest", "run", "rest", "strength", "walk", "rest"],
      high: ["strength", "run", "strength", "pilates", "run", "strength", "rest"]
    };
    return patterns[state.profile.activity] || patterns.light;
  }

  function variedMeals(target, activity, dayIndex) {
    const menus = [
      [["Breakfast", "Pa amb tomàquet with egg and fruit", "2 slices wholegrain pa de pagès · 2 eggs · tomato · 1 orange · 10g olive oil"], ["Lunch", "Amanida de cigrons with escalivada", "160g cooked chickpeas · roasted pepper, aubergine and onion · 10g olive oil"], ["Dinner", "Suquet de peix with potatoes and greens", "160g white fish · 300g potatoes · tomato, garlic and 250g greens"]],
      [["Breakfast", "Greek yogurt with oats, walnuts and pear", "250g Greek yogurt · 60g oats · 1 pear · 15g walnuts"], ["Lunch", "Llenties estofades amb verdures", "250g cooked lentils · carrot, celery and tomato · 2 slices wholegrain bread"], ["Dinner", "Pollastre a la planxa with escalivada and brown rice", "150g chicken · 80g dry brown rice · 250g escalivada"]],
      [["Breakfast", "Pa amb tomàquet with fresh cheese and fruit", "2 slices wholegrain bread · tomato · 80g fresh cheese · 1 apple · 10g olive oil"], ["Lunch", "Esqueixada-style cod and white bean salad", "140g cod · 180g cooked white beans · tomato, pepper and olives"], ["Dinner", "Truita de verdures with roasted sweet potato", "3 eggs · spinach and mushrooms · 300g sweet potato · salad"]],
      [["Breakfast", "Apple-cinnamon porridge with yogurt", "70g oats · 1 apple · 200g Greek yogurt · cinnamon"], ["Lunch", "Arròs integral amb verdures and turkey", "80g dry brown rice · 150g turkey · 250g seasonal vegetables"], ["Dinner", "Bacallà al forn with potatoes and green beans", "160g cod · 300g potatoes · 250g green beans · 10g olive oil"]],
      [["Breakfast", "Yogurt bowl with berries and almonds", "250g Greek yogurt · 50g oats · 100g berries · 15g almonds"], ["Lunch", "Mongetes amb verdures and chicken", "180g cooked white beans · 150g chicken · tomato, spinach and onion"], ["Dinner", "Cigrons amb espinacs i pa amb tomàquet", "250g cooked chickpeas · spinach and tomato · 2 slices wholegrain bread"]],
      [["Breakfast", "Vegetable omelette and pa amb tomàquet", "3 eggs · spinach and mushrooms · 2 slices wholegrain bread · tomato"], ["Lunch", "Salmó with potato and leafy salad", "140g salmon · 300g potatoes · large leafy salad · 10g olive oil"], ["Dinner", "Pasta integral amb llenties and tomato", "250g cooked lentils · 80g dry wholegrain pasta · tomato sauce and vegetables"]],
      [["Breakfast", "Oats with banana, yogurt and hazelnuts", "60g oats · 200g Greek yogurt · 1 banana · 15g hazelnuts"], ["Lunch", "Amanida mediterrània de tonyina i mongetes", "1 tuna can · 180g cooked white beans · tomato, cucumber and olives"], ["Dinner", "Crema de verdures with tofu and pa de pagès", "180g tofu · vegetable soup · 2 slices wholegrain bread · 10g olive oil"]]
    ][dayIndex];
    return mealPlan(target, activity).map((meal, index) => ({ ...meal, title: menus[index][1], portions: menus[index][2] }));
  }

  function weeklyPlan() {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; const activities = weeklyActivities(); const activityExplanation = { sedentary: "mostly sitting, with gentle movement built in", light: "light activity (1–2 activity days/week)", moderate: "regular training (3–4 training days/week)", high: "frequent training (5+ training days/week)" }[state.profile.activity];
    const images = ["https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=80", "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80"];
    root.innerHTML = coachShell("Your varied seven-day meal plan", "Built from your first-chat answer: " + activityExplanation + ". Review it before creating your basket.", '<div class="bubble coach full-card"><div class="weekly-grid">' + days.map((day, index) => { const target = dailyTarget(state.profile, activities[index]); const meals = variedMeals(target, activities[index], index); return '<article class="week-day"><img class="meal-image" src="' + images[index] + '" alt="' + day + ' meal ideas"><h3>' + day + ' · ' + esc(activityLabels[activities[index]]) + '</h3><p><strong>' + target.calories + ' kcal</strong> · ' + target.proteinG + 'g protein</p>' + meals.map((meal) => '<p><strong>' + meal.slot + ': ' + esc(meal.title) + '</strong><br><span class="meta">' + esc(meal.portions) + '</span></p>').join("") + '</article>'; }).join("") + '</div><div class="actions"><button class="button" id="approve-week">Approve weekly plan and create basket</button><button class="button quiet" id="back">Back to daily plan</button></div></div>');
    root.querySelector("#approve-week").onclick = weeklyBasket; root.querySelector("#back").onclick = dashboard;
  }

  function weeklyBasket() {
    const activities = weeklyActivities(); const scale = dailyTarget(state.profile, activities[0]).calories / 2000;
    const baseItems = [[1200, "Greek yogurt"], [360, "oats"], [4, "bananas"], [3, "apples or pears"], [300, "berries"], [12, "eggs"], [700, "chicken breast"], [450, "turkey"], [280, "salmon"], [160, "cod"], [180, "tofu"], [2, "tuna cans"], [660, "cooked lentils"], [500, "cooked chickpeas or beans"], [240, "dry rice or quinoa"], [250, "dry wholegrain pasta"], [1500, "potatoes or sweet potatoes"], [2200, "mixed vegetables and salad"], [140, "olive oil"], [12, "slices wholegrain bread"], [50, "nuts, seeds or peanut butter"]];
    const totals = baseItems.map(([amount, name]) => [name, amount < 20 ? amount : Math.round(amount * scale / 10) * 10]);
    root.innerHTML = coachShell("Your approved weekly shopping basket", "A varied basket matching the seven specific daily menus and your first-chat training pattern.", '<div class="bubble coach full-card"><ul class="basket">' + totals.map(([name, amount]) => '<li><strong>' + (amount < 20 ? amount : amount + "g") + '</strong> ' + esc(name) + '</li>').join("") + '</ul><div class="actions"><button class="button quiet" id="back">Back to weekly plan</button></div></div>');
    root.querySelector("#back").onclick = weeklyPlan;
  }

  function checkIn(id, message = "") {
    const plan = currentPlan(); const meal = plan.meals.find((item) => item.id === id);
    root.innerHTML = coachShell(meal.slot + " check-in", meal.title, `<div class="bubble coach">Did you eat this proposed meal?</div><div class="actions"><button class="button" id="eaten">I ate this proposal</button><button class="button quiet" id="restaurant">I ate at a restaurant</button><button class="button quiet" id="skip">I skipped it</button></div>${message}<button class="button quiet" id="back">Back to plan</button>`);
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#eaten").onclick = () => { state.meals[id] = { status: "eaten" }; save(); dashboard(); };
    root.querySelector("#skip").onclick = () => { state.meals[id] = { status: "skipped" }; save(); dashboard(); };
    root.querySelector("#restaurant").onclick = () => restaurant(id, meal);
  }

  function restaurant(id, meal) {
    capturedMealImage = null;
    root.innerHTML = coachShell("Restaurant meal", "Scan the meal, then adapt the rest of today’s plan.", '<div class="bubble coach">Take a clear photo of the plate. On a phone, Take photo opens the rear camera; on desktop, it opens your camera if available.</div><div class="actions"><button class="button" id="open-camera">Take photo</button><label class="button quiet" for="photo">Choose photo</label><input id="photo" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div id="camera-area"></div><label class="field"><input id="logmeal-consent" type="checkbox"> I authorise Quota Vita to send this one meal photo to LogMeal for automated analysis. Quota Vita does not store the image.</label><div class="actions"><button class="button" id="scan">Scan meal</button><button class="button quiet" id="manual">Mark as restaurant meal without scanning</button></div><div id="feedback"></div><button class="button quiet" id="back">Back</button>');
    const stopCamera = () => { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; };
    root.querySelector("#back").onclick = () => { stopCamera(); checkIn(id); };
    root.querySelector("#manual").onclick = () => { state.meals[id] = { status: "restaurant" }; save(); dashboard(); };
    root.querySelector("#open-camera").onclick = async () => {
      const area = root.querySelector("#camera-area");
      try {
        stopCamera();
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        area.innerHTML = '<video id="camera-preview" autoplay playsinline style="width:100%;max-width:620px;background:#183d39"></video><div class="actions"><button class="button" id="capture-photo">Use this photo</button></div>';
        const video = root.querySelector("#camera-preview"); video.srcObject = cameraStream;
        root.querySelector("#capture-photo").onclick = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          capturedMealImage = canvas.toDataURL("image/jpeg", 0.84);
          stopCamera();
          area.innerHTML = '<p class="status">Photo ready. Press “Scan meal” to upload it.</p>';
        };
      } catch (error) {
        area.innerHTML = note("Camera access is unavailable. Choose a photo instead.", true);
      }
    };
    root.querySelector("#scan").onclick = async () => {
      const file = root.querySelector("#photo").files[0]; const feedback = root.querySelector("#feedback");
      if (!file && !capturedMealImage) return feedback.innerHTML = note("Take or choose a JPEG, PNG, or WebP photo first.", true);
      if (!root.querySelector("#logmeal-consent").checked) return feedback.innerHTML = note("Confirm the LogMeal photo-analysis authorisation before scanning.", true);
      if (file && file.size > 8 * 1024 * 1024) return feedback.innerHTML = note("Choose a photo smaller than 8 MB.", true);
      feedback.innerHTML = note("Checking photo-analysis availability…");
      try {
        const imageBase64 = capturedMealImage || await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        const response = await fetch("/api/meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, logmealConsent: true }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.meals[id] = { status: "restaurant", analysis: "scanned" }; save(); stopCamera();
        feedback.innerHTML = note("Meal estimate received. Your remaining plan has been adjusted.");
        setTimeout(dashboard, 900);
      } catch (error) { feedback.innerHTML = note(error.message || "Photo analysis is unavailable.", true); }
    };
  }

  function basket() {
    const plan = currentPlan(); const items = basketItems(plan);
    root.innerHTML = coachShell("Your one-day shopping basket", "Quantities are for one person and this specific plan.", '<div class="bubble coach full-card"><ul class="basket">' + items.map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(name) + "</li>").join("") + '</ul><div class="actions"><button class="button" id="basket-pdf">Download basket PDF</button><button class="button quiet" id="back">Back to daily plan</button><button class="button quiet" id="clear">Delete this device plan</button></div></div>');
    root.querySelector("#basket-pdf").onclick = () => printPdf("basket");
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = () => { localStorage.removeItem(storageKey); state = { profile: null, activity: "rest", meals: {} }; welcome(); };
  }

  if (state.profile) dashboard(); else welcome();
})();
