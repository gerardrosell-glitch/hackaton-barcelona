(() => {
  const root = document.querySelector("#coach");
  const storageKey = "quota-vita-coach-v2";
  const activityLabels = { rest: "Rest day", run: "Run", strength: "Strength", pilates: "Pilates", walk: "Walk" };
  let state;
  let cameraStream;
  let capturedMealImage;
  let language = localStorage.getItem("quota-vita-coach-language") || "en";
  let mealDeckIndex = 0;
  let mobileCoachOpen = false;
  let mobilePlanOpen = false;
  let weeklyBasketEstimate;
  const pendingMealImages = new Set();
  const failedMealImages = new Set();
  const pendingWeeklyMealImages = new Set();
  const failedWeeklyMealImages = new Set();
  const pendingDailyMealPlans = new Set();
  const failedDailyMealPlans = new Set();
  const expandedPlanDetails = new Set();
  const chatStyle = document.createElement("style");
  chatStyle.textContent = ".coach-workspace{position:relative;isolation:isolate;min-height:100dvh;overflow:hidden;border-radius:0;padding:clamp(28px,5vw,64px) clamp(18px,8vw,128px);background:#1d6254;color:#fff}.coach-workspace::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(9,46,39,.9),rgba(20,91,77,.72) 48%,rgba(255,106,70,.58))}.coach-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}.coach-workspace .stepper{margin:0 auto 20px;max-width:760px}.coach-workspace .eyebrow,.coach-workspace .lead{color:#fff}.coach-workspace h2{max-width:760px;margin:0 auto 5px;color:#fff;font-size:clamp(2rem,4vw,3.5rem);line-height:1.02;text-align:left}.coach-workspace>.eyebrow,.coach-workspace>.lead{max-width:760px;margin-left:auto;margin-right:auto;text-align:left}.coach-workspace>.lead{margin-top:0;margin-bottom:22px;font-size:1rem}.chat{max-width:760px;min-height:440px;margin:0 auto;padding:18px;border:1px solid rgba(255,255,255,.35);border-radius:24px;background:rgba(8,43,36,.44);display:grid;align-content:start;gap:13px;backdrop-filter:blur(10px)}.bubble{max-width:78%;padding:14px 17px;border-radius:19px;line-height:1.45;box-shadow:0 10px 24px rgba(4,37,31,.14)}.bubble.coach{justify-self:start;background:rgba(255,255,255,.97);color:#173e36;border-bottom-left-radius:5px}.bubble.user{justify-self:end;background:#123e35;color:#fff;border:1px solid rgba(255,255,255,.35);border-bottom-right-radius:5px}.bubble .meta{display:block;margin-top:6px;color:#55736d;font-size:.9em}.coach-intro{font-size:1.04rem}.composer{width:100%;box-sizing:border-box;margin:8px 0 0;padding:11px;border:1px solid rgba(255,255,255,.8);border-radius:22px;background:rgba(255,255,255,.98);box-shadow:0 18px 42px rgba(4,37,31,.2)}.composer-label{display:block;padding:2px 7px 9px;color:#41675f;font-weight:700;font-size:.88rem}.quick-replies{display:flex;flex-wrap:wrap;gap:8px}.quick-replies button{border:1px solid #8fb9ab;border-radius:999px;background:#f6fbf8;color:#173e36;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}.quick-replies button:hover{background:#dceee6}.chat-input{display:flex;gap:8px}.chat-input input{min-width:0;flex:1;border:0;background:transparent;padding:12px 10px;color:#173e36;font:inherit;font-size:1rem;outline:none}.chat-input .button{border-radius:15px}.chat-cancel{display:block;margin:16px auto 0;background:transparent!important;border-color:rgba(255,255,255,.8)!important;color:#fff!important}.coach-workspace .privacy{margin:16px auto 0;color:#fff;text-align:center}.coach-workspace .actions{justify-content:center}@media(max-width:600px){.coach-workspace{min-height:100dvh;padding:26px 16px}.coach-workspace h2{font-size:2.25rem}.chat{min-height:0;padding:13px}.bubble{max-width:92%}.chat-input .button{padding:11px 14px}}";
  document.head.append(chatStyle);
  const conversationOverflowStyle = document.createElement("style");
  conversationOverflowStyle.textContent = ".shell{max-width:none!important;margin:0!important;padding:0!important}.masthead{display:none!important}main{padding:0!important}.coach-workspace{width:100vw;margin-left:calc(50% - 50vw);border-radius:0;overflow:visible!important;background:url('/assets/coach-palette.png') center/cover!important;color:#163b32}.coach-workspace::after{background:rgba(255,244,222,.38)!important}.coach-video{display:none}.coach-workspace .eyebrow,.coach-workspace .lead,.coach-workspace h2,.coach-workspace .privacy{color:#163b32}.chat{background:rgba(255,247,230,.76);border-color:rgba(107,103,53,.32);backdrop-filter:blur(14px)}.bubble.coach{background:rgba(255,252,243,.95);color:#163b32}.bubble.user{background:#456451;color:#fff;border-color:#456451}.composer{background:rgba(255,252,243,.96);border-color:#d99b60}.quick-replies button{background:#fff6df;border-color:#b5a96b;color:#274a3e}.quick-replies button:hover{background:#f4d39b}.quick-replies button:focus-visible,.restart-control:focus-visible{outline:3px solid #e67553;outline-offset:3px}.shortcut-key{display:inline-grid;place-items:center;min-width:1.55em;height:1.55em;margin-right:7px;border:1px solid currentColor;border-radius:50%;font-size:.76em;line-height:1;font-family:ui-monospace,SFMono-Regular,monospace}.keyboard-hint{margin:0 7px 9px;color:#55736d;font-size:.82rem}.restart-control{margin-left:auto;border:1px solid #7e8254;background:rgba(255,252,243,.9);color:#274a3e;padding:8px 11px;font:inherit;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.chat-input input{color:#274a3e}.chat-input .button,.coach-workspace .button:not(.quiet){background:#3f6653;border-color:#3f6653}.chat-cancel{color:#274a3e!important;border-color:#7e8254!important;background:rgba(255,247,230,.55)!important}.chat-page{max-width:760px;margin:0 auto}.chat-page .bubble{max-width:100%;box-sizing:border-box}.chat-page .day{display:grid;gap:16px}.chat-page .meal-list{display:grid;gap:14px}.meal-image{width:100%;height:190px;object-fit:cover;border-radius:12px;margin:0 0 12px}.weekly-grid{display:grid;gap:12px}.week-day{padding:14px;border:1px solid #d9b47a;border-radius:12px;background:rgba(255,252,243,.88)}.week-day h3{margin:0 0 6px}.chat-page .privacy{color:#55736d;text-align:left}";
  document.head.append(conversationOverflowStyle);
  const paletteContrastStyle = document.createElement("style");
  paletteContrastStyle.textContent = ".coach-workspace{color:#392d23}.coach-workspace .eyebrow,.coach-workspace .lead,.coach-workspace h2,.coach-workspace .privacy{color:#392d23}.coach-workspace .eyebrow{color:#9e4e35}.coach-workspace .lead{color:#584538}.chat{background:rgba(255,249,237,.84);border-color:rgba(112,78,48,.32)}.bubble.coach{background:rgba(255,253,247,.97);color:#392d23}.bubble.user{background:#614633;border-color:#614633;color:#fffdf8}.bubble .meta,.chat-page .privacy,.keyboard-hint{color:#6d5948}.composer{background:rgba(255,253,247,.98);border-color:#c88152}.quick-replies button{background:#fff7e8;border-color:#bf885d;color:#392d23}.quick-replies button:hover{background:#f1d0aa}.quick-replies button:focus-visible,.restart-control:focus-visible{outline-color:#a14e34}.chat-input input{color:#392d23}.chat-input .button,.coach-workspace .button:not(.quiet){background:#614633;border-color:#614633;color:#fffdf8}.chat-cancel{color:#392d23!important;border-color:#9a6544!important;background:rgba(255,249,237,.7)!important}.restart-control{background:#fff9ed;border-color:#a66b48;color:#392d23}.shortcut-key{border-color:#a66b48;color:#7a4730}.week-day{background:rgba(255,253,247,.92);border-color:#d1a171}.meal-header,.meal p,.ledger,.method{color:#392d23}.meta,.ledger span{color:#6d5948}.meal-image-placeholder{display:grid;place-items:center;align-content:center;gap:12px;background:linear-gradient(135deg,#fff7e8,#efd6ab);color:#584538;font-weight:800;text-align:center}.meal-image-placeholder .button{margin:0}";
  document.head.append(paletteContrastStyle);
  const mealDeckStyle = document.createElement("style");
  mealDeckStyle.textContent = ".daily-plan-workspace{padding:0!important}.daily-meal-deck{width:100%;min-height:100dvh;padding:clamp(8px,.8vw,16px) clamp(20px,5.25vw,160px) clamp(48px,6vw,112px);box-sizing:border-box;background:transparent;color:#392d23}.daily-meal-track{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(16px,1.25vw,32px);width:100%;max-width:none;margin:0;align-items:stretch}.daily-meal-overview{width:100%;max-width:none;margin:0 0 clamp(12px,.9vw,18px)}.daily-meal-card{min-width:0;container-type:inline-size}.daily-meal-content{height:100%}.daily-meal-card .meal{box-sizing:border-box;height:100%;min-height:0;margin:0;padding:clamp(18px,1.3vw,30px);display:flex;flex-direction:column;border-left-width:7px;background:#fffdf7;box-shadow:0 16px 38px rgba(58,42,27,.18)}.daily-meal-card .meal .actions{justify-content:flex-start;margin-top:auto}.daily-meal-card .meal .button{min-width:0}.daily-meal-card .meal-image{height:clamp(170px,min(52cqw,34dvh),340px);object-fit:cover}.daily-meal-card h3{font-size:clamp(1.5rem,3cqw,2.2rem);line-height:1.04}.meal-deck-controls{display:none}.meal-deck-controls .coach-controls{margin:0}.meal-deck-position,.meal-deck-help{display:none}.meal-status{display:inline-block;margin:0 0 12px;color:#9e4e35;font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:.76rem}.daily-plan-follow-up{width:min(980px,100%);margin:0 auto;padding:26px 18px 64px}.daily-plan-follow-up .bubble{max-width:100%}@media(min-width:720px) and (max-width:1050px){.daily-meal-deck{padding-inline:clamp(20px,4vw,48px)}.daily-meal-overview{grid-template-columns:minmax(220px,.36fr) minmax(0,1fr)}}@media(max-width:719px){.daily-meal-deck{position:relative;width:100vw;height:100dvh;overflow:hidden;padding:0;background:#392d23;color:#392d23;touch-action:pan-y}.daily-meal-track{display:flex;width:100%;max-width:none;height:100%;margin:0;gap:0;will-change:transform;transition:transform .28s cubic-bezier(.22,.8,.25,1)}.daily-meal-overview{display:none!important}.daily-meal-card{box-sizing:border-box;flex:0 0 100%;width:100%;min-height:100%;padding:76px 14px 54px;display:flex;align-items:center;overflow-y:auto}.daily-meal-content{width:100%}.daily-meal-card .meal{min-height:calc(100dvh - 170px);padding:20px;box-shadow:0 18px 45px rgba(16,10,7,.33)}.daily-meal-card .meal-image{height:min(25dvh,220px)}.daily-meal-card h3{font-size:1.5rem}.meal-deck-controls{position:absolute;inset:12px 12px auto;z-index:2;display:flex;justify-content:space-between;align-items:center;margin:0;color:#fffdf8;font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}.meal-deck-controls>*{pointer-events:auto}.meal-deck-controls .coach-controls{margin:0;color:inherit}.meal-deck-position{display:block;margin:0;text-shadow:0 1px 8px rgba(0,0,0,.35)}.meal-deck-help{display:block;position:absolute;z-index:2;inset:auto 18px 14px;margin:0;color:#fffdf8;text-align:center;font-size:.76rem;text-shadow:0 1px 8px rgba(0,0,0,.35);pointer-events:none}}@media(prefers-reduced-motion:reduce){.daily-meal-track{transition:none}}";
  document.head.append(mealDeckStyle);
  const planActionStyle = document.createElement("style");
  planActionStyle.textContent = ".coach-controls--daily{width:100%;max-width:none;margin:0;flex-wrap:wrap;justify-content:flex-start}.coach-controls--daily .restart-control{margin-left:auto}.plan-top-actions{display:flex;align-items:center;gap:5px;min-width:0}.plan-top-scope{color:#9e4e35;font-size:.67rem;font-weight:900;letter-spacing:.1em;line-height:1;text-transform:uppercase}.plan-top-action{display:inline-flex;align-items:center;justify-content:center;min-height:32px;border:1px solid #a66b48;background:#fff9ed;color:#275e50;padding:6px 9px;font:inherit;font-size:.68rem;font-weight:800;letter-spacing:.01em;line-height:1;text-align:center;white-space:nowrap;cursor:pointer}.plan-top-action:hover{background:#f1d0aa}.plan-top-action:focus-visible{outline:3px solid #a14e34;outline-offset:2px}.plan-top-action.primary{border-color:#614633;background:#614633;color:#fffdf8}.daily-plan-mobile-actions{display:none!important}.daily-meal-card .meal .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;box-sizing:border-box;align-items:stretch;margin-top:auto;padding-top:12px;flex-shrink:0}.daily-meal-card .meal .actions .button{display:inline-flex;align-items:center;justify-content:center;width:100%;min-width:0;box-sizing:border-box;min-height:48px;padding:9px 8px;line-height:1.15;text-align:center}.daily-meal-card .meal .actions .button:only-child{grid-column:1/-1}@media(max-width:719px){.daily-meal-deck{touch-action:pan-y}.daily-meal-card{padding-top:124px}.daily-meal-card .meal{min-width:0}.meal-deck-controls{align-items:flex-start}.meal-deck-controls .coach-controls--daily{flex:1;width:auto;gap:5px}.meal-deck-controls .coach-controls--daily .restart-control{margin-left:0}.meal-deck-controls .plan-top-actions{order:5;flex:0 0 100%;width:100%;justify-content:flex-start;overflow-x:auto;padding:2px 0 1px;scrollbar-width:none}.meal-deck-controls .plan-top-actions::-webkit-scrollbar{display:none}.meal-deck-controls .plan-top-scope{font-size:.58rem}.meal-deck-controls .plan-top-action{min-height:29px;padding:5px 7px;font-size:.6rem}.daily-meal-card .meal .actions{gap:7px}.daily-meal-card .meal .actions .button{min-height:50px;padding:8px 5px;font-size:clamp(.68rem,3.2vw,.84rem);overflow-wrap:anywhere}}";
  document.head.append(planActionStyle);
  const milkshakeOptionStyle = document.createElement("style");
  milkshakeOptionStyle.textContent = ".milkshake-option{display:flex;flex-wrap:wrap;gap:3px 8px;align-items:baseline;margin:12px 0 0!important;padding:8px 10px;border:1px solid #d1a171;border-radius:10px;background:#fff4df;color:#584538!important;font-size:.82rem;line-height:1.25}.milkshake-option strong{color:#9e4e35}.milkshake-detail{font-weight:700}.week-day .milkshake-option{margin-top:auto!important;font-size:clamp(.74rem,4.2cqw,.88rem)}@media(max-width:719px){.milkshake-option{margin-top:10px!important;padding:7px 9px;font-size:.76rem}}";
  document.head.append(milkshakeOptionStyle);
  const compactCardStyle = document.createElement("style");
  compactCardStyle.textContent = ".card-detail-toggle{display:none;align-items:center;justify-content:center;gap:6px;width:max-content;max-width:100%;margin:10px 0 0;border:1px solid #a66b48;background:#fff9ed;color:#275e50;padding:6px 9px;font:inherit;font-size:.72rem;font-weight:800;line-height:1;cursor:pointer}.card-detail-toggle:hover{background:#f1d0aa}.card-detail-toggle:focus-visible{outline:3px solid #a14e34;outline-offset:2px}.compact-plan-view .card-detail-toggle{display:inline-flex}.compact-plan-view .meal.is-collapsed,.compact-plan-view .week-day.is-collapsed{height:auto;min-height:0}.compact-plan-view .meal.is-collapsed .meal-visual,.compact-plan-view .meal.is-collapsed .meal-status,.compact-plan-view .meal.is-collapsed .meal-header>.meta,.compact-plan-view .meal.is-collapsed .meal-header .eyebrow,.compact-plan-view .meal.is-collapsed .meal-details,.compact-plan-view .week-day.is-collapsed .weekly-card-visual,.compact-plan-view .week-day.is-collapsed .week-day-details{display:none}.compact-plan-view .meal.is-collapsed .meal-header{display:block}.compact-plan-view .meal.is-collapsed .meal-header h3{margin:0}.compact-plan-view .week-day.is-collapsed h3{margin:0}.compact-plan-view .week-day.is-collapsed{padding:clamp(12px,1.15vw,20px)}@media(max-width:719px){.compact-plan-view .daily-meal-card .meal.is-collapsed{min-height:0;height:auto}.compact-plan-view .daily-meal-card{align-items:flex-start}.compact-plan-view .card-detail-toggle{margin-top:12px}}";
  document.head.append(compactCardStyle);
  const weeklyPlanStyle = document.createElement("style");
  weeklyPlanStyle.textContent = ".weekly-plan-workspace{padding:clamp(10px,1.4vw,28px) clamp(18px,5vw,96px)!important}.weekly-plan-workspace .coach-controls,.weekly-plan-heading,.weekly-plan-page{width:min(100%,1920px);max-width:none!important;margin-left:auto;margin-right:auto}.weekly-plan-workspace .coach-controls{margin-bottom:clamp(6px,.7vw,12px)}.weekly-plan-heading{margin:0 0 clamp(10px,1vw,18px)}.weekly-plan-workspace h2{max-width:none;margin:0 0 4px;font-size:clamp(2.15rem,4.2vw,4.4rem)}.weekly-plan-workspace>.lead{max-width:980px;margin:0}.weekly-plan-page{min-height:0;padding:clamp(10px,1.2vw,18px);border-radius:22px}.weekly-plan-page .full-card{width:100%;max-width:none;padding:0;background:transparent;box-shadow:none}.weekly-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:clamp(12px,1.1vw,20px);width:100%}.week-day{container-type:inline-size;display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:clamp(12px,1.15vw,20px);border-width:1px;border-radius:16px;box-shadow:0 12px 28px rgba(58,42,27,.1)}.week-day .weekly-meal-image{height:clamp(132px,56cqw,230px);margin-bottom:14px;object-fit:cover}.week-day h3{font-size:clamp(1.05rem,6.2cqw,1.45rem);line-height:1.12}.week-day p{margin:.35rem 0;font-size:clamp(.78rem,4.7cqw,.96rem);line-height:1.38}.week-day p:last-child{margin-bottom:0}.weekly-plan-page>.bubble>.actions{margin:clamp(18px,2vw,30px) 0 0;justify-content:flex-start}@media(min-width:1500px){.weekly-grid{grid-template-columns:repeat(7,minmax(0,1fr))}}@media(max-width:719px){.weekly-plan-workspace{padding:12px 14px 22px!important}.weekly-plan-page{padding:10px;border-radius:16px}.weekly-grid{grid-template-columns:1fr;gap:12px}.week-day .weekly-meal-image{height:min(56vw,260px)}}";
  document.head.append(weeklyPlanStyle);
  const liveCoachPanelStyle = document.createElement("style");
  liveCoachPanelStyle.textContent = ".daily-meal-overview{display:grid;grid-template-columns:minmax(250px,.42fr) minmax(0,1fr);align-items:stretch;border-top:6px solid #e6bf67;background:#fffdf7;box-shadow:0 16px 38px rgba(58,42,27,.18)}.daily-meal-overview .ledger{position:static;margin:0;padding:18px;border-top:0;border-right:1px solid #dfcba8;background:transparent}.daily-meal-overview .live-coach{min-width:0;padding:15px 20px}.daily-meal-overview .live-coach-heading{display:flex;align-items:center;gap:12px;margin:0 0 7px}.daily-meal-overview .live-coach-heading .eyebrow{flex:0 0 auto;margin:0}.daily-meal-overview .live-coach-heading .coach-controls{flex:1;width:auto;max-width:none;margin:0}.daily-meal-overview .live-coach-heading .plan-top-actions{justify-content:flex-end}.daily-meal-overview .live-coach-heading .plan-top-action{min-height:30px;padding:5px 7px;font-size:.63rem}.daily-meal-overview .live-coach-thread{display:grid;gap:6px;max-height:86px;overflow:auto}.daily-meal-overview .live-coach .bubble{max-width:100%;padding:9px 12px;border-radius:12px;box-shadow:none}.daily-meal-overview .live-coach .bubble .meta{display:none}.daily-meal-overview .live-coach .composer{margin:10px 0 0;padding:6px 10px;border-radius:14px;box-shadow:none}.daily-meal-overview .live-coach .chat-input input{padding:8px 7px}.daily-meal-overview .live-coach .chat-input .button{padding:9px 14px}.daily-meal-overview .live-coach>.meta{display:none}.daily-plan-follow-up .live-coach{display:none}@media(max-width:1050px){.daily-meal-overview .live-coach-heading{align-items:flex-start;flex-direction:column}.daily-meal-overview .live-coach-heading .coach-controls{width:100%;justify-content:flex-start}.daily-meal-overview .live-coach-heading .plan-top-actions{justify-content:flex-start}}";
  document.head.append(liveCoachPanelStyle);
  const mobileCoachStyle = document.createElement("style");
  mobileCoachStyle.textContent = ".mobile-coach-toggle,.mobile-coach-drawer{display:none}@media(max-width:719px){.mobile-coach-toggle{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,253,247,.82);border-radius:999px;background:rgba(57,45,35,.72);color:#fffdf8;padding:7px 10px;font:inherit;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.mobile-coach-drawer:not([hidden]){position:absolute;z-index:4;inset:58px 12px 12px;display:flex;flex-direction:column;min-height:0;padding:16px;border:1px solid rgba(255,253,247,.72);border-radius:18px;background:#fffdf7;color:#392d23;box-shadow:0 18px 48px rgba(16,10,7,.45)}.mobile-coach-drawer-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 10px}.mobile-coach-drawer-header .eyebrow{margin:0}.mobile-coach-close{border:0;background:transparent;color:#614633;padding:6px;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}.mobile-coach-drawer .live-coach{display:flex;flex:1;min-height:0;flex-direction:column}.mobile-coach-drawer .live-coach>.eyebrow{display:none}.mobile-coach-drawer .live-coach-thread{display:grid;flex:1;align-content:start;gap:8px;min-height:0;overflow:auto}.mobile-coach-drawer .live-coach .bubble{max-width:100%;padding:10px 12px}.mobile-coach-drawer .live-coach .composer{flex:0 0 auto;margin:10px 0 0;padding:6px 10px}.mobile-coach-drawer .live-coach>.meta{display:none}.meal-deck-controls .coach-controls{gap:7px}.meal-deck-controls .restart-control{padding:7px 8px}}@media(max-width:420px){.meal-deck-controls{inset:10px 8px auto;font-size:.6rem}.meal-deck-controls .coach-controls{gap:3px}.meal-deck-controls .coach-controls [data-language]{padding:3px}.mobile-coach-toggle{padding:6px 8px;font-size:.6rem}.meal-deck-controls .restart-control{padding:6px 7px;font-size:.58rem;letter-spacing:.04em}}";
  document.head.append(mobileCoachStyle);
  const mobileCoachCompactStyle = document.createElement("style");
  mobileCoachCompactStyle.textContent = ".restart-control-short{display:none}@media(max-width:420px){.meal-deck-controls .restart-control-full{display:none}.meal-deck-controls .restart-control-short{display:inline}}";
  document.head.append(mobileCoachCompactStyle);
  const mobileCoachTightStyle = document.createElement("style");
  mobileCoachTightStyle.textContent = "@media(max-width:719px){.meal-deck-controls{width:auto}}@media(max-width:420px){.meal-deck-controls .coach-controls{gap:2px}.mobile-coach-toggle{padding:5px;font-size:.55rem;letter-spacing:.02em}.meal-deck-controls .restart-control{padding:5px;font-size:.55rem}}";
  document.head.append(mobileCoachTightStyle);
  const mobilePlanStyle = document.createElement("style");
  mobilePlanStyle.textContent = ".mobile-plan-toggle,.mobile-plan-drawer{display:none}@media(max-width:719px){.mobile-plan-toggle{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,253,247,.82);border-radius:999px;background:rgba(57,45,35,.72);color:#fffdf8;padding:7px 10px;font:inherit;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.mobile-plan-drawer:not([hidden]){position:absolute;z-index:5;inset:58px 12px auto;display:block;max-height:calc(100dvh - 82px);overflow:auto;padding:16px;border:1px solid rgba(255,253,247,.72);border-radius:18px;background:#fffdf7;color:#392d23;box-shadow:0 18px 48px rgba(16,10,7,.45)}.mobile-plan-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}.mobile-plan-drawer-header .eyebrow{margin:0}.mobile-plan-close{border:0;background:transparent;color:#614633;padding:6px;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}.mobile-plan-drawer .plan-top-actions{display:grid;grid-template-columns:1fr;gap:8px;width:100%;overflow:visible}.mobile-plan-drawer .plan-top-scope{margin:8px 0 0}.mobile-plan-drawer .plan-top-action{width:100%;min-height:44px;box-sizing:border-box;font-size:.82rem}.daily-meal-card{padding-top:76px!important}.meal-deck-help{display:none!important}}@media(max-width:420px){.mobile-plan-toggle{padding:5px;font-size:.55rem;letter-spacing:.02em}}";
  document.head.append(mobilePlanStyle);
  const mealInteractionStyle = document.createElement("style");
  mealInteractionStyle.textContent = ".restaurant-overlay{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:16px;background:rgba(57,45,35,.54);overflow:auto}.restaurant-overlay .restaurant-dialog{width:min(720px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border-radius:22px;background:#fff9ed;color:#392d23;box-shadow:0 20px 60px rgba(57,45,35,.35)}.restaurant-overlay .actions{justify-content:flex-start}.restaurant-overlay video{width:100%;max-width:620px;border-radius:14px;background:#392d23}.swipe-hint{margin:0 0 14px;color:#6d5948;font-size:.86rem}@media(max-width:600px){.restaurant-overlay{align-items:end;padding:0}.restaurant-overlay .restaurant-dialog{max-height:92dvh;border-radius:22px 22px 0 0}.swipe-hint{font-size:.8rem}}";
  document.head.append(mealInteractionStyle);
  const coachControlsStyle = document.createElement("style");
  coachControlsStyle.textContent = ".coach-controls{display:flex;justify-content:flex-end;align-items:center;gap:12px;max-width:980px;margin:0 auto 24px;color:#392d23;font-size:.78rem;font-weight:800;letter-spacing:.05em}.coach-controls [data-language]{border:0;background:transparent;color:inherit;padding:5px;cursor:pointer;font:inherit}.coach-controls [data-language]:hover{text-decoration:underline}.coach-controls .restart-control{margin:0}@media(max-width:600px){.coach-controls{margin-bottom:18px;gap:7px;font-size:.7rem}.coach-controls .restart-control{font-size:.63rem}}";
  document.head.append(coachControlsStyle);
  const emailDeliveryStyle = document.createElement("style");
  emailDeliveryStyle.textContent = ".email-dialog{width:min(580px,100%)}.email-dialog .field{margin:14px 0}.email-dialog input[type=email]{width:100%}.email-dialog .consent-row{display:flex;align-items:flex-start;gap:10px;font-size:.92rem;line-height:1.45}.email-dialog .consent-row input{width:auto;margin-top:4px}.email-dialog a{color:#614633}.email-dialog .status{margin:12px 0 0}";
  document.head.append(emailDeliveryStyle);
  const basketCostStyle = document.createElement("style");
  basketCostStyle.textContent = ".basket-costs{margin:22px 0 6px;padding:18px;border:1px solid #d1a171;border-radius:16px;background:#fff8eb}.basket-costs h3{margin:0 0 5px}.basket-costs>p{margin:0 0 12px}.basket-costs ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.basket-costs li{display:flex;justify-content:space-between;gap:16px;padding-bottom:9px;border-bottom:1px solid rgba(191,136,93,.25)}.basket-costs li span{min-width:0}.basket-costs li small{display:block;margin-top:2px;color:#6d5948}.basket-costs li>strong{white-space:nowrap}.basket-costs-total{display:flex;justify-content:space-between;gap:16px;margin:14px 0 8px;font-size:1.13rem}.basket-costs-disclaimer{color:#6d5948;font-size:.84rem;line-height:1.45}";
  document.head.append(basketCostStyle);

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const readState = () => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } };
  state = { mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: 0, chat: [], ...(readState() || { profile: null, activity: "rest", meals: {} }) };
  const todayKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  if (state.profile && state.planDate !== todayKey()) {
    state = { ...state, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: (state.menuNonce || 0) + 1 };
    save();
  }
  const choiceButtons = (items, attribute) => items.map(([label, value], index) => '<button ' + attribute + '="' + esc(value) + '" aria-keyshortcuts="' + (index + 1) + '"><kbd class="shortcut-key">' + (index + 1) + '</kbd>' + esc(label) + '</button>').join("");
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
  const coachControls = (includeConversation = false, topActions = "", includeMobilePlanToggle = false) => {
    const restartLabel = language === "ca" ? "Comença de nou" : "Start over";
    const compactRestartLabel = language === "ca" ? "Reinicia" : "Reset";
    const restartTitle = language === "ca" ? "Manté el perfil desat i torna a preguntar el moviment d’avui" : "Keeps the saved profile and asks only about today’s movement";
    return '<div class="coach-controls' + (topActions ? ' coach-controls--daily' : '') + '" data-language-control><span><button type="button" data-language="en">EN</button> · <button type="button" data-language="ca">CA</button></span>' + (includeConversation ? '<button class="mobile-coach-toggle" id="mobile-coach-toggle" type="button" aria-controls="mobile-coach-drawer" aria-expanded="' + mobileCoachOpen + '">Conversation</button>' : "") + (includeMobilePlanToggle ? '<button class="mobile-plan-toggle" id="mobile-plan-toggle" type="button" aria-controls="mobile-plan-drawer" aria-expanded="' + mobilePlanOpen + '">Plan</button>' : "") + topActions + '<button class="restart-control" type="button" data-global-restart title="' + restartTitle + '" aria-label="' + restartLabel + '"><span class="restart-control-full">' + restartLabel + '</span><span class="restart-control-short" aria-hidden="true">' + compactRestartLabel + "</span></button></div>";
  };
  const resetCoach = () => {
    mobileCoachOpen = false;
    mobilePlanOpen = false;
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
  document.addEventListener("click", (event) => {
    const languageButton = event.target.closest("[data-language]");
    if (languageButton) { language = languageButton.dataset.language; localStorage.setItem("quota-vita-coach-language", language); location.reload(); }
    if (event.target.closest("[data-global-restart]")) resetCoach();
  });
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target.matches("input, textarea, select, [contenteditable='true']")) return;
    const index = Number(event.key) - 1;
    const choices = [...root.querySelectorAll("[data-answer], [data-choice]")];
    if (index >= 0 && index < choices.length) { event.preventDefault(); choices[index].click(); }
  });
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
      dashboard();
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
    let index = 0;
    const render = () => {
      const question = questions[index];
      const input = question.choices
        ? '<div class="composer"><span class="composer-label">Choose one reply</span><p class="keyboard-hint">Press 1, 2 or 3 on your keyboard to choose.</p><div class="quick-replies">' + choiceButtons(question.choices, "data-answer") + "</div></div>"
        : '<form class="composer chat-input" id="chat-form"><input id="chat-answer" aria-label="' + esc(question.label) + '" placeholder="' + (language === "ca" ? "Escriu la resposta…" : "Type your answer…") + '" type="number" min="' + question.min + '" max="' + question.max + '" step="' + (question.step || 1) + '" value="' + esc(answers[question.key] || "") + '" autofocus><button class="button" type="submit">Send</button></form>';
      const intro = index === 0 ? '<div class="bubble coach coach-intro">Hi, I’m your Quota Vita Coach. I’ll create today’s calories and macro targets, three meal ideas, and an exact one-day shopping basket.<span class="meta">I’ll tailor it to your body, usual activity, goal and today’s training—not give you a generic diet.</span></div>' : "";
      root.innerHTML = '<section class="coach-workspace">' + coachControls() + stepper(1) + '<p class="eyebrow">Your Coach</p><h2>Let’s build your daily meal plan.</h2><p class="lead">Personal calories and macros, three meals and a one-day shopping basket.</p><section class="chat" aria-live="polite">' + intro + `<div class="bubble coach">${esc(question.label)}<span class="meta">${esc(question.hint)}</span></div>` + input + '</section><button class="button quiet chat-cancel" id="cancel">Cancel and restart</button><p class="privacy">General wellbeing guidance only. It does not provide medical advice.</p></section>';
      root.querySelector("#cancel").onclick = welcome;
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
      state = { profile: answers, planDate: todayKey(), needsTraining: true, activity: "rest", meals: {}, mealImages: {}, weeklyMealImages: {}, dailyMeals: null, menuNonce: 1 };
      save();
      training();
    };
    render();
  }

  function coachShell(title, lead, content) {
    return '<section class="coach-workspace">' + coachControls() + '<p class="eyebrow">Your Coach</p><h2>' + esc(title) + '</h2><p class="lead">' + esc(lead) + '</p><section class="chat chat-page" aria-live="polite">' + content + '</section></section>';
  }

  function training() {
    const choices = [["Rest or recovery day", "rest"], ["Walk", "walk"], ["Pilates", "pilates"], ["Strength training", "strength"], ["Run", "run"]];
    const savedProfileLead = language === "ca"
      ? "El teu perfil està desat en aquest dispositiu. Els àpats i les quantitats s’adaptaran al moviment d’avui."
      : "Your profile is saved on this device. Your meals and quantities will adapt to today’s movement.";
    root.innerHTML = coachShell("Are you going to train today?", savedProfileLead, '<div class="bubble coach">What does today’s movement look like?<span class="meta">Choose one reply. I will adapt your calories, carbohydrates and meal quantities.</span></div><div class="composer"><span class="composer-label">Choose one reply</span><p class="keyboard-hint">Press 1, 2, 3, 4 or 5 on your keyboard to choose.</p><div class="quick-replies">' + choiceButtons(choices, "data-choice") + '</div></div><button class="button quiet" id="back">Back</button>');
    root.querySelector("#back").onclick = profile;
    root.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => { failedMealImages.clear(); failedWeeklyMealImages.clear(); failedDailyMealPlans.clear(); state.activity = button.dataset.choice; state.needsTraining = false; state.meals = {}; state.mealImages = {}; state.weeklyMealImages = {}; state.dailyMeals = null; state.menuNonce = (state.menuNonce || 0) + 1; save(); dashboard(); });
  }

  function totals(plan) {
    const eaten = Object.entries(state.meals).filter(([, item]) => item.status === "eaten" || item.status === "restaurant").map(([id]) => plan.meals.find((meal) => meal.id === id)).filter(Boolean);
    return eaten.reduce((sum, meal) => ({ calories: sum.calories + meal.calories, proteinG: sum.proteinG + meal.proteinG, carbohydrateG: sum.carbohydrateG + meal.carbohydrateG, fatG: sum.fatG + meal.fatG }), { calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 });
  }

  function methodology() {
    return '<details class="method"><summary>Where the meal ideas come from</summary><ul><li><strong>Meal ideas:</strong> Quota Vita’s practical meal templates are built from familiar whole foods, balanced-plate patterns and the general macro target calculated below. They are not recipes supplied by FatSecret, LogMeal, a restaurant or a dietitian.</li><li><strong>Catalan meals:</strong> Named Catalan dishes and their core ingredients are checked against Cala’s verified knowledge before being prioritised in the Coach. Portion sizes remain general-wellbeing templates, not traditional recipe instructions.</li><li><strong>Energy:</strong> a Mifflin-St Jeor resting-energy estimate uses age, height, weight and sex; your selected usual activity, goal and today’s activity then make transparent fixed adjustments.</li><li><strong>Macros:</strong> protein is a general-wellbeing heuristic of 1.2-1.6g/kg; fat is set at 28% of energy; carbohydrates make up the remaining energy. Fibre aims for 25g/day (30g for the male option in this prototype).</li><li><strong>Food and photo data:</strong> FatSecret is only used for food lookup when enabled; LogMeal is only used for a restaurant-photo estimate after explicit consent. Neither is the source of the core calorie calculation.</li></ul><p class="meta">Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin et al. (1990)</a>; <a href="https://multimedia.efsa.europa.eu/drvs/index.htm" target="_blank" rel="noopener">EFSA Dietary Reference Values</a>. Estimates can be materially wrong for an individual. Seek a qualified clinician for medical conditions, pregnancy, eating-disorder history, kidney disease or diabetes.</p></details>';
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
      : plan.meals.map((meal) => "<section><h2>" + esc(meal.slot) + ": " + esc(meal.title) + "</h2>" + (meal.catalanName ? "<p><strong>Catalan dish:</strong> " + esc(meal.catalanName) + "</p>" : "") + "<p>" + esc(meal.portions) + "</p><p>" + meal.calories + " kcal · " + meal.proteinG + "g protein · " + meal.carbohydrateG + "g carbohydrates · " + meal.fatG + "g fat</p></section>").join("");
    const popup = window.open("", "_blank");
    if (!popup) return alert("Allow pop-ups to download your PDF.");
    popup.document.write("<!doctype html><title>" + title + "</title><style>body{max-width:760px;margin:48px auto;color:#183d39;font:16px/1.5 system-ui}h1,h2{font-family:Georgia,serif}h1{font-size:42px}h2{font-size:23px;border-top:1px solid #c9d7c7;padding-top:18px}li{margin:8px 0}.meta{color:#5c756f;font-size:13px;margin-top:32px}@page{margin:18mm}</style><h1>Quota Vita / " + title + "</h1><p>" + esc(activityLabels[state.activity]) + " · " + plan.target.calories + " kcal · " + plan.target.proteinG + "g protein · " + plan.target.carbohydrateG + "g carbohydrates · " + plan.target.fatG + "g fat</p>" + content + '<p class="meta">General wellbeing estimate. Method: Mifflin-St Jeor energy estimate plus transparent activity and goal adjustments. EFSA DRVs inform macro and fibre context. Not medical advice.</p>');
    popup.document.close();
    setTimeout(() => popup.print(), 250);
  }

  function liveCoachMarkup(placement) {
    const ask = language === "ca" ? "Pregunta" : "Ask";
    const askLabel = language === "ca" ? "Pregunta al teu Coach…" : "Ask your Coach…";
    const messages = Array.isArray(state.chat) ? state.chat.slice(-8) : [];
    const thread = messages.length
      ? messages.map((message) => '<div class="bubble ' + (message.role === "user" ? "user" : "coach") + '">' + esc(message.text) + "</div>").join("")
      : '<div class="bubble coach">Ask about a meal, a healthy swap or today’s training.<span class="meta">General wellbeing guidance, not medical advice.</span></div>';
    const controls = placement === "desktop" ? coachControls(false, planTopActions()) : "";
    return '<section class="live-coach" aria-label="Talk to your Coach"><div class="live-coach-heading"><p class="eyebrow">Talk to your Coach</p>' + controls + '</div><div class="live-coach-thread" data-live-coach-thread="' + placement + '" aria-live="polite">' + thread + '</div><form class="composer chat-input" data-live-coach-form="' + placement + '"><input maxlength="1400" placeholder="' + esc(askLabel) + '" aria-label="' + esc(askLabel) + '" required><button class="button" type="submit">' + ask + '</button></form><p class="meta">Messages are sent to OpenAI to generate a reply. Quota Vita keeps this conversation only on this device.</p></section>';
  }

  async function askLiveCoach(message, placement) {
    if (placement === "mobile") mobileCoachOpen = true;
    const chat = Array.isArray(state.chat) ? state.chat : [];
    state.chat = [...chat, { role: "user", text: message }].slice(-12);
    save();
    dashboard();
    const form = root.querySelector('[data-live-coach-form="' + placement + '"]');
    const input = form?.querySelector("input");
    const submit = form?.querySelector("button");
    if (input) input.disabled = true;
    if (submit) { submit.disabled = true; submit.textContent = "Thinking…"; }
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
      dashboard();
      root.querySelector('[data-live-coach-thread="' + placement + '"]')?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      if (input) input.disabled = false;
      if (submit) { submit.disabled = false; submit.textContent = "Ask"; }
      const thread = root.querySelector('[data-live-coach-thread="' + placement + '"]');
      if (thread) thread.insertAdjacentHTML("beforeend", '<p class="status error">' + esc(error.message || "The live Coach is unavailable.") + "</p>");
    }
  }

  function planTopActions() {
    const daily = language === "ca" ? "DIARI" : "DAILY";
    const weekly = language === "ca" ? "SETMANAL" : "WEEKLY";
    const labels = language === "ca"
      ? { actions: "Accions del pla", check: "Revisió", pdf: "PDF diari", basket: "Cistella", weekly: "Pla setmanal", training: "Entrenament", compact: state.compactPlanView ? "Vista completa" : "Vista compacta" }
      : { actions: "Plan actions", check: "Daily check", pdf: "Daily PDF", basket: "Daily basket", weekly: "Weekly plan", training: "Training", compact: state.compactPlanView ? "Full cards" : "Compact cards" };
    return '<div class="plan-top-actions" aria-label="' + labels.actions + '"><span class="plan-top-scope">' + daily + '</span><button class="plan-top-action primary" type="button" data-dashboard-action="daily-check">' + labels.check + '</button><button class="plan-top-action" type="button" data-dashboard-action="meal-pdf">' + labels.pdf + '</button><button class="plan-top-action" type="button" data-dashboard-action="basket">' + labels.basket + '</button><span class="plan-top-scope">' + weekly + '</span><button class="plan-top-action" type="button" data-dashboard-action="week-plan">' + labels.weekly + '</button><button class="plan-top-action" type="button" data-dashboard-action="change-training">' + labels.training + '</button><button class="plan-top-action" type="button" data-dashboard-action="compact-view" aria-pressed="' + Boolean(state.compactPlanView) + '">' + labels.compact + '</button></div>';
  }

  function detailToggleMarkup(detailKey, collapsed) {
    const label = language === "ca" ? (collapsed ? "+ Detalls" : "− Amaga els detalls") : (collapsed ? "+ Details" : "− Hide details");
    return '<button class="card-detail-toggle" type="button" data-detail-toggle="' + esc(detailKey) + '" aria-controls="' + esc(detailKey) + '-details" aria-expanded="' + String(!collapsed) + '">' + label + '</button>';
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
        button.textContent = language === "ca" ? (collapsed ? "+ Detalls" : "− Amaga els detalls") : (collapsed ? "+ Details" : "− Hide details");
      };
    });
  }

  function toggleCompactPlanView(render) {
    state.compactPlanView = !state.compactPlanView;
    expandedPlanDetails.clear();
    save();
    render();
  }

  function bindDashboardActions() {
    root.querySelectorAll("[data-dashboard-action]").forEach((button) => {
      const actions = {
        "daily-check": dailyCheck,
        "meal-pdf": () => printPdf("plan"),
        basket,
        "week-plan": weeklyPlan,
        "change-training": training,
        "start-over": resetCoach,
        "compact-view": () => toggleCompactPlanView(dashboard)
      };
      button.onclick = actions[button.dataset.dashboardAction];
    });
  }

  function dashboard() {
    const plan = currentPlan();
    const eaten = totals(plan);
    const left = { calories: Math.max(0, plan.target.calories - eaten.calories), proteinG: Math.max(0, plan.target.proteinG - eaten.proteinG), carbohydrateG: Math.max(0, plan.target.carbohydrateG - eaten.carbohydrateG) };
    mealDeckIndex = Math.min(mealDeckIndex, plan.meals.length - 1);
    const remaining = '<div class="ledger"><span>Still to eat</span><b>' + left.calories.toLocaleString() + '</b><span>kcal remaining</span><hr><span>' + left.proteinG + 'g protein · ' + left.carbohydrateG + 'g carbs remaining</span></div>';
    const mobileCoach = '<aside class="mobile-coach-drawer" id="mobile-coach-drawer"' + (mobileCoachOpen ? "" : " hidden") + '><div class="mobile-coach-drawer-header"><p class="eyebrow">Conversation</p><button class="mobile-coach-close" id="mobile-coach-close" type="button">Reduce</button></div>' + liveCoachMarkup("mobile") + "</aside>";
    const mobilePlan = window.matchMedia("(max-width: 719px)").matches
      ? '<aside class="mobile-plan-drawer" id="mobile-plan-drawer"' + (mobilePlanOpen ? "" : " hidden") + '><div class="mobile-plan-drawer-header"><p class="eyebrow">' + (language === "ca" ? "Opcions del pla" : "Plan options") + '</p><button class="mobile-plan-close" id="mobile-plan-close" type="button">' + (language === "ca" ? "Tanca" : "Close") + '</button></div>' + planTopActions() + "</aside>"
      : "";
    const milkshakeMeal = plan.meals.find((meal) => meal.milkshakeEligible)?.id || "lunch";
    root.innerHTML = '<section class="coach-workspace daily-plan-workspace' + (state.compactPlanView ? ' compact-plan-view' : '') + '"><section class="daily-meal-deck" aria-label="Daily meals" tabindex="0"><div class="meal-deck-controls"><p class="meal-deck-position" aria-live="polite"></p>' + coachControls(true, "", true) + '</div>' + mobileCoach + mobilePlan + '<div class="daily-meal-overview">' + remaining + liveCoachMarkup("desktop") + '</div><div class="daily-meal-track">' + plan.meals.map((meal) => '<div class="daily-meal-card"><div class="daily-meal-content">' + mealCard(meal, meal.id === milkshakeMeal) + '</div></div>').join("") + '</div><p class="meal-deck-help">Swipe right to eat it · swipe left to skip it</p></section><section class="daily-plan-follow-up"><p class="privacy">This plan is stored only in this browser.</p>' + methodology() + '</section></section>';
    bindDashboardActions();
    bindDetailToggles();
    root.querySelectorAll("[data-meal]").forEach((button) => button.onclick = () => checkIn(button.dataset.meal));
    root.querySelectorAll("[data-confirm-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.confirmMeal, "eaten"); dashboard(); });
    root.querySelectorAll("[data-skip-meal]").forEach((button) => button.onclick = () => { recordMeal(button.dataset.skipMeal, "skipped"); dashboard(); });
    root.querySelectorAll("[data-restaurant-meal]").forEach((button) => { const meal = plan.meals.find((item) => item.id === button.dataset.restaurantMeal); button.onclick = () => restaurant(button.dataset.restaurantMeal, meal, true); });
    root.querySelectorAll("[data-live-coach-form]").forEach((form) => form.onsubmit = (event) => { event.preventDefault(); const input = form.querySelector("input"); const message = input.value.trim(); if (message) askLiveCoach(message, form.dataset.liveCoachForm); });
    const mobileCoachDrawer = root.querySelector("#mobile-coach-drawer");
    const setMobileCoachOpen = (open) => {
      mobileCoachOpen = open;
      mobileCoachDrawer.hidden = !open;
      root.querySelector("#mobile-coach-toggle")?.setAttribute("aria-expanded", String(open));
      root.querySelector(".daily-meal-deck")?.classList.toggle("conversation-open", open);
      if (open) mobileCoachDrawer.querySelector("input")?.focus({ preventScroll: true });
    };
    root.querySelector("#mobile-coach-toggle")?.addEventListener("click", () => setMobileCoachOpen(!mobileCoachOpen));
    root.querySelector("#mobile-coach-close")?.addEventListener("click", () => setMobileCoachOpen(false));
    const mobilePlanDrawer = root.querySelector("#mobile-plan-drawer");
    const setMobilePlanOpen = (open) => {
      if (!mobilePlanDrawer) return;
      mobilePlanOpen = open;
      mobilePlanDrawer.hidden = !open;
      root.querySelector("#mobile-plan-toggle")?.setAttribute("aria-expanded", String(open));
      if (open) setMobileCoachOpen(false);
    };
    root.querySelector("#mobile-plan-toggle")?.addEventListener("click", () => setMobilePlanOpen(!mobilePlanOpen));
    root.querySelector("#mobile-plan-close")?.addEventListener("click", () => setMobilePlanOpen(false));
    enableMealSwipe(plan);
    loadMealImages(plan);
    void loadGeneratedDailyMeals(plan.target);
  }

  function enableMealSwipe(plan) {
    if (!window.matchMedia("(max-width: 719px)").matches) return;
    const deck = root.querySelector(".daily-meal-deck");
    const track = root.querySelector(".daily-meal-track");
    const position = root.querySelector(".meal-deck-position");
    if (!deck || !track || !position) return;
    let pointer;
    let touch;
    let lastCommittedSwipeAt = 0;
    const renderPosition = () => { position.textContent = "Meal " + (mealDeckIndex + 1) + " of " + plan.meals.length; };
    const moveTo = (nextIndex, immediate = false) => {
      mealDeckIndex = Math.max(0, Math.min(plan.meals.length - 1, nextIndex));
      track.style.transition = immediate ? "none" : "";
      track.style.transform = "translate3d(" + (-mealDeckIndex * 100) + "%, 0, 0)";
      renderPosition();
      if (immediate) requestAnimationFrame(() => { track.style.transition = ""; });
    };
    const releasePointer = () => {
      if (pointer?.id !== undefined && deck.hasPointerCapture?.(pointer.id)) {
        try { deck.releasePointerCapture(pointer.id); } catch { /* Safari may already have released it. */ }
      }
      pointer = null;
    };
    const completeSwipe = (offset, verticalOffset = 0) => {
      const threshold = Math.max(42, deck.clientWidth * .12);
      if (Math.abs(offset) < threshold || Math.abs(offset) <= Math.abs(verticalOffset)) return false;
      if (Date.now() - lastCommittedSwipeAt < 400) return true;
      const activeMeal = plan.meals[mealDeckIndex];
      if (!activeMeal) return false;
      lastCommittedSwipeAt = Date.now();
      recordMeal(activeMeal.id, offset > 0 ? "eaten" : "skipped");
      mealDeckIndex = Math.min(mealDeckIndex + 1, plan.meals.length - 1);
      dashboard();
      return true;
    };
    moveTo(mealDeckIndex, true);
    deck.addEventListener("pointerdown", (event) => {
      if (deck.classList.contains("conversation-open")) return;
      if (event.target.closest("button, input, label, a")) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
      try { deck.setPointerCapture(event.pointerId); } catch { /* Touch fallback below handles browsers without pointer capture. */ }
    });
    deck.addEventListener("pointermove", (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const offset = event.clientX - pointer.x;
      if (!pointer.dragging && Math.abs(offset) > Math.abs(event.clientY - pointer.y) && Math.abs(offset) > 6) pointer.dragging = true;
      if (!pointer.dragging) return;
      const width = deck.clientWidth || window.innerWidth;
      const limitedOffset = Math.max(-width * .35, Math.min(width * .35, offset));
      track.style.transition = "none";
      track.style.transform = "translate3d(calc(" + (-mealDeckIndex * 100) + "% + " + limitedOffset + "px), 0, 0)";
    });
    deck.addEventListener("pointerup", (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const offset = event.clientX - pointer.x;
      const verticalOffset = event.clientY - pointer.y;
      const wasDragging = pointer.dragging;
      releasePointer();
      if (wasDragging && completeSwipe(offset, verticalOffset)) return;
      moveTo(mealDeckIndex);
    });
    deck.addEventListener("pointercancel", () => { releasePointer(); moveTo(mealDeckIndex); });
    deck.addEventListener("touchstart", (event) => {
      if (deck.classList.contains("conversation-open") || event.target.closest("button, input, label, a")) return;
      const start = event.changedTouches[0];
      if (start) touch = { id: start.identifier, x: start.clientX, y: start.clientY };
    }, { passive: true });
    deck.addEventListener("touchend", (event) => {
      if (!touch) return;
      const end = [...event.changedTouches].find((item) => item.identifier === touch.id);
      if (!end) return;
      const start = touch;
      touch = null;
      if (!completeSwipe(end.clientX - start.x, end.clientY - start.y)) moveTo(mealDeckIndex);
    }, { passive: true });
    deck.addEventListener("touchcancel", () => { touch = null; moveTo(mealDeckIndex); }, { passive: true });
    deck.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); moveTo(mealDeckIndex + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); moveTo(mealDeckIndex - 1); }
    });
  }

  function recordMeal(id, status, details = {}) {
    const previous = state.meals[id] || {};
    const eligible = status === "eaten" || status === "restaurant";
    if (eligible && !previous.pointsAwarded) {
      const legacyMealPoints = Object.values(state.meals).filter((meal) => ["eaten", "restaurant"].includes(meal.status)).length * 10;
      state.totalPoints = Math.max(Number(state.totalPoints) || 0, legacyMealPoints) + 10;
      details.pointsAwarded = true;
    } else if (previous.pointsAwarded) details.pointsAwarded = true;
    state.meals[id] = { ...previous, ...details, status };
    save();
  }

  function dailyCheck() {
    const plan = currentPlan();
    const completed = plan.meals.filter((meal) => ["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    const pending = plan.meals.filter((meal) => !["eaten", "restaurant"].includes(state.meals[meal.id]?.status));
    const date = new Intl.DateTimeFormat(language === "ca" ? "ca-ES" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    const completedToday = state.dailyCheckAwardedDate === todayKey();
    const points = completed.length * 10 + (completedToday ? 10 : 0);
    const totalPoints = Math.max(Number(state.totalPoints) || 0, completed.length * 10 + (completedToday ? 10 : 0));
    const content = '<div class="bubble coach"><strong>' + esc(date) + '</strong><span class="meta">' + completed.length + ' of ' + plan.meals.length + ' meals logged today · ' + points + ' points today · ' + totalPoints + ' total points · ' + (state.streak || 0) + ' day streak</span></div>'
      + (pending.length ? '<div class="composer"><span class="composer-label">Review the meals still pending</span><div class="quick-replies">' + pending.map((meal) => '<button data-daily-check="' + meal.id + '">' + esc(meal.slot) + ': ' + esc(meal.title) + '</button>').join("") + '</div></div>' : '<div class="bubble coach">Your daily check is complete. Your meals and plan are saved on this device for today.</div>')
      + '<div class="actions">' + (pending.length ? "" : completedToday ? '<span class="button quiet">Daily check completed · +10</span>' : '<button class="button" id="complete-check">Complete today’s check (+10)</button>') + '<button class="button quiet" id="back">Back to daily plan</button></div>';
    root.innerHTML = coachShell("Daily check", "Review what you have eaten today and adapt the remaining meals.", content);
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
      const mealPoints = Object.values(state.meals).filter((meal) => ["eaten", "restaurant"].includes(meal.status)).length * 10;
      state.totalPoints = Math.max(Number(state.totalPoints) || 0, mealPoints) + 10;
      save();
    }
    dailyCheck();
  }

  const quotaVitaMilkshakeMl = (proteinG) => Math.max(100, Math.ceil((Number(proteinG) / 24) * 10) * 10);
  const milkshakeOptionMarkup = (meal) => {
    const millilitres = quotaVitaMilkshakeMl(meal.proteinG);
    const text = language === "ca"
      ? "Substitueix la proteïna · " + millilitres + " ml · 24 g/100 ml"
      : "Protein swap · " + millilitres + " ml · 24 g/100 ml";
    return '<p class="milkshake-option"><strong>Quota Vita Milkshake</strong><span class="milkshake-detail">' + text + '</span></p>';
  };

  function mealCard(meal, showMilkshakeOption = meal.id === "lunch") {
    const saved = state.meals[meal.id];
    const status = saved?.status;
    const label = status === "restaurant" ? "Restaurant meal logged" : status === "eaten" ? "Logged" : status === "skipped" ? "Skipped" : "Planned";
    const imageUrl = state.mealImages?.[meal.id];
    const image = imageUrl
      ? '<img class="meal-image" src="' + esc(imageUrl) + '" alt="' + esc(meal.title) + '">'
      : '<div class="meal-image meal-image-placeholder" data-meal-image-placeholder="' + esc(meal.id) + '" role="status"><span>' + (failedMealImages.has(mealImageKey(meal)) ? "Meal image is unavailable right now." : "Creating your meal image…") + '</span></div>';
    const actions = status
      ? '<div class="actions"><button class="button quiet" data-meal="' + esc(meal.id) + '">Review this meal</button></div>'
      : '<div class="actions"><button class="button" data-confirm-meal="' + esc(meal.id) + '">I’ll eat this</button><button class="button quiet" data-restaurant-meal="' + esc(meal.id) + '">Restaurant meal</button><button class="button quiet" data-skip-meal="' + esc(meal.id) + '">Skip for now</button></div>';
    const catalanDish = meal.catalanName ? '<p class="meta"><strong>Catalan dish:</strong> ' + esc(meal.catalanName) + '</p>' : "";
    const macroSummary = '<span class="meta">' + meal.calories + " kcal<br><strong>" + meal.proteinG + 'g <span>protein</span></strong><br><span>' + meal.carbohydrateG + 'g <span>carbohydrates</span> · ' + meal.fatG + 'g <span>fat</span></span></span>';
    const detailKey = "daily-" + meal.id;
    const collapsed = Boolean(state.compactPlanView) && !expandedPlanDetails.has(detailKey);
    return '<article class="meal ' + (status || "") + (collapsed ? ' is-collapsed' : '') + '" data-meal-card="' + esc(meal.id) + '" data-detail-card="' + esc(detailKey) + '"><div class="meal-visual">' + image + '</div><span class="meal-status">' + label + '</span><div class="meal-header"><div><p class="eyebrow">' + esc(meal.slot) + "</p><h3>" + esc(meal.title) + '</h3></div>' + macroSummary + "</div>" + detailToggleMarkup(detailKey, collapsed) + '<div class="meal-details" id="' + esc(detailKey) + '-details">' + catalanDish + '<p>' + esc(meal.portions) + '</p><p class="meta">' + esc(meal.hint) + '</p>' + (showMilkshakeOption ? milkshakeOptionMarkup(meal) : "") + actions + "</div></article>";
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
        placeholder.textContent = "Meal image is unavailable right now.";
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

  function weeklyPlanShell(title, lead, content, topActions = "") {
    return '<section class="coach-workspace weekly-plan-workspace' + (state.compactPlanView ? ' compact-plan-view' : '') + '">' + coachControls(false, topActions) + '<header class="weekly-plan-heading"><p class="eyebrow">Your Coach</p><h2>' + esc(title) + '</h2><p class="lead">' + esc(lead) + '</p></header><section class="chat chat-page weekly-plan-page" aria-live="polite">' + content + '</section></section>';
  }

  function weeklyPlanTopActions() {
    const labels = language === "ca"
      ? { actions: "Accions del pla setmanal", scope: "SETMANAL", approve: "Crea la cistella", pdf: "PDF setmanal", email: "Correu", back: "Pla diari", compact: state.compactPlanView ? "Vista completa" : "Vista compacta" }
      : { actions: "Weekly plan actions", scope: "WEEKLY", approve: "Create basket", pdf: "Weekly PDF", email: "Email", back: "Daily plan", compact: state.compactPlanView ? "Full cards" : "Compact cards" };
    return '<div class="plan-top-actions" aria-label="' + labels.actions + '"><span class="plan-top-scope">' + labels.scope + '</span><button class="plan-top-action primary" type="button" id="top-approve-week">' + labels.approve + '</button><button class="plan-top-action" type="button" id="top-weekly-pdf">' + labels.pdf + '</button><button class="plan-top-action" type="button" id="top-weekly-email">' + labels.email + '</button><button class="plan-top-action" type="button" id="top-back-daily">' + labels.back + '</button><button class="plan-top-action" type="button" id="top-compact-plan" aria-pressed="' + Boolean(state.compactPlanView) + '">' + labels.compact + '</button></div>';
  }

  function weeklyDayCard(entry, milkshakeOptions) {
    const detailKey = "weekly-" + entry.id;
    const collapsed = Boolean(state.compactPlanView) && !expandedPlanDetails.has(detailKey);
    const details = '<p><strong>' + entry.target.calories + ' kcal</strong> · ' + entry.target.proteinG + 'g protein</p>' + entry.meals.map((meal) => '<p><strong>' + meal.slot + ': ' + esc(meal.title) + '</strong><br><span class="meta">' + (meal.catalanName ? '<strong>Catalan dish:</strong> ' + esc(meal.catalanName) + '<br>' : '') + esc(meal.portions) + '</span></p>' + (milkshakeOptions.has(entry.id + ":" + meal.id) ? milkshakeOptionMarkup(meal) : "")).join("");
    return '<article class="week-day' + (collapsed ? ' is-collapsed' : '') + '" data-detail-card="' + esc(detailKey) + '"><div class="weekly-card-visual">' + weeklyMealImageMarkup(entry) + '</div><h3>' + esc(entry.day) + ' · ' + esc(activityLabels[entry.activity]) + '</h3>' + detailToggleMarkup(detailKey, collapsed) + '<div class="week-day-details" id="' + esc(detailKey) + '-details">' + details + '</div></article>';
  }

  function weeklyPlanEntries() {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
    return '<div class="meal-image weekly-meal-image meal-image-placeholder" data-weekly-meal-image-placeholder="' + esc(entry.id) + '" data-weekly-meal-image-key="' + esc(imageKey) + '" role="status"><span>' + (failedWeeklyMealImages.has(imageKey) ? "Meal image is unavailable right now." : "Creating your meal image…") + '</span></div>';
  }

  function updateWeeklyMealImagePlaceholder(entry, imageUrl) {
    root.querySelectorAll('[data-weekly-meal-image-placeholder="' + entry.id + '"]').forEach((placeholder) => {
      if (placeholder.dataset.weeklyMealImageKey !== weeklyMealImageKey(entry)) return;
      if (!imageUrl) { placeholder.textContent = "Meal image is unavailable right now."; return; }
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
    const activityExplanation = { sedentary: "mostly sitting, with gentle movement built in", light: "light activity (1–2 activity days/week)", moderate: "regular training (3–4 training days/week)", high: "frequent training (5+ training days/week)" }[state.profile.activity];
    const entries = weeklyPlanEntries();
    const milkshakeOptions = weeklyMilkshakeOptionKeys(entries);
    const cards = entries.map((entry) => weeklyDayCard(entry, milkshakeOptions)).join("");
    root.innerHTML = weeklyPlanShell("Your varied seven-day meal plan", "Built from your first-chat answer: " + activityExplanation + ". Review it before creating your basket.", '<div class="bubble coach full-card"><div class="weekly-grid">' + cards + '</div></div>', weeklyPlanTopActions());
    root.querySelector("#top-approve-week").onclick = weeklyBasket; root.querySelector("#top-weekly-pdf").onclick = () => printWeekly("plan"); root.querySelector("#top-weekly-email").onclick = () => emailWeekly("plan"); root.querySelector("#top-back-daily").onclick = dashboard; root.querySelector("#top-compact-plan").onclick = () => toggleCompactPlanView(weeklyPlan);
    bindDetailToggles();
    entries.forEach((entry) => { void loadWeeklyMealImage(entry); });
  }

  function weeklyBasketItems() {
    const activities = weeklyActivities(); const scale = dailyTarget(state.profile, activities[0]).calories / 2000;
    const baseItems = [[1200, "Greek yogurt"], [360, "oats"], [4, "bananas"], [3, "apples or pears"], [300, "berries"], [12, "eggs"], [700, "chicken breast"], [450, "turkey"], [280, "salmon"], [160, "cod"], [180, "tofu"], [2, "tuna cans"], [660, "cooked lentils"], [500, "cooked chickpeas or beans"], [240, "dry rice or quinoa"], [250, "dry wholegrain pasta"], [1500, "potatoes or sweet potatoes"], [2200, "mixed vegetables and salad"], [140, "olive oil"], [12, "slices wholegrain bread"], [50, "nuts, seeds or peanut butter"]];
    return baseItems.map(([amount, name]) => [name, amount < 20 ? amount : Math.round(amount * scale / 10) * 10]);
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
      ...weeklyBasketEstimate.items.map((item) => "- " + basketAmountLabel(item) + " " + item.name + ": " + formatEur(item.price)),
      "Estimated total: " + formatEur(weeklyBasketEstimate.total),
      "Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.",
    ].join("\n");
  }

  function renderBasketEstimate(estimate) {
    const mount = root.querySelector("#weekly-cost-estimate");
    if (!mount || !Array.isArray(estimate.items) || !Number.isFinite(Number(estimate.total))) return;
    weeklyBasketEstimate = estimate;
    mount.innerHTML = '<section class="basket-costs"><h3>Estimated weekly basket cost</h3><p class="meta">' + esc(basketEstimateSource(estimate)) + '</p><ul>' + estimate.items.map((item) => '<li><span><strong>' + esc(basketAmountLabel(item)) + '</strong> ' + esc(item.name) + '</span><strong>' + esc(formatEur(item.price)) + '</strong></li>').join("") + '</ul><p class="basket-costs-total"><strong>Estimated total</strong><strong>' + esc(formatEur(estimate.total)) + '</strong></p><p class="basket-costs-disclaimer">Price estimates cover the listed quantities, not a checkout quote. Promotions, store, brand, pack sizes and delivery can change the final amount.</p></section>';
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
    root.innerHTML = coachShell("Your approved weekly shopping basket", "A varied basket matching the seven specific daily menus and your first-chat training pattern.", '<div class="bubble coach full-card"><ul class="basket">' + totals.map(([name, amount]) => '<li><strong>' + (amount < 20 ? amount : amount + "g") + '</strong> ' + esc(name) + '</li>').join("") + '</ul><section id="weekly-cost-estimate" aria-live="polite">' + note("Checking the latest price estimate…") + '</section><div class="actions"><button class="button" id="weekly-basket-pdf" disabled>Download weekly basket PDF</button><button class="button quiet" id="weekly-basket-email" disabled>Send by email</button><button class="button quiet" id="back">Back to weekly plan</button></div></div>');
    root.querySelector("#weekly-basket-pdf").onclick = () => printWeekly("basket"); root.querySelector("#weekly-basket-email").onclick = () => emailWeekly("basket"); root.querySelector("#back").onclick = weeklyPlan;
    loadBasketEstimate(totals);
  }

  function weeklyText(kind) {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    if (kind === "basket") return weeklyBasketItems().map(([name, amount]) => "- " + amount + (amount < 20 ? "" : "g") + " " + name).join("\n") + (weeklyBasketEstimate ? "\n\n" + basketEstimateText() : "");
    return days.map((day, index) => {
      const target = dailyTarget(state.profile, weeklyActivities()[index]);
      return day + " - " + activityLabels[weeklyActivities()[index]] + "\n" + variedMeals(target, weeklyActivities()[index], index).map((meal) => meal.slot + ": " + meal.title + (meal.catalanName ? " [Catalan dish: " + meal.catalanName + "]" : "") + " (" + meal.portions + ")").join("\n");
    }).join("\n\n");
  }

  function printWeekly(kind) {
    const title = kind === "basket" ? "Weekly shopping basket" : "Seven-day meal plan";
    const popup = window.open("", "_blank");
    if (!popup) return alert("Allow pop-ups to download your PDF.");
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
    const overlay = document.createElement("div");
    overlay.className = "restaurant-overlay";
    overlay.innerHTML = '<section class="restaurant-dialog email-dialog" role="dialog" aria-modal="true" aria-labelledby="email-title"><h3 id="email-title">' + esc(title) + '</h3><p class="meta">' + esc(explanation) + '</p><form id="shopify-email-form"><label class="field">' + (isCatalan ? "Adreça electrònica" : "Email address") + '<input id="shopify-email-address" required type="email" autocomplete="email" value="' + esc(state.email || "") + '"></label><label class="consent-row"><input id="shopify-email-consent" required type="checkbox"><span>' + consent + ' <a href="https://quotavita.com/policies/privacy-policy" target="_blank" rel="noopener">' + (isCatalan ? "Política de privacitat" : "Privacy Policy") + '</a>.</span></label><div class="actions"><button class="button" type="submit">' + esc(send) + '</button><button class="button quiet" type="button" id="shopify-email-close">' + esc(close) + '</button></div><div id="shopify-email-feedback" aria-live="polite"></div></form></section>';
    document.body.append(overlay);
    const closeDialog = () => overlay.remove();
    overlay.querySelector("#shopify-email-close").onclick = closeDialog;
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    const address = overlay.querySelector("#shopify-email-address");
    address.focus();
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

  function checkIn(id, message = "") {
    const plan = currentPlan(); const meal = plan.meals.find((item) => item.id === id);
    root.innerHTML = coachShell(meal.slot + " check-in", meal.title, `<div class="bubble coach">Did you eat this proposed meal?</div><div class="actions"><button class="button" id="eaten">I ate this proposal</button><button class="button quiet" id="restaurant">I ate at a restaurant</button><button class="button quiet" id="skip">I skipped it</button></div>${message}<button class="button quiet" id="back">Back to plan</button>`);
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#eaten").onclick = () => { recordMeal(id, "eaten"); dashboard(); };
    root.querySelector("#skip").onclick = () => { recordMeal(id, "skipped"); dashboard(); };
    root.querySelector("#restaurant").onclick = () => restaurant(id, meal);
  }

  function restaurant(id, meal, inline = false) {
    if (inline) return restaurantOverlay(id, meal);
    capturedMealImage = null;
    root.innerHTML = coachShell("Restaurant meal", "Scan the meal, then adapt the rest of today’s plan.", '<div class="bubble coach">Take a clear photo of the plate. On a phone, Take photo opens the rear camera; on desktop, it opens your camera if available.</div><div class="actions"><button class="button" id="open-camera">Take photo</button><label class="button quiet" for="photo">Choose photo</label><input id="photo" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div id="camera-area"></div><label class="field"><input id="logmeal-consent" type="checkbox"> I authorise Quota Vita to send this one meal photo to LogMeal for automated analysis. Quota Vita does not store the image.</label><div class="actions"><button class="button" id="scan">Scan meal</button><button class="button quiet" id="manual">Mark as restaurant meal without scanning</button></div><div id="feedback"></div><button class="button quiet" id="back">Back</button>');
    const stopCamera = () => { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; };
    root.querySelector("#back").onclick = () => { stopCamera(); checkIn(id); };
    root.querySelector("#manual").onclick = () => { recordMeal(id, "restaurant"); dashboard(); };
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
        recordMeal(id, "restaurant", { analysis: "scanned" }); stopCamera();
        feedback.innerHTML = note("Meal estimate received. Your remaining plan has been adjusted.");
        setTimeout(dashboard, 900);
      } catch (error) { feedback.innerHTML = note(error.message || "Photo analysis is unavailable.", true); }
    };
  }

  function restaurantOverlay(id, meal) {
    capturedMealImage = null;
    const overlay = document.createElement("section");
    overlay.className = "restaurant-overlay";
    overlay.innerHTML = '<div class="restaurant-dialog" role="dialog" aria-modal="true" aria-label="Restaurant meal"><p class="eyebrow">Restaurant meal</p><h2>' + esc(meal.slot) + '</h2><p class="swipe-hint">You are still in today’s meal plan. Add a photo only if you want an estimate; you can also log the restaurant meal without scanning.</p><div class="actions"><button class="button" id="inline-open-camera">Take photo</button><label class="button quiet" for="inline-photo">Choose photo</label><input id="inline-photo" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div id="inline-camera-area"></div><label class="field"><input id="inline-logmeal-consent" type="checkbox"> I authorise Quota Vita to send this one meal photo to LogMeal for automated analysis. Quota Vita does not store the image.</label><div class="actions"><button class="button" id="inline-scan">Scan meal</button><button class="button quiet" id="inline-manual">Log restaurant meal without scanning</button><button class="button quiet" id="inline-close">Back to my meal</button></div><div id="inline-feedback"></div></div>';
    document.body.append(overlay);
    const stopCamera = () => { cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null; };
    const close = () => { stopCamera(); overlay.remove(); };
    overlay.querySelector("#inline-close").onclick = close;
    overlay.querySelector("#inline-manual").onclick = () => { recordMeal(id, "restaurant"); close(); dashboard(); };
    overlay.querySelector("#inline-open-camera").onclick = async () => {
      const area = overlay.querySelector("#inline-camera-area");
      try {
        stopCamera();
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        area.innerHTML = '<video id="inline-camera-preview" autoplay playsinline></video><div class="actions"><button class="button" id="inline-capture">Use this photo</button></div>';
        const video = overlay.querySelector("#inline-camera-preview"); video.srcObject = cameraStream;
        overlay.querySelector("#inline-capture").onclick = () => {
          const canvas = document.createElement("canvas"); const scale = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          capturedMealImage = canvas.toDataURL("image/jpeg", 0.84); stopCamera(); area.innerHTML = '<p class="status">Photo ready. Press “Scan meal” to upload it.</p>';
        };
      } catch { area.innerHTML = note("Camera access is unavailable. Choose a photo instead.", true); }
    };
    overlay.querySelector("#inline-scan").onclick = async () => {
      const file = overlay.querySelector("#inline-photo").files[0]; const feedback = overlay.querySelector("#inline-feedback");
      if (!file && !capturedMealImage) return feedback.innerHTML = note("Take or choose a JPEG, PNG, or WebP photo first.", true);
      if (!overlay.querySelector("#inline-logmeal-consent").checked) return feedback.innerHTML = note("Confirm the LogMeal photo-analysis authorisation before scanning.", true);
      if (file && file.size > 8 * 1024 * 1024) return feedback.innerHTML = note("Choose a photo smaller than 8 MB.", true);
      feedback.innerHTML = note("Checking photo-analysis availability…");
      try {
        const imageBase64 = capturedMealImage || await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        const response = await fetch("/api/meal-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, logmealConsent: true }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        recordMeal(id, "restaurant", { analysis: "scanned" }); close(); dashboard();
      } catch (error) { feedback.innerHTML = note(error.message || "Photo analysis is unavailable.", true); }
    };
  }

  function basket() {
    const plan = currentPlan(); const items = basketItems(plan);
    root.innerHTML = coachShell("Your one-day shopping basket", "Quantities are for one person and this specific plan.", '<div class="bubble coach full-card"><ul class="basket">' + items.map(([amount, name]) => "<li><strong>" + amount + (typeof amount === "number" && amount !== 1 ? "g" : "") + "</strong> " + esc(name) + "</li>").join("") + '</ul><div class="actions"><button class="button" id="basket-pdf">Download basket PDF</button><button class="button quiet" id="back">Back to daily plan</button><button class="button quiet" id="clear">Delete this device plan</button></div></div>');
    root.querySelector("#basket-pdf").onclick = () => printPdf("basket");
    root.querySelector("#back").onclick = dashboard;
    root.querySelector("#clear").onclick = resetCoach;
  }

  if (state.profile) (state.needsTraining ? training() : dashboard()); else welcome();
})();
