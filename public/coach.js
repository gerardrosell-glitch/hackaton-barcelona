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
  conversationOverflowStyle.textContent = ".coach-workspace{overflow:visible!important}";
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
      { key: "activity", label: "What does a usual week look like?", hint: "This is your normal week, not today: mostly sitting, light movement, regular training, or frequent training.", choices: [["Mostly sitting", "sedentary"], ["Lightly active", "light"], ["Regular training", "moderate"], ["Frequent training", "high"]] },
      { key: "goal", label: "What would you like to work toward?", hint: "This applies only a gentle starting calorie adjustment. It is not a clinical prescription.", choices: [["Lose fat", "lose"], ["Gain muscle", "gain"], ["Maintain", "maintain"]] }
    ];
    let index = 0;
    const history = () => questions.slice(0, index).map((question) => '<div class="bubble coach">' + esc(question.label) + '<span class="meta">' + esc(question.hint) + '</span></div><div class="bubble user">' + esc(question.choices ? question.choices.find((item) => item[1] === answers[question.key])?.[0] || "Prefer not to say" : answers[question.key]) + "</div>").join("");
    const render = () => {
      const question = questions[index];
      const input = question.choices
        ? '<div class="composer"><span class="composer-label">Choose one reply</span><div class="quick-replies">' + question.choices.map(([label, value]) => '<button data-answer="' + esc(value) + '">' + esc(label) + "</button>").join("") + "</div></div>"
        : '<form class="composer chat-input" id="chat-form"><input id="chat-answer" aria-label="' + esc(question.label) + '" placeholder="Type your answer…" type="number" min="' + question.min + '" max="' + question.max + '" step="' + (question.step || 1) + '" value="' + esc(answers[question.key] || "") + '" autofocus><button class="button" type="submit">Send</button></form>';
      const intro = index === 0 ? '<div class="bubble coach coach-intro">Hi, I’m your Quota Vita Coach. I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.<span class="meta">I’ll tailor it to your body, usual activity, goal and today’s training—not give you a generic diet.</span></div>' : "";
      root.innerHTML = '<section class="coach-workspace"><video class="coach-video" autoplay muted loop playsinline aria-hidden="true"><source src="https://cdn.shopify.com/s/files/1/0943/8042/5563/files/qv-projecte-720.mp4?v=1787404053" type="video/mp4"></video>' + stepper(1) + '<p class="eyebrow">Your Coach</p><h2>Let’s build your daily meal plan.</h2><p class="lead">Personal calories and macros, three meals and a one-day shopping basket.</p><section class="chat" aria-live="polite">' + intro + history() + `<div class="bubble coach">${esc(question.label)}<span class="meta">${esc(question.hint)}</span></div>` + input + '</section><button class="button quiet chat-cancel" id="cancel">Cancel and restart</button><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p></section>';
      root.querySelector("#cancel").onclick = welcome;
      root.querySelectorAll("[data-answer]").forEach((button) => button.onclick = () => advance(button.dataset.answer));
      const form = root.querySelector("#chat-form");
      if (form) form.onsubmit = (event) => { event.preventDefault(); advance(root.querySelector("#chat-answer").value); };
      requestAnimationFrame(() => root.querySelector(".composer")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    const advance = (value) => {
      const question = questions[index];
      if (!question.choices && (!Number.isFinite(Number(value)) || Number(value) < question.min || Number(value) > question.max)) return render();
      answers[question.key] = question.choices ? value : Number(value);
      index += 1;
      if (index < questions.length) return render();
      root.innerHTML = stepper(1) + '<section class="chat"><div class="bubble coach">I have what I need. Would you like to keep this plan on this device?<span class="meta">It stays in this browser and can be deleted with Start over. Nothing is saved to an account.</span></div></section><div class="actions"><button class="button" id="save-device">Create and save my plan</button><button class="button quiet" id="one-time">Create a one-time plan</button></div>';
      const finish = (persist) => {
        state = { profile: answers, activity: "rest", meals: {} };
        if (persist) save(); else localStorage.removeItem(storageKey);
        training();
      };
      root.querySelector("#save-device").onclick = () => finish(true);
      root.querySelector("#one-time").onclick = () => finish(false);
    };
    render();
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

  function methodology() {
    return '<details class="method"><summary>How this plan is calculated</summary><ul><li><strong>Energy:</strong> a Mifflin-St Jeor resting-energy estimate uses age, height, weight and sex; your selected usual activity, goal and today’s activity then make transparent fixed adjustments.</li><li><strong>Macros:</strong> protein is a general-wellbeing heuristic of 1.2-1.6g/kg; fat is set at 28% of energy; carbohydrates make up the remaining energy. Fibre aims for 25g/day (30g for the male option in this prototype).</li><li><strong>Meals and basket:</strong> the three meals are practical food templates split across the day. They are not a prescription, allergy-safe plan or diagnosis.</li><li><strong>Food and photo data:</strong> FatSecret is only used for food lookup when enabled; LogMeal is only used for a restaurant-photo estimate after its EU DPA is approved. Neither is the source of the core calorie calculation.</li></ul><p class="meta">Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin et al. (1990)</a>; <a href="https://multimedia.efsa.europa.eu/drvs/index.htm" target="_blank" rel="noopener">EFSA Dietary Reference Values</a>. Estimates can be materially wrong for an individual. Seek a qualified clinician for medical conditions, pregnancy, eating-disorder history, kidney disease or diabetes.</p></details>';
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
    root.innerHTML = stepper(3) + '<p class="eyebrow">3 / Your daily plan</p><h2>' + esc(activityLabels[state.activity]) + ' meal plan.</h2><p class="lead">' + (state.activity === "run" ? "Add familiar carbohydrates and fluids around your run." : state.activity === "strength" ? "Spread protein across the day and include carbohydrates around training." : "A balanced plan for steady energy, protein and fibre.") + '</p><div class="day"><aside class="ledger"><span>Still to eat</span><b>' + left.calories.toLocaleString() + '</b><span>kcal remaining</span><hr><span>' + left.proteinG + 'g protein · ' + left.carbohydrateG + 'g carbs remaining</span></aside><section class="meal-list">' + plan.meals.map((meal) => mealCard(meal)).join("") + '</section></div><div class="actions"><button class="button" id="meal-pdf">Download meal plan PDF</button><button class="button quiet" id="basket">My buying basket</button><button class="button quiet" id="change-training">Change training</button><button class="button quiet" id="start-over">Start over</button><a class="button quiet" href="https://www.quotavita.com/account">Sign in to your Quota Vita account</a></div><p class="privacy">PDF downloads are created in your browser. This anonymous plan is stored only in this browser. Account-based cloud saving is available only after explicit consent and final Shopify account integration.</p>' + methodology();
    root.querySelector("#meal-pdf").onclick = () => printPdf("plan");
    root.querySelector("#basket").onclick = basket;
    root.querySelector("#change-training").onclick = training;
    root.querySelector("#start-over").onclick = () => { localStorage.removeItem(storageKey); state = { profile: null, activity: "rest", meals: {} }; welcome(); };
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
    capturedMealImage = null;
    root.innerHTML = '<p class="eyebrow">Restaurant meal</p><h2>Scan the meal, then adapt the day.</h2><p class="lead">Take a clear photo of the plate. On a phone, “Take photo” opens the rear camera; on desktop, it opens your camera if available.</p><div class="actions"><button class="button" id="open-camera">Take photo</button><label class="button quiet" for="photo">Choose photo</label><input id="photo" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div id="camera-area"></div><label class="field"><input id="logmeal-consent" type="checkbox"> I authorise Quota Vita to send this one meal photo to LogMeal for automated analysis. Quota Vita does not store the image.</label><div class="actions"><button class="button" id="scan">Scan meal</button><button class="button quiet" id="manual">Mark as restaurant meal without scanning</button></div><div id="feedback"></div><button class="button quiet" id="back">Back</button>';
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
    root.innerHTML = '<p class="eyebrow">Your one-day basket</p><h2>Buy what today’s plan needs.</h2><p class="lead">Quantities are for one person and this specific plan. Check labels for allergens and adjust for household portions.</p><ul class="basket">' + items.map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(name) + "</li>").join("") + '</ul><div class="actions"><button class="button" id="basket-pdf">Download basket PDF</button><button class="button quiet" id="back">Back to daily plan</button><button class="button quiet" id="clear">Delete this device plan</button></div>';
    root.querySelector("#basket-pdf").onclick = () => printPdf("basket");
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = () => { localStorage.removeItem(storageKey); state = { profile: null, activity: "rest", meals: {} }; welcome(); };
  }

  if (state.profile) dashboard(); else welcome();
})();
