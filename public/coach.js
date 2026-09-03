(() => {
  const root = document.querySelector("#coach");
  /* The version the server stamped on this script's own URL. Any module this
     file imports later carries the same stamp, so one deploy replaces both
     rather than pairing new code with a cached copy of its dependency. */
  const assetVersion = new URLSearchParams((document.currentScript?.src || "").split("?")[1] || "").get("v") || "";
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
    // If they chose tomorrow's movement last night, the plan is ready on waking.
    const planned = state.tomorrowActivity;
    state = { ...state, planDate: todayKey(), needsTraining: !planned, activity: planned || "rest", tomorrowActivity: null, meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
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

  // `surface` names the placement. It travels to the server, comes back inside
  // the cart link as `utm_content`, and is sent to /api/events on the same
  // click — one word, both ledgers, so Shopify sessions and the internal funnel
  // can be read against each other.
  function shopOffer(millilitres, surface) {
    const key = millilitres + ":" + language + ":" + (surface || "");
    if (!shopOfferRequests.has(key)) {
      const query = "/api/shop?millilitres=" + encodeURIComponent(millilitres)
        + "&language=" + encodeURIComponent(language)
        + (surface ? "&surface=" + encodeURIComponent(surface) : "");
      shopOfferRequests.set(key, fetch(query)
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => body?.offer || null)
        .catch(() => null));
    }
    return shopOfferRequests.get(key);
  }

  function shopOfferMarkup(offer, surface) {
    const coverage = language === "ca"
      ? offer.product.label + " · " + offer.coverageDays + " dies · " + formatEur(offer.product.priceEurHint)
      : offer.product.label + " · " + offer.coverageDays + " days · " + formatEur(offer.product.priceEurHint);
    const perDay = language === "ca"
      ? formatEur(offer.costPerDayEurHint) + " al dia"
      : formatEur(offer.costPerDayEurHint) + " a day";
    return '<span class="shop-offer"><a class="button shop-buy" href="' + esc(offer.cartUrl) + '" target="_blank" rel="noopener" data-shop-buy="' + esc(offer.product.sku) + '" data-shop-surface="' + esc(surface || "") + '">'
      + esc(T("Buy the protein", "Compra la proteïna")) + '</a><span class="shop-line">' + esc(coverage) + ' · ' + esc(perDay) + "</span></span>";
  }

  function fillShopOffers() {
    root.querySelectorAll("[data-shop-ml]:not([data-shop-filled])").forEach((node) => {
      node.dataset.shopFilled = "1";
      const millilitres = Number(node.dataset.shopMl);
      if (!Number.isFinite(millilitres) || millilitres <= 0) return;
      const surface = node.dataset.shopSurface || "";
      void shopOffer(millilitres, surface).then((offer) => {
        if (!offer || !node.isConnected) return;
        node.insertAdjacentHTML("beforeend", shopOfferMarkup(offer, surface));
        track("shop_offer_shown", { sku: offer.product.sku, millilitres, surface });
      });
    });
  }

  root.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-shop-buy]");
    if (link) track("shop_checkout_opened", { sku: link.dataset.shopBuy, surface: link.dataset.shopSurface || "" });
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

  // ── Progress sync ───────────────────────────────────────────────────────
  // The streak, the XP and the badges are the whole retention argument, and
  // until now they lived only in localStorage: a cache clear erased them and
  // they did not follow anyone from phone to laptop. A streak that either can
  // happen to is not worth asking someone to care about, so it syncs.
  //
  // The merge is deliberately the same shape on both sides — larger wins, badges
  // union, days merged per key — so it does not matter which side runs it, and
  // two devices used on the same day cannot cost each other a day's work.

  const progressToServer = () => {
    const g = game();
    return {
      xp: g.xp || 0,
      streak: g.streak || 0,
      bestStreak: g.bestStreak || g.streak || 0,
      freezes: g.freezes || 0,
      proteinDays: g.proteinDays || 0,
      lastGoalDay: g.lastGoalDay || null,
      badges: Array.isArray(g.badges) ? g.badges : [],
      days: g.days || {},
    };
  };

  /** Folds the account's record into this device's. Nothing is ever lowered. */
  function applyServerProgress(remote) {
    if (!remote) return false;
    const g = game();
    const before = JSON.stringify(progressToServer());

    const days = { ...(g.days || {}) };
    for (const [key, value] of Object.entries(remote.days || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object") continue;
      const mine = days[key] || { xp: 0, quests: {}, goal: false };
      days[key] = {
        xp: Math.max(Number(mine.xp) || 0, Number(value.xp) || 0),
        quests: { ...(mine.quests || {}), ...(value.quests || {}) },
        goal: Boolean(mine.goal || value.goal),
      };
    }

    g.days = days;
    g.xp = Math.max(g.xp || 0, Number(remote.xp) || 0);
    g.streak = Math.max(g.streak || 0, Number(remote.streak) || 0);
    g.bestStreak = Math.max(g.bestStreak || 0, Number(remote.bestStreak) || 0, g.streak);
    g.freezes = Math.min(2, Math.max(g.freezes || 0, Number(remote.freezes) || 0));
    g.proteinDays = Math.max(g.proteinDays || 0, Number(remote.proteinDays) || 0);
    g.badges = [...new Set([...(g.badges || []), ...(Array.isArray(remote.badges) ? remote.badges : [])])];
    if (remote.lastGoalDay && (!g.lastGoalDay || remote.lastGoalDay > g.lastGoalDay)) g.lastGoalDay = remote.lastGoalDay;

    save();
    return JSON.stringify(progressToServer()) !== before;
  }

  let progressPushTimer = null;
  let progressPushPending = false;

  async function pushProgress() {
    progressPushPending = false;
    if (!signedIn()) return;
    const saved = await accountFetch("/api/account", {
      method: "POST",
      body: JSON.stringify({ kind: "progress", progress: progressToServer() }),
    });
    // The server merges and returns the authoritative record, so a second device
    // that earned XP earlier in the day is folded back in on the way out.
    if (saved?.progress && applyServerProgress(saved.progress)) renderChrome();
    if (saved?.progress) track("account_synced", { kind: "progress" });
  }

  /**
   * XP is awarded in bursts — a meal log can pay a quest, a level and a badge in
   * the same tick — so the write is coalesced rather than sent three times.
   */
  function schedulePushProgress() {
    if (!signedIn()) return;
    progressPushPending = true;
    clearTimeout(progressPushTimer);
    progressPushTimer = setTimeout(() => { void pushProgress(); }, 1200);
  }

  // A tab closed before the timer fires must not lose the award.
  addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !progressPushPending || !signedIn()) return;
    clearTimeout(progressPushTimer);
    progressPushPending = false;
    try {
      // sendBeacon cannot carry an Authorization header, so this last-gasp write
      // goes through fetch with keepalive instead.
      void fetch("/api/account", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accountToken() },
        body: JSON.stringify({ kind: "progress", progress: progressToServer() }),
      });
    } catch {
      // A lost final write costs at most the last few seconds of XP.
    }
  });

  /**
   * On load, reconcile the device with the account. A saved profile on the
   * server wins when this device has none — that is the whole point of an
   * account. A profile on this device is pushed up when the server has none.
   */
  async function syncAccount() {
    if (!signedIn()) return;
    const data = await accountFetch("/api/account");
    if (!data?.signedIn) return;

    // Progress first, and regardless of the profile: someone who signs in on a
    // new phone should see their streak before anything else loads.
    const changed = applyServerProgress(data.progress);
    if (data.progress) syncStreak();
    if (changed) renderChrome();
    // Push straight back so the account holds the union, not just the newer side.
    void pushProgress();

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
  const localise = (text) => (language === "ca" ? (catalan[text] || text) : text);
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
  const SHOP_URL = (window.COACH_CONFIG?.shopUrl || "https://www.quotavita.com")
    + "?ref=coach&utm_source=coach&utm_medium=app&utm_campaign=shop_nav";

  /* Design directions can be previewed with ?theme=paper|ink|kitchen. Opt-in
     only: without the parameter nothing loads and the shipped design stands. */
  const previewTheme = new URLSearchParams(location.search).get("theme");
  if (["paper", "ink", "kitchen"].includes(previewTheme)) {
    const themeLink = document.createElement("link");
    themeLink.rel = "stylesheet";
    themeLink.href = "/themes/" + previewTheme + ".css";
    document.head.append(themeLink);
    document.documentElement.dataset.previewTheme = previewTheme;
  }

  const topbarHost = chromeHost("topbar", "header", "topbar");
  const tabbarHost = chromeHost("tabbar", "nav", "tabbar", { "aria-label": "Sections", hidden: "" });
  let currentView = "setup";
  let menuOpen = false;

  const navIcons = {
    today: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    basket: '<path d="M4 8h16l-1.4 11.1a2 2 0 0 1-2 1.75H7.4a2 2 0 0 1-2-1.75L4 8Z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
    coach: '<path d="M21 11.5a8 8 0 0 1-8 8H8l-5 2.5V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/>',
    progress: '<path d="M12 3.2 14.6 9l6.4.6-4.8 4.2 1.4 6.2-5.6-3.3-5.6 3.3 1.4-6.2L3 9.6 9.4 9 12 3.2Z"/>',
    shop: '<path d="M4.5 8h15l-1.2 11.2a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8L4.5 8Z"/><path d="M9 8V6.3a3 3 0 0 1 6 0V8"/><path d="M9.5 11.5h5"/>'
  };

  const navItems = () => [
    { id: "today", label: T("Today", "Avui") },
    { id: "week", label: T("Week", "Setmana") },
    { id: "basket", label: T("Basket", "Cistella") },
    { id: "coach", label: T("Coach", "Coach") },
    { id: "progress", label: T("Progress", "Progrés") },
    // Not a view: the storefront, opened in its own tab so the plan is not lost.
    { id: "shop", label: T("Shop", "Botiga"), href: SHOP_URL }
  ];

  const svgIcon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + navIcons[name] + "</svg>";

  /** The site and developer pages, as links. Shown in setup and in the menu. */
  function siteLinks() {
    return [
      ["/about", T("About", "Qui som")],
      ["/contact", T("Contact", "Contacte")],
      ["/privacy", T("Privacy", "Privacitat")],
      ["/developers", T("Developers and API", "Desenvolupadors i API")]
    ].map(([href, label]) => '<a href="' + href + '">' + esc(label) + "</a>").join(" · ");
  }

  /* The menu holds actions and settings only — the five destinations live in the
     tab bar. Groups run in the order you would reach for them: what you can do
     with today, then with the week, then the settings, then your data, then the
     company. Navigation that already has a button elsewhere is not repeated. */
  function menuMarkup() {
    const item = ([action, label, extra = ""]) => '<button class="menu-item' + extra + '" type="button" data-menu-action="' + action + '">' + esc(label) + "</button>";
    const group = (title, items) => (items.length ? "<h2>" + esc(title) + "</h2>" + items.map(item).join("") : "");
    const linkGroup = (title, items) => "<h2>" + esc(title) + "</h2><div class=\"menu-links\">" + items.map(([href, label]) => '<a href="' + href + '">' + esc(label) + "</a>").join("") + "</div>";
    const choiceRow = (label, options) => '<div class="menu-row"><span>' + esc(label) + '</span><div class="menu-choice">' + options + "</div></div>";

    const languageRow = choiceRow(T("Language", "Idioma"),
      '<span data-language-control>' + [["en", "EN"], ["ca", "CA"]]
        .map(([code, short]) => '<button type="button" data-language="' + code + '" class="' + (language === code ? "is-active" : "") + '">' + short + "</button>").join("") + "</span>");
    const densityRow = choiceRow(T("Cards", "Targetes"),
      [[false, T("Full", "Completes")], [true, T("Compact", "Compactes")]]
        .map(([compact, label]) => '<button type="button" data-density="' + compact + '" class="' + (Boolean(state.compactPlanView) === compact ? "is-active" : "") + '">' + esc(label) + "</button>").join(""));

    return '<div class="overflow-menu" id="overflow-menu" role="menu"' + (menuOpen ? "" : " hidden") + ">"
      + group(T("Today", "Avui"), [
        ["change-training", T("Change today’s training", "Canvia l’entrenament d’avui")],
        ["daily-pdf", T("Download today’s plan", "Baixa el pla d’avui")]
      ])
      + group(T("This week", "Aquesta setmana"), [
        ["weekly-pdf", T("Download the week", "Baixa la setmana")],
        ["weekly-email", T("Email me the week", "Envia’m la setmana")]
      ])
      + "<h2>" + esc(T("Settings", "Configuració")) + "</h2>"
      + item(["edit-profile", T("My details", "Les meves dades")])
      + languageRow
      + densityRow
      + "<h2>" + esc(T("Your data", "Les teves dades")) + "</h2>"
      + (accountsEnabled || signedIn()
        ? item(["account", signedIn() ? T("Your account", "El teu compte") : T("Save my plan to my account", "Desa el meu pla al meu compte")])
        : "")
      + item(["restart-day", T("Start today again", "Torna a començar el dia")])
      + item(["delete-data", T("Delete my data", "Esborra les meves dades"), " menu-item--danger"])
      + linkGroup(T("Quota Vita", "Quota Vita"), [
        ["/about", T("About", "Qui som")],
        ["/contact", T("Contact", "Contacte")],
        ["/privacy", T("Privacy", "Privacitat")],
        ["/developers", T("Developers", "Desenvolupadors")]
      ])
      + "</div>";
  }

  /* Fast search. Everything the Coach already knows about today and the week is
     searchable from one field: a meal, an ingredient, a day, a basket line, or
     a place to go. Matching is accent-insensitive so "proteina" finds
     "proteïna" and "escalivada" finds "Escalivada". */
  const fold = (value) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function searchIndex() {
    const entries = [];
    const add = (group, label, detail, run) => entries.push({ group, label, detail, run });

    if (state.profile) {
      const plan = currentPlan();
      plan.meals.forEach((meal) => {
        add(T("Today’s meals", "Àpats d’avui"), meal.slot + " · " + meal.title, meal.portions, () => {
          dashboard();
          requestAnimationFrame(() => {
            const card = root.querySelector('[data-meal-card="' + meal.id + '"]');
            if (!card) return;
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("is-flagged");
            setTimeout(() => card.classList.remove("is-flagged"), 1400);
          });
        });
      });

      if (state.weekly) {
        weeklyPlanEntries().forEach((entry) => {
          entry.meals.forEach((meal) => {
            add(entry.day, meal.slot + " · " + meal.title, meal.portions, () => weeklyPlan());
          });
        });
      }

      weeklyBasketItems().forEach(([name, amount]) => {
        add(T("Basket", "Cistella"), localiseFood(name), amount + (amount < 20 ? "" : " g"), () => weeklyBasket());
      });
    }

    navItems().forEach((nav) => add(T("Go to", "Ves a"), nav.label, "", nav.href ? () => window.open(nav.href, "_blank", "noopener") : () => showView(nav.id)));
    [
      [T("Daily check", "Revisió del dia"), dailyCheck],
      [T("Change today’s training", "Canvia l’entrenament d’avui"), () => training()],
      [T("My details", "Les meves dades"), editProfile],
      [T("Download today’s plan", "Baixa el pla d’avui"), () => printPdf("plan")],
      [T("Email me the week", "Envia’m la setmana"), () => emailWeekly("plan")]
    ].forEach(([label, run]) => add(T("Actions", "Accions"), label, "", run));

    return entries;
  }

  function searchResults(query) {
    const needle = fold(query).trim();
    if (needle.length < 2) return [];
    const words = needle.split(/\s+/);
    return searchIndex()
      .map((entry) => {
        const haystack = fold(entry.label + " " + entry.detail + " " + entry.group);
        if (!words.every((word) => haystack.includes(word))) return null;
        // A hit at the start of the label beats one buried in the ingredients.
        return { entry, rank: fold(entry.label).startsWith(words[0]) ? 0 : fold(entry.label).includes(needle) ? 1 : 2 };
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 12)
      .map((hit) => hit.entry);
  }

  let searchHits = [];

  function renderSearchResults(query) {
    const list = document.querySelector("#search-results");
    if (!list) return;
    searchHits = searchResults(query);
    if (fold(query).trim().length < 2) {
      list.innerHTML = '<p class="search-hint">' + esc(T("Search a meal, an ingredient, a day or a screen.", "Cerca un àpat, un ingredient, un dia o una pantalla.")) + "</p>";
      return;
    }
    if (!searchHits.length) {
      list.innerHTML = '<p class="search-hint">' + esc(T("Nothing matches “" + query.trim() + "”.", "Res no coincideix amb «" + query.trim() + "».")) + "</p>";
      return;
    }
    list.innerHTML = searchHits.map((hit, index) => '<button class="search-hit" type="button" data-search-hit="' + index + '">'
      + '<span class="search-hit-group">' + esc(hit.group) + "</span>"
      + '<span class="search-hit-label">' + esc(hit.label) + "</span>"
      + (hit.detail ? '<span class="search-hit-detail">' + esc(hit.detail) + "</span>" : "")
      + "</button>").join("");
  }

  function openSearch() {
    if (document.querySelector("#search-panel")) return;
    setMenuOpen(false);
    const panel = document.createElement("div");
    panel.className = "search-panel";
    panel.id = "search-panel";
    panel.innerHTML = '<div class="search-sheet" role="dialog" aria-modal="true" aria-label="' + esc(T("Search", "Cerca")) + '">'
      + '<div class="search-bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>'
      + '<input id="search-input" type="search" autocomplete="off" placeholder="' + esc(T("Search the Coach…", "Cerca al Coach…")) + '" aria-label="' + esc(T("Search the Coach", "Cerca al Coach")) + '">'
      + '<button class="search-close" type="button" data-search-close>' + esc(T("Close", "Tanca")) + "</button></div>"
      + '<div class="search-results" id="search-results" role="listbox"></div></div>';
    document.body.append(panel);
    document.body.classList.add("modal-open");
    renderSearchResults("");
    const input = panel.querySelector("#search-input");
    input.addEventListener("input", () => renderSearchResults(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !searchHits.length) return;
      event.preventDefault();
      runSearchHit(0);
    });
    panel.addEventListener("click", (event) => {
      if (event.target === panel || event.target.closest("[data-search-close]")) return closeSearch();
      const hit = event.target.closest("[data-search-hit]");
      if (hit) runSearchHit(Number(hit.dataset.searchHit));
    });
    requestAnimationFrame(() => input.focus());
    translate();
  }

  function runSearchHit(index) {
    const hit = searchHits[index];
    closeSearch();
    hit?.run();
  }

  function closeSearch() {
    document.querySelector("#search-panel")?.remove();
    document.body.classList.remove("modal-open");
  }


  /* ── Voice control ───────────────────────────────────────────────────────
     The Coach is used with both hands busy: chopping, carrying a shopping
     basket, halfway through a set. So everything the tab bar and the overflow
     menu can do, a sentence can do too.

     The controller itself lives in `voice.js` and is fetched the first time the
     microphone is tapped, because most visits never ask for it. This is the
     other half of the contract: the small set of app functions voice is allowed
     to reach, and the sentences the Coach reads back.

     Note what is missing. `deleteEverything` is not here. Erasing a person's
     profile is a confirmed decision on a screen they can read, and a misheard
     sentence in a noisy kitchen must never be able to reach it. */

  const voiceReopenKey = "quota-vita-coach-voice-open";
  let voiceController = null;
  let voiceLoading = null;

  /** Everything the interpreter needs about the screen, and nothing more. */
  function voiceContext() {
    if (!state.profile) return { view: "setup", hasProfile: false };
    if (state.needsTraining) return { view: "setup", hasProfile: true, activity: state.activity };
    const plan = currentPlan();
    return {
      view: currentView,
      hasProfile: true,
      activity: state.activity,
      remaining: remainingToday(plan),
      meals: plan.meals.map((meal) => ({ id: meal.id, title: meal.title, status: state.meals[meal.id]?.status || "" }))
    };
  }

  /** "a, b and c" — a list a synthesiser reads as a list rather than a table. */
  function spokenList(items) {
    const parts = items.filter(Boolean);
    if (parts.length < 2) return parts.join("");
    return parts.slice(0, -1).join(", ") + " " + T("and", "i") + " " + parts[parts.length - 1];
  }

  const spokenGrams = (value) => Math.round(value) + " grams";

  function spokenMeal(meal) {
    // Middle dots are a typographic separator; read aloud they are silence.
    const portions = String(meal.portions || "").split("·").map((part) => part.trim()).filter(Boolean);
    return meal.slot + ": " + meal.title + ". " + portions.join(", ") + ".";
  }

  function spokenTargets() {
    const plan = currentPlan();
    const left = remainingToday(plan);
    if (left.calories <= 0 && left.proteinG <= 0) {
      return T("You have met today's target. Nicely done.", "Ja has arribat a l'objectiu d'avui. Molt bé.");
    }
    return T(
      "You have " + Math.round(left.calories) + " calories left, with " + spokenGrams(left.proteinG) + " of protein, "
        + spokenGrams(left.carbohydrateG) + " of carbohydrate and " + spokenGrams(left.fatG) + " of fat.",
      "Et queden " + Math.round(left.calories) + " calories, amb " + spokenGrams(left.proteinG) + " de proteïna, "
        + spokenGrams(left.carbohydrateG) + " de carbohidrats i " + spokenGrams(left.fatG) + " de greix."
    );
  }

  function spokenBasket(scope) {
    const lines = scope === "week"
      ? weeklyBasketItems().map(([name, amount]) => (amount < 20 ? amount : amount + " g") + " " + localiseFood(name))
      : basketItems(currentPlan()).map(([amount, name]) => (typeof amount === "number" && amount !== 1 ? amount + " g" : String(amount)) + " " + localiseFood(name));
    const lead = scope === "week"
      ? T("Your week needs:", "La setmana necessita:")
      : T("For today you need:", "Per avui necessites:");
    return lead + " " + spokenList(lines) + ".";
  }

  /* Setup by voice. `profile(seed)` already knows how to take part of an answer
     and jump to the first question still open, so the microphone reuses it
     rather than owning a second copy of the onboarding order. The next question
     is read back off the screen it just rendered, which keeps the spoken and
     the written flow the same sentence, already translated. */
  function nextSetupQuestion() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const bubbles = [...root.querySelectorAll(".chat .bubble.coach")];
        const question = bubbles[bubbles.length - 1];
        if (!question) return resolve("");
        // The hint lives in a `.meta` span inside the same bubble. On screen it
        // is a second line; read aloud with the question it is one long
        // run-on sentence, so only the question itself is spoken.
        const spoken = [...question.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" ");
        resolve((spoken.trim() || question.textContent).trim());
      }));
    });
  }

  /* Onboarding holds its six answers in a closure and only writes them to
     `state.profile` on the last question. So a second spoken answer arriving
     before the sixth would seed `profile()` with nothing but itself and send
     the person back to question one. This is where the spoken answers wait. */
  let voiceSetupAnswers = {};

  /** A refusal replaces the confirmation the grammar produced; it never follows it. */
  const instead = (text) => ({ say: text, instead: true });
  const needsSetup = () => instead(T("Let's finish your setup first. How old are you?", "Primer acabem la configuració. Quants anys tens?"));

  /**
   * The allow-list, executed. Each runner returns what the Coach should read
   * out on top of the confirmation the grammar or the model already produced,
   * or nothing when the confirmation says it all.
   */
  const voiceRunners = {
    navigate: ({ view }) => {
      if (!state.profile || state.needsTraining) return needsSetup();
      showView(view);
      return null;
    },
    log_meal: ({ meal, status }) => {
      if (!state.profile || state.needsTraining) return needsSetup();
      const entry = currentPlan().meals.find((item) => item.id === meal);
      if (!entry) return null;
      recordMeal(entry.id, status);
      refreshMealCard(entry.id);
      return null;
    },
    set_training: ({ activity }) => {
      if (!state.profile) return needsSetup();
      applyTraining(activity);
      return null;
    },
    set_profile: async (answers) => {
      if (!state.profile) {
        voiceSetupAnswers = { ...voiceSetupAnswers, ...answers };
        profile(voiceSetupAnswers);
        if (state.profile) voiceSetupAnswers = {};
        return nextSetupQuestion();
      }
      voiceSetupAnswers = {};
      state.profile = { ...state.profile, ...answers };
      save();
      void pushProfile();
      rerenderCurrentView();
      return T("Updated. Your targets are recalculated.", "Actualitzat. He recalculat els teus objectius.");
    },
    read_targets: () => (state.profile && !state.needsTraining ? spokenTargets() : needsSetup()),
    read_meal: ({ meal }) => {
      if (!state.profile || state.needsTraining) return needsSetup();
      const entry = currentPlan().meals.find((item) => item.id === meal);
      return entry ? spokenMeal(entry) : null;
    },
    read_basket: ({ scope }) => (state.profile && !state.needsTraining ? spokenBasket(scope === "week" ? "week" : "day") : needsSetup()),
    daily_check: () => {
      if (!state.profile || state.needsTraining) return needsSetup();
      dailyCheck();
      return null;
    },
    set_language: ({ language: code }) => {
      if (code === language) return null;
      localStorage.setItem("quota-vita-coach-language", code);
      // The language switch reloads, which would take the voice panel with it.
      // This is the note that survives the reload and reopens it.
      try { sessionStorage.setItem(voiceReopenKey, "yes"); } catch { /* private mode */ }
      setTimeout(() => location.reload(), 1400);
      return null;
    },
    email_week: () => {
      if (!state.profile || state.needsTraining) return needsSetup();
      emailWeekly("plan");
      return null;
    },
    download: ({ kind }) => {
      if (!state.profile || state.needsTraining) return needsSetup();
      printPdf(kind === "basket" ? "basket" : "plan");
      return null;
    },
    restart_day: () => { restartDay(); return null; },
    edit_profile: () => {
      if (!state.profile) return needsSetup();
      editProfile();
      return null;
    },
    search: ({ query }) => {
      if (!state.profile || state.needsTraining) return needsSetup();
      openSearch();
      const input = document.querySelector("#search-input");
      if (!input) return null;
      input.value = query;
      renderSearchResults(query);
      const hits = searchHits.length;
      return hits
        ? T(hits === 1 ? "One match. It's on screen." : hits + " matches are on screen.",
            hits === 1 ? "Una coincidència. La tens a la pantalla." : hits + " coincidències a la pantalla.")
        : T("Nothing matches that.", "No hi ha res que hi coincideixi.");
    }
  };

  const voiceBridge = {
    language: () => language,
    context: voiceContext,
    history: () => (Array.isArray(state.chat) ? state.chat.slice(-6) : []),
    perform: (action) => voiceRunners[action.name]?.(action.arguments || {}) ?? null,
    remember: (role, text) => {
      state.chat = [...(Array.isArray(state.chat) ? state.chat : []), { role, text }].slice(-20);
      save();
      renderCoachThreads();
    },
    track
  };

  async function openVoice() {
    if (voiceController) return voiceController.open();
    if (!voiceLoading) {
      voiceLoading = import("/voice.js" + (assetVersion ? "?v=" + encodeURIComponent(assetVersion) : ""))
        .then((module) => module.createVoiceController(voiceBridge))
        .catch((error) => { voiceLoading = null; throw error; });
    }
    try {
      voiceController = await voiceLoading;
      voiceController.open();
    } catch (error) {
      console.error("Voice control could not load", error);
      // Offline, and never loaded before. Search is the nearest thing that
      // works with no network, so the microphone hands over rather than dying.
      openSearch();
    }
  }

  function renderChrome() {
    const inSetup = !state.profile || state.needsTraining;
    const items = navItems();
    const topnav = inSetup ? "" : '<nav class="topnav" aria-label="' + esc(T("Sections", "Seccions")) + '">' + items.map((item) => (item.href
      ? '<a class="topnav-link topnav-link--shop" href="' + esc(item.href) + '" target="_blank" rel="noopener">' + esc(item.label) + "</a>"
      : '<button class="topnav-link' + (currentView === item.id ? " is-active" : "") + '" type="button" data-nav="' + item.id + '"' + (currentView === item.id ? ' aria-current="page"' : "") + ">" + esc(item.label) + "</button>")).join("") + "</nav>";
    const languages = '<div class="lang" data-language-control>' + [["en", "EN"], ["ca", "CA"]].map(([code, label]) => '<button type="button" data-language="' + code + '" class="' + (language === code ? "is-active" : "") + '" aria-pressed="' + (language === code) + '">' + label + "</button>").join("") + "</div>";
    const menuButton = inSetup ? "" : '<button class="icon-button" id="menu-toggle" type="button" aria-haspopup="true" aria-expanded="' + menuOpen + '" aria-controls="overflow-menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg><span class="sr-only">' + esc(T("More options", "Més opcions")) + "</span></button>";
    const chips = inSetup ? "" : streakChipsMarkup();
    const voiceButton = '<button class="icon-button" id="voice-toggle" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/></svg><span class="sr-only">' + esc(T("Talk to your Coach", "Parla amb el teu Coach")) + "</span></button>";
    const searchButton = inSetup ? "" : '<button class="icon-button" id="search-toggle" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span class="sr-only">' + esc(T("Search", "Cerca")) + "</span></button>";
    topbarHost.innerHTML = '<div class="topbar-inner"><a class="brand" href="/" aria-label="Quota Vita Coach"><img class="brand-logo brand-logo--ink" src="/assets/logo-quota-vita.png" width="578" height="120" alt="Quota Vita"><img class="brand-logo brand-logo--light" src="/assets/logo-quota-vita-light.png" width="621" height="120" alt="" aria-hidden="true"><em>Coach</em></a>' + topnav + '<div class="topbar-actions">' + chips + languages + voiceButton + searchButton + menuButton + "</div></div>" + (inSetup ? "" : menuMarkup());
    tabbarHost.hidden = inSetup;
    tabbarHost.innerHTML = inSetup ? "" : items.map((item) => (item.href
      ? '<a class="tab tab--shop" href="' + esc(item.href) + '" target="_blank" rel="noopener">' + svgIcon(item.id) + '<span class="tab-label">' + esc(item.label) + "</span></a>"
      : '<button class="tab' + (currentView === item.id ? " is-active" : "") + '" type="button" data-nav="' + item.id + '"' + (currentView === item.id ? ' aria-current="page"' : "") + ">" + svgIcon(item.id) + '<span class="tab-label">' + esc(item.label) + "</span></button>")).join("");
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
    document.documentElement.dataset.view = view;
    if (ROUTES.includes(view) && location.hash.slice(1) !== view) {
      history.replaceState(null, "", "#" + view);
    }
    root.innerHTML = html;
    menuOpen = false;
    renderChrome();
    fillShopOffers();
    if (changed) window.scrollTo({ top: 0, behavior: "auto" });
  }

  /** Re-asks today's movement and rebuilds today's plan. Keeps everything else. */
  const restartDay = () => {
    if (!state.profile) return welcome();
    failedMealImages.clear();
    failedWeeklyMealImages.clear();
    state = { ...state, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
    save();
    training();
  };

  /** Actually erases everything this device holds. Confirmed first, always. */
  function deleteEverything() {
    const items = [
      T("Your age, height, weight, activity and goal", "L’edat, l’alçada, el pes, l’activitat i l’objectiu"),
      T("Today’s plan and everything you have logged", "El pla d’avui i tot el que has registrat"),
      T("Your streak, XP, quests and badges", "La ratxa, els XP, les missions i les insígnies"),
      T("Your saved conversation with the Coach", "La conversa desada amb el Coach")
    ];
    const { overlay, close } = openModal(
      '<p class="eyebrow">' + esc(T("Delete my data", "Esborra les meves dades")) + '</p><h2 id="delete-title">' + esc(T("This cannot be undone", "Això no es pot desfer")) + "</h2>"
      + '<p>' + esc(T("Everything below is stored only in this browser and will be erased for good:", "Tot el següent es desa només en aquest navegador i s’esborrarà definitivament:")) + "</p>"
      + '<ul class="plain-list">' + items.map((item) => "<li>" + esc(item) + "</li>").join("") + "</ul>"
      + '<div class="actions"><button class="button button--danger" type="button" id="confirm-delete">' + esc(T("Delete everything", "Esborra-ho tot")) + '</button><button class="button quiet" type="button" data-modal-close>' + esc(T("Keep my data", "Conserva les dades")) + "</button></div>",
      "delete-title"
    );
    overlay.querySelector("#confirm-delete").onclick = () => {
      localStorage.removeItem(storageKey);
      localStorage.removeItem("quota-vita-coach-language");
      state = { profile: null, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: 0, chat: [] };
      close();
      welcome();
    };
  }
  const viewRenderers = () => ({ today: dashboard, week: weeklyPlan, basket: basket, coach: coachPage, progress: progressView, account: account });

  const ROUTES = ["today", "week", "basket", "coach", "progress"];

  function showView(name) {
    const render = viewRenderers()[name];
    if (!render) return;
    if (ROUTES.includes(name) && location.hash.slice(1) !== name) {
      history.pushState(null, "", "#" + name);
    }
    render();
  }

  /** Renders whatever the address bar says, so back and refresh behave. */
  function renderFromHash() {
    const name = location.hash.slice(1);
    if (!state.profile || state.needsTraining) return;
    const render = viewRenderers()[ROUTES.includes(name) ? name : "today"];
    if (render) render();
  }

  window.addEventListener("online", () => {
    failedMealImages.clear();
    failedWeeklyMealImages.clear();
    failedDailyMealPlans.clear();
    if (currentView === "today") dashboard();
  });

  window.addEventListener("popstate", renderFromHash);
  window.addEventListener("hashchange", renderFromHash);

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
    "edit-profile": editProfile,
    "leave-demo": () => { state.demo = false; state.profile = null; save(); profile(); },
    "restart-day": restartDay,
    "delete-data": deleteEverything
  });

  document.addEventListener("click", (event) => {
    const languageButton = event.target.closest("[data-language]");
    if (languageButton) { language = languageButton.dataset.language; localStorage.setItem("quota-vita-coach-language", language); location.reload(); return; }
    if (event.target.closest("[data-global-restart]")) return restartDay();
    const navButton = event.target.closest("[data-nav]");
    if (navButton) return showView(navButton.dataset.nav);
    const density = event.target.closest("[data-density]");
    if (density) {
      const compact = density.dataset.density === "true";
      if (Boolean(state.compactPlanView) !== compact) {
        state.compactPlanView = compact;
        expandedPlanDetails.clear();
        save();
        rerenderCurrentView();
      }
      return;
    }
    if (event.target.closest("#voice-toggle")) return void openVoice();
    if (event.target.closest("#search-toggle")) return openSearch();
    if (event.target.closest("#menu-toggle")) return setMenuOpen(!menuOpen);
    const menuAction = event.target.closest("[data-menu-action]");
    if (menuAction) {
      setMenuOpen(false);
      return menuActions()[menuAction.dataset.menuAction]?.();
    }
    if (menuOpen && !event.target.closest("#overflow-menu")) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    // "/" is the shortcut everyone already knows for search.
    if (event.key === "/" && state.profile && !state.needsTraining
      && !event.target.matches("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      return openSearch();
    }
    // "v" for voice, on the same terms: not while something is being typed into.
    if ((event.key === "v" || event.key === "V") && !event.metaKey && !event.ctrlKey && !event.altKey
      && !event.target.matches("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      return void openVoice();
    }
    if (event.key !== "Escape") return;
    if (document.querySelector("#search-panel")) return closeSearch();
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

  /* The lowest daily intake this Coach will ever put on screen. Below these,
     a general-wellbeing tool has no business writing a plan at all, so the
     target is raised to the floor and the user is told to see a clinician. */
  const CALORIE_FLOOR = { male: 1500, female: 1200, "": 1300 };

  function dailyTarget(profile, activity) {
    const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[profile.activity];
    const sexAdjustment = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
    const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment;
    const trainingAdjustment = { rest: 0, walk: 100, pilates: 125, strength: 250, run: 350 }[activity];
    const maintenance = bmr * factor + trainingAdjustment;
    // A proportional deficit or surplus. A flat 300 kcal is a rounding error for
    // a large athlete and a third of the day's food for a small older person.
    const goalAdjustment = profile.goal === "lose"
      ? -Math.min(500, Math.round(maintenance * 0.15))
      : profile.goal === "gain" ? Math.min(400, Math.round(maintenance * 0.12)) : 0;
    const requested = Math.round((maintenance + goalAdjustment) / 25) * 25;
    const floor = CALORIE_FLOOR[profile.sex] ?? CALORIE_FLOOR[""];
    const belowFloor = requested < floor;
    const calories = Math.max(floor, requested);
    const proteinPerKg = activity === "strength" || profile.goal === "gain" ? 1.6 : profile.goal === "lose" ? 1.4 : 1.2;
    // Protein and fat may never crowd carbohydrate out of the day: cap them so
    // at least 20% of energy is left for carbs, instead of clamping carbs at 0.
    const fatG = Math.round(calories * 0.28 / 9);
    const carbFloorKcal = calories * 0.2;
    const proteinCapG = Math.max(40, Math.floor((calories - carbFloorKcal - fatG * 9) / 4));
    const proteinG = Math.min(Math.round(profile.weightKg * proteinPerKg), proteinCapG);
    const carbohydrateG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
    return { calories, proteinG, carbohydrateG, fatG, fibreG: profile.sex === "male" ? 30 : 25, belowFloor, requested, floor };
  }

  /* Portion strings are written for a 2,000 kcal day. Scale the quantities with
     the target so the food on the card matches the numbers above it. */
  /* The countable things a portion line can name, singular and plural, so a
     scaled quantity reads correctly in both languages. */
  const COUNTABLE_NOUNS = {
    slice: ["slice", "slices"], slices: ["slice", "slices"],
    egg: ["egg", "eggs"], eggs: ["egg", "eggs"],
    banana: ["banana", "bananas"], bananas: ["banana", "bananas"],
    apple: ["apple", "apples"], apples: ["apple", "apples"],
    orange: ["orange", "oranges"], oranges: ["orange", "oranges"],
    pear: ["pear", "pears"], pears: ["pear", "pears"],
    "tuna can": ["tuna can", "tuna cans"], "tuna cans": ["tuna can", "tuna cans"],
    llesca: ["llesca", "llesques"], llesques: ["llesca", "llesques"],
    ou: ["ou", "ous"], ous: ["ou", "ous"],
    "plàtan": ["plàtan", "plàtans"], "plàtans": ["plàtan", "plàtans"],
    poma: ["poma", "pomes"], pomes: ["poma", "pomes"],
    taronja: ["taronja", "taronges"], taronges: ["taronja", "taronges"],
    pera: ["pera", "peres"], peres: ["pera", "peres"],
    llauna: ["llauna", "llaunes"], llaunes: ["llauna", "llaunes"]
  };

  function scalePortions(text, scale) {
    if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.06) return text;
    const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);
    return String(text)
      .replace(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/gi, (whole, amount, unit) => {
        const scaled = Number(String(amount).replace(",", ".")) * scale;
        return roundTo(scaled, scaled >= 100 ? 10 : 5) + unit.toLowerCase();
      })
      .replace(/\b(\d+(?:[.,]\d+)?)\s+([A-Za-zÀ-ÿ]+(?:\s+cans?)?)\b/g, (whole, amount, noun) => {
        // Catalan plurals are not "add an s", so countable nouns carry both forms.
        const forms = COUNTABLE_NOUNS[noun.toLowerCase()];
        if (!forms) return whole;
        const count = Math.max(1, Math.round(Number(String(amount).replace(",", ".")) * scale));
        return count + " " + (count === 1 ? forms[0] : forms[1]);
      });
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
    /* Rounding each meal independently left one or two grams stranded, so a day
       where you ate everything still read "1g carbs remaining". Every meal but
       the last is rounded from its share; the last takes the exact remainder,
       so the three always add up to the target. */
    const split = (total, rounding = 1) => {
      const parts = share.slice(0, -1).map((portion) => Math.round((total * portion) / rounding) * rounding);
      const used = parts.reduce((sum, part) => sum + part, 0);
      return [...parts, Math.max(0, total - used)];
    };
    const calories = split(target.calories, 25);
    const protein = split(target.proteinG);
    const carbohydrate = split(target.carbohydrateG);
    const fat = split(target.fatG);
    return foods.map(([slot, title, portions, hint, catalanName], index) => ({
      id: slot.toLowerCase(),
      slot, title, portions, hint, catalanName,
      calories: calories[index],
      proteinG: protein[index],
      carbohydrateG: carbohydrate[index],
      fatG: fat[index]
    }));
  }

  /* Portion text is written for a 2,000 kcal day, in whichever language the
     meal was localised into, so scaling runs after localisation. */
  function scaleMealPortions(meal, scale) {
    return { ...meal, portions: scalePortions(meal.portions, scale) };
  }

  function currentPlan() {
    const target = dailyTarget(state.profile, state.activity);
    const fallbackMeals = mealPlan(target, state.activity);
    const menuKey = dailyMenuKey();
    const generatedMeals = state.dailyMeals?.key === menuKey ? state.dailyMeals.meals : null;
    const scale = target.calories / 2000;
    const meals = fallbackMeals.map((fallback, index) => scaleMealPortions(localiseMeal({ ...fallback, ...(generatedMeals?.[index] || {}), id: fallback.id, slot: generatedMeals?.[index]?.slot || fallback.slot, calories: fallback.calories, proteinG: fallback.proteinG, carbohydrateG: fallback.carbohydrateG, fatG: fallback.fatG }), generatedMeals ? 1 : scale));
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
    landing();
  }

  function profile(seed) {
    const answers = { ...(state.profile || {}), ...(seed || {}) };
    const questions = [
      { key: "age", label: "How old are you?", hint: "For adults aged 18 to 100.", type: "number", min: 18, max: 100 },
      { key: "heightCm", label: "What is your height in centimetres?", hint: "For example, 175.", type: "number", min: 120, max: 230 },
      { key: "weightKg", label: "What is your weight in kilograms?", hint: "This lets us estimate protein and energy needs.", type: "number", min: 35, max: 300, step: "0.1" },
      { key: "sex", label: "Which option should we use for the energy estimate?", hint: "You can choose “prefer not to say”; we will use a midpoint estimate.", choices: [["Female", "female"], ["Male", "male"], ["Prefer not to say", ""]] },
      { key: "activity", label: "What does a usual week look like?", hint: "Mostly sitting = little planned movement. Lightly active = walking or light exercise 1–2 days/week. Regular training = exercise 3–4 days/week. Frequent training = demanding exercise 5+ days/week.", choices: [["Mostly sitting", "sedentary"], ["Lightly active", "light"], ["Regular training", "moderate"], ["Frequent training", "high"]] },
      { key: "goal", label: "What would you like to work toward?", hint: "Lose fat = a gentle calorie reduction. Gain muscle = a small calorie increase and more protein. Maintain = steady energy and weight. These are general-wellbeing estimates, not clinical advice.", choices: [["Lose fat", "lose"], ["Gain muscle", "gain"], ["Maintain", "maintain"]] }
    ];
    const totalSteps = questions.length + 1;
    // A seeded answer means that question is already behind us.
    let index = seed ? questions.findIndex((question) => answers[question.key] === undefined) : 0;
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
          + (problem ? '<div class="bubble coach bubble--problem">' + esc(problem) + "</div>" : '<div class="bubble coach">' + esc(question.label) + '<span class="meta">' + esc(question.hint) + "</span></div>") + input
          + '</section><div class="actions on-shell">' + back + '<button class="button quiet" id="cancel" type="button">' + esc(T("Cancel and restart", "Cancel·la i comença de nou")) + '</button></div><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p><p class="privacy privacy-links">' + siteLinks() + '</p></div>',
        "view--setup"
      ));
      root.querySelector("#cancel").onclick = welcome;
      root.querySelector("#back")?.addEventListener("click", () => { index -= 1; render(); });
      root.querySelectorAll("[data-answer]").forEach((button) => button.onclick = () => advance(button.dataset.answer));
      const form = root.querySelector("#chat-form");
      if (form) form.onsubmit = (event) => { event.preventDefault(); advance(root.querySelector("#chat-answer").value); };
      requestAnimationFrame(() => root.querySelector("#chat-answer")?.focus({ preventScroll: true }));
    };
    let problem = "";
    const advance = (value) => {
      const question = questions[index];
      if (!question.choices && (!Number.isFinite(Number(value)) || Number(value) < question.min || Number(value) > question.max)) {
        problem = String(value).trim()
          ? T("That is outside " + question.min + "–" + question.max + ". " + question.label, "Això queda fora de " + question.min + "–" + question.max + ". " + question.label)
          : T("I need a number to work with. " + question.label, "Necessito un número. " + question.label);
        return render();
      }
      problem = "";
      answers[question.key] = question.choices ? value : Number(value);
      index += 1;
      if (index < questions.length) return render();
      completeSetup();
    };

    /** The six answers become a profile. Reached by the last click, or by a
        seed that already carries all six — which is what voice hands in. */
    function completeSetup() {
      state = { ...state, profile: answers, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
      save();
      track("onboarding_completed", { goal: String(answers.goal || ""), activity: String(answers.activity || "") });
      void pushProfile();
      training(true);
    }

    if (index < 0) return completeSetup();
    render();
  }

  function viewShell(title, lead, content, extraClass = "") {
    return '<section class="view' + (extraClass ? " " + extraClass : "") + (state.compactPlanView ? " compact-view" : "") + '"><header class="view-head"><p class="eyebrow">' + esc(T("Your Coach", "El teu coach")) + '</p><h1>' + esc(title) + "</h1>" + (lead ? '<p class="view-lead">' + esc(lead) + "</p>" : "") + "</header>" + content + "</section>";
  }

  /* The six setup answers, editable. A nutrition app whose whole premise is
     adapting to your body has to let the body change. */
  function editProfile() {
    const p = state.profile || {};
    const numberField = (key, label, hint, min, max, step) => '<label class="field">' + esc(label)
      + '<input id="edit-' + key + '" type="number" inputmode="decimal" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + esc(p[key] ?? "") + '" required>'
      + "<small>" + esc(hint) + "</small></label>";
    const selectField = (key, label, options) => '<label class="field">' + esc(label)
      + '<select id="edit-' + key + '">' + options.map(([value, text]) => '<option value="' + esc(value) + '"' + (String(p[key] ?? "") === value ? " selected" : "") + ">" + esc(text) + "</option>").join("") + "</select></label>";
    mount("profile", viewShell(
      T("My details", "Les meves dades"),
      T("Change these whenever your body or your goal changes. Your plan is recalculated straight away.", "Canvia-ho sempre que el teu cos o el teu objectiu canviïn. El pla es recalcula immediatament."),
      '<form class="card" id="profile-form"><div class="field-grid">'
      + numberField("age", T("Age", "Edat"), T("18 to 100", "De 18 a 100"), 18, 100)
      + numberField("heightCm", T("Height in cm", "Alçada en cm"), T("120 to 230", "De 120 a 230"), 120, 230)
      + numberField("weightKg", T("Weight in kg", "Pes en kg"), T("35 to 300", "De 35 a 300"), 35, 300, "0.1")
      + selectField("sex", T("Used for the energy estimate", "Per a l’estimació energètica"), [["female", T("Female", "Dona")], ["male", T("Male", "Home")], ["", T("Prefer not to say", "Prefereixo no dir-ho")]])
      + selectField("activity", T("A usual week", "Una setmana habitual"), [["sedentary", T("Mostly sitting", "Principalment assegut")], ["light", T("Lightly active", "Activitat lleugera")], ["moderate", T("Regular training", "Entrenament regular")], ["high", T("Frequent training", "Entrenament freqüent")]])
      + selectField("goal", T("Working toward", "Objectiu"), [["lose", T("Lose fat", "Perdre greix")], ["gain", T("Gain muscle", "Guanyar múscul")], ["maintain", T("Maintain", "Mantenir")]])
      + '</div><div id="profile-feedback" aria-live="polite"></div>'
      + '<div class="actions"><button class="button" type="submit">' + esc(T("Save and recalculate", "Desa i recalcula")) + '</button><button class="button quiet" type="button" id="profile-cancel">' + esc(T("Cancel", "Cancel·la")) + "</button></div></form>"
    ));
    root.querySelector("#profile-cancel").onclick = dashboard;
    root.querySelector("#profile-form").onsubmit = (event) => {
      event.preventDefault();
      const read = (key) => Number(root.querySelector("#edit-" + key).value);
      const bounds = { age: [18, 100], heightCm: [120, 230], weightKg: [35, 300] };
      const invalid = Object.entries(bounds).find(([key, [min, max]]) => !Number.isFinite(read(key)) || read(key) < min || read(key) > max);
      const feedback = root.querySelector("#profile-feedback");
      if (invalid) return feedback.innerHTML = note(T("Check the " + invalid[0].replace("Cm", "").replace("Kg", "") + " field: it must be between " + invalid[1][0] + " and " + invalid[1][1] + ".", "Revisa el camp: ha d’estar entre " + invalid[1][0] + " i " + invalid[1][1] + "."), true);
      state.profile = {
        age: read("age"), heightCm: read("heightCm"), weightKg: read("weightKg"),
        sex: root.querySelector("#edit-sex").value,
        activity: root.querySelector("#edit-activity").value,
        goal: root.querySelector("#edit-goal").value
      };
      // The targets moved, so the generated menu and its photos no longer match.
      state.dailyMeals = null;
      state.mealImages = {};
      state.weeklyMealImages = {};
      state.menuNonce = (state.menuNonce || 0) + 1;
      failedDailyMealPlans.clear();
      failedMealImages.clear();
      save();
      dashboard();
    };
  }

  /* A stranger should be able to see what this produces before handing over
     their body measurements. */
  /* The landing is the first thing anyone sees and it has one job: make the
     product feel worth the six questions it is about to ask. So it is a
     photograph, a headline set as large as the screen allows, one sentence, and
     the Coach already talking. The first question is answered here rather than
     behind a button — the conversation starts on the landing instead of being
     promised by it. */
  function landing() {
    const opener = T("Hi, I’m your Quota Vita Coach. Six quick questions and today’s plan is yours.",
                     "Hola, soc el teu Coach de Quota Vita. Sis preguntes ràpides i el pla d’avui és teu.");
    mount("landing", '<section class="view view--landing">'
      + '<div class="hero">'
      + '<picture class="hero-media">'
      +   '<source media="(max-width: 640px)" srcset="/assets/hero-landing-sm.jpg">'
      +   '<img src="/assets/hero-landing.jpg" alt="' + esc(T("A Mediterranean lunch laid on a table in daylight", "Un dinar mediterrani parat en una taula amb llum natural")) + '" fetchpriority="high">'
      + '</picture>'
      + '<div class="hero-body">'
      +   '<h1 class="hero-title">' + esc(T("Eat for the day you actually have.", "Menja segons el dia que tens de veritat.")) + "</h1>"
      +   '<p class="hero-lead">' + esc(T("Your calories, your macros, three meals and the exact shopping list — built around your body, your goal and what you are doing today.", "Les teves calories, els teus macronutrients, tres àpats i la llista de la compra exacta, segons el teu cos, el teu objectiu i el que facis avui.")) + "</p>"
      +   '<div class="hero-chat">'
      +     '<p class="hero-bubble">' + esc(opener) + "</p>"
      +     '<form class="hero-composer" id="landing-form">'
      +       '<label class="sr-only" for="landing-age">' + esc(T("How old are you?", "Quants anys tens?")) + "</label>"
      +       '<input id="landing-age" type="number" inputmode="numeric" enterkeyhint="send" min="18" max="100" placeholder="' + esc(T("How old are you?", "Quants anys tens?")) + '" autocomplete="off">'
      +       '<button class="button" type="submit">' + esc(T("Start", "Comença")) + "</button>"
      +     "</form>"
      +     '<p class="hero-note" id="landing-note">' + esc(T("Six questions. No account. Everything stays in this browser.", "Sis preguntes. Sense compte. Tot es queda en aquest navegador.")) + "</p>"
      +   "</div>"
      +   '<button class="hero-secondary" type="button" id="see-example">' + esc(T("Or see an example day first", "O mira primer un dia d’exemple")) + "</button>"
      + "</div></div>"
      + '<footer class="hero-foot"><span>' + esc(T("General wellbeing guidance only. Not medical advice.", "Orientació de benestar general. No és assessorament mèdic.")) + "</span>" + siteLinks() + "</footer>"
      + "</section>");
    const form = root.querySelector("#landing-form");
    const input = root.querySelector("#landing-age");
    form.onsubmit = (event) => {
      event.preventDefault();
      const age = Number(input.value);
      if (!Number.isFinite(age) || age < 18 || age > 100) {
        root.querySelector("#landing-note").textContent = T("That is outside 18–100. How old are you?", "Això queda fora de 18–100. Quants anys tens?");
        input.focus();
        return;
      }
      profile({ age });
    };
    root.querySelector("#see-example").onclick = startDemo;
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  /** A full working day on a sample profile, clearly labelled, one tap to adopt. */
  function startDemo() {
    state = {
      ...state,
      demo: true,
      profile: { age: 34, heightCm: 172, weightKg: 68, sex: "", activity: "moderate", goal: "maintain" },
      planDate: todayKey(), needsTraining: false, activity: "strength",
      meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1
    };
    dashboard();
  }

  function demoBannerMarkup() {
    if (!state.demo) return "";
    return '<div class="notice notice--demo"><div><strong>' + esc(T("This is an example day", "Això és un dia d’exemple")) + "</strong><span>" + esc(T("Built for a 34-year-old who trains regularly. Yours will use your own numbers.", "Fet per a una persona de 34 anys que entrena sovint. El teu farà servir els teus números.")) + '</span></div><button class="button" type="button" data-menu-action="leave-demo">' + esc(T("Make this mine", "Fes-lo meu")) + "</button></div>";
  }

  function coachShell(title, lead, content) {
    return viewShell(title, lead, '<section class="chat" aria-live="polite">' + content + "</section>");
  }

  function training(fromSetup = false) {
    const choices = [["Rest or recovery day", "rest"], ["Walk", "walk"], ["Pilates", "pilates"], ["Strength training", "strength"], ["Run", "run"]];
    const inSetup = fromSetup;
    const savedProfileLead = language === "ca"
      ? "El teu perfil està desat en aquest dispositiu. Els àpats i les quantitats s’adaptaran al moviment d’avui."
      : "Your profile is saved on this device. Your meals and quantities will adapt to today’s movement.";
    const back = inSetup
      ? '<button class="button quiet" id="back" type="button">' + esc(T("Back", "Enrere")) + "</button>"
      : '<button class="button quiet" id="back" type="button">' + esc(T("Back to today", "Torna a avui")) + "</button>";
    const g = game();
    const returning = !inSetup || (g.streak || 0) > 0 || game().xp > 0;
    const greeting = returning && (g.streak || 0) > 0
      ? T("Good to see you — day " + g.streak + " of your streak.", "Que bo tornar-te a veure: dia " + g.streak + " de la teva ratxa.")
      : "";
    mount("setup", viewShell(
      inSetup ? "Are you going to train today?" : T("What does today look like?", "Com és el dia d’avui?"),
      inSetup ? savedProfileLead : T("Your meals and quantities adapt to today’s movement.", "Els àpats i les quantitats s’adapten al moviment d’avui."),
      (inSetup ? stepper(7, 7) : (greeting ? '<p class="greeting">' + icon("flame") + '' + esc(greeting) + "</p>" : ""))
        + '<div class="setup"><section class="chat" aria-live="polite"><div class="bubble coach">What does today’s movement look like?<span class="meta">Choose one reply. I will adapt your calories, carbohydrates and meal quantities.</span></div><div class="composer"><span class="composer-label">'
        + esc(T("Choose one reply", "Tria una resposta"))
        + '</span><p class="keyboard-hint">' + esc(T("Press 1, 2, 3, 4 or 5 on your keyboard to choose.", "Prem 1, 2, 3, 4 o 5 al teclat per triar.")) + '</p><div class="quick-replies">'
        + choiceButtons(choices, "data-choice")
        + '</div></div></section><div class="actions on-shell">' + back + "</div></div>",
      "view--setup"
    ));
    root.querySelector("#back").onclick = () => { if (inSetup) return profile(); state.needsTraining = false; dashboard(); };
    root.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => applyTraining(button.dataset.choice));
  }

  /* Choosing today's movement rebuilds the target, the three meals, their
     photographs and the basket. The screen and the microphone both go through
     here so neither can rebuild a different subset of the day. */
  function applyTraining(activity) {
    failedMealImages.clear();
    failedWeeklyMealImages.clear();
    failedDailyMealPlans.clear();
    state.activity = activity;
    state.needsTraining = false;
    state.meals = {};
    state.mealImages = {};
    state.weeklyMealImages = {};
    state.dailyMeals = null;
    state.menuNonce = (state.menuNonce || 0) + 1;
    save();
    dashboard();
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

  /**
   * Openings for a conversation nobody knows how to start.
   *
   * They are built from the plan on screen, not from a generic list, so the
   * first tap asks about the dinner actually sitting in front of the person.
   */
  function coachStarters() {
    const plan = state.profile ? currentPlan() : null;
    const dinner = plan?.meals?.find((meal) => /dinner|sopar/i.test(meal.slot || ""));
    const starters = [];

    if (dinner?.title) {
      starters.push({
        label: T("Swap tonight’s dinner", "Canvia el sopar d’avui"),
        text: T("Suggest a different dinner instead of " + dinner.title + ", with similar calories and protein.",
                "Proposa un sopar diferent en comptes de " + dinner.title + ", amb calories i proteïna semblants."),
      });
    }
    starters.push({
      label: T("I’m eating out tonight", "Avui sopo fora"),
      text: T("I am eating at a restaurant tonight. What should I order to stay close to today’s target?",
              "Avui sopo en un restaurant. Què hauria de demanar per acostar-me a l’objectiu d’avui?"),
    });
    starters.push({
      label: T("Make it cheaper", "Fes-ho més barat"),
      text: T("How can I hit today’s target with cheaper ingredients from a normal supermarket?",
              "Com puc assolir l’objectiu d’avui amb ingredients més barats d’un supermercat normal?"),
    });
    starters.push({
      label: T("I trained harder than planned", "He entrenat més del previst"),
      text: T("I trained harder than planned today. Should I eat more, and what?",
              "Avui he entrenat més del previst. Hauria de menjar més, i què?"),
    });

    return starters.slice(0, 4);
  }

  function coachStartersMarkup() {
    return '<div class="coach-starters">'
      + coachStarters()
        .map((starter) => '<button class="goal-chip" type="button" data-coach-starter="' + esc(starter.text) + '">' + esc(starter.label) + "</button>")
        .join("")
      + "</div>";
  }

  function liveCoachMarkup(placement) {
    const ask = T("Ask", "Pregunta");
    const askLabel = T("Ask your Coach…", "Pregunta al teu Coach…");
    const messages = Array.isArray(state.chat) ? state.chat.slice(-8) : [];
    // An empty chat with a blinking cursor is a test, not an invitation. Until
    // there is a conversation, offer four ways into one.
    const thread = messages.length
      ? messages.map((message) => '<div class="bubble ' + (message.role === "user" ? "user" : "coach") + '">' + esc(message.text) + "</div>").join("")
      : '<div class="bubble coach">Ask about a meal, a healthy swap or today’s training.<span class="meta">General wellbeing guidance, not medical advice.</span></div>';
    const starters = messages.length ? "" : coachStartersMarkup();
    return '<section class="live-coach" aria-label="Talk to your Coach"><p class="eyebrow">Talk to your Coach</p><div class="live-coach-thread" data-live-coach-thread="' + placement + '" aria-live="polite">' + thread + '</div>' + starters + '<form class="composer chat-input" data-live-coach-form="' + placement + '"><input maxlength="1400" placeholder="' + esc(askLabel) + '" aria-label="' + esc(askLabel) + '" required><button class="button" type="submit">' + esc(ask) + '</button></form><p class="meta">Messages are sent to OpenAI to generate a reply. Quota Vita keeps this conversation only on this device.</p></section>';
  }

  function renderCoachThreads() {
    const messages = Array.isArray(state.chat) ? state.chat.slice(-8) : [];
    root.querySelectorAll("[data-live-coach-thread]").forEach((thread) => {
      thread.innerHTML = messages.map((message) => '<div class="bubble ' + (message.role === "user" ? "user" : "coach") + '">' + esc(message.text) + "</div>").join("");
      thread.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    // The starters are an empty state. Once there is a conversation they are
    // just four buttons in the middle of it.
    if (messages.length) root.querySelectorAll(".coach-starters").forEach((node) => node.remove());
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
      const offline = !navigator.onLine || error instanceof TypeError || /failed to fetch|networkerror|load failed|network request/i.test(String(error?.message || ""));
      const message = offline
        ? T("No connection right now. Your plan still works offline — the Coach will answer when you are back online.", "Ara mateix no hi ha connexió. El pla funciona igualment sense connexió; el Coach respondrà quan tornis a tenir-ne.")
        : (error.message || T("The Coach is unavailable right now. Try again in a moment.", "El Coach no està disponible ara mateix. Torna-ho a provar d’aquí a un moment."));
      const thread = root.querySelector('[data-live-coach-thread="' + placement + '"]') || root.querySelector("[data-live-coach-thread]");
      if (thread) thread.insertAdjacentHTML("beforeend", '<p class="status error">' + esc(message) + "</p>");
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
    root.querySelectorAll("[data-coach-starter]").forEach((button) => {
      button.onclick = () => {
        const section = button.closest(".live-coach");
        track("coach_prompt_used", { label: button.textContent.slice(0, 40) });
        askLiveCoach(button.dataset.coachStarter, section?.querySelector("[data-live-coach-form]")?.dataset.liveCoachForm || "desktop");
      };
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

  /** What is still to eat today. The panel draws it; the Coach reads it aloud. */
  function remainingToday(plan) {
    const eaten = totals(plan);
    return {
      calories: Math.max(0, plan.target.calories - eaten.calories),
      proteinG: Math.max(0, plan.target.proteinG - eaten.proteinG),
      carbohydrateG: Math.max(0, plan.target.carbohydrateG - eaten.carbohydrateG),
      fatG: Math.max(0, plan.target.fatG - eaten.fatG)
    };
  }

  function targetPanelMarkup(plan) {
    const eaten = totals(plan);
    const left = remainingToday(plan);
    const logged = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status)).length;
    const percent = (value, target) => (target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0);

    /**
     * Eaten against target, not the remainder.
     *
     * The bar used to fill by what was left, under a heading that said "still to
     * eat", beside a number that was also what was left. Three different framings
     * of the same quantity, so a full bar could mean either finished or untouched
     * depending on which one you read. It now says `46 / 122 g`: the bar fills as
     * you eat, and the pair of numbers removes the question.
     */
    const row = (label, eatenValue, target, modifier) => {
      const filled = percent(eatenValue, target);
      const over = target > 0 && eatenValue > target * 1.05;
      const met = !over && target > 0 && eatenValue >= target * 0.9;
      const tone = over ? " is-over" : met ? " is-met" : "";
      return '<div class="macro-row' + tone + '">'
        + '<span class="macro-row-label">' + esc(label) + "</span>"
        + '<div class="bar ' + modifier + '" role="img" aria-label="' + esc(label + " " + Math.round(eatenValue) + " of " + target + " g") + '">'
        + '<i style="width:' + filled + '%"></i></div>'
        + '<b><span class="macro-eaten">' + Math.round(eatenValue) + "</span>" + '<span class="macro-target">/' + target + "g</span></b>"
        + "</div>";
    };

    return '<section class="target" id="target-panel">'
      + '<div class="target-head"><div><span class="target-label">' + esc(T("Still to eat", "Encara per menjar")) + '</span><div class="target-figure"><b>' + left.calories.toLocaleString(language === "ca" ? "ca-ES" : "en-GB") + "</b><span>kcal</span></div></div>"
      + '<span class="chip">' + esc(activityLabel(state.activity)) + "</span></div>"
      + '<div class="target-macros">'
      + row(T("Protein", "Proteïna"), eaten.proteinG, plan.target.proteinG, "bar--protein")
      + row(T("Carbs", "Carbohidrats"), eaten.carbohydrateG, plan.target.carbohydrateG, "bar--carbs")
      + row(T("Fat", "Greixos"), eaten.fatG, plan.target.fatG, "bar--fat")
      + "</div>"
      + '<div class="target-foot"><p class="meta">' + logged + " " + esc(T("of", "de")) + " " + plan.meals.length + " " + esc(T("meals logged today", "àpats registrats avui")) + '</p><button class="link-button" type="button" data-menu-action="daily-check">' + esc(T("Daily check", "Revisió del dia")) + "</button></div>"
      + "</section>";
  }

  /**
   * The summary card is sticky, and at full height it covered most of a phone
   * screen — meal titles were sliced in half behind it while you scrolled. It
   * now shrinks to a single line the moment it leaves its resting place.
   *
   * The observer watches for the card's top edge passing under the top bar: a
   * sticky element stops being fully visible at exactly the point it sticks.
   */
  let unwatchTargetPanel = null;

  function watchTargetPanel() {
    unwatchTargetPanel?.();
    unwatchTargetPanel = null;

    const panel = root.querySelector("#target-panel");
    if (!panel) return;

    // A zero-height marker left where the card rests. Once the card is stuck its
    // own rectangle stops moving, so it can no longer be asked whether it is
    // stuck; the marker keeps scrolling and can.
    let sentinel = panel.previousElementSibling;
    if (!sentinel?.classList.contains("target-sentinel")) {
      sentinel = document.createElement("div");
      sentinel.className = "target-sentinel";
      sentinel.setAttribute("aria-hidden", "true");
      panel.before(sentinel);
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const limit = (document.querySelector(".topbar")?.offsetHeight ?? 60) + 2;
      panel.classList.toggle("is-stuck", sentinel.getBoundingClientRect().top < limit);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    measure();

    unwatchTargetPanel = () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }

  function updateTargetPanel(plan) {
    const panel = root.querySelector("#target-panel");
    if (!panel) return;
    panel.outerHTML = targetPanelMarkup(plan);
    // outerHTML replaces the node, so the listener was left measuring a detached
    // element and the card would expand mid-scroll on the next meal logged.
    // watchTargetPanel re-attaches and re-measures, which also restores the
    // stuck state without having to carry it across by hand.
    translate();
    watchTargetPanel();
  }

  /** Shown when the honest calculation lands under the safe floor. */
  function safetyNoticeMarkup(target) {
    if (!target.belowFloor) return "";
    return '<div class="notice notice--care"><div><strong>' + esc(T("These numbers need a professional, not an app", "Aquests números necessiten un professional, no una app")) + "</strong><span>"
      + esc(T("Your details work out at about " + target.requested + " kcal a day, which is below what this Coach will plan for. It has been raised to " + target.calories + " kcal so the day is still balanced, but please talk to a doctor or dietitian before following it.",
             "Amb les teves dades surten uns " + target.requested + " kcal al dia, per sota del que aquest Coach pot planificar. S’ha apujat a " + target.calories + " kcal perquè el dia segueixi equilibrat, però parla amb un metge o dietista abans de seguir-lo."))
      + '</span></div><button class="button quiet" type="button" data-menu-action="edit-profile">' + esc(T("Check my details", "Revisa les meves dades")) + "</button></div>";
  }

  /** The compact quest strip, so the game is visible where people actually are. */
  function questStripMarkup() {
    const day = todayGame();
    const quests = todayQuests();
    const done = quests.filter((quest) => day.quests[quest.id]).length;
    return '<section class="quest-strip"><div class="quest-strip-head"><span class="label">' + esc(T("Today’s quests", "Missions d’avui")) + '</span><span class="quest-strip-count">' + done + " / " + quests.length + "</span></div><ul>"
      + quests.map((quest) => {
        const complete = Boolean(day.quests[quest.id]);
        const label = esc(language === "ca" ? quest.ca : quest.en);
        const inner = '<span class="quest-check" aria-hidden="true">' + (complete ? "✓" : "") + "</span><span>" + label + "</span><b>+" + quest.xp + "</b>";
        return '<li class="' + (complete ? "is-done" : "") + '">' + (complete
          ? "<span>" + inner + "</span>"
          : '<button type="button" data-quest-go="' + esc(quest.go) + '" aria-label="' + label + '">' + inner + "</button>") + "</li>";
      }).join("")
      + "</ul></section>";
  }

  /** A streak save is worth nothing if the user never learns it happened. */
  function freezeNoticeMarkup() {
    const g = game();
    if (g.freezeNotice !== todayKey()) return "";
    return '<div class="notice notice--freeze"><div><strong>' + esc(T("A streak freeze saved your " + g.streak + "-day streak", "Una congelació ha salvat la teva ratxa de " + g.streak + " dies")) + "</strong><span>"
      + esc(g.freezes > 0
        ? T("You missed a day and one of your freezes covered it. You have " + g.freezes + " left — earn another after seven days in a row.", "Has fallat un dia i una de les congelacions ho ha cobert. Te’n queden " + g.freezes + ". En guanyaràs una altra després de set dies seguits.")
        : T("You missed a day and your last freeze covered it. Seven days in a row earns another one.", "Has fallat un dia i l’última congelació ho ha cobert. Set dies seguits en tornen a donar una."))
      + '</span></div><button class="button quiet" type="button" data-dismiss-freeze>' + esc(T("Got it", "Entesos")) + "</button></div>";
  }

  /** Everything logged: give the day an ending instead of a row of zeroes. */
  function dayCompleteMarkup(plan) {
    const decided = plan.meals.filter((meal) => state.meals[meal.id]?.status);
    if (decided.length < plan.meals.length) return "";
    const g = game();
    const day = todayGame();
    const ate = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status)).length;
    const nextBadge = BADGES.find((badge) => !g.badges.includes(badge.id));
    const tomorrow = state.tomorrowActivity;
    const choices = [["rest", T("Rest", "Descans")], ["walk", T("Walk", "Caminar")], ["pilates", T("Pilates", "Pilates")], ["strength", T("Strength", "Força")], ["run", T("Run", "Córrer")]];
    const headline = ate === 0
      ? T("Today did not go to plan. That is still a day logged.", "Avui no ha anat segons el pla. Tot i així, és un dia registrat.")
      : ate < plan.meals.length
        ? T("Day closed — " + ate + " of " + plan.meals.length + " meals eaten as planned.", "Dia tancat: " + ate + " de " + plan.meals.length + " àpats com estava previst.")
        : T("Every meal logged. That is a complete day.", "Tots els àpats registrats. Un dia complet.");
    return '<section class="day-done"><p class="eyebrow">' + esc(T("Day complete", "Dia complet")) + '</p><h2>' + esc(headline) + "</h2>"
      + '<div class="day-done-stats"><div><b>' + (g.streak || 0) + '</b><span>' + esc((g.streak === 1 ? T("day streak", "dia de ratxa") : T("day streak", "dies de ratxa"))) + '</span></div><div><b>' + day.xp + '</b><span>XP ' + esc(T("today", "avui")) + '</span></div>'
      + (nextBadge ? '<div><b class="day-done-badge" aria-hidden="true">' + icon(nextBadge.icon) + '</b><span>' + esc(language === "ca" ? nextBadge.hint.ca : nextBadge.hint.en) + "</span></div>" : "")
      + "</div>"
      + '<div class="tomorrow"><span class="label">' + esc(T("Tomorrow’s movement", "El moviment de demà")) + '</span><div class="tomorrow-choices">'
      + choices.map(([value, label]) => '<button type="button" class="tomorrow-choice' + (tomorrow === value ? " is-active" : "") + '" data-tomorrow="' + value + '">' + esc(label) + "</button>").join("")
      + '</div><p class="meta">' + esc(tomorrow ? T("Set. Tomorrow’s plan will be ready when you open the Coach.", "Fet. El pla de demà estarà a punt quan obris el Coach.") : T("Pick one and tomorrow’s plan is ready before you wake up.", "Tria’n una i el pla de demà estarà a punt abans que et llevis.")) + "</p></div></section>";
  }

  /**
   * Where this plan lives, and what to do about it.
   *
   * The old line — "This plan is stored only in this browser" — was true and
   * was a dead end: it told someone their streak was disposable and offered no
   * way to make it otherwise. Signed in, it says the opposite and means it.
   */
  function storageNoticeMarkup() {
    if (signedIn()) {
      return '<p class="privacy privacy--synced">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.6 5.7M4 12a8 8 0 0 1 13.6-5.7"/><path d="M17 3v4h-4M7 21v-4h4"/></svg>'
        + esc(T("Saved to your Quota Vita account. Your streak follows you to any device.",
                "Desat al teu compte de Quota Vita. La teva ratxa et segueix a qualsevol dispositiu."))
        + "</p>";
    }
    if (!accountsEnabled) {
      return '<p class="privacy">' + esc(T("This plan is stored only in this browser.", "Aquest pla només es desa en aquest navegador.")) + "</p>";
    }
    return '<p class="privacy privacy--offer">'
      + esc(T("This plan is stored only in this browser — clearing it loses your streak.",
              "Aquest pla només es desa en aquest navegador: si l’esborres, perds la ratxa."))
      + ' <a class="privacy-action" href="' + esc(accountLinkUrl()) + '" data-track="account_link_started">'
      + esc(T("Keep it on every device", "Conserva’l a tots els dispositius")) + "</a></p>";
  }

  function dashboard() {
    const plan = currentPlan();
    const generating = !state.dailyMeals && pendingDailyMealPlans.size > 0;
    const chip = generating ? '<p class="loading-chip">' + esc(T("Personalising your meals…", "Personalitzant els teus àpats…")) + "</p>" : "";
    mount("today", viewShell(
      T("Today’s plan", "El pla d’avui"),
      T("Three meals built around your body, your goal and today’s movement.", "Tres àpats pensats pel teu cos, el teu objectiu i el moviment d’avui."),
      demoBannerMarkup() + safetyNoticeMarkup(plan.target) + freezeNoticeMarkup() + chip
        + '<div class="today"><div class="today-main">' + targetPanelMarkup(plan)
        + questStripMarkup()
        + dayCompleteMarkup(plan)
        + '<ul class="meal-list" id="meal-list">' + mealListMarkup(plan) + "</ul>"
        + '<div class="logged-toggle" id="logged-toggle">' + loggedToggleMarkup(plan) + "</div>"
        + storageNoticeMarkup() + methodology() + "</div>"
        + '<aside class="today-aside">' + liveCoachMarkup("desktop") + "</aside></div>",
      "view--today"
    ));
    track("targets_shown", { calories: plan.target.calories, protein_g: plan.target.proteinG, activity: String(state.activity || "") });
    bindTodayHandlers(plan);
    watchTargetPanel();
    loadMealImages(plan);
    void loadGeneratedDailyMeals(plan.target);
  }

  /* Once a meal has been eaten it stops being a decision, so its card leaves the
     list and Today shows only what is still open. Nothing is lost: the toggle
     below the list brings the whole day back. */
  let showLoggedMeals = false;
  const isConsumed = (id) => ["eaten", "restaurant"].includes(state.meals[id]?.status);

  function mealListMarkup(plan) {
    const milkshakeMeal = plan.meals.find((meal) => meal.milkshakeEligible)?.id || "lunch";
    const visible = showLoggedMeals ? plan.meals : plan.meals.filter((meal) => !isConsumed(meal.id));
    return visible.map((meal) => "<li>" + mealCard(meal, meal.id === milkshakeMeal) + "</li>").join("");
  }

  function loggedToggleMarkup(plan) {
    const hidden = plan.meals.filter((meal) => isConsumed(meal.id)).length;
    if (!hidden) return "";
    const label = showLoggedMeals
      ? T("Hide the meals I logged", "Amaga els àpats registrats")
      : T("Show today’s dishes", "Mostra’m els plats d’avui") + " (" + hidden + ")";
    return '<button class="button quiet show-logged" type="button" data-toggle-logged aria-expanded="' + showLoggedMeals + '">' + esc(label) + "</button>";
  }

  function refreshMealList() {
    const plan = currentPlan();
    const list = root.querySelector("#meal-list");
    if (!list) return dashboard();
    list.innerHTML = mealListMarkup(plan);
    const toggle = root.querySelector("#logged-toggle");
    if (toggle) toggle.innerHTML = loggedToggleMarkup(plan);
    root.querySelector(".loading-chip")?.remove();
    bindTodayHandlers(plan);
    watchTargetPanel();
    updateTargetPanel(plan);
    translate();
    fillShopOffers();
    loadMealImages(plan);
  }

  function refreshMealCard(id) {
    const plan = currentPlan();
    const card = root.querySelector('[data-meal-card="' + id + '"]');
    if (!card) return dashboard();
    // The moment the last meal gets an answer the day earns its closing card,
    // which only a full render can add.
    const allDecided = plan.meals.every((meal) => state.meals[meal.id]?.status);
    if (allDecided && !root.querySelector(".day-done")) return dashboard();
    if (!showLoggedMeals && isConsumed(id)) return refreshMealList();
    const milkshakeMeal = plan.meals.find((meal) => meal.milkshakeEligible)?.id || "lunch";
    card.outerHTML = mealCard(plan.meals.find((meal) => meal.id === id), id === milkshakeMeal);
    bindTodayHandlers(plan);
    watchTargetPanel();
    updateTargetPanel(plan);
    translate();
    fillShopOffers();
  }

  function bindTodayHandlers(plan) {
    root.querySelector("[data-toggle-logged]")?.addEventListener("click", () => {
      showLoggedMeals = !showLoggedMeals;
      refreshMealList();
    });
    root.querySelectorAll("[data-quest-go]").forEach((button) => button.onclick = () => {
      const destination = button.dataset.questGo;
      if (destination === "check") return dailyCheck();
      if (destination === "coach") return coachPage();
      if (destination === "week") return weeklyPlan();
      if (destination === "basket") return basket();
      // "meals": take them to the first meal still waiting for an answer.
      const next = [...root.querySelectorAll("[data-meal-card]")].find((card) => card.dataset.status === "planned");
      if (!next) return;
      next.scrollIntoView({ behavior: "smooth", block: "center" });
      next.classList.add("is-flagged");
      setTimeout(() => next.classList.remove("is-flagged"), 1400);
    });
    root.querySelectorAll("[data-tomorrow]").forEach((button) => button.onclick = () => {
      state.tomorrowActivity = button.dataset.tomorrow;
      save();
      dashboard();
    });
    root.querySelector("[data-dismiss-freeze]")?.addEventListener("click", () => {
      game().freezeNotice = "";
      save();
      dashboard();
    });
    root.querySelectorAll("[data-swap-meal]").forEach((button) => button.onclick = () => askForSwap(button.dataset.swapMeal));
    root.querySelectorAll("[data-retry-image]").forEach((button) => button.onclick = () => {
      const meal = currentPlan().meals.find((item) => item.id === button.dataset.retryImage);
      if (!meal) return;
      failedMealImages.delete(mealImageKey(meal));
      refreshMealCard(meal.id);
      void loadMealImage(meal);
    });
    root.querySelectorAll("[data-meal]").forEach((button) => button.onclick = () => checkIn(button.dataset.meal));
    root.querySelectorAll("[data-confirm-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.confirmMeal, "eaten"); refreshMealCard(button.dataset.confirmMeal); });
    root.querySelectorAll("[data-skip-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.skipMeal, "skipped"); refreshMealCard(button.dataset.skipMeal); });
    root.querySelectorAll("[data-unlog-meal]").forEach((button) => button.onclick = () => {
      delete state.meals[button.dataset.unlogMeal];
      save();
      refreshMealCard(button.dataset.unlogMeal);
    });
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

  /** Turns a skip into a conversation instead of a dead end. */
  function askForSwap(id) {
    const meal = currentPlan().meals.find((item) => item.id === id);
    if (!meal) return;
    const question = T(
      "I skipped " + meal.slot.toLowerCase() + " (" + meal.title + "). Suggest two lighter or quicker swaps that keep me near my targets.",
      "M’he saltat " + meal.slot.toLowerCase() + " (" + meal.title + "). Suggereix-me dues alternatives més lleugeres o ràpides que em mantinguin a prop dels objectius."
    );
    coachPage();
    askLiveCoach(question, "page");
  }

  function coachPage() {
    mount("coach", viewShell(
      T("Talk to your Coach", "Parla amb el teu Coach"),
      T("Ask about a meal, a healthy swap or today’s training.", "Pregunta per un àpat, un canvi saludable o l’entrenament d’avui."),
      // A conversation you arrive at from a meal needs a door back to it.
      '<div class="coach-head-actions"><button class="link-button" type="button" id="coach-back">' + esc(T("Back to today", "Torna a avui")) + "</button></div>"
      + liveCoachMarkup("page"),
      "view--coach"
    ));
    root.querySelector("#coach-back").onclick = dashboard;
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
    { id: "log-all", xp: 15, go: "meals", en: "Log all three meals", ca: "Registra els tres àpats" },
    { id: "protein", xp: 20, go: "meals", en: "Hit your protein target", ca: "Assoleix el teu objectiu de proteïna" },
    { id: "check", xp: 15, go: "check", en: "Complete your daily check", ca: "Completa la revisió del dia" },
    { id: "ask", xp: 10, go: "coach", en: "Ask your Coach a question", ca: "Fes una pregunta al teu Coach" },
    { id: "week", xp: 10, go: "week", en: "Review your seven-day plan", ca: "Revisa el pla de set dies" },
    { id: "basket", xp: 10, go: "basket", en: "Open your shopping basket", ca: "Obre la teva cistella" }
  ];

  // ── Icons ───────────────────────────────────────────────────────────────
  // Emoji were doing the work of an icon set: 🍽️ 🔥 ⭐ 🏆 💪 🗓️ 📷 🫒. They render
  // differently on every platform, they sit at a different optical weight to
  // everything around them, they cannot take the brand colour, and — more than
  // any single other thing on the page — they read as unfinished. One drawn set,
  // one stroke weight, currentColor throughout.

  const ICON_PATHS = {
    plate: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.4"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/>',
    trophy: '<path d="M6.5 4h11v5.5a5.5 5.5 0 0 1-11 0z"/><path d="M6.5 5.5H5a2.2 2.2 0 0 0 0 4.4h.8M17.5 5.5H19a2.2 2.2 0 0 1 0 4.4h-.8"/><path d="M12 15v4.2M8.6 20h6.8"/>',
    dumbbell: '<path d="M6.4 6.6v10.8M3.4 8.8v6.4M17.6 6.6v10.8M20.6 8.8v6.4M6.4 12h11.2"/>',
    calendar: '<rect x="3.2" y="5" width="17.6" height="15.8" rx="2.2"/><path d="M3.2 9.6h17.6M8.2 2.8v4M15.8 2.8v4"/>',
    camera: '<path d="M4.4 6.9h3.4l1.3-2.4h5.8l1.3 2.4h3.4a1.6 1.6 0 0 1 1.6 1.6v10a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6v-10a1.6 1.6 0 0 1 1.6-1.6z"/><circle cx="12" cy="13.4" r="3.6"/>',
    leaf: '<path d="M11.4 20.2A7 7 0 0 1 10.2 6.3C15.7 5.2 17.2 4.6 19.2 2.2c1 2 2 4.2 2 8 0 5.5-4.8 10-9.8 10z"/><path d="M2.8 21.2c0-3 1.9-5.4 5.1-6C10.3 14.7 12.4 13.2 13.4 12"/>',
    shield: '<path d="M12 2.8l7.4 3v5.9c0 4.5-3 8.6-7.4 9.9-4.4-1.3-7.4-5.4-7.4-9.9V5.8z"/>',
    sparkle: '<path d="M12 3.4l1.7 4.5 4.5 1.7-4.5 1.7L12 15.8l-1.7-4.5-4.5-1.7 4.5-1.7z"/><path d="M18.6 15.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
    sync: '<path d="M20.4 12a8.4 8.4 0 0 1-14.3 6M3.6 12a8.4 8.4 0 0 1 14.3-6"/><path d="M17.6 2.9v4.2h-4.2M6.4 21.1v-4.2h4.2"/>',
  };

  /** One inline SVG, sized by its container's font-size, coloured by currentColor. */
  const icon = (name, extraClass = "") => {
    const path = ICON_PATHS[name];
    if (!path) return "";
    return '<svg class="icon' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + "</svg>";
  };

  const BADGES = [
    { id: "first-plate", icon: "plate", en: "First plate", ca: "Primer plat", hint: { en: "Log your first meal", ca: "Registra el teu primer àpat" } },
    { id: "streak-3", icon: "flame", en: "Three in a row", ca: "Tres seguits", hint: { en: "A 3-day streak", ca: "Ratxa de 3 dies" } },
    { id: "streak-7", icon: "star", en: "Full week", ca: "Setmana sencera", hint: { en: "A 7-day streak", ca: "Ratxa de 7 dies" } },
    { id: "streak-30", icon: "trophy", en: "Thirty days", ca: "Trenta dies", hint: { en: "A 30-day streak", ca: "Ratxa de 30 dies" } },
    { id: "protein-5", icon: "dumbbell", en: "Protein five", ca: "Cinc de proteïna", hint: { en: "Hit protein on 5 days", ca: "Assoleix la proteïna 5 dies" } },
    { id: "week-planner", icon: "calendar", en: "Week planner", ca: "Planificador", hint: { en: "Build a weekly basket", ca: "Crea una cistella setmanal" } },
    { id: "scanner", icon: "camera", en: "Eating out", ca: "Menjar fora", hint: { en: "Log a restaurant meal", ca: "Registra un àpat de restaurant" } },
    { id: "level-5", icon: "leaf", en: "Mediterranean pro", ca: "Pro mediterrani", hint: { en: "Reach level 5", ca: "Arriba al nivell 5" } }
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
      g.freezeNotice = today;
      return;
    }
    if (g.lastGoalDay < yesterday) g.streak = 0;
  }

  function awardBadge(id) {
    const g = game();
    if (g.badges.includes(id)) return false;
    g.badges.push(id);
    const badge = BADGES.find((item) => item.id === id);
    if (badge) celebrate(icon(badge.icon), T("Badge unlocked", "Insígnia desbloquejada"), language === "ca" ? badge.ca : badge.en);
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
        g.bestStreak = Math.max(g.bestStreak || 0, g.streak);
        // Seven days in a row earns a freeze back, up to two in hand.
        if (g.streak % 7 === 0 && (g.freezes || 0) < 2) {
          g.freezes = (g.freezes || 0) + 1;
          celebrate(icon("shield"), T("Streak freeze earned", "Has guanyat una congelació"), T("You now have " + g.freezes, "Ara en tens " + g.freezes));
        }
      }
      celebrate(icon("flame"), T("Daily goal complete", "Objectiu diari assolit"), T("Streak: ", "Ratxa: ") + g.streak + " " + (g.streak === 1 ? T("day", "dia") : T("days", "dies")));
    }
    const afterLevel = levelFor(g.xp).number;
    if (afterLevel > beforeLevel) celebrate(icon("sparkle"), T("Level up", "Nivell superat"), levelFor(g.xp).name);
    refreshBadges();
    save();
    schedulePushProgress();
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
    const day = todayGame();
    day.logged = logged.length;
    if (logged.length) awardBadge("first-plate");
    if (logged.length >= plan.meals.length) completeQuest("log-all");
    checkProteinQuest();
    // Every meal answered closes the day. Say so, once.
    const decided = plan.meals.every((meal) => state.meals[meal.id]?.status);
    if (decided && !day.closeShown) {
      day.closeShown = true;
      const summary = logged.length === plan.meals.length
        ? T("All " + plan.meals.length + " meals logged · " + day.xp + " XP", "Els " + plan.meals.length + " àpats registrats · " + day.xp + " XP")
        : T(logged.length + " of " + plan.meals.length + " meals eaten · " + day.xp + " XP", logged.length + " de " + plan.meals.length + " àpats menjats · " + day.xp + " XP");
      // A beat behind any goal or level popup, so they do not land on top of each other.
      setTimeout(() => celebrate(icon("sparkle"), T("Day complete", "Dia complet"), summary), 260);
    }
    save();
  }

  function streakChipsMarkup() {
    const g = game();
    const day = todayGame();
    const percent = Math.min(100, Math.round((day.xp / DAILY_GOAL_XP) * 100));
    return '<button class="streak-chips" type="button" data-nav="progress" aria-label="' + esc(T("Your progress", "El teu progrés")) + '">'
      + '<span class="streak-chip">' + icon("flame") + (g.streak || 0) + "</span>"
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
      return '<div class="streak-day' + (done ? " is-done" : "") + (offset === 0 ? " is-today" : "") + '"><span>' + esc(initials) + '</span><i>' + (done ? icon("flame") : "") + "</i></div>";
    }).join("");
    const quests = todayQuests().map((quest) => {
      const done = Boolean(day.quests[quest.id]);
      return '<li class="quest' + (done ? " is-done" : "") + '"><span class="quest-check" aria-hidden="true">' + (done ? "✓" : "") + '</span><span class="quest-text">' + esc(language === "ca" ? quest.ca : quest.en) + '</span><span class="quest-xp">+' + quest.xp + " XP</span></li>";
    }).join("");
    const badges = BADGES.map((badge) => {
      const earned = g.badges.includes(badge.id);
      return '<li class="badge' + (earned ? " is-earned" : "") + '"><span class="badge-icon">' + icon(badge.icon) + '</span><strong>' + esc(language === "ca" ? badge.ca : badge.en) + "</strong><span>" + esc(language === "ca" ? badge.hint.ca : badge.hint.en) + "</span></li>";
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
    const day = todayGame();
    if (!day.paid) day.paid = {};
    if (eligible && day.paid[id] !== "logged") {
      // Correcting a skip to "I ate it" tops up the difference; it never pays twice.
      const topUp = day.paid[id] === "skipped" ? 7 : 10;
      day.paid[id] = "logged";
      awardXp(topUp, T("Meal logged", "Àpat registrat"));
      if (status === "restaurant") awardBadge("scanner");
    } else if (status === "skipped" && !day.paid[id]) {
      // Recording what actually happened is the habit worth rewarding, even
      // when the honest answer is "I did not eat it".
      day.paid[id] = "skipped";
      awardXp(3, T("Logged honestly", "Registrat amb sinceritat"));
    }
    checkMealQuests();
    track("meal_logged", { status, meal: id });
    if (eligible) void pushMeal(currentPlan().meals.find((meal) => meal.id === id), status);
  }

  function dailyCheck() {
    const plan = currentPlan();
    const completed = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    // A skipped meal is a decision, not an omission: the day can still be closed.
    const pending = plan.meals.filter((meal) => !state.meals[meal.id]?.status);
    const skipped = plan.meals.filter((meal) => state.meals[meal.id]?.status === "skipped");
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
        : '<div class="card"><p>' + esc(skipped.length
            ? T("Every meal has an answer, including the " + skipped.length + " you skipped. That still counts as a day logged.", "Tots els àpats tenen resposta, inclosos els " + skipped.length + " que t’has saltat. Compta igualment com a dia registrat.")
            : T("Your daily check is complete. Your meals and plan are saved on this device for today.", "La revisió del dia està completa. Els àpats i el pla es desen en aquest dispositiu per avui.")) + "</p></div>")
      + '<div class="actions on-shell">'
      + (pending.length ? "" : completedToday
        ? '<span class="chip chip--logged">' + esc(T("Daily check completed", "Revisió completada")) + "</span>"
        : '<button class="button" type="button" id="complete-check">' + esc(T("Complete today’s check", "Completa la revisió d’avui")) + " (+" + (QUEST_POOL.find((quest) => quest.id === "check")?.xp || 15) + " XP)</button>")
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
    return '<p class="milkshake" data-shop-ml="' + millilitres + '" data-shop-surface="meal_card"><strong>Batut Quota Vita</strong><span>' + text + '</span></p>';
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
      : '<div class="meal-image meal-image-placeholder" data-meal-image-placeholder="' + esc(meal.id) + '" role="status">' + (failedMealImages.has(mealImageKey(meal))
        ? "<span>" + esc(T("Meal image unavailable.", "Imatge no disponible.")) + '</span><button class="link-button" type="button" data-retry-image="' + esc(meal.id) + '">' + esc(T("Try again", "Torna-ho a provar")) + "</button>"
        : "<span>" + esc(T("Creating your meal image…", "Creant la imatge de l’àpat…")) + "</span>") + "</div>";
    const skipOffer = status === "skipped"
      ? '<p class="skip-offer">' + esc(T("Not feeling this one?", "No et ve de gust?")) + '<button class="link-button" type="button" data-swap-meal="' + esc(meal.id) + '">' + esc(T("Ask for a swap", "Demana un canvi")) + "</button></p>"
      : "";
    const actions = status
      ? '<div class="meal-actions"><button class="button quiet" type="button" data-unlog-meal="' + esc(meal.id) + '">' + esc(T("Undo", "Desfés")) + '</button><button class="button quiet" type="button" data-meal="' + esc(meal.id) + '">' + esc(T("Change", "Canvia")) + "</button></div>"
      : '<div class="meal-actions"><button class="button" type="button" data-confirm-meal="' + esc(meal.id) + '">' + esc(T("I’ll eat this", "M’ho menjaré")) + '</button><button class="button quiet" type="button" data-restaurant-meal="' + esc(meal.id) + '">' + esc(T("Restaurant", "Restaurant")) + '</button><button class="button ghost" type="button" data-skip-meal="' + esc(meal.id) + '">' + esc(T("Skip", "Omet")) + "</button></div>";
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
      + skipOffer + actions + "</div></div></article>";
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
        placeholder.innerHTML = "<span>" + esc(T("Meal image unavailable.", "Imatge no disponible.")) + '</span><button class="link-button" type="button" data-retry-image="' + esc(meal.id) + '">' + esc(T("Try again", "Torna-ho a provar")) + "</button>";
        placeholder.querySelector("[data-retry-image]").onclick = () => {
          failedMealImages.delete(mealImageKey(meal));
          refreshMealCard(meal.id);
          void loadMealImage(meal);
        };
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

  /**
   * The five goals people actually arrive with. The week used to open on an
   * empty text field and a "Continue" button, which asks someone to compose a
   * sentence before they have seen anything — the highest-friction opening a
   * screen can have, and the one most likely to be abandoned. The field stays,
   * for the goal that is not on the list.
   */
  const WEEKLY_GOAL_PRESETS = [
    { en: "Eat with more energy", ca: "Menjar amb més energia" },
    { en: "Lose fat steadily", ca: "Perdre greix de manera constant" },
    { en: "Build strength", ca: "Guanyar força" },
    { en: "Train for a 10 km run", ca: "Preparar una cursa de 10 km" },
    { en: "Eat well for less", ca: "Menjar bé gastant menys" },
  ];

  function weeklySetup() {
    const saved = state.weekly || {};
    const presets = WEEKLY_GOAL_PRESETS
      .map((preset) => {
        const label = language === "ca" ? preset.ca : preset.en;
        return '<button class="goal-chip' + (saved.goal === label ? " is-active" : "") + '" type="button" data-goal="' + esc(label) + '">' + esc(label) + "</button>";
      })
      .join("");

    mount("week", coachShell(
      T("Let’s plan your week", "Planifiquem la teva setmana"),
      T("First, tell your Coach what you want from this week.", "Primer, digues al teu Coach què vols d’aquesta setmana."),
      '<div class="bubble coach">' + esc(T("What are your goals for the week?", "Quins són els teus objectius per a la setmana?")) + '<span class="meta">' + esc(T("Pick one to start, or write your own.", "Tria’n un per començar, o escriu el teu.")) + "</span></div>"
      + '<div class="goal-chips">' + presets + "</div>"
      + '<form class="composer chat-input" id="weekly-goal-form"><input id="weekly-goal" enterkeyhint="next" placeholder="' + esc(T("Or write your own goal", "O escriu el teu objectiu")) + '" value="' + esc(saved.goal || "") + '" required><button class="button" type="submit">' + esc(T("Continue", "Continua")) + "</button></form>"
      + '<div class="actions"><button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + "</button></div>"
    ));

    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#weekly-goal-form").onsubmit = (event) => { event.preventDefault(); weeklyTraining(root.querySelector("#weekly-goal").value.trim()); };
    root.querySelectorAll("[data-goal]").forEach((button) => {
      // One tap is the whole answer: a chip goes straight on rather than filling
      // the box and waiting for a second press on Continue.
      button.onclick = () => {
        track("weekly_goal_preset", { preset: button.dataset.goal.slice(0, 40) });
        weeklyTraining(button.dataset.goal);
      };
    });
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
    const scale = target.calories / 2000;
    return mealPlan(target, activity).map((meal, index) => scaleMealPortions(localiseMeal({ ...meal, title: menus[index][1], portions: menus[index][2], catalanName: menus[index][3] }), scale));
  }

  /** Meals logged over the last seven days, from the progress history. */
  function weekAdherence() {
    const g = game();
    let logged = 0;
    let days = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const record = g.days?.[dayOffsetKey(offset)];
      if (!record) continue;
      days += 1;
      logged += Number(record.logged) || 0;
    }
    return { logged, days, possible: 21 };
  }

  function weeklyDayCard(entry, milkshakeOptions) {
    const detailKey = "weekly-" + entry.id;
    const collapsed = Boolean(state.compactPlanView) && !expandedPlanDetails.has(detailKey);
    const details = '<p><strong>' + entry.target.calories + " kcal</strong> · " + entry.target.proteinG + "g " + esc(T("protein", "proteïna")) + "</p>"
      + entry.meals.map((meal) => "<p><strong>" + esc(meal.slot) + ": " + esc(meal.title) + '</strong><br><span class="meta">' + (meal.catalanName ? "<strong>Catalan dish:</strong> " + esc(meal.catalanName) + "<br>" : "") + esc(meal.portions) + "</span></p>" + (milkshakeOptions.has(entry.id + ":" + meal.id) ? milkshakeOptionMarkup(meal) : "")).join("");
    // Monday is index 0; JS Sunday is 0, so shift.
    const todayIndex = (new Date().getDay() + 6) % 7;
    const isToday = entry.index === todayIndex;
    const useToday = isToday || entry.activity === state.activity
      ? ""
      : '<button class="link-button week-day-use" type="button" data-use-day="' + esc(entry.activity) + '">' + esc(T("Use this day today", "Fes servir aquest dia avui")) + "</button>";
    return '<article class="week-day' + (collapsed ? " is-collapsed" : "") + (isToday ? " is-today" : "") + '" data-detail-card="' + esc(detailKey) + '"><div class="weekly-card-visual">' + weeklyMealImageMarkup(entry) + "</div><h3>" + esc(entry.day) + " · " + esc(activityLabel(entry.activity)) + (isToday ? '<span class="chip chip--today">' + esc(T("Today", "Avui")) + "</span>" : "") + "</h3>" + useToday + detailToggleMarkup(detailKey, collapsed) + '<div class="week-day-details" id="' + esc(detailKey) + '-details">' + details + "</div></article>";
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
      weekLead + " " + (() => { const a = weekAdherence(); return a.days ? T(a.logged + " meals logged in the last 7 days.", a.logged + " àpats registrats en els darrers 7 dies.") : ""; })(),
      /* One action, plus a quiet way back into the setup. Downloading and
         emailing the week live in the menu; having them here as well pushed
         the plan itself off the bottom of a phone screen. */
      '<div class="week-actions"><button class="button" type="button" id="approve-week">' + esc(T("Create the weekly basket", "Crea la cistella setmanal")) + '</button><button class="link-button" type="button" id="edit-week">' + esc(T("Edit my week", "Edita la setmana")) + '</button></div><div class="week-grid">' + cards + "</div>"
    ));
    root.querySelector("#approve-week").onclick = weeklyBasket;
    root.querySelector("#edit-week").onclick = weeklySetup;
    root.querySelectorAll("[data-use-day]").forEach((button) => button.onclick = () => {
      failedMealImages.clear();
      failedDailyMealPlans.clear();
      state.activity = button.dataset.useDay;
      state.meals = {};
      state.mealImages = {};
      state.dailyMeals = null;
      state.menuNonce = (state.menuNonce || 0) + 1;
      save();
      dashboard();
    });
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

  function shopBlockMarkup(surface) {
    const millilitres = dailySwapMillilitres();
    if (!millilitres) return "";
    return '<section class="shop-block" data-shop-ml="' + millilitres + '" data-shop-surface="' + esc(surface) + '"><h2>' + esc(T("Cover the protein swap", "Cobreix el canvi de proteïna"))
      + "</h2><p>" + esc(T("Your plan swaps one protein for a Batut Quota Vita. This is the tub that covers it.", "El teu pla canvia una proteïna per un Batut Quota Vita. Aquest és el pot que ho cobreix."))
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

  /* The page gets these strings translated by translate() walking the DOM. The
     PDF and the email are not DOM, so they read the same dictionary directly
     rather than carrying a second Catalan wording of the same sentence. */
  /* Basket items grouped the way a shop is laid out, so the list is walked once
     rather than criss-crossed. The order of the keys is the order of the aisles. */
  const FOOD_GROUPS = [
    { key: "produce", en: "Fruit and vegetables", ca: "Fruita i verdura",
      names: ["bananas", "banana", "apples or pears", "apple", "berries", "potatoes or sweet potatoes", "potatoes", "mixed vegetables and salad", "vegetables and salad"] },
    { key: "protein", en: "Meat and fish", ca: "Carn i peix",
      names: ["chicken breast", "chicken", "turkey", "salmon", "cod", "tuna cans"] },
    { key: "dairy", en: "Dairy and eggs", ca: "Làctics i ous",
      names: ["Greek yogurt", "eggs"] },
    { key: "pulses", en: "Pulses and plant protein", ca: "Llegums i proteïna vegetal",
      names: ["tofu", "cooked lentils", "cooked chickpeas or beans", "cooked chickpeas"] },
    { key: "grains", en: "Grains and bread", ca: "Cereals i pa",
      names: ["oats", "dry rice or quinoa", "dry rice", "dry wholegrain pasta", "slices wholegrain bread", "wholegrain bread"] },
    { key: "cupboard", en: "Cupboard", ca: "Rebost",
      names: ["olive oil", "nuts, seeds or peanut butter", "nuts"] }
  ];

  const foodGroupOf = (name) => FOOD_GROUPS.find((group) => group.names.includes(name)) || FOOD_GROUPS[FOOD_GROUPS.length - 1];
  const foodGroupLabel = (group) => (language === "ca" ? group.ca : group.en);

  /** Basket rows in aisle order, each carrying its price when one is known. */
  function groupedBasketRows() {
    const priced = new Map((weeklyBasketEstimate?.items || []).map((item) => [item.name, item]));
    const rows = weeklyBasketItems().map(([name, amount]) => {
      const estimate = priced.get(name);
      return {
        group: foodGroupOf(name),
        amount: amount + (amount < 20 ? "" : " g"),
        name: localiseFood(name),
        price: estimate ? formatEur(estimate.price) : ""
      };
    });
    return FOOD_GROUPS
      .map((group) => ({ group: foodGroupLabel(group), items: rows.filter((row) => row.group === group) }))
      .filter((section) => section.items.length);
  }

  const basketEstimateCopy = () => ({
    title: localise("Estimated weekly basket cost"),
    source: localise("Average supermarket reference."),
    total: localise("Estimated total"),
    note: localise("Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.")
  });

  function basketEstimateSource(estimate) {
    return basketEstimateCopy().source;
  }

  function renderBasketEstimate(estimate) {
    const list = root.querySelector("#weekly-basket-list");
    if (!list || !Array.isArray(estimate.items) || !Number.isFinite(Number(estimate.total))) return;
    weeklyBasketEstimate = estimate;
    list.innerHTML = basketListMarkup(weeklyBasketSections(), formatEur(estimate.total));
    const note = root.querySelector("#weekly-cost-note");
    if (note) note.textContent = basketEstimateCopy().note;
    root.querySelector("#weekly-basket-pdf").disabled = false;
    root.querySelector("#weekly-basket-email").disabled = false;
    translate();
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
      const note = root.querySelector("#weekly-cost-note");
      // The basket is still usable without prices, so say only what is missing.
      if (note) note.textContent = T("Prices are unavailable right now. The list is still complete.", "Ara mateix els preus no estan disponibles. La llista continua sent completa.");
      root.querySelector("#weekly-basket-pdf").disabled = false;
      root.querySelector("#weekly-basket-email").disabled = false;
    }
  }

  /* One list, walked in aisle order, with each price on its own line and the
     total on top. It used to be two lists — the things to buy, then the same
     things again with prices — which meant scrolling between them to answer
     "what does this cost". */
  function basketListMarkup(sections, total) {
    const head = total
      ? '<div class="basket-total"><span class="label">' + esc(basketEstimateCopy().total) + '</span><b>' + esc(total) + "</b>"
        + '<span class="meta">' + esc(basketEstimateCopy().source) + "</span></div>"
      : "";
    const body = sections.map((section) => '<section class="basket-section"><h3>' + esc(section.title) + "</h3><ul>"
      + section.items.map((row) => '<li><span class="basket-item"><b>' + esc(row.amount) + "</b> " + esc(row.name) + "</span>"
        + (row.price ? '<span class="basket-price">' + esc(row.price) + "</span>" : "") + "</li>").join("")
      + "</ul></section>").join("");
    return head + '<div class="basket-list">' + body + "</div>";
  }

  function weeklyBasketSections() {
    return groupedBasketRows().map((section) => ({
      title: section.group,
      items: section.items.map((row) => ({ amount: row.amount, name: row.name, price: row.price }))
    }));
  }

  function weeklyBasket() {
    const totals = weeklyBasketItems();
    weeklyBasketEstimate = undefined;
    mount("basket", viewShell(
      T("Your seven-day basket", "La teva cistella de set dies"),
      T("A varied basket matching the seven daily menus and your training pattern.", "Una cistella variada que encaixa amb els set menús diaris i el teu patró d’entrenament."),
      basketSwitcher("weekly")
        + '<div class="card"><section id="weekly-basket-list">' + basketListMarkup(weeklyBasketSections(), "") + "</section>"
        + '<p class="meta" id="weekly-cost-note" aria-live="polite">' + esc(T("Checking the latest price estimate…", "Comprovant l’estimació de preu més recent…")) + "</p>"
        + shopBlockMarkup("weekly_basket")
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

  /* The week, unflattened. The email lays it out from this structure, and
     weeklyText() is written on top of it so the two can never drift apart.
     The basket keeps both shapes: `groups` in aisle order for the layout the
     screen shows, and the flat `items` the mailer falls back to. */
  function weeklySections(kind) {
    if (kind === "basket") {
      const groups = weeklyBasketSections();
      const items = groups.flatMap((group) => group.items.map((row) =>
        ({ amount: row.amount, name: row.name, price: row.price, category: group.title })));
      const copy = basketEstimateCopy();
      /* Prices arrive later, from /api/basket-prices. Without them the basket
         still travels — the email just leaves the total out. */
      const estimate = weeklyBasketEstimate
        ? { total: formatEur(weeklyBasketEstimate.total), totalLabel: copy.total, source: copy.source, note: copy.note }
        : null;
      return { items, groups, estimate };
    }
    return weeklyPlanEntries().map((entry) => ({
      day: entry.day,
      activity: activityLabel(entry.activity),
      meals: entry.meals.map((meal) =>
        ({ slot: meal.slot, title: meal.title, portions: meal.portions, catalanName: meal.catalanName || "" }))
    }));
  }

  function weeklyText(kind) {
    const sections = weeklySections(kind);
    if (kind === "basket") {
      const copy = basketEstimateCopy();
      const head = sections.estimate ? [copy.total + ": " + sections.estimate.total, sections.estimate.source, ""] : [];
      const body = (sections.groups || []).flatMap((section) => [
        section.title.toUpperCase(),
        ...section.items.map((item) => "- " + item.amount + " " + item.name + (item.price ? "  " + item.price : "")),
        ""
      ]);
      const tail = sections.estimate ? [sections.estimate.note] : [];
      return head.concat(body, tail).join("\n").trim();
    }
    /* The Catalan dish goes on its own indented line: inside the meal line it
       read like a debug annotation, and this pastes cleanly into Notes. */
    return sections.map((day) => [day.day + " - " + day.activity].concat(day.meals.map((meal) =>
      meal.slot + ": " + meal.title + " (" + meal.portions + ")" +
      (meal.catalanName ? "\n  " + localise("Catalan dish:") + " " + meal.catalanName : "")
    )).join("\n")).join("\n\n");
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
          body: JSON.stringify({ email, kind, checklist: weeklyText(kind), sections: weeklySections(kind), language, marketingConsent: true })
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
        if (!response.ok) {
          /* 422 means the photo itself is the problem, and saying so helps.
             Anything else is our side — a provider being down or a key being
             wrong — and the operator's wording for that ("needs a valid
             LogMeal APIUser token in production") is not something to put in
             front of someone sitting in a restaurant. */
          const aboutThePhoto = response.status === 422;
          const failure = new Error(aboutThePhoto
            ? (data.error || T("That photo could not be read.", "No s’ha pogut llegir la foto."))
            : T("Photo scanning is unavailable right now — but you can still log this as a restaurant meal.", "Ara mateix l’escaneig de fotos no funciona, però pots registrar l’àpat igualment."));
          failure.scanningDown = !aboutThePhoto;
          throw failure;
        }
        recordMeal(id, "restaurant", { analysis: "scanned" });
        closeAll();
        refreshMealCard(id);
      } catch (error) {
        feedback.innerHTML = note(error.message || T("Photo analysis is unavailable.", "L’anàlisi de fotos no està disponible."), true);
        // When scanning is the thing that failed, the way forward becomes the
        // obvious button rather than the quiet one beside it.
        if (error.scanningDown) {
          overlay.querySelector("#inline-manual")?.classList.remove("quiet");
          overlay.querySelector("#inline-scan")?.classList.add("quiet");
        }
      }
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
        + '</ul>' + shopBlockMarkup("daily_basket")
        + '<div class="actions"><button class="button" type="button" id="basket-pdf">' + esc(T("Download basket PDF", "Baixa el PDF de la cistella")) + '</button><button class="button quiet" type="button" id="back">' + esc(T("Back to today", "Torna a avui")) + "</button></div></div>"
        // Erasing everything sat in the same row as "Download PDF" and "Back to
        // today", in the same quiet grey, one slip of the thumb away from either.
        // It keeps its place on the page and loses its disguise.
        + '<div class="danger-zone"><button class="button danger" type="button" id="clear">' + esc(T("Delete this device plan", "Esborra el pla d’aquest dispositiu")) + "</button></div>"
    ));
    track("basket_created", { scope: "daily", items: items.length });
    root.querySelector("#basket-pdf").onclick = () => printPdf("basket");
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = deleteEverything;
    bindBasketSwitcher();
    completeQuest("basket");
  }

  // ── Installing ──────────────────────────────────────────────────────────
  // The Coach is used standing in a supermarket aisle and again at a restaurant
  // table. Both are moments you reach for an icon, not a bookmark — and the
  // basement of a supermarket is also where the signal goes, which is the other
  // half of what the service worker is for.

  const installDismissKey = "quota-vita-coach-install-dismissed";
  let installPrompt = null;

  function registerWorker() {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
    // Registration is deferred to idle: it competes with the first plan render
    // for the same connection, and the plan is what the person came for.
    const start = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // An unregistered worker costs offline support and nothing else.
    });
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 2500);
  }

  /**
   * Not on the first visit. Asking someone to install a thing they have used for
   * ninety seconds is how install prompts got their reputation; this waits until
   * there is a plan and some progress worth keeping.
   */
  function installOfferIsWelcome() {
    if (!installPrompt || readLocal(installDismissKey) === "yes") return false;
    if (matchMedia("(display-mode: standalone)").matches) return false;
    return Boolean(state.profile) && (game().xp > 0 || (game().streak || 0) > 0);
  }

  function renderInstallBar() {
    document.querySelector("#install-bar")?.remove();
    if (!installOfferIsWelcome()) return;

    const bar = document.createElement("div");
    bar.id = "install-bar";
    bar.className = "install-bar";
    bar.innerHTML = '<div class="install-bar-text"><strong>' + esc(T("Add the Coach to your home screen", "Afegeix el Coach a la pantalla d’inici"))
      + "</strong><span>" + esc(T("Opens straight to today’s plan, and works in the supermarket without signal.",
                                  "S’obre directament al pla d’avui i funciona al supermercat sense cobertura.")) + "</span></div>"
      + '<div class="install-bar-actions"><button class="button button--sm" type="button" data-install="yes">' + esc(T("Add", "Afegeix"))
      + '</button><button class="icon-button icon-button--sm" type="button" data-install="no" aria-label="' + esc(T("Not now", "Ara no")) + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';

    bar.querySelector('[data-install="no"]').onclick = () => {
      writeLocal(installDismissKey, "yes");
      bar.remove();
      track("install_dismissed");
    };
    bar.querySelector('[data-install="yes"]').onclick = async () => {
      const prompt = installPrompt;
      installPrompt = null;
      bar.remove();
      if (!prompt) return;
      track("install_prompted");
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") track("install_accepted");
      else writeLocal(installDismissKey, "yes");
    };

    document.querySelector(".app")?.appendChild(bar);
  }

  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstallBar();
  });

  addEventListener("appinstalled", () => {
    installPrompt = null;
    document.querySelector("#install-bar")?.remove();
    track("install_completed");
  });

  /* The language switch reloads the page. If it was made by voice, the panel
     that made it comes back, in the language it just asked for. */
  try {
    if (sessionStorage.getItem(voiceReopenKey) === "yes") {
      sessionStorage.removeItem(voiceReopenKey);
      setTimeout(() => void openVoice(), 400);
    }
  } catch {
    // Private mode has no session storage, and no panel to restore.
  }

  if (state.profile) { syncStreak(); save(); }
  if (!state.profile) welcome();
  else if (state.needsTraining) training();
  else renderFromHash();
  registerWorker();
  if (new URLSearchParams(location.search).get("source") === "installed") track("opened_from_home_screen");
  void checkAccountsEnabled();
  void syncAccount();
})();
