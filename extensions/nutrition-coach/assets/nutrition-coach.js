(() => {
  const root = document.querySelector("[data-nutrition-coach]");
  if (!root) return;

  const today = new Intl.DateTimeFormat(document.documentElement.lang || "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const demo = { calories: 1240, calorieGoal: 2000, protein: 61, proteinGoal: 90, fibre: 17, fibreGoal: 25 };

  root.innerHTML = `
    <div class="qv-nutrition-coach__shell">
      <header class="qv-nutrition-coach__topline"><div class="qv-nutrition-coach__brand"><i class="qv-nutrition-coach__leaf"></i> Quota Vita / Daily food</div><time class="qv-nutrition-coach__date">${today}</time></header>
      <div class="qv-nutrition-coach__hero">
        <div><p class="qv-nutrition-coach__eyebrow">Your everyday guide</p><h1>Make the rest of today count.</h1><p class="qv-nutrition-coach__subhead">A little more protein and fibre will make your day feel balanced. No perfection required.</p><div class="qv-nutrition-coach__actions"><button class="qv-nutrition-coach__button" data-action="meal">Log a meal</button><button class="qv-nutrition-coach__button qv-nutrition-coach__button--quiet" data-action="shop">Build my shopping list</button></div></div>
        <div class="qv-nutrition-coach__plate" aria-label="A visual representation of a balanced plate"><span class="qv-nutrition-coach__plate-label">vegetables<br>protein<br>whole grains<br>healthy fats</span></div>
      </div>
      <div class="qv-nutrition-coach__content">
        <section class="qv-nutrition-coach__panel" aria-labelledby="qv-day-title"><h2 id="qv-day-title">Today’s steady pace</h2><p class="qv-nutrition-coach__caption">These are estimates for general wellbeing, not medical advice.</p><div class="qv-nutrition-coach__rings"><div class="qv-nutrition-coach__ring"><div><b data-calories>${demo.calories.toLocaleString()}</b><span>of ${demo.calorieGoal.toLocaleString()} kcal</span></div></div><div class="qv-nutrition-coach__ring"><div><b data-protein>${demo.protein}g</b><span>of ${demo.proteinGoal}g protein</span></div></div><div class="qv-nutrition-coach__ring"><div><b data-fibre>${demo.fibre}g</b><span>of ${demo.fibreGoal}g fibre</span></div></div></div><p class="qv-nutrition-coach__nudge" data-nudge>Try a handful of chickpeas, skyr, or a bean salad at your next meal. That closes most of today’s protein and fibre gap.</p></section>
        <section class="qv-nutrition-coach__panel" aria-labelledby="qv-next-title"><h2 id="qv-next-title">Small next moves</h2><p class="qv-nutrition-coach__caption">Chosen from what your day could still use.</p><ul class="qv-nutrition-coach__list" data-next-list><li><span><strong>Greek yogurt + berries</strong><br><small>Protein · fibre</small></span><button data-add="Greek yogurt + berries">I had this</button></li><li><span><strong>Lentil & tomato salad</strong><br><small>Protein · fibre · iron</small></span><button data-add="Lentil & tomato salad">I had this</button></li><li><span><strong>Wholegrain toast + hummus</strong><br><small>Fibre · healthy fats</small></span><button data-add="Wholegrain toast + hummus">I had this</button></li></ul></section>
      </div>
      <footer class="qv-nutrition-coach__footer"><section class="qv-nutrition-coach__footer-card"><h3>Eating out?</h3><p>Photograph your plate and we’ll suggest foods and portions for you to check—never a guess presented as fact.</p><button class="qv-nutrition-coach__link-button" data-action="photo">Add restaurant meal</button></section><section class="qv-nutrition-coach__footer-card"><h3>Moving more today?</h3><p>Log a session to see a modest hydration and refuelling suggestion.</p><button class="qv-nutrition-coach__link-button" data-action="activity">Log activity</button></section></footer>
    </div>
    <dialog data-dialog><form class="qv-nutrition-coach__modal" method="dialog" data-form></form></dialog>`;

  const dialog = root.querySelector("[data-dialog]");
  const form = root.querySelector("[data-form]");
  const open = (markup) => { form.innerHTML = markup; dialog.showModal(); };
  const close = () => dialog.close();
  const shopItems = ["Chickpeas (2 jars)", "Greek yogurt or skyr", "Cherry tomatoes", "Wholegrain bread", "Hummus"];

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.add) {
      demo.protein += 15; demo.fibre += 5;
      root.querySelector("[data-protein]").textContent = `${demo.protein}g`;
      root.querySelector("[data-fibre]").textContent = `${demo.fibre}g`;
      root.querySelector("[data-nudge]").textContent = `${button.dataset.add} recorded. Nice—your remaining gap is smaller now.`;
      button.closest("li").remove();
    }
    if (action === "meal") open(`<h2>Log something you ate</h2><p>Search, scan a product barcode, or add a restaurant photo. You will confirm every estimate.</p><label class="qv-nutrition-coach__field">What did you have?<input name="meal" autocomplete="off" placeholder="e.g. lentil soup and bread" required></label><div class="qv-nutrition-coach__actions"><button class="qv-nutrition-coach__button" value="save">Add to today</button><button class="qv-nutrition-coach__button qv-nutrition-coach__button--quiet" type="button" data-close>Cancel</button></div><p class="qv-nutrition-coach__privacy">Food data is personal. Save only after you have reviewed the entry.</p>`);
    if (action === "photo") open(`<h2>Add a restaurant meal</h2><p>Choose a photo and we’ll suggest ingredients and portions for your review. It is not a precise calorie measurement.</p><label class="qv-nutrition-coach__field">Meal photo<input name="photo" type="file" accept="image/*" capture="environment" required></label><div class="qv-nutrition-coach__actions"><button class="qv-nutrition-coach__button" value="scan">Suggest ingredients</button><button class="qv-nutrition-coach__button qv-nutrition-coach__button--quiet" type="button" data-close>Cancel</button></div>`);
    if (action === "activity") open(`<h2>Log your movement</h2><p>For longer sessions, we can gently adjust your hydration and refuelling guidance.</p><label class="qv-nutrition-coach__field">Minutes of activity<input name="minutes" type="number" min="1" max="600" value="45" required></label><label class="qv-nutrition-coach__field">Intensity<select name="intensity"><option value="light">Light</option><option value="moderate" selected>Moderate</option><option value="high">High</option></select></label><div class="qv-nutrition-coach__actions"><button class="qv-nutrition-coach__button" value="save">Save activity</button><button class="qv-nutrition-coach__button qv-nutrition-coach__button--quiet" type="button" data-close>Cancel</button></div>`);
    if (action === "shop") open(`<h2>My simple shopping list</h2><p>Based on the meals that would help this week. Always check product labels for allergens.</p><ul class="qv-nutrition-coach__list">${shopItems.map((item) => `<li><span>${item}</span><small>Protein / fibre</small></li>`).join("")}</ul><div class="qv-nutrition-coach__actions"><button class="qv-nutrition-coach__button" value="save">Save list</button><button class="qv-nutrition-coach__button qv-nutrition-coach__button--quiet" type="button" data-close>Close</button></div>`);
    if (button.dataset.close !== undefined) close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const status = document.createElement("p"); status.className = "qv-nutrition-coach__status";
    status.textContent = values.get("photo") ? "Photo selected. In production, you’ll review the suggested foods next." : "Saved for today.";
    form.append(status);
  });
})();
