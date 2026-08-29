(() => {
  const root = document.querySelector("#coach");
  const storageKey = "quota-vita-coach-v2";
  const activityLabels = { rest: "Rest day", run: "Run", strength: "Strength", pilates: "Pilates", walk: "Walk" };
  let state;
  let cameraStream;
  let capturedMealImage;
  let language = localStorage.getItem("quota-vita-coach-language") || "en";
  let weeklyBasketEstimate;
  const pendingMealImages = new Set();
  const failedMealImages = new Set();
  const pendingWeeklyMealImages = new Set();
  const failedWeeklyMealImages = new Set();
  const pendingDailyMealPlans = new Set();
  const failedDailyMealPlans = new Set();
  const expandedPlanDetails = new Set();

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const readState = () => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } };
  state = { mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: 0, chat: [], ...(readState() || { profile: null, activity: "rest", meals: {} }) };
  const todayKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  if (state.profile && state.planDate !== todayKey()) {
    state = { ...state, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
    save();
  }
  // ── Measurement ─────────────────────────────────────────────────────────
  // A random, non-identifying id. It carries no email, no profile and no
  // nutrition data, so activation, return and basket conversion can be counted
  // without a login and without touching anything the consent gate governs.
  const sessionId = (() => {
    const key = "quota-vita-coach-session";
    let id = localStorage.getItem(key);
    if (!id) {
      id = (window.crypto?.randomUUID?.() || String(Math.random()).slice(2) + Date.now().toString(36));
      localStorage.setItem(key, id);
    }
    return id;
  })();

  function track(name, props = {}) {
    const payload = JSON.stringify({ name, sessionId, language, props });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
      else void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    } catch {
      // Measurement never blocks the Coach.
    }
  }

  (() => {
    const key = "quota-vita-coach-last-seen";
    const previous = localStorage.getItem(key);
    const today = todayKey();
    track("coach_opened", { returning: Boolean(previous), has_profile: Boolean(state.profile) });
    if (previous && previous !== today) {
      track("returned_day_two", { days_since: Math.round((Date.parse(today) - Date.parse(previous)) / 86400000) });
    }
    localStorage.setItem(key, today);
  })();

  // ── The shop ────────────────────────────────────────────────────────────
  // The protein swap on a meal card is an offer. The server decides which tub
  // it maps to and builds the attributed cart link; the client only asks.
  const shopOfferRequests = new Map();

  function shopOffer(millilitres) {
    const key = millilitres + ":" + language;
    if (!shopOfferRequests.has(key)) {
      shopOfferRequests.set(key, fetch("/api/shop?millilitres=" + encodeURIComponent(millilitres) + "&language=" + encodeURIComponent(language))
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => body?.offer || null)
        .catch(() => null));
    }
    return shopOfferRequests.get(key);
  }

  function shopOfferMarkup(offer) {
    const coverage = language === "ca"
      ? offer.product.label + " · " + offer.coverageDays + " dies · " + formatEur(offer.product.priceEurHint)
      : offer.product.label + " · " + offer.coverageDays + " days · " + formatEur(offer.product.priceEurHint);
    const perDay = language === "ca"
      ? formatEur(offer.costPerDayEurHint) + " al dia"
      : formatEur(offer.costPerDayEurHint) + " a day";
    return '<span class="shop-offer"><a class="button shop-buy" href="' + esc(offer.cartUrl) + '" target="_blank" rel="noopener" data-shop-buy="' + esc(offer.product.sku) + '">'
      + esc(T("Buy the protein", "Compra la proteïna")) + '</a><span class="shop-line">' + esc(coverage) + ' · ' + esc(perDay) + "</span></span>";
  }

  function fillShopOffers() {
    root.querySelectorAll("[data-shop-ml]:not([data-shop-filled])").forEach((node) => {
      node.dataset.shopFilled = "1";
      const millilitres = Number(node.dataset.shopMl);
      if (!Number.isFinite(millilitres) || millilitres <= 0) return;
      void shopOffer(millilitres).then((offer) => {
        if (!offer || !node.isConnected) return;
        node.insertAdjacentHTML("beforeend", shopOfferMarkup(offer));
        track("shop_offer_shown", { sku: offer.product.sku, millilitres });
      });
    });
  }

  root.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-shop-buy]");
    if (link) track("shop_checkout_opened", { sku: link.dataset.shopBuy });
  });

  // ── The account ─────────────────────────────────────────────────────────
  // Identity comes from Shopify, handed over once through the App Proxy. All of
  // this is additive: every call can fail, and the local plan is untouched when
  // it does, so the Coach still works for someone who never signs in.
  const accountTokenKey = "quota-vita-coach-account";
  const accountConsentKey = "quota-vita-coach-account-consent";
  const readLocal = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

  (() => {
    // The token arrives in the fragment, which never reaches a server log.
    // Take it out of the address bar immediately so it is not shared by copy.
    const match = /[#&]coach_session=([^&]+)/.exec(location.hash || "");
    if (!match) return;
    writeLocal(accountTokenKey, decodeURIComponent(match[1]));
    history.replaceState(null, "", location.pathname + location.search);
    track("account_linked");
  })();

  let accountsEnabled = false;
  const accountToken = () => readLocal(accountTokenKey);
  const signedIn = () => Boolean(accountToken());
  const accountConsented = () => readLocal(accountConsentKey) === "granted";

  /** Can anyone sign in here at all? Answered once, without a token. */
  async function checkAccountsEnabled() {
    try {
      const response = await fetch("/api/account");
      if (!response.ok) return;
      accountsEnabled = Boolean((await response.json())?.configured);
      if (accountsEnabled) renderChrome();
    } catch {
      // Leave accounts hidden rather than offering a door that does not open.
    }
  }

  async function accountFetch(path, options = {}) {
    const token = accountToken();
    if (!token) return null;
    try {
      const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(options.headers || {}) },
      });
      if (response.status === 401) {
        try { localStorage.removeItem(accountTokenKey); } catch { /* private mode */ }
        return null;
      }
      if (!response.ok) return null;
      return response.status === 204 ? {} : await response.json();
    } catch {
      return null;
    }
  }

  const profileToServer = () => ({ ...state.profile, consent: true, medicalFlags: [] });

  const profileFromServer = (record) => ({
    age: Number(record.age),
    heightCm: Number(record.height_cm),
    weightKg: Number(record.weight_kg),
    sex: record.sex || "",
    activity: record.activity,
    goal: record.goal,
  });

  async function pushProfile() {
    if (!signedIn() || !state.profile || !accountConsented()) return;
    const saved = await accountFetch("/api/account", { method: "POST", body: JSON.stringify(profileToServer()) });
    if (saved?.profile) track("account_synced", { kind: "profile" });
  }

  async function pushMeal(meal, status) {
    if (!signedIn() || !accountConsented() || !meal) return;
    const saved = await accountFetch("/api/account", {
      method: "POST",
      body: JSON.stringify({
        kind: "meal",
        name: meal.title,
        source: status === "restaurant" ? "restaurant_photo" : "manual",
        calories: meal.calories,
        proteinG: meal.proteinG,
        carbohydrateG: meal.carbohydrateG,
        fatG: meal.fatG,
      }),
    });
    if (saved?.meal) track("account_synced", { kind: "meal" });
  }

  /**
   * On load, reconcile the device with the account. A saved profile on the
   * server wins when this device has none — that is the whole point of an
   * account. A profile on this device is pushed up when the server has none.
   */
  async function syncAccount() {
    if (!signedIn()) return;
    const data = await accountFetch("/api/account");
    if (!data?.signedIn) return;
    if (data.profile && !state.profile) {
      state = { ...state, profile: profileFromServer(data.profile), planDate: todayKey(), needsTraining: true, activity: "rest", meals: {} };
      save();
      track("account_profile_restored");
      return training();
    }
    if (!data.profile && state.profile) void pushProfile();
  }

  const accountLinkUrl = () => (window.COACH_CONFIG?.accountLinkUrl || "https://www.quotavita.com/apps/nutrition-coach/link");

  function connectAccount() {
    writeLocal(accountConsentKey, "granted");
    track("account_link_started");
    window.location.href = accountLinkUrl();
  }

  const choiceButtons = (items, attribute) => items.map(([label, value], index) => '<button ' + attribute + '="' + esc(value) + '" aria-keyshortcuts="' + (index + 1) + '"><kbd class="shortcut-key">' + (index + 1) + '</kbd>' + esc(label) + '</button>').join("");
  const stepper = (step, total) => '<div class="stepper" role="group" aria-label="Setup progress"><span class="stepper-label">' + (language === "ca" ? "Pas " + step + " de " + total : "Step " + step + " of " + total) + '</span><span class="stepper-track"><span class="stepper-fill" style="width:' + Math.round((step / total) * 100) + '%"></span></span></div>';
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
    "Press 1, 2 or 3 on your keyboard to choose.": "Prem 1, 2 o 3 al teclat per triar.",
    "Press 1, 2, 3, 4 or 5 on your keyboard to choose.": "Prem 1, 2, 3, 4 o 5 al teclat per triar.",
    "Visual for this meal": "Imatge d’aquest àpat", "Generate meal image": "Genera la imatge de l’àpat", "Generating image…": "S’està generant la imatge…", "Catalan dish:": "Plat català:", "protein": "proteïna", "carbohydrates": "hidrats de carboni", "fat": "greix",
    "Daily check": "Revisió diària", "Review what you have eaten today and adapt the remaining meals.": "Revisa què has menjat avui i adapta els àpats pendents.",
    "Review the meals still pending": "Revisa els àpats pendents", "meals logged today.": "àpats registrats avui.", "day streak": "dies seguits",
    "Your daily check is complete. Your meals and plan are saved on this device for today.": "La revisió diària està completa. Els àpats i el pla d’avui es desen en aquest dispositiu.",
    "Complete today’s check (+10)": "Completa la revisió d’avui (+10)", "Daily check completed · +10": "Revisió diària completada · +10", "Back to daily plan": "Torna al pla diari",
    "Download weekly plan PDF": "Descarrega el PDF del pla setmanal", "Download weekly basket PDF": "Descarrega el PDF de la cistella setmanal",
    "Send by email": "Envia per correu electrònic", "Email address": "Adreça electrònica",
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
    ,"Are you going to train today?": "Entrenaràs avui?"
    ,"Your meals and quantities will adapt to today’s movement.": "Els àpats i les quantitats s’adaptaran al moviment d’avui."
    ,"What does today’s movement look like?": "Com serà el moviment d’avui?"
    ,"Choose one reply. I will adapt your calories, carbohydrates and meal quantities.": "Tria una resposta. Adaptaré les calories, els hidrats de carboni i les quantitats dels àpats."
    ,"Choose one reply": "Tria una resposta"
    ,"Your varied seven-day meal plan": "El teu pla d’àpats variat de set dies"
    ,"Approve weekly plan and create basket": "Aprova el pla setmanal i crea la cistella"
    ,"Back to daily plan": "Torna al pla diari"
    ,"Back to weekly plan": "Torna al pla setmanal"
    ,"Your approved weekly shopping basket": "La teva cistella setmanal aprovada"
    ,"A varied basket matching the seven specific daily menus and your first-chat training pattern.": "Una cistella variada que correspon als set menús diaris concrets i al patró d’entrenament de la primera conversa."
    ,"Your one-day shopping basket": "La teva cistella de compra d’un dia"
    ,"Daily shopping basket": "Cistella de compra diària"
    ,"Create weekly plan": "Crea el pla setmanal"
    ,"Download daily plan PDF": "Descarrega el PDF del pla diari"
    ,"This plan is stored only in this browser.": "Aquest pla només es desa en aquest navegador."
    ,"Restaurant meal logged": "Àpat de restaurant registrat"
    ,"Logged": "Registrat"
    ,"Daily proposal": "Proposta diària"
    ,"Scroll through your meals, then choose what actually happened.": "Desplaça't pels àpats i tria què ha passat realment."
    ,"I’ll eat this": "Menjaré això"
    ,"Skip for now": "Ho ometré ara"
    ,"Review this meal": "Revisa aquest àpat"
    ,"Planned": "Planificat"
    ,"Talk to your Coach": "Parla amb el teu Coach"
    ,"Conversation": "Conversa"
    ,"Reduce": "Redueix"
    ,"Ask about a meal, a healthy swap or today’s training.": "Pregunta sobre un àpat, una alternativa saludable o l’entrenament d’avui."
    ,"General wellbeing guidance, not medical advice.": "Orientació general de benestar, no assessorament mèdic."
    ,"Ask your Coach…": "Pregunta al teu Coach…"
    ,"Ask your Coach...": "Pregunta al teu Coach…"
    ,"Ask": "Pregunta"
    ,"Thinking…": "Pensant…"
    ,"Messages are sent to OpenAI to generate a reply. Quota Vita keeps this conversation only on this device.": "Els missatges s'envien a OpenAI per generar una resposta. Quota Vita només conserva aquesta conversa en aquest dispositiu."
    ,"Estimated weekly basket cost": "Cost setmanal estimat de la cistella"
    ,"Checking the latest price estimate…": "Comprovant l’estimació de preu més recent…"
    ,"Average supermarket reference.": "Referència de supermercat mig."
    ,"Estimated total": "Total estimat"
    ,"Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.": "Les estimacions de preu cobreixen les quantitats indicades, no són un pressupost de compra. Les promocions, la botiga, la marca, les mides dels envasos i el lliurament poden canviar l’import final."
    ,"Unable to load the price estimate.": "No s’ha pogut carregar l’estimació de preu."
    ,"Monday": "Dilluns", "Tuesday": "Dimarts", "Wednesday": "Dimecres", "Thursday": "Dijous", "Friday": "Divendres", "Saturday": "Dissabte", "Sunday": "Diumenge"
    ,"Rest day": "Dia de descans", "Strength": "Força", "Run": "Córrer", "Walk": "Caminar"
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
  const catalanMealText = {
    "Breakfast": "Esmorzar", "Lunch": "Dinar", "Dinner": "Sopar",
    "Pa amb tomàquet with Greek yogurt, banana and berries": "Pa amb tomàquet amb iogurt grec, plàtan i fruits del bosc",
    "Escalivada with chickpeas and chicken": "Escalivada amb cigrons i pollastre",
    "Pa amb tomàquet with egg, fruit and nuts": "Pa amb tomàquet amb ou, fruita i fruits secs",
    "Start with carbohydrate and protein before the session.": "Comença amb hidrats de carboni i proteïna abans de la sessió.",
    "Your main recovery meal.": "El teu àpat principal de recuperació.",
    "Steady energy and fibre for tomorrow.": "Energia sostinguda i fibra per a demà.",
    "Protein, fibre and a satisfying start.": "Proteïna, fibra i un inici saciant.",
    "Build the plate around protein and plants.": "Construeix el plat al voltant de la proteïna i els vegetals.",
    "A simple balanced evening meal.": "Un sopar senzill i equilibrat.",
    "2 slices wholegrain pa de pagès · ripe tomato · 250g Greek yogurt · 1 banana · 100g berries": "2 llesques de pa de pagès integral · tomàquet madur · 250g de iogurt grec · 1 plàtan · 100g de fruits del bosc",
    "160g chicken · 160g cooked chickpeas · roasted pepper, aubergine and onion · 1 slice pa de pagès · 10g olive oil": "160g de pollastre · 160g de cigrons cuits · pebrot, albergínia i ceba escalivats · 1 llesca de pa de pagès · 10g d’oli d’oliva",
    "250g cooked lentils · 2 slices wholegrain pa de pagès · salad · ½ avocado": "250g de llenties cuites · 2 llesques de pa de pagès integral · amanida · ½ alvocat",
    "2 slices wholegrain pa de pagès · ripe tomato · 2 eggs · 1 apple · 15g nuts": "2 llesques de pa de pagès integral · tomàquet madur · 2 ous · 1 poma · 15g de fruits secs",
    "150g chicken · 160g chickpeas · 250g escalivada · 10g olive oil": "150g de pollastre · 160g de cigrons · 250g d’escalivada · 10g d’oli d’oliva",
    "250g cooked lentils · carrot, celery and tomato · 2 slices wholegrain pa de pagès · salad": "250g de llenties cuites · pastanaga, api i tomàquet · 2 llesques de pa de pagès integral · amanida",
    "Pa amb tomàquet with egg and fruit": "Pa amb tomàquet amb ou i fruita",
    "2 slices wholegrain pa de pagès · 2 eggs · tomato · 1 orange · 10g olive oil": "2 llesques de pa de pagès integral · 2 ous · tomàquet · 1 taronja · 10g d’oli d’oliva",
    "Escalivada with chickpeas": "Escalivada amb cigrons",
    "160g cooked chickpeas · roasted pepper, aubergine and onion · 10g olive oil": "160g de cigrons cuits · pebrot, albergínia i ceba escalivats · 10g d’oli d’oliva",
    "160g white fish · 300g potatoes · tomato, garlic and 250g greens": "160g de peix blanc · 300g de patates · tomàquet, all i 250g de verdures verdes",
    "Greek yogurt with oats, walnuts and pear": "Iogurt grec amb civada, nous i pera",
    "250g Greek yogurt · 60g oats · 1 pear · 15g walnuts": "250g de iogurt grec · 60g de civada · 1 pera · 15g de nous",
    "Llenties estofades amb verdures": "Llenties estofades amb verdures",
    "250g cooked lentils · carrot, celery and tomato · 2 slices wholegrain bread": "250g de llenties cuites · pastanaga, api i tomàquet · 2 llesques de pa integral",
    "Pollastre a la planxa with escalivada and brown rice": "Pollastre a la planxa amb escalivada i arròs integral",
    "150g chicken · 80g dry brown rice · 250g escalivada": "150g de pollastre · 80g d’arròs integral en cru · 250g d’escalivada",
    "Pa amb tomàquet with fresh cheese and fruit": "Pa amb tomàquet amb formatge fresc i fruita",
    "2 slices wholegrain bread · tomato · 80g fresh cheese · 1 apple · 10g olive oil": "2 llesques de pa integral · tomàquet · 80g de formatge fresc · 1 poma · 10g d’oli d’oliva",
    "Esqueixada-style cod and white bean salad": "Amanida d’estil esqueixada de bacallà i mongetes blanques",
    "140g cod · 180g cooked white beans · tomato, pepper and olives": "140g de bacallà · 180g de mongetes blanques cuites · tomàquet, pebrot i olives",
    "Truita de verdures with roasted sweet potato": "Truita de verdures amb moniato al forn",
    "3 eggs · spinach and mushrooms · 300g sweet potato · salad": "3 ous · espinacs i bolets · 300g de moniato · amanida",
    "Apple-cinnamon porridge with yogurt": "Farinetes de poma i canyella amb iogurt",
    "70g oats · 1 apple · 200g Greek yogurt · cinnamon": "70g de civada · 1 poma · 200g de iogurt grec · canyella",
    "Arròs integral amb verdures and turkey": "Arròs integral amb verdures i gall dindi",
    "80g dry brown rice · 150g turkey · 250g seasonal vegetables": "80g d’arròs integral en cru · 150g de gall dindi · 250g de verdures de temporada",
    "Bacallà al forn with potatoes and green beans": "Bacallà al forn amb patates i mongetes verdes",
    "160g cod · 300g potatoes · 250g green beans · 10g olive oil": "160g de bacallà · 300g de patates · 250g de mongetes verdes · 10g d’oli d’oliva",
    "Yogurt bowl with berries and almonds": "Bol de iogurt amb fruits del bosc i ametlles",
    "250g Greek yogurt · 50g oats · 100g berries · 15g almonds": "250g de iogurt grec · 50g de civada · 100g de fruits del bosc · 15g d’ametlles",
    "Mongetes amb verdures and chicken": "Mongetes amb verdures i pollastre",
    "180g cooked white beans · 150g chicken · tomato, spinach and onion": "180g de mongetes blanques cuites · 150g de pollastre · tomàquet, espinacs i ceba",
    "Cigrons amb espinacs i pa amb tomàquet": "Cigrons amb espinacs i pa amb tomàquet",
    "250g cooked chickpeas · spinach and tomato · 2 slices wholegrain bread": "250g de cigrons cuits · espinacs i tomàquet · 2 llesques de pa integral",
    "Vegetable omelette and pa amb tomàquet": "Truita de verdures i pa amb tomàquet",
    "3 eggs · spinach and mushrooms · 2 slices wholegrain bread · tomato": "3 ous · espinacs i bolets · 2 llesques de pa integral · tomàquet",
    "Salmó with potato and leafy salad": "Salmó amb patata i amanida de fulla verda",
    "140g salmon · 300g potatoes · large leafy salad · 10g olive oil": "140g de salmó · 300g de patates · amanida gran de fulla verda · 10g d’oli d’oliva",
    "Pasta integral amb llenties and tomato": "Pasta integral amb llenties i tomàquet",
    "250g cooked lentils · 80g dry wholegrain pasta · tomato sauce and vegetables": "250g de llenties cuites · 80g de pasta integral en cru · salsa de tomàquet i verdures",
    "Oats with banana, yogurt and hazelnuts": "Civada amb plàtan, iogurt i avellanes",
    "60g oats · 200g Greek yogurt · 1 banana · 15g hazelnuts": "60g de civada · 200g de iogurt grec · 1 plàtan · 15g d’avellanes",
    "Amanida mediterrània de tonyina i mongetes": "Amanida mediterrània de tonyina i mongetes",
    "1 tuna can · 180g cooked white beans · tomato, cucumber and olives": "1 llauna de tonyina · 180g de mongetes blanques cuites · tomàquet, cogombre i olives",
    "Crema de verdures with tofu and pa de pagès": "Crema de verdures amb tofu i pa de pagès",
    "180g tofu · vegetable soup · 2 slices wholegrain bread · 10g olive oil": "180g de tofu · crema de verdures · 2 llesques de pa integral · 10g d’oli d’oliva"
  };
  const localiseMealText = (text) => language === "ca" ? (catalanMealText[text] || text) : text;
  const localiseMeal = (meal) => ({ ...meal, slot: localiseMealText(meal.slot), title: localiseMealText(meal.title), portions: localiseMealText(meal.portions), hint: localiseMealText(meal.hint) });
  const T = (english, catalan) => (language === "ca" ? catalan : english);

  /* The shell markup is server-rendered, so mount defensively: if a host is
     missing the app still boots instead of dying on a null innerHTML. */
  const chromeHost = (id, tag, className, attributes = {}) => {
    let node = document.querySelector("#" + id);
    if (!node) {
      node = document.createElement(tag);
      node.id = id;
      node.className = className;
      Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
      const app = document.querySelector(".app") || document.body;
      if (id === "topbar") app.prepend(node); else app.append(node);
    }
    return node;
  };
  const topbarHost = chromeHost("topbar", "header", "topbar");
  const tabbarHost = chromeHost("tabbar", "nav", "tabbar", { "aria-label": "Sections", hidden: "" });
  let currentView = "setup";
  let menuOpen = false;

  const navIcons = {
    today: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    basket: '<path d="M4 8h16l-1.4 11.1a2 2 0 0 1-2 1.75H7.4a2 2 0 0 1-2-1.75L4 8Z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
    coach: '<path d="M21 11.5a8 8 0 0 1-8 8H8l-5 2.5V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/>',
    progress: '<path d="M12 3.2 14.6 9l6.4.6-4.8 4.2 1.4 6.2-5.6-3.3-5.6 3.3 1.4-6.2L3 9.6 9.4 9 12 3.2Z"/>'
  };

  const navItems = () => [
    { id: "today", label: T("Today", "Avui") },
    { id: "week", label: T("Week", "Setmana") },
    { id: "basket", label: T("Basket", "Cistella") },
    { id: "coach", label: T("Coach", "Coach") },
    { id: "progress", label: T("Progress", "Progrés") }
  ];

  const svgIcon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + navIcons[name] + "</svg>";

  function menuMarkup() {
    const compact = state.compactPlanView ? T("Full cards", "Vista completa") : T("Compact cards", "Vista compacta");
    const group = (title, items) => "<h2>" + esc(title) + "</h2>" + items.map(([action, label, extra = ""]) => '<button class="menu-item' + extra + '" type="button" data-menu-action="' + action + '">' + esc(label) + "</button>").join("");
    const languageGroup = '<h2>' + esc(T("Language", "Idioma")) + '</h2><div class="menu-lang" data-language-control>'
      + [["en", "English"], ["ca", "Català"]].map(([code, label]) => '<button class="menu-item' + (language === code ? " is-active" : "") + '" type="button" data-language="' + code + '">' + label + "</button>").join("")
      + "</div>";
    return '<div class="overflow-menu" id="overflow-menu" role="menu"' + (menuOpen ? "" : " hidden") + ">"
      + languageGroup
      + group(T("Today", "Avui"), [
        ["daily-check", T("Daily check", "Revisió del dia")],
        ["daily-pdf", T("Download today's plan", "Baixa el pla d’avui")],
        ["change-training", T("Change today's training", "Canvia l’entrenament d’avui")]
      ])
      + group(T("Week", "Setmana"), [
        ["weekly-pdf", T("Download the week", "Baixa la setmana")],
        ["weekly-email", T("Email my week", "Envia’m la setmana")]
      ])
      + (accountsEnabled || signedIn()
        ? group(T("Account", "Compte"), [
          ["account", signedIn() ? T("Your account", "El teu compte") : T("Save my plan to my account", "Desa el meu pla al meu compte")]
        ])
        : "")
      + group(T("View", "Vista"), [
        ["compact-view", compact],
        ["start-over", T("Start over", "Comença de nou"), " menu-item--danger"]
      ])
      + "</div>";
  }

  function renderChrome() {
    const inSetup = !state.profile || state.needsTraining;
    const items = navItems();
    const topnav = inSetup ? "" : '<nav class="topnav" aria-label="' + esc(T("Sections", "Seccions")) + '">' + items.map((item) => '<button class="topnav-link' + (currentView === item.id ? " is-active" : "") + '" type="button" data-nav="' + item.id + '"' + (currentView === item.id ? ' aria-current="page"' : "") + ">" + esc(item.label) + "</button>").join("") + "</nav>";
    const languages = '<div class="lang" data-language-control>' + [["en", "EN"], ["ca", "CA"]].map(([code, label]) => '<button type="button" data-language="' + code + '" class="' + (language === code ? "is-active" : "") + '" aria-pressed="' + (language === code) + '">' + label + "</button>").join("") + "</div>";
    const menuButton = inSetup ? "" : '<button class="icon-button" id="menu-toggle" type="button" aria-haspopup="true" aria-expanded="' + menuOpen + '" aria-controls="overflow-menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg><span class="sr-only">' + esc(T("More options", "Més opcions")) + "</span></button>";
    const chips = inSetup ? "" : streakChipsMarkup();
    topbarHost.innerHTML = '<div class="topbar-inner"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">QV</span>Quota Vita <em>Coach</em></a>' + topnav + '<div class="topbar-actions">' + chips + languages + menuButton + "</div></div>" + (inSetup ? "" : menuMarkup());
    tabbarHost.hidden = inSetup;
    tabbarHost.innerHTML = inSetup ? "" : items.map((item) => '<button class="tab' + (currentView === item.id ? " is-active" : "") + '" type="button" data-nav="' + item.id + '"' + (currentView === item.id ? ' aria-current="page"' : "") + ">" + svgIcon(item.id) + '<span class="tab-label">' + esc(item.label) + "</span></button>").join("");
    translate();
  }

  function setMenuOpen(open) {
    menuOpen = open;
    const menu = document.querySelector("#overflow-menu");
    if (menu) menu.hidden = !open;
    document.querySelector("#menu-toggle")?.setAttribute("aria-expanded", String(open));
  }

  function mount(view, html) {
    const changed = view !== currentView;
    currentView = view;
    root.innerHTML = html;
    menuOpen = false;
    renderChrome();
    fillShopOffers();
    if (changed) window.scrollTo({ top: 0, behavior: "auto" });
  }

  const resetCoach = () => {
    if (state.profile) {
      failedMealImages.clear();
      failedWeeklyMealImages.clear();
      state = { ...state, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
      save();
      return training();
    }
    localStorage.removeItem(storageKey);
    state = { profile: null, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: 0 };
    welcome();
  };
  const viewRenderers = () => ({ today: dashboard, week: weeklyPlan, basket: basket, coach: coachPage, progress: progressView, account: account });

  function showView(name) {
    const render = viewRenderers()[name];
    if (render) render();
  }

  function rerenderCurrentView() {
    (viewRenderers()[currentView] || dashboard)();
  }

  const menuActions = () => ({
    "daily-check": dailyCheck,
    "daily-pdf": () => printPdf("plan"),
    "change-training": training,
    "weekly-pdf": () => printWeekly("plan"),
    "weekly-email": () => emailWeekly("plan"),
    "compact-view": () => { state.compactPlanView = !state.compactPlanView; expandedPlanDetails.clear(); save(); rerenderCurrentView(); },
    "account": account,
    "start-over": resetCoach
  });

  document.addEventListener("click", (event) => {
    const languageButton = event.target.closest("[data-language]");
    if (languageButton) { language = languageButton.dataset.language; localStorage.setItem("quota-vita-coach-language", language); location.reload(); return; }
    if (event.target.closest("[data-global-restart]")) return resetCoach();
    const navButton = event.target.closest("[data-nav]");
    if (navButton) return showView(navButton.dataset.nav);
    if (event.target.closest("#menu-toggle")) return setMenuOpen(!menuOpen);
    const menuAction = event.target.closest("[data-menu-action]");
    if (menuAction) {
      setMenuOpen(false);
      return menuActions()[menuAction.dataset.menuAction]?.();
    }
    if (menuOpen && !event.target.closest("#overflow-menu")) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (menuOpen) return setMenuOpen(false);
    document.querySelector(".modal [data-modal-close]")?.click();
  });
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target.matches("input, textarea, select, [contenteditable='true']")) return;
    const index = Number(event.key) - 1;
    const choices = [...root.querySelectorAll("[data-answer], [data-choice]")];
    if (index >= 0 && index < choices.length) { event.preventDefault(); choices[index].click(); }
  });
  new MutationObserver(() => translate()).observe(root, { childList: true, subtree: true });

  const activityLabelsCa = { rest: "Descans", run: "Córrer", strength: "Força", pilates: "Pilates", walk: "Caminar" };
  const activityLabel = (key) => (language === "ca" ? activityLabelsCa[key] : activityLabels[key]) || "";
  const weekdayNames = () => (language === "ca"
    ? ["Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"]
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  const catalanFood = {
    "Greek yogurt": "iogurt grec", "oats": "flocs de civada", "banana": "plàtan", "bananas": "plàtans",
    "berries": "fruits del bosc", "chicken": "pollastre", "chicken breast": "pit de pollastre",
    "dry rice": "arròs cru", "cooked lentils": "llenties cuites", "vegetables and salad": "verdures i amanida",
    "olive oil": "oli d’oliva", "wholegrain bread": "pa integral", "apple": "poma", "apples or pears": "pomes o peres",
    "nuts": "fruits secs", "cooked chickpeas": "cigrons cuits", "salmon": "salmó", "potatoes": "patates",
    "eggs": "ous", "turkey": "gall dindi", "cod": "bacallà", "tofu": "tofu", "tuna cans": "llaunes de tonyina",
    "cooked chickpeas or beans": "cigrons o mongetes cuits", "dry rice or quinoa": "arròs o quinoa cru",
    "dry wholegrain pasta": "pasta integral crua", "potatoes or sweet potatoes": "patates o moniatos",
    "mixed vegetables and salad": "verdures variades i amanida", "slices wholegrain bread": "llesques de pa integral",
    "nuts, seeds or peanut butter": "fruits secs, llavors o crema de cacauet"
  };
  const localiseFood = (name) => (language === "ca" ? (catalanFood[name] || name) : name);

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
        ["Breakfast", "Pa amb tomàquet with Greek yogurt, banana and berries", "2 slices wholegrain pa de pagès · ripe tomato · 250g Greek yogurt · 1 banana · 100g berries", "Start with carbohydrate and protein before the session.", "Pa amb tomàquet"],
        ["Lunch", "Escalivada with chickpeas and chicken", "160g chicken · 160g cooked chickpeas · roasted pepper, aubergine and onion · 1 slice pa de pagès · 10g olive oil", "Your main recovery meal.", "Escalivada"],
        ["Dinner", "Llenties estofades amb pa de pagès", "250g cooked lentils · 2 slices wholegrain pa de pagès · salad · ½ avocado", "Steady energy and fibre for tomorrow.", "Llenties estofades"]
      ]
      : [
        ["Breakfast", "Pa amb tomàquet with egg, fruit and nuts", "2 slices wholegrain pa de pagès · ripe tomato · 2 eggs · 1 apple · 15g nuts", "Protein, fibre and a satisfying start.", "Pa amb tomàquet"],
        ["Lunch", "Escalivada with chickpeas and chicken", "150g chicken · 160g chickpeas · 250g escalivada · 10g olive oil", "Build the plate around protein and plants.", "Escalivada"],
        ["Dinner", "Llenties estofades amb verdures i pa de pagès", "250g cooked lentils · carrot, celery and tomato · 2 slices wholegrain pa de pagès · salad", "A simple balanced evening meal.", "Llenties estofades"]
      ];
    return foods.map(([slot, title, portions, hint, catalanName], index) => ({
      id: slot.toLowerCase(),
      slot, title, portions, hint, catalanName,
      calories: Math.round(target.calories * share[index] / 25) * 25,
      proteinG: Math.round(target.proteinG * share[index]),
      carbohydrateG: Math.round(target.carbohydrateG * share[index]),
      fatG: Math.round(target.fatG * share[index])
    }));
  }

  function currentPlan() {
    const target = dailyTarget(state.profile, state.activity);
    const fallbackMeals = mealPlan(target, state.activity);
    const menuKey = dailyMenuKey();
    const generatedMeals = state.dailyMeals?.key === menuKey ? state.dailyMeals.meals : null;
    const meals = fallbackMeals.map((fallback, index) => localiseMeal({ ...fallback, ...(generatedMeals?.[index] || {}), id: fallback.id, slot: generatedMeals?.[index]?.slot || fallback.slot, calories: fallback.calories, proteinG: fallback.proteinG, carbohydrateG: fallback.carbohydrateG, fatG: fallback.fatG }));
    return { target, meals };
  }

  function dailyMenuKey() {
    const profile = state.profile || {};
    return [state.planDate, state.activity, state.menuNonce || 0, language, profile.activity, profile.goal].join("|");
  }

  function normaliseGeneratedDailyMeals(value) {
    const slots = ["Breakfast", "Lunch", "Dinner"];
    if (!Array.isArray(value) || value.length !== slots.length) return null;
    const meals = value.map((meal, index) => {
      const title = String(meal?.title || "").trim().slice(0, 140);
      const portions = String(meal?.portions || "").trim().slice(0, 280);
      const hint = String(meal?.hint || "").trim().slice(0, 180);
      const catalanName = String(meal?.catalanName || "").trim().slice(0, 120);
      if (!title || !portions || !hint) return null;
      return { slot: slots[index], title, portions, hint, catalanName, milkshakeEligible: Boolean(meal?.milkshakeEligible) };
    });
    return meals.every(Boolean) ? meals : null;
  }

  async function loadGeneratedDailyMeals(target) {
    const menuKey = dailyMenuKey();
    if (state.dailyMeals?.key === menuKey || pendingDailyMealPlans.has(menuKey) || failedDailyMealPlans.has(menuKey)) return;
    pendingDailyMealPlans.add(menuKey);
    try {
      const response = await fetch("/api/daily-meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity: state.activity,
          goal: state.profile?.goal,
          usualActivity: state.profile?.activity,
          target,
          language,
          variationSeed: state.menuNonce || 0
        })
      });
      const data = await response.json();
      const meals = normaliseGeneratedDailyMeals(data?.meals);
      if (!response.ok || !meals) throw new Error(data?.error || "A varied meal plan is unavailable.");
      if (dailyMenuKey() !== menuKey) return;
      state.dailyMeals = { key: menuKey, meals };
      state.mealImages = {};
      save();
      if (currentView === "today") refreshMealList();
    } catch {
      if (dailyMenuKey() === menuKey) failedDailyMealPlans.add(menuKey);
    } finally {
      pendingDailyMealPlans.delete(menuKey);
    }
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
    const totalSteps = questions.length + 1;
    let index = 0;
    const answerLabel = (question, value) => {
      if (!question.choices) return String(value) + (question.unit ? " " + question.unit : "");
      const choice = question.choices.find(([, choiceValue]) => choiceValue === value);
      return choice ? choice[0] : String(value);
    };
    const render = () => {
      const question = questions[index];
      const transcript = questions.slice(0, index).map((answered) => '<div class="bubble coach">' + esc(answered.label) + '</div><div class="bubble user">' + esc(answerLabel(answered, answers[answered.key])) + "</div>").join("");
      const input = question.choices
        ? '<div class="composer"><span class="composer-label">' + esc(T("Choose one reply", "Tria una resposta")) + '</span><p class="keyboard-hint">' + esc(T("Press " + question.choices.map((_, position) => position + 1).join(", ") + " on your keyboard to choose.", "Prem " + question.choices.map((_, position) => position + 1).join(", ") + " al teclat per triar.")) + '</p><div class="quick-replies">' + choiceButtons(question.choices, "data-answer") + "</div></div>"
        : '<form class="composer chat-input" id="chat-form"><input id="chat-answer" aria-label="' + esc(question.label) + '" placeholder="' + esc(T("Type your answer…", "Escriu la resposta…")) + '" type="number" inputmode="decimal" enterkeyhint="send" min="' + question.min + '" max="' + question.max + '" step="' + (question.step || 1) + '" value="' + esc(answers[question.key] ?? "") + '"><button class="button" type="submit">' + esc(T("Send", "Envia")) + "</button></form>";
      const intro = index === 0 ? '<div class="bubble coach coach-intro">Hi, I’m your Quota Vita Coach. I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.<span class="meta">I’ll tailor it to your body, usual activity, goal and today’s training—not give you a generic diet.</span></div>' : "";
      const back = index > 0 ? '<button class="button quiet" id="back" type="button">' + esc(T("Back", "Enrere")) + "</button>" : "";
      mount("setup", viewShell(
        "Let’s build your daily meal plan.",
        "Personal calories and macros, three meals and a one-day shopping basket.",
        stepper(index + 1, totalSteps)
          + '<div class="setup"><section class="chat" aria-live="polite">' + intro + transcript
          + '<div class="bubble coach">' + esc(question.label) + '<span class="meta">' + esc(question.hint) + "</span></div>" + input
          + '</section><div class="actions on-shell">' + back + '<button class="button quiet" id="cancel" type="button">' + esc(T("Cancel and restart", "Cancel·la i comença de nou")) + '</button></div><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p></div>',
        "view--setup"
      ));
      root.querySelector("#cancel").onclick = welcome;
      root.querySelector("#back")?.addEventListener("click", () => { index -= 1; render(); });
      root.querySelectorAll("[data-answer]").forEach((button) => button.onclick = () => advance(button.dataset.answer));
      const form = root.querySelector("#chat-form");
      if (form) form.onsubmit = (event) => { event.preventDefault(); advance(root.querySelector("#chat-answer").value); };
      requestAnimationFrame(() => root.querySelector("#chat-answer")?.focus({ preventScroll: true }));
    };
    const advance = (value) => {
      const question = questions[index];
      if (!question.choices && (!Number.isFinite(Number(value)) || Number(value) < question.min || Number(value) > question.max)) return render();
      answers[question.key] = question.choices ? value : Number(value);
      index += 1;
      if (index < questions.length) return render();
      state = { ...state, profile: answers, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
      save();
      track("onboarding_completed", { goal: String(answers.goal || ""), activity: String(answers.activity || "") });
      void pushProfile();
      training();
    };
    render();
  }

  function viewShell(title, lead, content, extraClass = "") {
    return '<section class="view' + (extraClass ? " " + extraClass : "") + (state.compactPlanView ? " compact-view" : "") + '"><header class="view-head"><p class="eyebrow">' + esc(T("Your Coach", "El teu coach")) + '</p><h1>' + esc(title) + "</h1>" + (lead ? '<p class="view-lead">' + esc(lead) + "</p>" : "") + "</header>" + content + "</section>";
  }

  function coachShell(title, lead, content) {
    return viewShell(title, lead, '<section class="chat" aria-live="polite">' + content + "</section>");
  }

  function training() {
    const choices = [["Rest or recovery day", "rest"], ["Walk", "walk"], ["Pilates", "pilates"], ["Strength training", "strength"], ["Run", "run"]];
    const inSetup = Boolean(state.needsTraining);
    const savedProfileLead = language === "ca"
      ? "El teu perfil està desat en aquest dispositiu. Els àpats i les quantitats s’adaptaran al moviment d’avui."
      : "Your profile is saved on this device. Your meals and quantities will adapt to today’s movement.";
    const back = inSetup
      ? '<button class="button quiet" id="back" type="button">' + esc(T("Back", "Enrere")) + "</button>"
      : '<button class="button quiet" id="back" type="button">' + esc(T("Back to today", "Torna a avui")) + "</button>";
    mount("setup", viewShell(
      "Are you going to train today?",
      savedProfileLead,
      (inSetup ? stepper(7, 7) : "")
        + '<div class="setup"><section class="chat" aria-live="polite"><div class="bubble coach">What does today’s movement look like?<span class="meta">Choose one reply. I will adapt your calories, carbohydrates and meal quantities.</span></div><div class="composer"><span class="composer-label">'
        + esc(T("Choose one reply", "Tria una resposta"))
        + '</span><p class="keyboard-hint">' + esc(T("Press 1, 2, 3, 4 or 5 on your keyboard to choose.", "Prem 1, 2, 3, 4 o 5 al teclat per triar.")) + '</p><div class="quick-replies">'
        + choiceButtons(choices, "data-choice")
        + '</div></div></section><div class="actions on-shell">' + back + "</div></div>",
      "view--setup"
    ));
    root.querySelector("#back").onclick = () => { if (inSetup) return profile(); state.needsTraining = false; dashboard(); };
    root.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => { failedMealImages.clear(); failedWeeklyMealImages.clear(); failedDailyMealPlans.clear(); state.activity = button.dataset.choice; state.needsTraining = false; state.meals = {}; state.mealImages = {}; state.weeklyMealImages = {}; state.dailyMeals = null; state.menuNonce = (state.menuNonce || 0) + 1; save(); dashboard(); });
  }

  function totals(plan) {
    const eaten = Object.entries(state.meals).filter(([, item]) => item.status === "eaten" || item.status === "restaurant").map(([id]) => plan.meals.find((meal) => meal.id === id)).filter(Boolean);
    return eaten.reduce((sum, meal) => ({ calories: sum.calories + meal.calories, proteinG: sum.proteinG + meal.proteinG, carbohydrateG: sum.carbohydrateG + meal.carbohydrateG, fatG: sum.fatG + meal.fatG }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 });
  }

  function methodology() {
    const item = (label, body) => "<li><strong>" + label + ":</strong> " + body + "</li>";
    const items = language === "ca"
      ? item("Idees d’àpats", "Les plantilles d’àpats pràctiques de Quota Vita es construeixen amb aliments integrals coneguts, patrons de plat equilibrat i l’objectiu general de macronutrients calculat més avall. No són receptes proporcionades per FatSecret, LogMeal, un restaurant o una dietista.")
        + item("Àpats catalans", "Els plats catalans amb nom i els seus ingredients principals es contrasten amb el coneixement verificat de Cala abans de prioritzar-los al Coach. Les mides de les racions continuen sent plantilles de benestar general, no instruccions de recepta tradicional.")
        + item("Energia", "Una estimació d’energia en repòs de Mifflin-St Jeor fa servir l’edat, l’alçada, el pes i el sexe; l’activitat habitual que has triat, l’objectiu i l’activitat d’avui hi apliquen després ajustos fixos i transparents.")
        + item("Macronutrients", "La proteïna segueix una heurística de benestar general d’1,2 a 1,6 g/kg; el greix se situa al 28 % de l’energia; els carbohidrats completen l’energia restant. La fibra té un objectiu de 25 g al dia (30 g per a l’opció masculina en aquest prototip).")
        + item("Dades d’aliments i fotos", "FatSecret només es fa servir per cercar aliments quan està activat; LogMeal només es fa servir per estimar una foto de restaurant després d’un consentiment explícit. Cap dels dos és la font del càlcul principal de calories.")
      : item("Meal ideas", "Quota Vita’s practical meal templates are built from familiar whole foods, balanced-plate patterns and the general macro target calculated below. They are not recipes supplied by FatSecret, LogMeal, a restaurant or a dietitian.")
        + item("Catalan meals", "Named Catalan dishes and their core ingredients are checked against Cala’s verified knowledge before being prioritised in the Coach. Portion sizes remain general-wellbeing templates, not traditional recipe instructions.")
        + item("Energy", "a Mifflin-St Jeor resting-energy estimate uses age, height, weight and sex; your selected usual activity, goal and today’s activity then make transparent fixed adjustments.")
        + item("Macros", "protein is a general-wellbeing heuristic of 1.2-1.6g/kg; fat is set at 28% of energy; carbohydrates make up the remaining energy. Fibre aims for 25g/day (30g for the male option in this prototype).")
        + item("Food and photo data", "FatSecret is only used for food lookup when enabled; LogMeal is only used for a restaurant-photo estimate after explicit consent. Neither is the source of the core calorie calculation.");
    const sources = language === "ca"
      ? 'Fonts: <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin et al. (1990)</a>; <a href="https://multimedia.efsa.europa.eu/drvs/index.htm" target="_blank" rel="noopener">valors dietètics de referència de l’EFSA</a>. Les estimacions poden ser molt inexactes per a una persona concreta. Consulta un professional sanitari qualificat en cas de malaltia, embaràs, antecedents de trastorn de la conducta alimentària, malaltia renal o diabetis.'
      : 'Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin et al. (1990)</a>; <a href="https://multimedia.efsa.europa.eu/drvs/index.htm" target="_blank" rel="noopener">EFSA Dietary Reference Values</a>. Estimates can be materially wrong for an individual. Seek a qualified clinician for medical conditions, pregnancy, eating-disorder history, kidney disease or diabetes.';
    return '<details class="method"><summary>' + esc(T("Where the meal ideas come from", "D’on surten les idees d’àpats")) + "</summary><ul>" + items + '</ul><p class="meta">' + sources + "</p></details>";
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
      ? "<ul>" + basketItems(plan).map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(localiseFood(name)) + "</li>").join("") + "</ul>"
      : plan.meals.map((meal) => "<section><h2>" + esc(meal.slot) + ": " + esc(meal.title) + "</h2>" + (meal.catalanName ? "<p><strong>Catalan dish:</strong> " + esc(meal.catalanName) + "</p>" : "") + "<p>" + esc(meal.portions) + "</p><p>" + meal.calories + " kcal · " + meal.proteinG + "g protein · " + meal.carbohydrateG + "g carbohydrates · " + meal.fatG + "g fat</p></section>").join("");
    const popup = window.open("", "_blank");
    if (!popup) return alert(T("Allow pop-ups to download your PDF.", "Permet les finestres emergents per baixar el PDF."));
    popup.document.write("<!doctype html><title>" + title + "</title><style>body{max-width:760px;margin:48px auto;color:#183d39;font:16px/1.5 system-ui}h1,h2{font-family:Georgia,serif}h1{font-size:42px}h2{font-size:23px;border-top:1px solid #c9d7c7;padding-top:18px}li{margin:8px 0}.meta{color:#5c756f;font-size:13px;margin-top:32px}@page{margin:18mm}</style><h1>Quota Vita / " + title + "</h1><p>" + esc(activityLabel(state.activity)) + " · " + plan.target.calories + " kcal · " + plan.target.proteinG + "g protein · " + plan.target.carbohydrateG + "g carbohydrates · " + plan.target.fatG + "g fat</p>" + content + '<p class="meta">General wellbeing estimate. Method: Mifflin-St Jeor energy estimate plus transparent activity and goal adjustments. EFSA DRVs inform macro and fibre context. Not medical advice.</p>');
    popup.document.close();
    setTimeout(() => popup.print(), 250);
  }

  function liveCoachMarkup(placement) {
    const ask = T("Ask", "Pregunta");
    const askLabel = T("Ask your Coach…", "Pregunta al teu Coach…");
    const messages = Array.isArray(state.chat) ? state.chat.slice(-8) : [];
    const thread = messages.length
      ? messages.map((message) => '<div class="bubble ' + (message.role === "user" ? "user" : "coach") + '">' + esc(message.text) + "</div>").join("")
      : '<div class="bubble coach">Ask about a meal, a healthy swap or today’s training.<span class="meta">General wellbeing guidance, not medical advice.</span></div>';
    return '<section class="live-coach" aria-label="Talk to your Coach"><p class="eyebrow">Talk to your Coach</p><div class="live-coach-thread" data-live-coach-thread="' + placement + '" aria-live="polite">' + thread + '</div><form class="composer chat-input" data-live-coach-form="' + placement + '"><input maxlength="1400" placeholder="' + esc(askLabel) + '" aria-label="' + esc(askLabel) + '" required><button class="button" type="submit">' + esc(ask) + '</button></form><p class="meta">Messages are sent to OpenAI to generate a reply. Quota Vita keeps this conversation only on this device.</p></section>';
  }

  function renderCoachThreads() {
    const messages = Array.isArray(state.chat) ? state.chat.slice(-8) : [];
    root.querySelectorAll("[data-live-coach-thread]").forEach((thread) => {
      thread.innerHTML = messages.map((message) => '<div class="bubble ' + (message.role === "user" ? "user" : "coach") + '">' + esc(message.text) + "</div>").join("");
      thread.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    translate();
  }

  async function askLiveCoach(message, placement) {
    const chat = Array.isArray(state.chat) ? state.chat : [];
    state.chat = [...chat, { role: "user", text: message }].slice(-12);
    save();
    completeQuest("ask");
    renderCoachThreads();
    const forms = [...root.querySelectorAll("[data-live-coach-form]")];
    forms.forEach((form) => {
      form.querySelector("input").value = "";
      form.querySelector("input").disabled = true;
      const submit = form.querySelector("button");
      submit.disabled = true;
      submit.textContent = T("Thinking…", "Hi penso…");
    });
    try {
      const response = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, messages: state.chat })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The live Coach is unavailable.");
      state.chat = [...state.chat, { role: "assistant", text: data.reply }].slice(-12);
      save();
      renderCoachThreads();
    } catch (error) {
      const thread = root.querySelector('[data-live-coach-thread="' + placement + '"]') || root.querySelector("[data-live-coach-thread]");
      if (thread) thread.insertAdjacentHTML("beforeend", '<p class="status error">' + esc(error.message || "The live Coach is unavailable.") + "</p>");
    } finally {
      forms.forEach((form) => {
        form.querySelector("input").disabled = false;
        const submit = form.querySelector("button");
        submit.disabled = false;
        submit.textContent = T("Ask", "Pregunta");
      });
    }
  }

  function bindLiveCoach() {
    root.querySelectorAll("[data-live-coach-form]").forEach((form) => form.onsubmit = (event) => {
      event.preventDefault();
      const input = form.querySelector("input");
      const message = input.value.trim();
      if (message) askLiveCoach(message, form.dataset.liveCoachForm);
    });
  }

  function detailToggleMarkup(detailKey, collapsed) {
    const label = collapsed ? T("+ Details", "+ Detalls") : T("− Hide details", "− Amaga els detalls");
    return '<button class="detail-toggle" type="button" data-detail-toggle="' + esc(detailKey) + '" aria-controls="' + esc(detailKey) + '-details" aria-expanded="' + String(!collapsed) + '">' + label + "</button>";
  }

  function bindDetailToggles() {
    root.querySelectorAll("[data-detail-toggle]").forEach((button) => {
      button.onclick = () => {
        const card = button.closest("[data-detail-card]");
        if (!card) return;
        const collapsed = card.classList.toggle("is-collapsed");
        const detailKey = button.dataset.detailToggle;
        if (collapsed) expandedPlanDetails.delete(detailKey); else expandedPlanDetails.add(detailKey);
        button.setAttribute("aria-expanded", String(!collapsed));
        button.textContent = collapsed ? T("+ Details", "+ Detalls") : T("− Hide details", "− Amaga els detalls");
      };
    });
  }

  function targetPanelMarkup(plan) {
    const eaten = totals(plan);
    const left = {
      calories: Math.max(0, plan.target.calories - eaten.calories),
      proteinG: Math.max(0, plan.target.proteinG - eaten.proteinG),
      carbohydrateG: Math.max(0, plan.target.carbohydrateG - eaten.carbohydrateG),
      fatG: Math.max(0, plan.target.fatG - eaten.fatG)
    };
    const logged = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status)).length;
    const percent = (value, target) => (target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0);
    const row = (label, value, target, modifier) => '<div class="macro-row"><span>' + esc(label) + '</span><div class="bar ' + modifier + '"><i style="width:' + percent(target - value, target) + '%"></i></div><b>' + value + "g</b></div>";
    return '<section class="target" id="target-panel">'
      + '<div class="target-head"><div><span class="target-label">' + esc(T("Still to eat", "Encara per menjar")) + '</span><div class="target-figure"><b>' + left.calories.toLocaleString(language === "ca" ? "ca-ES" : "en-GB") + "</b><span>kcal</span></div></div>"
      + '<span class="chip">' + esc(activityLabel(state.activity)) + "</span></div>"
      + '<div class="target-macros">'
      + row(T("Protein", "Proteïna"), left.proteinG, plan.target.proteinG, "bar--protein")
      + row(T("Carbs", "Carbohidrats"), left.carbohydrateG, plan.target.carbohydrateG, "bar--carbs")
      + row(T("Fat", "Greixos"), left.fatG, plan.target.fatG, "bar--fat")
      + "</div>"
      + '<div class="target-foot"><p class="meta">' + logged + " " + esc(T("of", "de")) + " " + plan.meals.length + " " + esc(T("meals logged today", "àpats registrats avui")) + '</p><button class="link-button" type="button" data-menu-action="daily-check">' + esc(T("Daily check", "Revisió del dia")) + "</button></div>"
      + "</section>";
  }

  function updateTargetPanel(plan) {
    const panel = root.querySelector("#target-panel");
    if (panel) { panel.outerHTML = targetPanelMarkup(plan); translate(); }
  }

  function dashboard() {
    const plan = currentPlan();
    const generating = !state.dailyMeals && pendingDailyMealPlans.size > 0;
    const chip = generating ? '<p class="loading-chip">' + esc(T("Personalising your meals…", "Personalitzant els teus àpats…")) + "</p>" : "";
    mount("today", viewShell(
      T("Today’s plan", "El pla d’avui"),
      T("Three meals built around your body, your goal and today’s movement.", "Tres àpats pensats pel teu cos, el teu objectiu i el moviment d’avui."),
      chip
        + '<div class="today"><div class="today-main">' + targetPanelMarkup(plan)
        + '<ul class="meal-list" id="meal-list">' + mealListMarkup(plan) + "</ul>"
        + '<p class="privacy">This plan is stored only in this browser.</p>' + methodology() + "</div>"
        + '<aside class="today-aside">' + liveCoachMarkup("desktop") + "</aside></div>",
      "view--today"
    ));
    track("targets_shown", { calories: plan.target.calories, protein_g: plan.target.proteinG, activity: String(state.activity || "") });
    bindTodayHandlers(plan);
    loadMealImages(plan);
    void loadGeneratedDailyMeals(plan.target);
  }

  function mealListMarkup(plan) {
    const milkshakeMeal = plan.meals.find((meal) => meal.milkshakeEligible)?.id || "lunch";
    return plan.meals.map((meal) => "<li>" + mealCard(meal, meal.id === milkshakeMeal) + "</li>").join("");
  }

  function refreshMealList() {
    const plan = currentPlan();
    const list = root.querySelector("#meal-list");
    if (!list) return dashboard();
    list.innerHTML = mealListMarkup(plan);
    root.querySelector(".loading-chip")?.remove();
    bindTodayHandlers(plan);
    updateTargetPanel(plan);
    translate();
    loadMealImages(plan);
  }

  function refreshMealCard(id) {
    const plan = currentPlan();
    const card = root.querySelector('[data-meal-card="' + id + '"]');
    if (!card) return dashboard();
    const milkshakeMeal = plan.meals.find((meal) => meal.milkshakeEligible)?.id || "lunch";
    card.outerHTML = mealCard(plan.meals.find((meal) => meal.id === id), id === milkshakeMeal);
    bindTodayHandlers(plan);
    updateTargetPanel(plan);
    translate();
  }

  function bindTodayHandlers(plan) {
    root.querySelectorAll("[data-meal]").forEach((button) => button.onclick = () => checkIn(button.dataset.meal));
    root.querySelectorAll("[data-confirm-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.confirmMeal, "eaten"); refreshMealCard(button.dataset.confirmMeal); });
    root.querySelectorAll("[data-skip-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.skipMeal, "skipped"); refreshMealCard(button.dataset.skipMeal); });
    root.querySelectorAll("[data-restaurant-meal]").forEach((button) => {
      const meal = plan.meals.find((item) => item.id === button.dataset.restaurantMeal);
      button.onclick = () => restaurantOverlay(button.dataset.restaurantMeal, meal);
    });
    bindDetailToggles();
    bindLiveCoach();
    enableMealSwipe();
  }

  function enableMealSwipe() {
    if (!window.matchMedia("(hover: none)").matches) return;
    root.querySelectorAll("[data-meal-card]").forEach((card) => {
      if (card.dataset.swipeBound === "true" || card.dataset.status !== "planned") return;
      card.dataset.swipeBound = "true";
      let startX = 0;
      let startY = 0;
      let tracking = false;
      card.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        tracking = true;
      }, { passive: true });
      card.addEventListener("touchend", (event) => {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        if (Math.abs(deltaX) < 90 || Math.abs(deltaX) < Math.abs(deltaY) * 1.6) return;
        const id = card.dataset.mealCard;
        recordMeal(id, deltaX > 0 ? "eaten" : "skipped");
        refreshMealCard(id);
      }, { passive: true });
    });
  }

  function coachPage() {
    mount("coach", viewShell(
      T("Talk to your Coach", "Parla amb el teu Coach"),
      T("Ask about a meal, a healthy swap or today’s training.", "Pregunta per un àpat, un canvi saludable o l’entrenament d’avui."),
      '<div class="view--coach">' + liveCoachMarkup("page") + "</div>"
    ));
    bindLiveCoach();
    root.querySelector("[data-live-coach-form] input")?.focus({ preventScroll: true });
  }
  /* ----------------------------------------------------------------------
     Progress: streaks, XP, daily goal, quests and badges.

     Modelled on Duolingo's loop — a visible streak, a daily XP goal, a small
     set of quests and immediate feedback on every action. One deliberate
     difference: nothing here rewards eating less. XP comes from logging,
     planning and hitting your protein target, never from a calorie deficit,
     because a nutrition app that gamifies restriction is a nutrition app that
     hurts people.
     ---------------------------------------------------------------------- */

  const DAILY_GOAL_XP = 40;

  const LEVELS = [
    { xp: 0, en: "Getting started", ca: "Comences" },
    { xp: 60, en: "Consistent", ca: "Constant" },
    { xp: 180, en: "Balanced plate", ca: "Plat equilibrat" },
    { xp: 380, en: "Strong week", ca: "Setmana forta" },
    { xp: 650, en: "Mediterranean pro", ca: "Pro mediterrani" },
    { xp: 1000, en: "Coach’s regular", ca: "Habitual del Coach" },
    { xp: 1500, en: "Quota Vita legend", ca: "Llegenda Quota Vita" }
  ];

  const QUEST_POOL = [
    { id: "log-all", xp: 15, en: "Log all three meals", ca: "Registra els tres àpats" },
    { id: "protein", xp: 20, en: "Hit your protein target", ca: "Assoleix el teu objectiu de proteïna" },
    { id: "check", xp: 15, en: "Complete your daily check", ca: "Completa la revisió del dia" },
    { id: "ask", xp: 10, en: "Ask your Coach a question", ca: "Fes una pregunta al teu Coach" },
    { id: "week", xp: 10, en: "Review your seven-day plan", ca: "Revisa el pla de set dies" },
    { id: "basket", xp: 10, en: "Open your shopping basket", ca: "Obre la teva cistella" }
  ];

  const BADGES = [
    { id: "first-plate", icon: "🍽️", en: "First plate", ca: "Primer plat", hint: { en: "Log your first meal", ca: "Registra el teu primer àpat" } },
    { id: "streak-3", icon: "🔥", en: "Three in a row", ca: "Tres seguits", hint: { en: "A 3-day streak", ca: "Ratxa de 3 dies" } },
    { id: "streak-7", icon: "⭐", en: "Full week", ca: "Setmana sencera", hint: { en: "A 7-day streak", ca: "Ratxa de 7 dies" } },
    { id: "streak-30", icon: "🏆", en: "Thirty days", ca: "Trenta dies", hint: { en: "A 30-day streak", ca: "Ratxa de 30 dies" } },
    { id: "protein-5", icon: "💪", en: "Protein five", ca: "Cinc de proteïna", hint: { en: "Hit protein on 5 days", ca: "Assoleix la proteïna 5 dies" } },
    { id: "week-planner", icon: "🗓️", en: "Week planner", ca: "Planificador", hint: { en: "Build a weekly basket", ca: "Crea una cistella setmanal" } },
    { id: "scanner", icon: "📷", en: "Eating out", ca: "Menjar fora", hint: { en: "Log a restaurant meal", ca: "Registra un àpat de restaurant" } },
    { id: "level-5", icon: "🫒", en: "Mediterranean pro", ca: "Pro mediterrani", hint: { en: "Reach level 5", ca: "Arriba al nivell 5" } }
  ];

  function game() {
    if (!state.game) {
      // Carry the old points/streak counters into the new model rather than resetting anyone.
      state.game = {
        xp: Number(state.totalPoints) || 0,
        streak: Number(state.streak) || 0,
        lastGoalDay: state.dailyCheckAwardedDate || "",
        freezes: 1,
        days: {},
        badges: [],
        proteinDays: 0
      };
    }
    if (!state.game.days) state.game.days = {};
    if (!Array.isArray(state.game.badges)) state.game.badges = [];
    return state.game;
  }

  function todayGame() {
    const key = todayKey();
    const g = game();
    if (!g.days[key]) g.days[key] = { xp: 0, quests: {}, goal: false };
    // Keep only the last 60 days so localStorage cannot grow without bound.
    const keys = Object.keys(g.days).sort();
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((old) => delete g.days[old]);
    return g.days[key];
  }

  function levelFor(xp) {
    let index = 0;
    LEVELS.forEach((level, position) => { if (xp >= level.xp) index = position; });
    const current = LEVELS[index];
    const next = LEVELS[index + 1];
    return {
      number: index + 1,
      name: language === "ca" ? current.ca : current.en,
      floor: current.xp,
      ceiling: next ? next.xp : current.xp,
      isMax: !next,
      progress: next ? Math.min(100, Math.round(((xp - current.xp) / (next.xp - current.xp)) * 100)) : 100
    };
  }

  function dayOffsetKey(offset) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return todayKey(date);
  }

  /** A day counts towards the streak once its XP goal is met. */
  function syncStreak() {
    const g = game();
    const today = todayKey();
    if (g.lastGoalDay === today) return;
    const yesterday = dayOffsetKey(1);
    if (g.lastGoalDay === yesterday) return;
    if (!g.lastGoalDay) { g.streak = g.streak || 0; return; }
    // A missed day: spend a freeze if there is one, otherwise the streak resets.
    const missedTwo = g.lastGoalDay < dayOffsetKey(2);
    if (!missedTwo && (g.freezes || 0) > 0 && g.streak > 0) {
      g.freezes -= 1;
      g.lastGoalDay = yesterday;
      g.frozeOn = today;
      return;
    }
    if (g.lastGoalDay < yesterday) g.streak = 0;
  }

  function awardBadge(id) {
    const g = game();
    if (g.badges.includes(id)) return false;
    g.badges.push(id);
    const badge = BADGES.find((item) => item.id === id);
    if (badge) celebrate(badge.icon, T("Badge unlocked", "Insígnia desbloquejada"), language === "ca" ? badge.ca : badge.en);
    return true;
  }

  function refreshBadges() {
    const g = game();
    if (g.streak >= 3) awardBadge("streak-3");
    if (g.streak >= 7) awardBadge("streak-7");
    if (g.streak >= 30) awardBadge("streak-30");
    if ((g.proteinDays || 0) >= 5) awardBadge("protein-5");
    if (levelFor(g.xp).number >= 5) awardBadge("level-5");
  }

  function awardXp(amount, label) {
    const g = game();
    const day = todayGame();
    const beforeLevel = levelFor(g.xp).number;
    g.xp += amount;
    day.xp += amount;
    xpToast(amount, label);
    if (!day.goal && day.xp >= DAILY_GOAL_XP) {
      day.goal = true;
      const today = todayKey();
      if (g.lastGoalDay !== today) {
        g.streak = g.lastGoalDay === dayOffsetKey(1) ? (g.streak || 0) + 1 : 1;
        g.lastGoalDay = today;
      }
      celebrate("🔥", T("Daily goal complete", "Objectiu diari assolit"), T("Streak: ", "Ratxa: ") + g.streak + " " + (g.streak === 1 ? T("day", "dia") : T("days", "dies")));
    }
    const afterLevel = levelFor(g.xp).number;
    if (afterLevel > beforeLevel) celebrate("🎉", T("Level up", "Nivell superat"), levelFor(g.xp).name);
    refreshBadges();
    save();
    renderChrome();
  }

  /** Marks a quest done and pays it out once. */
  function completeQuest(id) {
    const day = todayGame();
    if (day.quests[id]) return;
    const quest = QUEST_POOL.find((item) => item.id === id);
    if (!quest) return;
    day.quests[id] = true;
    awardXp(quest.xp, language === "ca" ? quest.ca : quest.en);
  }

  function xpToast(amount, label) {
    const host = document.querySelector("#toast-host") || (() => {
      const node = document.createElement("div");
      node.id = "toast-host";
      node.className = "toast-host";
      document.body.append(node);
      return node;
    })();
    const toast = document.createElement("p");
    toast.className = "toast";
    toast.innerHTML = '<b>+' + amount + " XP</b>" + (label ? "<span>" + esc(label) + "</span>" : "");
    host.append(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function celebrate(icon, title, subtitle) {
    const overlay = document.createElement("div");
    overlay.className = "celebrate";
    overlay.innerHTML = '<div class="celebrate-card"><span class="celebrate-icon" aria-hidden="true">' + icon + "</span><strong>" + esc(title) + "</strong><span>" + esc(subtitle) + "</span></div>";
    document.body.append(overlay);
    setTimeout(() => overlay.classList.add("is-leaving"), 1500);
    setTimeout(() => overlay.remove(), 2100);
  }

  /** Quests are picked per day so they feel fresh but never shuffle mid-day. */
  function todayQuests() {
    const seed = [...todayKey()].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const rotated = QUEST_POOL.slice(seed % QUEST_POOL.length).concat(QUEST_POOL.slice(0, seed % QUEST_POOL.length));
    // "Log all three meals" is the core habit, so it is always on the board.
    const core = QUEST_POOL[0];
    return [core, ...rotated.filter((quest) => quest.id !== core.id).slice(0, 2)];
  }

  function checkProteinQuest() {
    const plan = currentPlan();
    const eaten = totals(plan);
    if (eaten.proteinG < plan.target.proteinG) return;
    const day = todayGame();
    if (!day.proteinCounted) { day.proteinCounted = true; game().proteinDays = (game().proteinDays || 0) + 1; }
    completeQuest("protein");
  }

  function checkMealQuests() {
    const plan = currentPlan();
    const logged = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    if (logged.length) awardBadge("first-plate");
    if (logged.length >= plan.meals.length) completeQuest("log-all");
    checkProteinQuest();
    save();
  }

  function streakChipsMarkup() {
    const g = game();
    const day = todayGame();
    const percent = Math.min(100, Math.round((day.xp / DAILY_GOAL_XP) * 100));
    return '<button class="streak-chips" type="button" data-nav="progress" aria-label="' + esc(T("Your progress", "El teu progrés")) + '">'
      + '<span class="streak-chip"><span aria-hidden="true">🔥</span>' + (g.streak || 0) + "</span>"
      + '<span class="streak-chip streak-chip--xp"><span class="xp-ring" style="--p:' + percent + '"></span>' + day.xp + "</span>"
      + "</button>";
  }

  function progressView() {
    const g = game();
    const day = todayGame();
    const level = levelFor(g.xp);
    const percent = Math.min(100, Math.round((day.xp / DAILY_GOAL_XP) * 100));
    const week = [6, 5, 4, 3, 2, 1, 0].map((offset) => {
      const key = dayOffsetKey(offset);
      const done = key === todayKey() ? day.goal : Boolean(g.days?.[key]?.goal);
      const initials = new Intl.DateTimeFormat(language === "ca" ? "ca-ES" : "en-GB", { weekday: "narrow" }).format(new Date(Date.now() - offset * 86400000)).replace(/\.$/, "");
      return '<div class="streak-day' + (done ? " is-done" : "") + (offset === 0 ? " is-today" : "") + '"><span>' + esc(initials) + '</span><i aria-hidden="true">' + (done ? "🔥" : "") + "</i></div>";
    }).join("");
    const quests = todayQuests().map((quest) => {
      const done = Boolean(day.quests[quest.id]);
      return '<li class="quest' + (done ? " is-done" : "") + '"><span class="quest-check" aria-hidden="true">' + (done ? "✓" : "") + '</span><span class="quest-text">' + esc(language === "ca" ? quest.ca : quest.en) + '</span><span class="quest-xp">+' + quest.xp + " XP</span></li>";
    }).join("");
    const badges = BADGES.map((badge) => {
      const earned = g.badges.includes(badge.id);
      return '<li class="badge' + (earned ? " is-earned" : "") + '"><span class="badge-icon" aria-hidden="true">' + badge.icon + '</span><strong>' + esc(language === "ca" ? badge.ca : badge.en) + "</strong><span>" + esc(language === "ca" ? badge.hint.ca : badge.hint.en) + "</span></li>";
    }).join("");
    mount("progress", viewShell(
      T("Your progress", "El teu progrés"),
      T("Consistency, not perfection. Points come from logging and planning — never from eating less.", "Constància, no perfecció. Els punts venen de registrar i planificar, mai de menjar menys."),
      '<div class="stack">'
      + '<section class="card level-card"><div class="level-head"><div><p class="eyebrow">' + esc(T("Level", "Nivell")) + " " + level.number + '</p><h2 class="level-name">' + esc(level.name) + '</h2></div><span class="level-xp">' + g.xp + " XP</span></div>"
      + '<div class="bar"><i style="width:' + level.progress + '%"></i></div>'
      + '<p class="meta">' + esc(level.isMax ? T("Top level reached.", "Has arribat al nivell més alt.") : (level.ceiling - g.xp) + " " + T("XP to the next level", "XP per al nivell següent")) + "</p></section>"
      + '<section class="card"><div class="goal-head"><p class="eyebrow">' + esc(T("Today’s goal", "Objectiu d’avui")) + '</p><span class="goal-count">' + day.xp + " / " + DAILY_GOAL_XP + " XP</span></div>"
      + '<div class="bar"><i style="width:' + percent + '%"></i></div>'
      + '<div class="streak-week">' + week + "</div>"
      + '<p class="meta">' + esc(T("Streak", "Ratxa")) + ": <strong>" + (g.streak || 0) + "</strong> " + esc(g.streak === 1 ? T("day", "dia") : T("days", "dies")) + " · " + esc(T("Streak freezes left", "Congelacions de ratxa")) + ": " + (g.freezes || 0) + "</p></section>"
      + '<section class="card"><p class="eyebrow">' + esc(T("Today’s quests", "Missions d’avui")) + '</p><ul class="quest-list">' + quests + "</ul></section>"
      + '<section class="card"><p class="eyebrow">' + esc(T("Badges", "Insígnies")) + '</p><ul class="badge-grid">' + badges + "</ul></section>"
      + '<div class="actions on-shell"><button class="button" type="button" data-menu-action="daily-check">' + esc(T("Daily check", "Revisió del dia")) + '</button><button class="button quiet" type="button" data-nav="today">' + esc(T("Back to today", "Torna a avui")) + "</button></div>"
      + "</div>",
      "view--progress"
    ));
  }

  function recordMeal(id, status, details = {}) {
    const previous = state.meals[id] || {};
    const eligible = status === "eaten" || status === "restaurant";
    if (eligible && !previous.pointsAwarded) details.pointsAwarded = true;
    else if (previous.pointsAwarded) details.pointsAwarded = true;
    state.meals[id] = { ...previous, ...details, status };
    save();
    if (eligible && !previous.pointsAwarded) {
      awardXp(10, T("Meal logged", "Àpat registrat"));
      if (status === "restaurant") awardBadge("scanner");
    }
    checkMealQuests();
    track("meal_logged", { status, meal: id });
    if (eligible) void pushMeal(currentPlan().meals.find((meal) => meal.id === id), status);
  }

  function dailyCheck() {
    const plan = currentPlan();
    const completed = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    const pending = plan.meals.filter((meal) => !["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    const date = new Intl.DateTimeFormat(language === "ca" ? "ca-ES" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    const completedToday = state.dailyCheckAwardedDate === todayKey();
    const points = todayGame().xp;
    const totalPoints = game().xp;
    const scoreboard = '<div class="card"><p class="eyebrow">' + esc(date) + '</p><div class="scoreboard">'
      + [[completed.length + " / " + plan.meals.length, T("meals logged", "àpats registrats")], [String(points) + " XP", T("earned today", "guanyats avui")], [String(totalPoints) + " XP", T("total", "total")], [String(game().streak || 0), T("day streak", "dies seguits")]]
        .map(([value, label]) => '<div class="score"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>").join("")
      + "</div></div>";
    const content = scoreboard
      + (pending.length
        ? '<div class="card"><p class="eyebrow">' + esc(T("Still to review", "Encara per revisar")) + '</p><div class="quick-replies">' + pending.map((meal) => '<button type="button" data-daily-check="' + esc(meal.id) + '"><span>' + esc(meal.slot) + ": " + esc(meal.title) + "</span></button>").join("") + "</div></div>"
        : '<div class="card"><p>' + esc(T("Your daily check is complete. Your meals and plan are saved on this device for today.", "La revisió del dia està completa. Els àpats i el pla es desen en aquest dispositiu per avui.")) + "</p></div>")
      + '<div class="actions on-shell">'
      + (pending.length ? "" : completedToday
        ? '<span class="chip chip--logged">' + esc(T("Daily check completed · +10", "Revisió completada · +10")) + "</span>"
        : '<button class="button" type="button" id="complete-check">' + esc(T("Complete today’s check (+10)", "Completa la revisió d’avui (+10)")) + "</button>")
      + '<button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + "</button></div>";
    mount("today", viewShell(T("Daily check", "Revisió del dia"), T("Review what you have eaten today and adapt the remaining meals.", "Revisa què has menjat avui i adapta els àpats que queden."), '<div class="stack">' + content + "</div>"));
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#complete-check")?.addEventListener("click", completeDailyCheck);
    root.querySelectorAll("[data-daily-check]").forEach((button) => button.onclick = () => checkIn(button.dataset.dailyCheck));
  }

  function completeDailyCheck() {
    const today = todayKey();
    if (state.dailyCheckAwardedDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      state.streak = state.dailyCheckDate === todayKey(yesterday) ? (state.streak || 0) + 1 : 1;
      state.dailyCheckDate = today;
      state.dailyCheckAwardedDate = today;
      save();
      completeQuest("check");
    }
    dailyCheck();
  }

  const quotaVitaMilkshakeMl = (proteinG) => Math.max(100, Math.ceil((Number(proteinG) / 24) * 10) * 10);
  const milkshakeOptionMarkup = (meal) => {
    const millilitres = quotaVitaMilkshakeMl(meal.proteinG);
    const text = language === "ca"
      ? "Substitueix la proteïna · " + millilitres + " ml · 24 g/100 ml"
      : "Protein swap · " + millilitres + " ml · 24 g/100 ml";
    return '<p class="milkshake" data-shop-ml="' + millilitres + '"><strong>Quota Vita Milkshake</strong><span>' + text + '</span></p>';
  };

  function mealCard(meal, showMilkshakeOption = meal.id === "lunch") {
    const status = state.meals[meal.id]?.status;
    const statusLabels = {
      restaurant: [T("Restaurant meal", "Àpat de restaurant"), "chip--restaurant"],
      eaten: [T("Logged", "Registrat"), "chip--logged"],
      skipped: [T("Skipped", "Omès"), "chip--skipped"]
    };
    const [statusLabel, statusClass] = statusLabels[status] || ["", ""];
    const chip = statusLabel ? '<span class="chip ' + statusClass + '">' + esc(statusLabel) + "</span>" : "";
    const imageUrl = state.mealImages?.[meal.id];
    const image = imageUrl
      ? '<img class="meal-image" src="' + esc(imageUrl) + '" alt="' + esc(meal.title) + '">'
      : '<div class="meal-image meal-image-placeholder" data-meal-image-placeholder="' + esc(meal.id) + '" role="status"><span>' + esc(failedMealImages.has(mealImageKey(meal)) ? T("Meal image is unavailable right now.", "Ara mateix la imatge de l’àpat no està disponible.") : T("Creating your meal image…", "Creant la imatge de l’àpat…")) + "</span></div>";
    const actions = status
      ? '<div class="meal-actions"><button class="button quiet" type="button" data-meal="' + esc(meal.id) + '">' + esc(T("Review this meal", "Revisa aquest àpat")) + "</button></div>"
      : '<div class="meal-actions"><button class="button" type="button" data-confirm-meal="' + esc(meal.id) + '">' + esc(T("I’ll eat this", "M’ho menjaré")) + '</button><button class="button quiet" type="button" data-restaurant-meal="' + esc(meal.id) + '">' + esc(T("Restaurant", "Restaurant")) + '</button><button class="button quiet" type="button" data-skip-meal="' + esc(meal.id) + '">' + esc(T("Skip", "Omet")) + "</button></div>";
    const catalanDish = meal.catalanName ? '<p class="meal-catalan"><strong>Catalan dish:</strong> ' + esc(meal.catalanName) + "</p>" : "";
    const macros = '<dl class="macros"><div><dt>kcal</dt><dd>' + meal.calories + '</dd></div><div class="macro--protein"><dt>' + esc(T("protein", "proteïna")) + "</dt><dd>" + meal.proteinG + 'g</dd></div><div><dt>' + esc(T("carbs", "carbo.")) + "</dt><dd>" + meal.carbohydrateG + 'g</dd></div><div><dt>' + esc(T("fat", "greix")) + "</dt><dd>" + meal.fatG + "g</dd></div></dl>";
    const detailKey = "daily-" + meal.id;
    const collapsed = Boolean(state.compactPlanView) && !expandedPlanDetails.has(detailKey);
    return '<article class="meal-card' + (collapsed ? " is-collapsed" : "") + '" data-meal-card="' + esc(meal.id) + '" data-detail-card="' + esc(detailKey) + '" data-status="' + esc(status || "planned") + '">'
      + '<div class="meal-media">' + image + "</div>"
      + '<div class="meal-body"><div><p class="meal-slot">' + esc(meal.slot) + chip + '</p><h3 class="meal-title">' + esc(meal.title) + "</h3></div>"
      + detailToggleMarkup(detailKey, collapsed)
      + '<div class="meal-details" id="' + esc(detailKey) + '-details">' + macros + catalanDish
      + '<p class="meal-portions">' + esc(meal.portions) + '</p><p class="meta">' + esc(meal.hint) + "</p>"
      + (showMilkshakeOption ? milkshakeOptionMarkup(meal) : "")
      + actions + "</div></div></article>";
  }

  function loadMealImages(plan) {
    plan.meals.forEach((meal) => { void loadMealImage(meal); });
  }

  function mealImageKey(meal) {
    return [state.planDate, state.activity, meal.id, meal.title].join("|");
  }

  function updateMealImagePlaceholder(meal, imageUrl) {
    const placeholders = root.querySelectorAll('[data-meal-image-placeholder="' + meal.id + '"]');
    placeholders.forEach((placeholder) => {
      if (!imageUrl) {
        placeholder.textContent = T("Meal image is unavailable right now.", "Ara mateix la imatge de l’àpat no està disponible.");
        return;
      }
      const image = document.createElement("img");
      image.className = "meal-image";
      image.src = imageUrl;
      image.alt = meal.title;
      placeholder.replaceWith(image);
    });
  }

  async function loadMealImage(meal) {
    const imageKey = mealImageKey(meal);
    if (state.mealImages?.[meal.id] || pendingMealImages.has(imageKey) || failedMealImages.has(imageKey)) return;
    pendingMealImages.add(imageKey);
    try {
      const response = await fetch("/api/meal-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: meal.title }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Meal-image generation is unavailable.");
      const currentMeal = currentPlan().meals.find((item) => item.id === meal.id);
      if (!currentMeal || currentMeal.title !== meal.title) return;
      state.mealImages = { ...(state.mealImages || {}), [meal.id]: data.imageUrl };
      save();
      updateMealImagePlaceholder(meal, data.imageUrl);
    } catch {
      const currentMeal = currentPlan().meals.find((item) => item.id === meal.id);
      if (currentMeal?.title === meal.title) {
        failedMealImages.add(imageKey);
        updateMealImagePlaceholder(meal);
      }
    } finally {
      pendingMealImages.delete(imageKey);
    }
  }

  function weeklySetup() {
    const saved = state.weekly || {};
    mount("week", coachShell(
      T("Let’s plan your week", "Planifiquem la teva setmana"),
      T("First, tell your Coach what you want from this week.", "Primer, digues al teu Coach què vols d’aquesta setmana."),
      '<div class="bubble coach">' + esc(T("What are your goals for the week?", "Quins són els teus objectius per a la setmana?")) + '<span class="meta">' + esc(T("For example: feel more energetic, lose fat steadily, prepare for a 10 km run, or build strength.", "Per exemple: tenir més energia, perdre greix de manera constant, preparar una cursa de 10 km o guanyar força.")) + "</span></div>"
      + '<form class="composer chat-input" id="weekly-goal-form"><input id="weekly-goal" enterkeyhint="next" placeholder="' + esc(T("Write your goal for this week", "Escriu el teu objectiu per a aquesta setmana")) + '" value="' + esc(saved.goal || "") + '" required><button class="button" type="submit">' + esc(T("Continue", "Continua")) + "</button></form>"
      + '<div class="actions"><button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + "</button></div>"
    ));
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#weekly-goal-form").onsubmit = (event) => { event.preventDefault(); weeklyTraining(root.querySelector("#weekly-goal").value.trim()); };
  }

  function weeklyTraining(weeklyGoal) {
    const saved = state.weekly || {};
    const dayOptions = (selected) => [0, 1, 2, 3, 4, 5, 6, 7].map((count) => '<option value="' + count + '"' + (count === selected ? " selected" : "") + ">" + count + "</option>").join("");
    mount("week", coachShell(
      T("Your training week", "La teva setmana d’entrenament"),
      T("Tell me how many strength and running days you plan.", "Digues quants dies de força i de córrer tens previstos."),
      '<div class="bubble coach">' + esc(T("How will you train this week?", "Com entrenaràs aquesta setmana?")) + '<span class="meta">' + esc(T("For example: two strength days and one running day. The remaining days are treated as recovery or light movement.", "Per exemple: dos dies de força i un de córrer. La resta de dies es tracten com a recuperació o moviment suau.")) + "</span></div>"
      + '<form class="composer" id="weekly-training-form"><div class="field-row"><label class="field">' + esc(T("Strength days", "Dies de força")) + '<select id="strength-days">' + dayOptions(Number.isFinite(Number(saved.strength)) && saved.strength !== undefined ? Number(saved.strength) : 2) + '</select></label><label class="field">' + esc(T("Running days", "Dies de córrer")) + '<select id="run-days">' + dayOptions(Number.isFinite(Number(saved.run)) && saved.run !== undefined ? Number(saved.run) : 1) + '</select></label></div><div class="actions"><button class="button" type="submit">' + esc(T("Create my seven-day meal plan", "Crea el meu pla d’àpats de set dies")) + "</button></div></form>"
      + '<div class="actions"><button class="button quiet" type="button" id="back">' + esc(T("Back", "Enrere")) + "</button></div>"
    ));
    root.querySelector("#back").onclick = weeklySetup;
    root.querySelector("#weekly-training-form").onsubmit = (event) => {
      event.preventDefault();
      const strength = Number(root.querySelector("#strength-days").value);
      const run = Number(root.querySelector("#run-days").value);
      const feedback = root.querySelector("#weekly-training-feedback");
      if (strength + run > 7) {
        const message = note(T("Strength and running days cannot add up to more than seven.", "Els dies de força i de córrer no poden sumar més de set."), true);
        if (feedback) feedback.innerHTML = message; else root.querySelector("#weekly-training-form").insertAdjacentHTML("beforeend", '<div id="weekly-training-feedback">' + message + "</div>");
        return;
      }
      state.weekly = { goal: weeklyGoal, strength, run };
      save();
      weeklyPlan();
    };
  }

  function weeklyActivities() {
    const patterns = {
      sedentary: ["rest", "walk", "rest", "rest", "walk", "rest", "rest"],
      light: ["walk", "rest", "pilates", "rest", "walk", "rest", "rest"],
      moderate: ["strength", "rest", "run", "rest", "strength", "walk", "rest"],
      high: ["strength", "run", "strength", "pilates", "run", "strength", "rest"]
    };
    const strengthDays = Number(state.weekly?.strength);
    const runDays = Number(state.weekly?.run);
    if (Number.isFinite(strengthDays) && Number.isFinite(runDays) && strengthDays + runDays > 0) {
      // Spread the declared sessions across the week instead of stacking them.
      const spread = [0, 3, 1, 5, 2, 4, 6];
      const days = new Array(7).fill("rest");
      let slot = 0;
      for (let session = 0; session < strengthDays && slot < 7; session += 1, slot += 1) days[spread[slot]] = "strength";
      for (let session = 0; session < runDays && slot < 7; session += 1, slot += 1) days[spread[slot]] = "run";
      return days;
    }
    return patterns[state.profile.activity] || patterns.light;
  }

  function variedMeals(target, activity, dayIndex) {
    const menus = [
      [["Breakfast", "Pa amb tomàquet with egg and fruit", "2 slices wholegrain pa de pagès · 2 eggs · tomato · 1 orange · 10g olive oil", "Pa amb tomàquet"], ["Lunch", "Escalivada with chickpeas", "160g cooked chickpeas · roasted pepper, aubergine and onion · 10g olive oil", "Escalivada"], ["Dinner", "Suquet de peix with potatoes and greens", "160g white fish · 300g potatoes · tomato, garlic and 250g greens", "Suquet de peix"]],
      [["Breakfast", "Greek yogurt with oats, walnuts and pear", "250g Greek yogurt · 60g oats · 1 pear · 15g walnuts"], ["Lunch", "Llenties estofades amb verdures", "250g cooked lentils · carrot, celery and tomato · 2 slices wholegrain bread", "Llenties estofades"], ["Dinner", "Pollastre a la planxa with escalivada and brown rice", "150g chicken · 80g dry brown rice · 250g escalivada", "Pollastre a la planxa amb escalivada"]],
      [["Breakfast", "Pa amb tomàquet with fresh cheese and fruit", "2 slices wholegrain bread · tomato · 80g fresh cheese · 1 apple · 10g olive oil", "Pa amb tomàquet"], ["Lunch", "Esqueixada-style cod and white bean salad", "140g cod · 180g cooked white beans · tomato, pepper and olives", "Esqueixada de bacallà"], ["Dinner", "Truita de verdures with roasted sweet potato", "3 eggs · spinach and mushrooms · 300g sweet potato · salad", "Truita de verdures"]],
      [["Breakfast", "Apple-cinnamon porridge with yogurt", "70g oats · 1 apple · 200g Greek yogurt · cinnamon"], ["Lunch", "Arròs integral amb verdures and turkey", "80g dry brown rice · 150g turkey · 250g seasonal vegetables", "Arròs amb verdures"], ["Dinner", "Bacallà al forn with potatoes and green beans", "160g cod · 300g potatoes · 250g green beans · 10g olive oil", "Bacallà al forn"]],
      [["Breakfast", "Yogurt bowl with berries and almonds", "250g Greek yogurt · 50g oats · 100g berries · 15g almonds"], ["Lunch", "Mongetes amb verdures and chicken", "180g cooked white beans · 150g chicken · tomato, spinach and onion", "Mongetes amb verdures"], ["Dinner", "Cigrons amb espinacs i pa amb tomàquet", "250g cooked chickpeas · spinach and tomato · 2 slices wholegrain bread", "Cigrons amb espinacs"]],
      [["Breakfast", "Vegetable omelette and pa amb tomàquet", "3 eggs · spinach and mushrooms · 2 slices wholegrain bread · tomato", "Truita de verdures amb pa amb tomàquet"], ["Lunch", "Salmó with potato and leafy salad", "140g salmon · 300g potatoes · large leafy salad · 10g olive oil"], ["Dinner", "Pasta integral amb llenties and tomato", "250g cooked lentils · 80g dry wholegrain pasta · tomato sauce and vegetables"]],
      [["Breakfast", "Oats with banana, yogurt and hazelnuts", "60g oats · 200g Greek yogurt · 1 banana · 15g hazelnuts"], ["Lunch", "Amanida mediterrània de tonyina i mongetes", "1 tuna can · 180g cooked white beans · tomato, cucumber and olives"], ["Dinner", "Crema de verdures with tofu and pa de pagès", "180g tofu · vegetable soup · 2 slices wholegrain bread · 10g olive oil", "Crema de verdures amb pa de pagès"]]
    ][dayIndex];
    return mealPlan(target, activity).map((meal, index) => localiseMeal({ ...meal, title: menus[index][1], portions: menus[index][2], catalanName: menus[index][3] }));
  }

  function weeklyDayCard(entry, milkshakeOptions) {
    const detailKey = "weekly-" + entry.id;
    const collapsed = Boolean(state.compactPlanView) && !expandedPlanDetails.has(detailKey);
    const details = '<p><strong>' + entry.target.calories + " kcal</strong> · " + entry.target.proteinG + "g " + esc(T("protein", "proteïna")) + "</p>"
      + entry.meals.map((meal) => "<p><strong>" + esc(meal.slot) + ": " + esc(meal.title) + '</strong><br><span class="meta">' + (meal.catalanName ? "<strong>Catalan dish:</strong> " + esc(meal.catalanName) + "<br>" : "") + esc(meal.portions) + "</span></p>" + (milkshakeOptions.has(entry.id + ":" + meal.id) ? milkshakeOptionMarkup(meal) : "")).join("");
    return '<article class="week-day' + (collapsed ? " is-collapsed" : "") + '" data-detail-card="' + esc(detailKey) + '"><div class="weekly-card-visual">' + weeklyMealImageMarkup(entry) + "</div><h3>" + esc(entry.day) + " · " + esc(activityLabel(entry.activity)) + "</h3>" + detailToggleMarkup(detailKey, collapsed) + '<div class="week-day-details" id="' + esc(detailKey) + '-details">' + details + "</div></article>";
  }

  function weeklyPlanEntries() {
    const days = weekdayNames();
    const activities = weeklyActivities();
    return days.map((day, index) => {
      const target = dailyTarget(state.profile, activities[index]);
      const meals = variedMeals(target, activities[index], index);
      return { id: "day-" + index, day, index, activity: activities[index], target, meals };
    });
  }

  function weeklyMilkshakeOptionKeys(entries) {
    return new Set(entries.filter((_, index) => [0, 2, 4, 6].includes(index)).map((entry) => entry.id + ":lunch"));
  }

  function weeklyMealImageKey(entry) {
    return [state.planDate, state.profile?.activity, entry.id, entry.activity, entry.meals.map((meal) => meal.title).join("/")].join("|");
  }

  function weeklyMealImageUrl(entry) {
    const saved = state.weeklyMealImages?.[entry.id];
    if (!saved) return "";
    if (typeof saved === "string") return saved;
    return saved.key === weeklyMealImageKey(entry) ? saved.url : "";
  }

  function weeklyMealImageMarkup(entry) {
    const imageUrl = weeklyMealImageUrl(entry);
    if (imageUrl) return '<img class="meal-image weekly-meal-image" src="' + esc(imageUrl) + '" alt="' + esc(entry.day + " meal ideas") + '">';
    const imageKey = weeklyMealImageKey(entry);
    return '<div class="meal-image weekly-meal-image meal-image-placeholder" data-weekly-meal-image-placeholder="' + esc(entry.id) + '" data-weekly-meal-image-key="' + esc(imageKey) + '" role="status"><span>' + esc(failedWeeklyMealImages.has(imageKey) ? T("Meal image is unavailable right now.", "Ara mateix la imatge de l’àpat no està disponible.") : T("Creating your meal image…", "Creant la imatge de l’àpat…")) + '</span></div>';
  }

  function updateWeeklyMealImagePlaceholder(entry, imageUrl) {
    root.querySelectorAll('[data-weekly-meal-image-placeholder="' + entry.id + '"]').forEach((placeholder) => {
      if (placeholder.dataset.weeklyMealImageKey !== weeklyMealImageKey(entry)) return;
      if (!imageUrl) { placeholder.textContent = T("Meal image is unavailable right now.", "Ara mateix la imatge de l’àpat no està disponible."); return; }
      const image = document.createElement("img");
      image.className = "meal-image weekly-meal-image";
      image.src = imageUrl;
      image.alt = entry.day + " meal ideas";
      placeholder.replaceWith(image);
    });
  }

  async function loadWeeklyMealImage(entry) {
    const imageKey = weeklyMealImageKey(entry);
    if (weeklyMealImageUrl(entry) || pendingWeeklyMealImages.has(imageKey) || failedWeeklyMealImages.has(imageKey)) return;
    pendingWeeklyMealImages.add(imageKey);
    try {
      const title = entry.meals.map((meal) => meal.title).join(", ");
      const response = await fetch("/api/meal-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Meal-image generation is unavailable.");
      const current = weeklyPlanEntries().find((item) => item.id === entry.id);
      if (!current || weeklyMealImageKey(current) !== imageKey) return;
      state.weeklyMealImages = { ...(state.weeklyMealImages || {}), [entry.id]: { key: imageKey, url: data.imageUrl } };
      save();
      updateWeeklyMealImagePlaceholder(entry, data.imageUrl);
    } catch {
      const current = weeklyPlanEntries().find((item) => item.id === entry.id);
      if (current && weeklyMealImageKey(current) === imageKey) {
        failedWeeklyMealImages.add(imageKey);
        updateWeeklyMealImagePlaceholder(entry);
      }
    } finally {
      pendingWeeklyMealImages.delete(imageKey);
    }
  }

  function weeklyPlan() {
    if (!state.weekly) return weeklySetup();
    const activityExplanation = { sedentary: "mostly sitting, with gentle movement built in", light: "light activity (1–2 activity days/week)", moderate: "regular training (3–4 training days/week)", high: "frequent training (5+ training days/week)" }[state.profile.activity];
    const sessions = [Number(state.weekly?.strength) || 0, Number(state.weekly?.run) || 0];
    const plural = (count, one, many) => count + " " + (count === 1 ? one : many);
    const weekLead = sessions[0] + sessions[1] > 0
      ? T("Built from the week you planned: " + plural(sessions[0], "strength day", "strength days") + " and " + plural(sessions[1], "running day", "running days") + ". Review it before creating your basket.",
          "Fet a partir de la setmana que has planificat: " + plural(sessions[0], "dia de força", "dies de força") + " i " + plural(sessions[1], "dia de córrer", "dies de córrer") + ". Revisa-la abans de crear la cistella.")
      : "Built from your first-chat answer: " + activityExplanation + ". Review it before creating your basket.";
    const entries = weeklyPlanEntries();
    const milkshakeOptions = weeklyMilkshakeOptionKeys(entries);
    const cards = entries.map((entry) => weeklyDayCard(entry, milkshakeOptions)).join("");
    mount("week", viewShell(
      T("Your seven-day plan", "El teu pla de set dies"),
      weekLead,
      '<div class="actions on-shell" style="margin:0 0 24px"><button class="button" type="button" id="approve-week">' + esc(T("Create the weekly basket", "Crea la cistella setmanal")) + '</button><button class="button quiet" type="button" data-menu-action="weekly-pdf">' + esc(T("Download the week", "Baixa la setmana")) + '</button><button class="button quiet" type="button" data-menu-action="weekly-email">' + esc(T("Email my week", "Envia’m la setmana")) + '</button><button class="button quiet" type="button" id="edit-week">' + esc(T("Edit my week", "Edita la setmana")) + '</button></div><div class="week-grid">' + cards + "</div>"
    ));
    root.querySelector("#approve-week").onclick = weeklyBasket;
    root.querySelector("#edit-week").onclick = weeklySetup;
    completeQuest("week");
    bindDetailToggles();
    entries.forEach((entry) => { void loadWeeklyMealImage(entry); });
  }

  function weeklyBasketItems() {
    const activities = weeklyActivities(); const scale = dailyTarget(state.profile, activities[0]).calories / 2000;
    const baseItems = [[1200, "Greek yogurt"], [360, "oats"], [4, "bananas"], [3, "apples or pears"], [300, "berries"], [12, "eggs"], [700, "chicken breast"], [450, "turkey"], [280, "salmon"], [160, "cod"], [180, "tofu"], [2, "tuna cans"], [660, "cooked lentils"], [500, "cooked chickpeas or beans"], [240, "dry rice or quinoa"], [250, "dry wholegrain pasta"], [1500, "potatoes or sweet potatoes"], [2200, "mixed vegetables and salad"], [140, "olive oil"], [12, "slices wholegrain bread"], [50, "nuts, seeds or peanut butter"]];
    return baseItems.map(([amount, name]) => [name, amount < 20 ? amount : Math.round(amount * scale / 10) * 10]);
  }

  /**
   * The millilitres of milkshake this plan's protein swap actually asks for.
   * The basket offer is sized from the real plan, not from a round number.
   */
  function dailySwapMillilitres() {
    const meals = currentPlan().meals;
    const meal = meals.find((entry) => entry.milkshakeEligible) || meals.find((entry) => entry.id === "lunch") || meals[0];
    return meal ? quotaVitaMilkshakeMl(meal.proteinG) : 0;
  }

  function shopBlockMarkup() {
    const millilitres = dailySwapMillilitres();
    if (!millilitres) return "";
    return '<section class="shop-block" data-shop-ml="' + millilitres + '"><h2>' + esc(T("Cover the protein swap", "Cobreix el canvi de proteïna"))
      + "</h2><p>" + esc(T("Your plan swaps one protein for a Quota Vita Milkshake. This is the tub that covers it.", "El teu pla canvia una proteïna per un Milkshake de Quota Vita. Aquest és el pot que ho cobreix."))
      + "</p></section>";
  }

  function formatEur(value) {
    return new Intl.NumberFormat(language === "ca" ? "ca-ES" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(value));
  }

  function basketAmountLabel(item) {
    if (item.unit === "g") return item.amount + "g";
    if (item.unit === "slice") return String(item.amount);
    return String(item.amount);
  }

  function basketEstimateSource(estimate) {
    return "Average supermarket reference.";
  }

  function basketEstimateText() {
    if (!weeklyBasketEstimate) return "";
    return [
      "Estimated weekly basket cost",
      basketEstimateSource(weeklyBasketEstimate),
      ...weeklyBasketEstimate.items.map((item) => "- " + basketAmountLabel(item) + " " + localiseFood(item.name) + ": " + formatEur(item.price)),
      "Estimated total: " + formatEur(weeklyBasketEstimate.total),
      "Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.",
    ].join("\n");
  }

  function renderBasketEstimate(estimate) {
    const mount = root.querySelector("#weekly-cost-estimate");
    if (!mount || !Array.isArray(estimate.items) || !Number.isFinite(Number(estimate.total))) return;
    weeklyBasketEstimate = estimate;
    mount.innerHTML = '<section class="basket-costs"><h3>Estimated weekly basket cost</h3><p class="meta">' + esc(basketEstimateSource(estimate)) + '</p><ul>' + estimate.items.map((item) => '<li><span><strong>' + esc(basketAmountLabel(item)) + '</strong> ' + esc(localiseFood(item.name)) + '</span><strong>' + esc(formatEur(item.price)) + '</strong></li>').join("") + '</ul><p class="basket-costs-total"><strong>Estimated total</strong><strong>' + esc(formatEur(estimate.total)) + '</strong></p><p class="basket-costs-disclaimer">Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.</p></section>';
    root.querySelector("#weekly-basket-pdf").disabled = false;
    root.querySelector("#weekly-basket-email").disabled = false;
  }

  async function loadBasketEstimate(totals) {
    try {
      const response = await fetch("/api/basket-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: totals.map(([name, amount]) => ({ name, amount })) }),
      });
      const estimate = await response.json();
      if (!response.ok) throw new Error(estimate.error || "Unable to load the price estimate.");
      renderBasketEstimate(estimate);
    } catch {
      const mount = root.querySelector("#weekly-cost-estimate");
      if (mount) mount.innerHTML = note("Unable to load the price estimate.", true);
      root.querySelector("#weekly-basket-pdf").disabled = false;
      root.querySelector("#weekly-basket-email").disabled = false;
    }
  }

  function weeklyBasket() {
    const totals = weeklyBasketItems();
    weeklyBasketEstimate = undefined;
    mount("basket", viewShell(
      T("Your seven-day basket", "La teva cistella de set dies"),
      T("A varied basket matching the seven daily menus and your training pattern.", "Una cistella variada que encaixa amb els set menús diaris i el teu patró d’entrenament."),
      basketSwitcher("weekly")
        + '<div class="card"><ul class="basket">' + totals.map(([name, amount]) => "<li><strong>" + (amount < 20 ? amount : amount + "g") + "</strong> " + esc(localiseFood(name)) + "</li>").join("")
        + '</ul><section id="weekly-cost-estimate" aria-live="polite">' + note(T("Checking the latest price estimate…", "Comprovant l’estimació de preu més recent…")) + "</section>"
        + shopBlockMarkup()
        + '<div class="actions"><button class="button" type="button" id="weekly-basket-pdf" disabled>' + esc(T("Download basket PDF", "Baixa el PDF de la cistella")) + '</button><button class="button quiet" type="button" id="weekly-basket-email" disabled>' + esc(T("Send by email", "Envia per correu")) + '</button><button class="button quiet" type="button" id="back">' + esc(T("Back to the week", "Torna a la setmana")) + "</button></div></div>"
    ));
    track("basket_created", { scope: "weekly", items: totals.length });
    root.querySelector("#weekly-basket-pdf").onclick = () => printWeekly("basket");
    root.querySelector("#weekly-basket-email").onclick = () => emailWeekly("basket");
    root.querySelector("#back").onclick = weeklyPlan;
    bindBasketSwitcher();
    completeQuest("basket");
    awardBadge("week-planner");
    loadBasketEstimate(totals);
  }

  function weeklyText(kind) {
    const days = weekdayNames();
    if (kind === "basket") return weeklyBasketItems().map(([name, amount]) => "- " + amount + (amount < 20 ? "" : "g") + " " + localiseFood(name)).join("\n") + (weeklyBasketEstimate ? "\n\n" + basketEstimateText() : "");
    return days.map((day, index) => {
      const target = dailyTarget(state.profile, weeklyActivities()[index]);
      return day + " - " + activityLabel(weeklyActivities()[index]) + "\n" + variedMeals(target, weeklyActivities()[index], index).map((meal) => meal.slot + ": " + meal.title + (meal.catalanName ? " [Catalan dish: " + meal.catalanName + "]" : "") + " (" + meal.portions + ")").join("\n");
    }).join("\n\n");
  }

  function printWeekly(kind) {
    const title = kind === "basket" ? "Weekly shopping basket" : "Seven-day meal plan";
    const popup = window.open("", "_blank");
    if (!popup) return alert(T("Allow pop-ups to download your PDF.", "Permet les finestres emergents per baixar el PDF."));
    const text = weeklyText(kind).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    popup.document.write("<!doctype html><title>" + title + "</title><style>body{max-width:760px;margin:48px auto;color:#392d23;font:16px/1.5 system-ui}h1{font:42px Georgia,serif}@page{margin:18mm}</style><h1>Quota Vita / " + title + "</h1><p>" + text + "</p><p>General wellbeing guidance only. Not medical advice.</p>");
    popup.document.close(); setTimeout(() => popup.print(), 250);
  }

  function emailWeekly(kind) {
    const isCatalan = language === "ca";
    const title = kind === "basket" ? (isCatalan ? "Envia la meva cistella setmanal" : "Email my weekly basket") : (isCatalan ? "Envia el meu pla setmanal" : "Email my weekly plan");
    const explanation = isCatalan
      ? "L'enviarem directament des del flux de Shopify de Quota Vita."
      : "Quota Vita will send it directly through its Shopify workflow.";
    const consent = isCatalan
      ? "Accepto la Política de privacitat i autoritzo Quota Vita a conservar el meu correu electrònic i a enviar-me el meu pla, la meva cistella i comunicacions del Coach."
      : "I agree to the Privacy Policy and authorise Quota Vita to keep my email and send my plan, basket and Coach communications.";
    const send = isCatalan ? "Envia'm el correu" : "Send my email";
    const close = isCatalan ? "Tanca" : "Close";
    const { overlay } = openModal('<h3 id="email-title">' + esc(title) + '</h3><p class="meta">' + esc(explanation) + '</p><form id="shopify-email-form"><label class="field">' + (isCatalan ? "Adreça electrònica" : "Email address") + '<input id="shopify-email-address" required type="email" autocomplete="email" value="' + esc(state.email || "") + '"></label><label class="consent-row"><input id="shopify-email-consent" required type="checkbox"><span>' + consent + ' <a href="https://quotavita.com/policies/privacy-policy" target="_blank" rel="noopener">' + (isCatalan ? "Política de privacitat" : "Privacy Policy") + '</a>.</span></label><div class="actions"><button class="button" type="submit">' + esc(send) + '</button><button class="button quiet" type="button" id="shopify-email-close">' + esc(close) + '</button></div><div id="shopify-email-feedback" aria-live="polite"></div></form>', "email-title");
    const closeDialog = () => { overlay.remove(); document.body.classList.remove("modal-open"); };
    overlay.querySelector("#shopify-email-close").onclick = closeDialog;
    const address = overlay.querySelector("#shopify-email-address");
    address.focus({ preventScroll: true });
    overlay.querySelector("#shopify-email-form").onsubmit = async (event) => {
      event.preventDefault();
      const button = overlay.querySelector('[type="submit"]');
      const feedback = overlay.querySelector("#shopify-email-feedback");
      const email = address.value.trim();
      button.disabled = true;
      feedback.innerHTML = note(isCatalan ? "S'està enviant…" : "Sending…");
      try {
        const response = await fetch("/api/shopify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, kind, checklist: weeklyText(kind), language, marketingConsent: true })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || (isCatalan ? "No s'ha pogut enviar el correu." : "We couldn't send the email."));
        state.email = email;
        save();
        feedback.innerHTML = note(isCatalan ? "Fet. Rebràs el correu de Quota Vita aviat." : "Done. Your Quota Vita email is on its way.");
        button.remove();
      } catch (error) {
        feedback.innerHTML = note(error.message, true);
        button.disabled = false;
      }
    };
  }

  function checkIn(id) {
    const plan = currentPlan();
    const meal = plan.meals.find((item) => item.id === id);
    mount("today", viewShell(
      esc(meal.slot) + " " + T("check-in", "revisió"),
      meal.title,
      '<div class="card"><p>' + esc(T("Did you eat this proposed meal?", "Has menjat aquest àpat proposat?")) + '</p><div class="actions"><button class="button" type="button" id="eaten">' + esc(T("I ate this proposal", "He menjat la proposta")) + '</button><button class="button quiet" type="button" id="restaurant">' + esc(T("I ate at a restaurant", "He menjat en un restaurant")) + '</button><button class="button quiet" type="button" id="skip">' + esc(T("I skipped it", "Me l’he saltat")) + '</button><button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + "</button></div></div>"
    ));
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#eaten").onclick = () => { recordMeal(id, "eaten"); dashboard(); };
    root.querySelector("#skip").onclick = () => { recordMeal(id, "skipped"); dashboard(); };
    root.querySelector("#restaurant").onclick = () => restaurantOverlay(id, meal);
  }

  // Shared modal plumbing: scroll lock, focus restore and Escape handled in one place.
  function openModal(innerHtml, labelledBy) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = '<section class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="' + labelledBy + '">' + innerHtml + "</section>";
    const previouslyFocused = document.activeElement;
    document.body.append(overlay);
    document.body.classList.add("modal-open");
    const close = () => {
      overlay.remove();
      document.body.classList.remove("modal-open");
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled && node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    overlay.querySelector("[data-modal-close]")?.addEventListener("click", close);
    requestAnimationFrame(() => overlay.querySelector("input, button")?.focus({ preventScroll: true }));
    translate();
    return { overlay, close };
  }

  function restaurantOverlay(id, meal) {
    capturedMealImage = null;
    const consent = T(
      "I authorise Quota Vita to send this one meal photo to LogMeal for automated analysis. Quota Vita does not store the image.",
      "Autoritzo Quota Vita a enviar aquesta foto de l’àpat a LogMeal per a una anàlisi automatitzada. Quota Vita no desa la imatge."
    );
    const { overlay, close } = openModal(
      '<p class="eyebrow">' + esc(T("Restaurant meal", "Àpat de restaurant")) + '</p><h2 id="restaurant-title">' + esc(meal.slot) + '</h2><p class="meta">' + esc(T("Add a photo only if you want an estimate; you can also log the restaurant meal without scanning.", "Afegeix una foto només si vols una estimació; també pots registrar l’àpat sense escanejar-lo.")) + "</p>"
      + '<div class="actions"><button class="button quiet" type="button" id="inline-open-camera">' + esc(T("Take photo", "Fes una foto")) + '</button><label class="button quiet" for="inline-photo">' + esc(T("Choose photo", "Tria una foto")) + '</label><input id="inline-photo" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div>'
      + '<div id="inline-camera-area"></div>'
      + '<label class="consent-row"><input id="inline-logmeal-consent" type="checkbox"><span>' + esc(consent) + "</span></label>"
      + '<div class="actions"><button class="button" type="button" id="inline-scan">' + esc(T("Scan meal", "Escaneja l’àpat")) + '</button><button class="button quiet" type="button" id="inline-manual">' + esc(T("Log it without scanning", "Registra’l sense escanejar")) + '</button><button class="button quiet" type="button" data-modal-close>' + esc(T("Back to my meal", "Torna al meu àpat")) + "</button></div>"
      + '<div id="inline-feedback" aria-live="polite"></div>',
      "restaurant-title"
    );
    const stopCamera = () => { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; };
    const closeAll = () => { stopCamera(); close(); };
    overlay.querySelector("[data-modal-close]").addEventListener("click", stopCamera);
    overlay.querySelector("#inline-manual").onclick = () => { recordMeal(id, "restaurant"); closeAll(); refreshMealCard(id); };
    overlay.querySelector("#inline-open-camera").onclick = async () => {
      const area = overlay.querySelector("#inline-camera-area");
      try {
        stopCamera();
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        area.innerHTML = '<video id="inline-camera-preview" autoplay playsinline></video><div class="actions"><button class="button" type="button" id="inline-capture">' + esc(T("Use this photo", "Fes servir aquesta foto")) + "</button></div>";
        const video = overlay.querySelector("#inline-camera-preview");
        video.srcObject = cameraStream;
        overlay.querySelector("#inline-capture").onclick = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          capturedMealImage = canvas.toDataURL("image/jpeg", 0.84);
          stopCamera();
          area.innerHTML = '<p class="status">' + esc(T("Photo ready. Press “Scan meal” to upload it.", "Foto a punt. Prem «Escaneja l’àpat» per pujar-la.")) + "</p>";
        };
      } catch { area.innerHTML = note(T("Camera access is unavailable. Choose a photo instead.", "No es pot accedir a la càmera. Tria una foto."), true); }
    };
    overlay.querySelector("#inline-scan").onclick = async () => {
      const file = overlay.querySelector("#inline-photo").files[0];
      const feedback = overlay.querySelector("#inline-feedback");
      if (!file && !capturedMealImage) return feedback.innerHTML = note(T("Take or choose a JPEG, PNG, or WebP photo first.", "Primer fes o tria una foto JPEG, PNG o WebP."), true);
      if (!overlay.querySelector("#inline-logmeal-consent").checked) return feedback.innerHTML = note(T("Confirm the LogMeal photo-analysis authorisation before scanning.", "Confirma l’autorització d’anàlisi de fotos de LogMeal abans d’escanejar."), true);
      if (file && file.size > 8 * 1024 * 1024) return feedback.innerHTML = note(T("Choose a photo smaller than 8 MB.", "Tria una foto de menys de 8 MB."), true);
      feedback.innerHTML = note(T("Checking photo-analysis availability…", "Comprovant la disponibilitat de l’anàlisi de fotos…"));
      try {
        const imageBase64 = capturedMealImage || await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        const response = await fetch("/api/meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, logmealConsent: true }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        recordMeal(id, "restaurant", { analysis: "scanned" });
        closeAll();
        refreshMealCard(id);
      } catch (error) { feedback.innerHTML = note(error.message || T("Photo analysis is unavailable.", "L’anàlisi de fotos no està disponible."), true); }
    };
  }

  function basketSwitcher(scope) {
    return '<div class="segmented" role="group" aria-label="' + esc(T("Basket range", "Abast de la cistella")) + '"><button type="button" class="' + (scope === "daily" ? "is-active" : "") + '" data-basket-scope="daily" aria-pressed="' + (scope === "daily") + '">' + esc(T("One day", "Un dia")) + '</button><button type="button" class="' + (scope === "weekly" ? "is-active" : "") + '" data-basket-scope="weekly" aria-pressed="' + (scope === "weekly") + '">' + esc(T("Seven days", "Set dies")) + "</button></div>";
  }

  function bindBasketSwitcher() {
    root.querySelectorAll("[data-basket-scope]").forEach((button) => {
      button.onclick = () => (button.dataset.basketScope === "weekly" ? weeklyBasket() : basket());
    });
  }

  function account() {
    const linked = signedIn();
    const body = linked
      ? '<div class="card"><p class="account-state" id="account-state">' + esc(T("Checking your account…", "Comprovant el teu compte…")) + "</p>"
        + "<p>" + esc(T("Your profile and the meals you log are stored in the EU and travel with you to any device where you are signed in.", "El teu perfil i els àpats que registres es desen a la UE i et segueixen a qualsevol dispositiu on hagis iniciat la sessió.")) + "</p>"
        + '<div class="actions"><button class="button" type="button" id="account-sync">' + esc(T("Sync now", "Sincronitza ara")) + '</button>'
        + '<button class="button quiet" type="button" id="account-export">' + esc(T("Download my data", "Baixa les meves dades")) + '</button>'
        + '<button class="button quiet" type="button" id="account-delete">' + esc(T("Delete my saved record", "Esborra el meu registre desat")) + "</button></div>"
        + '<p class="status" id="account-status" aria-live="polite" hidden></p></div>'
      : '<div class="card"><p>' + esc(T("Right now this plan exists only in this browser. Clear it, change phone, and it is gone.", "Ara mateix aquest pla només existeix en aquest navegador. Si l’esborres o canvies de telèfon, es perd.")) + "</p>"
        + "<p>" + esc(T("Sign in with your Quota Vita account and your profile, your logged meals and your streak are kept for you.", "Inicia la sessió amb el teu compte de Quota Vita i el teu perfil, els àpats registrats i la teva ratxa es conserven.")) + "</p>"
        + '<label class="account-consent"><input type="checkbox" id="account-consent"> <span>' + esc(T("I agree that Quota Vita may store my nutrition profile and the meals I log in order to provide the Coach. I can export or delete it at any time.", "Accepto que Quota Vita desi el meu perfil nutricional i els àpats que registro per oferir el Coach. Puc exportar-ho o esborrar-ho quan vulgui.")) + "</span></label>"
        + '<div class="actions"><button class="button" type="button" id="account-connect" disabled>' + esc(T("Save my plan to my account", "Desa el meu pla al meu compte")) + '</button>'
        + '<button class="button quiet" type="button" id="back">' + esc(T("Not now", "Ara no")) + "</button></div></div>";

    mount("account", viewShell(
      T("Your account", "El teu compte"),
      T("Keep your plan when you close this browser.", "Conserva el teu pla quan tanquis aquest navegador."),
      body
    ));

    const status = (text) => {
      const node = root.querySelector("#account-status");
      if (!node) return;
      node.textContent = text;
      node.hidden = false;
    };

    if (linked) {
      // A token in this browser is not proof the record exists. Ask the server
      // before telling anyone their plan is safe.
      void accountFetch("/api/account").then((data) => {
        const node = root.querySelector("#account-state");
        if (!node) return;
        if (data?.signedIn) {
          node.textContent = data.profile
            ? T("Your plan is saved to your Quota Vita account.", "El teu pla es desa al teu compte de Quota Vita.")
            : T("Signed in. Nothing is saved yet — sync to store this plan.", "Sessió iniciada. Encara no hi ha res desat: sincronitza per desar aquest pla.");
        } else {
          node.textContent = T("We could not reach your account. Your plan is safe on this device.", "No hem pogut connectar amb el teu compte. El teu pla és segur en aquest dispositiu.");
        }
      });

      root.querySelector("#account-sync").onclick = async () => {
        status(T("Syncing…", "Sincronitzant…"));
        await pushProfile();
        status(T("Synced.", "Sincronitzat."));
      };
      root.querySelector("#account-export").onclick = async () => {
        status(T("Preparing your data…", "Preparant les teves dades…"));
        const data = await accountFetch("/api/account?export=1");
        if (!data) return status(T("That did not work. Try again in a moment.", "No ha funcionat. Torna-ho a provar d’aquí a un moment."));
        const popup = window.open("", "_blank");
        if (!popup) return status(T("Allow pop-ups to see your data.", "Permet les finestres emergents per veure les teves dades."));
        popup.document.write("<pre>" + esc(JSON.stringify(data, null, 2)) + "</pre>");
        popup.document.close();
        status(T("Opened in a new tab.", "Obert en una pestanya nova."));
      };
      root.querySelector("#account-delete").onclick = async () => {
        status(T("Deleting…", "Esborrant…"));
        const done = await accountFetch("/api/account", { method: "DELETE" });
        if (!done) return status(T("That did not work. Try again in a moment.", "No ha funcionat. Torna-ho a provar d’aquí a un moment."));
        try { localStorage.removeItem(accountTokenKey); localStorage.removeItem(accountConsentKey); } catch { /* private mode */ }
        status(T("Deleted. Your plan stays on this device only.", "Esborrat. El teu pla es queda només en aquest dispositiu."));
      };
    } else {
      const checkbox = root.querySelector("#account-consent");
      const connect = root.querySelector("#account-connect");
      checkbox.onchange = () => { connect.disabled = !checkbox.checked; };
      connect.onclick = connectAccount;
      root.querySelector("#back").onclick = dashboard;
    }
  }

  function basket() {
    const plan = currentPlan();
    const items = basketItems(plan);
    mount("basket", viewShell(
      T("Your one-day basket", "La teva cistella d’un dia"),
      T("Quantities are for one person and this specific plan.", "Les quantitats són per a una persona i aquest pla concret."),
      basketSwitcher("daily")
        + '<div class="card"><ul class="basket">' + items.map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(localiseFood(name)) + "</li>").join("")
        + '</ul>' + shopBlockMarkup()
        + '<div class="actions"><button class="button" type="button" id="basket-pdf">' + esc(T("Download basket PDF", "Baixa el PDF de la cistella")) + '</button><button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + '</button><button class="button quiet" type="button" id="clear">' + esc(T("Delete this device plan", "Esborra el pla d’aquest dispositiu")) + "</button></div></div>"
    ));
    track("basket_created", { scope: "daily", items: items.length });
    root.querySelector("#basket-pdf").onclick = () => printPdf("basket");
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = resetCoach;
    bindBasketSwitcher();
    completeQuest("basket");
  }

  if (state.profile) { syncStreak(); save(); }
  if (state.profile) (state.needsTraining ? training() : dashboard()); else welcome();
  void checkAccountsEnabled();
  void syncAccount();
})();
