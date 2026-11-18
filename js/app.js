/* app.js – TripCraft main logic */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$" };

  let trip = null;          // currently open trip
  let selectedPlace = null; // chosen from autocomplete
  let actModal;

  // ---------- helpers ----------
  const money = (n, cur = trip?.currency) => (SYMBOL[cur] || cur + " ") + Math.round(n).toLocaleString();
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg, type = "primary") {
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    $("#toasts").appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3000 });
    t.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  }
  const showTab = (id) => bootstrap.Tab.getOrCreateInstance($(`[data-bs-target="#${id}"]`)).show();
  const persist = () => { if (trip && !Store.save(trip)) toast("Could not save (storage full?)", "danger"); };

  // ---------- destination autocomplete ----------
  const destInput = $("#destInput"), destList = $("#destList");
  const runSearch = debounce(async () => {
    const q = destInput.value.trim();
    if (q.length < 2) { destList.classList.add("d-none"); return; }
    try {
      const res = await API.searchPlaces(q);
      destList.innerHTML = res.length
        ? res.map((p, i) => `<button type="button" class="list-group-item list-group-item-action" data-i="${i}"><i class="bi bi-geo-alt"></i> ${esc(p.name)}${p.admin ? ", " + esc(p.admin) : ""}, ${esc(p.country)}</button>`).join("")
        : `<div class="list-group-item text-muted">No places found</div>`;
      destList._res = res;
      destList.classList.remove("d-none");
    } catch { destList.innerHTML = `<div class="list-group-item text-danger">Search failed. Check your connection.</div>`; destList.classList.remove("d-none"); }
  });
  destInput.addEventListener("input", () => { selectedPlace = null; runSearch(); });
  destList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]"); if (!b) return;
    selectedPlace = destList._res[+b.dataset.i];
    destInput.value = `${selectedPlace.name}, ${selectedPlace.country}`;
    destList.classList.add("d-none");
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#destList, #destInput")) destList.classList.add("d-none"); });

  // ---------- date defaults ----------
  const today = new Date().toISOString().slice(0, 10);
  $("#startDate").min = today; $("#startDate").value = addDays(today, 7);
  $("#endDate").value = addDays(today, 10);
  $("#startDate").addEventListener("change", () => {
    $("#endDate").min = $("#startDate").value;
    if ($("#endDate").value < $("#startDate").value) $("#endDate").value = $("#startDate").value;
  });

  // ---------- itinerary generation ----------
  const FILLERS = {
    food: ["Street-food tour", "Dinner at a well-reviewed local restaurant", "Visit a local market"],
    nature: ["Walk in a park or garden", "Sunset viewpoint", "Scenic nature spot"],
    adventure: ["Outdoor adventure activity", "Rent a bike and explore", "Guided trek or water sport"],
    culture: ["Visit a local museum", "Heritage walk", "Attend a cultural show"],
    shopping: ["Browse the main shopping district", "Buy local souvenirs", "Visit a handicraft market"]
  };
  const SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:30"];

  $("#tripForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const start = $("#startDate").value, end = $("#endDate").value;
    if (!selectedPlace) return toast("Please pick a destination from the suggestions list.", "warning");
    if (!start || !end || end < start) return toast("Please choose valid dates.", "warning");
    const n = daysBetween(start, end);
    if (n > 14) return toast("Please keep trips to 14 days or fewer.", "warning");

    const btn = $("#genBtn"), status = $("#genStatus");
    btn.disabled = true; status.textContent = "Fetching destination data…";
    try {
      const p = selectedPlace;
      const [wx, info, near, ctry] = await Promise.all([
        API.weather(p.lat, p.lon, start, end),
        API.wikiSummary(p.name),
        API.attractions(p.lat, p.lon),
        API.country(p.countryCode)
      ]);
      status.textContent = "Building itinerary…";
      const interests = $$("#interests input:checked").map(i => i.value);
      const t = {
        id: Store.uid(),
        dest: p, start, end, days: [],
        travelers: Math.max(1, +$("#travelers").value || 1),
        currency: $("#currency").value,
        budget: +$("#budget").value || 0,
        interests, weather: wx, info, country: ctry ? summarizeCountry(ctry) : null,
        expenses: [], packing: []
      };
      t.days = buildDays(t, near);
      t.packing = buildPacking(t);
      trip = t; persist();
      renderAll();
      toast("Itinerary ready!", "success");
      showTab("tab-itinerary");
      status.textContent = "";
    } catch (err) {
      console.error(err);
      status.textContent = "";
      toast("Something went wrong while generating. Please try again.", "danger");
    } finally { btn.disabled = false; }
  });

  function summarizeCountry(c) {
    return {
      name: c.name?.common, capital: (c.capital || [])[0], region: c.region,
      languages: Object.values(c.languages || {}).join(", "),
      currencies: Object.entries(c.currencies || {}).map(([k, v]) => ({ code: k, name: v.name, symbol: v.symbol })),
      flag: c.flags?.svg || c.flags?.png
    };
  }

  function buildDays(t, near) {
    const n = daysBetween(t.start, t.end);
    const pool = near.filter(a => !/^(List of|Index of)/i.test(a.title));
    const perDay = Math.max(2, Math.min(4, Math.ceil(pool.length / n) || 2));
    const fillers = t.interests.flatMap(i => FILLERS[i] || []);
    if (!fillers.length) fillers.push(...FILLERS.culture);
    let fi = 0, pi = 0;
    const costGuess = { sight: 300, filler: 500 };
    const days = [];
    for (let d = 0; d < n; d++) {
      const acts = [];
      for (let k = 0; k < perDay; k++) {
        const slot = SLOTS[k];
        if (pi < pool.length) {
          const a = pool[pi++];
          acts.push({ id: Store.uid(), time: slot, name: `Visit ${a.title}`, cost: costGuess.sight, note: `${(a.dist / 1000).toFixed(1)} km from city centre`, lat: a.lat, lon: a.lon });
        } else {
          acts.push({ id: Store.uid(), time: slot, name: fillers[fi++ % fillers.length], cost: costGuess.filler, note: "" });
        }
      }
      acts.push({ id: Store.uid(), time: "19:30", name: "Dinner & relax", cost: 800, note: "Try a local speciality" });
      acts.sort((a, b) => a.time.localeCompare(b.time));
      days.push({ date: addDays(t.start, d), activities: acts });
    }
    // costs above are base numbers; convert later if currency differs (kept as in selected currency units)
    return days;
  }

  function buildPacking(t) {
    const L = [];
    const add = (cat, ...items) => items.forEach(text => L.push({ id: Store.uid(), cat, text, done: false }));
    const temps = Object.values(t.weather || {});
    const avgMax = temps.length ? temps.reduce((s, x) => s + x.max, 0) / temps.length : null;
    const avgMin = temps.length ? temps.reduce((s, x) => s + x.min, 0) / temps.length : null;
    const rainy = temps.some(x => (x.rain ?? 0) >= 50);
    const n = daysBetween(t.start, t.end);

    add("Documents", "Passport / government ID", "Tickets & bookings", "Travel insurance copy", "Some cash & cards");
    add("Electronics", "Phone & charger", "Power bank", "Universal adapter");
    add("Toiletries & health", "Toothbrush & toiletries", "Personal medicines", "Sunscreen", "Hand sanitiser");
    add("Clothing", `${Math.min(n, 7)} sets of daily wear`, "Comfortable walking shoes", "Sleepwear");
    if (avgMin !== null && avgMin < 12) add("Weather gear", "Warm jacket", "Thermals", "Gloves & beanie");
    if (avgMax !== null && avgMax > 28) add("Weather gear", "Light cotton clothes", "Sunglasses", "Hat or cap", "Water bottle");
    if (rainy) add("Weather gear", "Umbrella / raincoat", "Waterproof bag cover");
    if (avgMax === null) add("Weather gear", "Check forecast before you leave (dates are beyond the forecast window)");
    if (t.interests.includes("adventure")) add("Activity", "Sports shoes", "First-aid kit", "Quick-dry clothing");
    if (t.interests.includes("nature")) add("Activity", "Insect repellent", "Daypack", "Binoculars (optional)");
    if (t.interests.includes("culture")) add("Activity", "Modest clothing for temples/holy sites", "Small notebook");
    if (t.interests.includes("shopping")) add("Activity", "Foldable extra bag");
    if (t.travelers > 1) add("Group", "Shared first-aid & snacks", "Group booking details");
    return L;
  }

  // ---------- rendering ----------
  function renderAll() {
    const has = !!trip;
    ["itin", "budget", "pack"].forEach(k => {
      $(`#${k}Empty`).classList.toggle("d-none", has);
    });
    $("#itinContent").classList.toggle("d-none", !has);
    $("#budgetContent").classList.toggle("d-none", !has);
    $("#packContent").classList.toggle("d-none", !has);
    if (has) { renderItinerary(); renderBudget(); renderPacking(); }
    renderTrips();
  }

  function renderItinerary() {
    const t = trip, p = t.dest, n = t.days.length;
    const bbox = `${p.lon - 0.08},${p.lat - 0.05},${p.lon + 0.08},${p.lat + 0.05}`;
    const c = t.country;
    $("#itinContent").innerHTML = `
      <div class="row g-4 mb-4">
        <div class="col-lg-7">
          <div class="card shadow-sm h-100"><div class="card-body">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <h2 class="mb-0">${esc(p.name)}, ${esc(p.country)}</h2>
                <div class="text-muted">${fmtDate(t.start)} → ${fmtDate(t.end)} · ${n} day${n > 1 ? "s" : ""} · ${t.travelers} traveler${t.travelers > 1 ? "s" : ""}</div>
              </div>
              <div class="no-print d-flex gap-2">
                <button class="btn btn-outline-secondary btn-sm" id="printBtn"><i class="bi bi-printer"></i> Print / PDF</button>
                <button class="btn btn-outline-secondary btn-sm" id="shareBtn"><i class="bi bi-clipboard"></i> Copy text</button>
              </div>
            </div>
            ${t.info?.image ? `<div class="dest-hero my-3"><img src="${esc(t.info.image)}" alt="${esc(p.name)}"></div>` : ""}
            <p class="mb-1">${esc(t.info?.extract || "No description available for this destination.")}</p>
            ${t.info?.url ? `<a href="${esc(t.info.url)}" target="_blank" rel="noopener" class="small">Read more on Wikipedia</a>` : ""}
          </div></div>
        </div>
        <div class="col-lg-5">
          <div class="card shadow-sm mb-3"><div class="card-body">
            <h6 class="text-uppercase text-muted">Quick facts</h6>
            ${c ? `<div class="d-flex align-items-center gap-2 mb-2">${c.flag ? `<img src="${esc(c.flag)}" alt="flag" width="32" class="border">` : ""}<b>${esc(c.name)}</b></div>
            <ul class="list-unstyled small mb-0">
              <li><i class="bi bi-building"></i> Capital: ${esc(c.capital || "—")}</li>
              <li><i class="bi bi-translate"></i> Languages: ${esc(c.languages || "—")}</li>
              <li><i class="bi bi-cash"></i> Currency: ${c.currencies.map(x => esc(x.name) + " (" + esc(x.code) + ")").join(", ") || "—"}</li>
              <li><i class="bi bi-clock"></i> Timezone: ${esc(p.tz || "—")}</li>
            </ul><div id="fxBox" class="small mt-2 text-muted"></div>` : `<p class="text-muted small mb-0">Country info unavailable.</p>`}
          </div></div>
          <iframe id="map" class="w-100 border-0 shadow-sm" loading="lazy" title="Map of ${esc(p.name)}"
            src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lon}"></iframe>
        </div>
      </div>
      <div id="daysWrap"></div>`;

    $("#daysWrap").innerHTML = t.days.map((d, di) => {
      const w = t.weather?.[d.date];
      const [label, icon] = w ? WMO(w.code) : [];
      const dayTotal = d.activities.reduce((s, a) => s + (+a.cost || 0), 0);
      return `
      <div class="card shadow-sm day-card mb-3" data-day="${di}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h5 class="mb-0">Day ${di + 1} <small class="text-muted">· ${fmtDate(d.date)}</small></h5>
            <div class="d-flex align-items-center gap-2">
              ${w ? `<span class="weather-chip"><i class="bi ${icon}"></i> ${label} · ${Math.round(w.min)}–${Math.round(w.max)}°C · ☔ ${w.rain ?? 0}%</span>`
                  : `<span class="weather-chip text-muted"><i class="bi bi-cloud"></i> Forecast not yet available</span>`}
              <span class="badge text-bg-light">${money(dayTotal)}</span>
              <button class="btn btn-sm btn-outline-primary no-print" data-act="add" data-day="${di}"><i class="bi bi-plus-lg"></i> Add</button>
            </div>
          </div>
          ${d.activities.length ? d.activities.map(a => `
            <div class="activity" data-id="${a.id}">
              <div class="time">${esc(a.time)}</div>
              <div>
                <div class="fw-semibold">${esc(a.name)}</div>
                ${a.note ? `<div class="small text-muted">${esc(a.note)}</div>` : ""}
                <div class="cost text-muted">Est. ${money(a.cost || 0)}
                  ${a.lat ? ` · <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=16/${a.lat}/${a.lon}">map</a>` : ""}</div>
              </div>
              <div class="actions no-print">
                <button class="btn btn-sm btn-light" data-act="up" data-day="${di}" data-id="${a.id}" title="Move up"><i class="bi bi-arrow-up"></i></button>
                <button class="btn btn-sm btn-light" data-act="down" data-day="${di}" data-id="${a.id}" title="Move down"><i class="bi bi-arrow-down"></i></button>
                <button class="btn btn-sm btn-light" data-act="edit" data-day="${di}" data-id="${a.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-light text-danger" data-act="del" data-day="${di}" data-id="${a.id}" title="Delete"><i class="bi bi-trash"></i></button>
              </div>
            </div>`).join("") : `<p class="text-muted mb-0">Nothing planned yet.</p>`}
        </div>
      </div>`;
    }).join("");

    loadFx();
  }

  async function loadFx() {
    const box = $("#fxBox"); if (!box || !trip.country?.currencies?.length) return;
    const local = trip.country.currencies[0].code;
    const r = await API.rate(trip.currency, local);
    if (r && box) box.innerHTML = `<i class="bi bi-currency-exchange"></i> 1 ${trip.currency} ≈ ${r.toFixed(r < 1 ? 4 : 2)} ${local}`;
  }

  // itinerary actions (event delegation)
  $("#itinContent").addEventListener("click", (e) => {
    if (e.target.closest("#printBtn")) return window.print();
    if (e.target.closest("#shareBtn")) return copyText();
    const b = e.target.closest("[data-act]"); if (!b) return;
    const di = +b.dataset.day, day = trip.days[di];
    const idx = day?.activities.findIndex(a => a.id === b.dataset.id);
    switch (b.dataset.act) {
      case "add": openModal(di); break;
      case "edit": openModal(di, day.activities[idx]); break;
      case "del":
        day.activities.splice(idx, 1); persist(); renderAll(); break;
      case "up": if (idx > 0) { [day.activities[idx - 1], day.activities[idx]] = [day.activities[idx], day.activities[idx - 1]]; persist(); renderAll(); } break;
      case "down": if (idx < day.activities.length - 1) { [day.activities[idx + 1], day.activities[idx]] = [day.activities[idx], day.activities[idx + 1]]; persist(); renderAll(); } break;
    }
  });

  function copyText() {
    const lines = [`TripCraft – ${trip.dest.name}, ${trip.dest.country}`, `${trip.start} to ${trip.end}`, ""];
    trip.days.forEach((d, i) => {
      lines.push(`Day ${i + 1} (${d.date})`);
      d.activities.forEach(a => lines.push(`  ${a.time}  ${a.name}${a.note ? " – " + a.note : ""}`));
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast("Itinerary copied to clipboard", "success"), () => toast("Copy failed", "danger"));
  }

  // activity modal
  actModal = new bootstrap.Modal($("#actModal"));
  function openModal(di, act) {
    $("#actTitle").textContent = act ? "Edit activity" : "Add activity";
    $("#actDay").value = di; $("#actId").value = act?.id || "";
    $("#actName").value = act?.name || ""; $("#actTime").value = act?.time || "10:00";
    $("#actCost").value = act?.cost ?? 0; $("#actNote").value = act?.note || "";
    actModal.show();
  }
  $("#actForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const day = trip.days[+$("#actDay").value], id = $("#actId").value;
    const data = { time: $("#actTime").value, name: $("#actName").value.trim(), cost: Math.max(0, +$("#actCost").value || 0), note: $("#actNote").value.trim() };
    if (!data.name) return;
    if (id) Object.assign(day.activities.find(a => a.id === id), data);
    else day.activities.push({ id: Store.uid(), ...data });
    day.activities.sort((a, b) => a.time.localeCompare(b.time));
    persist(); actModal.hide(); renderAll();
  });

  // ---------- budget ----------
  const EXP_CATS = ["Stay", "Transport", "Food", "Activities", "Shopping", "Other"];

  function renderBudget() {
    const t = trip;
    const planned = t.days.reduce((s, d) => s + d.activities.reduce((x, a) => x + (+a.cost || 0), 0), 0) * t.travelers;
    const spent = t.expenses.reduce((s, x) => s + x.amount, 0);
    const total = planned + spent;
    const pct = t.budget ? Math.min(100, Math.round(total / t.budget * 100)) : 0;
    const left = t.budget - total;
    const byCat = {};
    t.expenses.forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + x.amount);
    if (planned) byCat["Planned activities"] = planned;

    $("#budgetContent").innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-3"><div class="stat-tile"><div class="text-muted small">Budget</div><div class="v">${t.budget ? money(t.budget) : "—"}</div></div></div>
        <div class="col-6 col-md-3"><div class="stat-tile"><div class="text-muted small">Planned (×${t.travelers})</div><div class="v">${money(planned)}</div></div></div>
        <div class="col-6 col-md-3"><div class="stat-tile"><div class="text-muted small">Other expenses</div><div class="v">${money(spent)}</div></div></div>
        <div class="col-6 col-md-3"><div class="stat-tile"><div class="text-muted small">${left >= 0 ? "Remaining" : "Over budget"}</div><div class="v ${left < 0 && t.budget ? "text-danger" : "text-success"}">${t.budget ? money(Math.abs(left)) : "—"}</div></div></div>
      </div>
      ${t.budget ? `<div class="progress mb-4" style="height:1.4rem" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success"}" style="width:${pct}%">${pct}%</div></div>` : `<div class="alert alert-info">Set a total budget in the Plan tab to see progress.</div>`}
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card shadow-sm"><div class="card-body">
            <h5>Add expense</h5>
            <form id="expForm" class="row g-2">
              <div class="col-12"><input class="form-control" id="expDesc" placeholder="Description (e.g. Hotel – 3 nights)" required maxlength="80"></div>
              <div class="col-6"><select class="form-select" id="expCat">${EXP_CATS.map(c => `<option>${c}</option>`).join("")}</select></div>
              <div class="col-6"><input type="number" class="form-control" id="expAmt" min="1" placeholder="Amount (${t.currency})" required></div>
              <div class="col-12"><button class="btn btn-primary w-100">Add</button></div>
            </form>
          </div></div>
        </div>
        <div class="col-lg-7">
          <div class="card shadow-sm mb-3"><div class="card-body">
            <h5>Breakdown</h5>
            ${Object.keys(byCat).length ? Object.entries(byCat).map(([k, v]) => `
              <div class="mb-2"><div class="d-flex justify-content-between small"><span>${esc(k)}</span><span>${money(v)}</span></div>
              <div class="progress" style="height:8px"><div class="progress-bar" style="width:${Math.round(v / total * 100)}%"></div></div></div>`).join("") : `<p class="text-muted mb-0">No costs yet.</p>`}
          </div></div>
          <div class="card shadow-sm"><div class="card-body">
            <h5>Expenses</h5>
            <ul class="list-group list-group-flush">
              ${t.expenses.length ? t.expenses.map(x => `<li class="list-group-item d-flex justify-content-between align-items-center">
                <span>${esc(x.desc)} <span class="badge text-bg-light">${esc(x.cat)}</span></span>
                <span>${money(x.amount)} <button class="btn btn-sm text-danger" data-del-exp="${x.id}"><i class="bi bi-x-lg"></i></button></span></li>`).join("") : `<li class="list-group-item text-muted">No expenses added.</li>`}
            </ul>
          </div></div>
        </div>
      </div>`;
  }
  $("#budgetContent").addEventListener("submit", (e) => {
    if (e.target.id !== "expForm") return;
    e.preventDefault();
    trip.expenses.push({ id: Store.uid(), desc: $("#expDesc").value.trim(), cat: $("#expCat").value, amount: Math.max(0, +$("#expAmt").value || 0) });
    persist(); renderBudget();
  });
  $("#budgetContent").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-exp]"); if (!b) return;
    trip.expenses = trip.expenses.filter(x => x.id !== b.dataset.delExp);
    persist(); renderBudget();
  });

  // ---------- packing ----------
  function renderPacking() {
    const groups = {};
    trip.packing.forEach(i => (groups[i.cat] ||= []).push(i));
    const done = trip.packing.filter(i => i.done).length, total = trip.packing.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    $("#packContent").innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2"><h3 class="mb-0">Packing list</h3><span class="text-muted">${done}/${total} packed</span></div>
      <div class="progress mb-3" style="height:10px"><div class="progress-bar bg-success" style="width:${pct}%"></div></div>
      <form id="packForm" class="input-group mb-4">
        <input class="form-control" id="packText" placeholder="Add an item…" required maxlength="80">
        <button class="btn btn-primary">Add</button>
      </form>
      <div class="row g-3">
        ${Object.entries(groups).map(([cat, items]) => `
          <div class="col-md-6"><div class="card shadow-sm h-100"><div class="card-body">
            <h6 class="text-uppercase text-muted">${esc(cat)}</h6>
            ${items.map(i => `<div class="form-check d-flex justify-content-between pack-item ${i.done ? "done" : ""}">
              <div><input class="form-check-input" type="checkbox" id="p${i.id}" data-pack="${i.id}" ${i.done ? "checked" : ""}>
              <label class="form-check-label" for="p${i.id}">${esc(i.text)}</label></div>
              <button class="btn btn-sm text-danger py-0" data-del-pack="${i.id}"><i class="bi bi-x"></i></button></div>`).join("")}
          </div></div></div>`).join("")}
      </div>`;
  }
  $("#packContent").addEventListener("change", (e) => {
    const id = e.target.dataset.pack; if (!id) return;
    trip.packing.find(i => i.id === id).done = e.target.checked; persist(); renderPacking();
  });
  $("#packContent").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-pack]"); if (!b) return;
    trip.packing = trip.packing.filter(i => i.id !== b.dataset.delPack); persist(); renderPacking();
  });
  $("#packContent").addEventListener("submit", (e) => {
    if (e.target.id !== "packForm") return;
    e.preventDefault();
    trip.packing.push({ id: Store.uid(), cat: "Custom", text: $("#packText").value.trim(), done: false });
    persist(); renderPacking();
  });

  // ---------- my trips ----------
  function renderTrips() {
    const trips = Store.all();
    $("#tripsList").innerHTML = trips.length ? trips.map(t => `
      <div class="col-md-6 col-lg-4"><div class="card shadow-sm trip-card h-100"><div class="card-body">
        <h5>${esc(t.dest.name)}, ${esc(t.dest.country)}</h5>
        <p class="text-muted small mb-3">${fmtDate(t.start)} → ${fmtDate(t.end)}<br>${t.days.length} days · ${t.travelers} traveler(s)</p>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm" data-open="${t.id}">Open</button>
          <button class="btn btn-outline-danger btn-sm" data-remove="${t.id}"><i class="bi bi-trash"></i></button>
        </div>
      </div></div></div>`).join("")
      : `<div class="col-12 text-center text-muted py-5"><i class="bi bi-suitcase display-4"></i><p class="mt-3">No saved trips yet.</p></div>`;
  }
  $("#tripsList").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"), r = e.target.closest("[data-remove]");
    if (o) { trip = Store.get(o.dataset.open); renderAll(); showTab("tab-itinerary"); }
    if (r && confirm("Delete this trip?")) {
      Store.remove(r.dataset.remove);
      if (trip?.id === r.dataset.remove) trip = null;
      renderAll();
    }
  });
  $("#newTripBtn").addEventListener("click", () => showTab("tab-plan"));

  // ---------- init ----------
  renderAll();
})();
