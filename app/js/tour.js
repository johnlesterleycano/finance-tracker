// First-run tour of the Payday screen: a spotlight on the real UI plus a step card. Both are manual popovers, so the page
// stays usable (people can tick a bill mid-tour). Offered once per device; replayed from Trends & setup.
import { pid, todayISO } from "./format.js";
import { currentPeriodId } from "./calc.js";
import { S } from "./store.js";
import { ui, app } from "./app.js";
import { G } from "./motion.js";

const KEY = "money-plan-tour-v1";
const wide = () => matchMedia("(min-width: 900px)").matches;
// storage blocked: treat as seen so the tour never nags on every load (replay still works)
const seen = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, "done"); } catch {} };

const STEPS = [
  { sel: ".hero-band", title: "What's left to assign", text: () => "Your income minus bills, savings and spending money. Aim to bring it close to zero so every peso has a job. Anything left carries into the next payday." },
  { sel: "#billsCard", title: "Tick bills as you pay them", text: () => `Select the circle next to a bill once it's paid. ${wide() ? "Hover over a bill" : "Swipe a bill left"} for Part paid and Edit. Go ahead and try it: the tour waits.` },
  { sel: "#savingsCard", title: "Move money into your funds", text: () => "Tick a transfer once the money has really moved. Only ticked transfers count towards a fund's balance." },
  { sel: "#spendCard", title: "Log everyday spending", text: () => "Set a budget for groceries, gas and eating out until the next payday, then add what you spend. Anything over the budget comes out of what's left to assign." },
  { sel: ".top-row", title: "Switch paydays and months", text: () => `Every month has a 15th and a 30th plan: pick one with the switch. Use the arrows at the top right to change month${wide() ? ", or press ← and →" : ""}.` },
  { sel: ".side-nav, #tabbar", title: "Four sections", text: () => `Month compares both paydays and suggests how to balance them. Funds & loans tracks savings and debts. Trends & setup holds your recurring bills, income and rules.${wide() ? " Keys 1 to 4 switch sections." : ""}` },
  { sel: ".sync", title: "It saves as you go", text: () => "This shows where your plan is saved and whether it's synced. Replay this tour any time from Trends & setup." }
];

// Where the card goes: below the target, else above, else to its right, else along the bottom edge. r is the target's rect.
function placeCard(r, cw, ch, vw, vh, M = 16, gap = 14) {
  const clampX = x => Math.min(Math.max(x, M), vw - cw - M), clampY = y => Math.min(Math.max(y, M), vh - ch - M);
  if (!r) return { x: clampX((vw - cw) / 2), y: clampY((vh - ch) / 2) };
  if (r.bottom + gap + ch <= vh - M) return { x: clampX(r.left), y: r.bottom + gap };
  if (r.top - gap - ch >= M) return { x: clampX(r.left), y: r.top - gap - ch };
  if (r.right + gap + cw <= vw - M) return { x: r.right + gap, y: clampY(r.top) };
  return { x: clampX(r.left), y: vh - ch - M };
}

const visible = sel => [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width > 0);
let T = null, offerT;

function bring(el) {
  if (el.closest(".top, .side, .tabs")) return false; // sticky or fixed: already on screen
  const r = el.getBoundingClientRect(), head = document.querySelector(".top").getBoundingClientRect().bottom;
  const foot = document.querySelector(".tabs-in").getBoundingClientRect().top || innerHeight, room = foot - head;
  const dy = r.height + 32 < room ? r.top - head - (room - r.height) / 2 : r.top - head - 16;
  if (Math.abs(dy) < 4) return false;
  window.scrollTo({ top: scrollY + dy, behavior: G() ? "smooth" : "auto" });
  return true;
}

function place() {
  const el = visible(STEPS[T.i].sel), c = T.card, sp = T.spot;
  const r = el?.getBoundingClientRect();
  sp.style.visibility = r ? "visible" : "hidden";
  if (r) {
    const pad = 6, rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    Object.assign(sp.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px", borderRadius: rad + pad + "px" });
  }
  const { x, y } = placeCard(r, c.offsetWidth, c.offsetHeight, document.documentElement.clientWidth, innerHeight);
  c.style.left = x + "px"; c.style.top = y + "px";
}

function show(i) {
  if (ui.tab !== "payday") app.goTab("payday"); // the tour lives on the Payday screen
  T.i = i;
  const s = STEPS[i], c = T.card, last = i === STEPS.length - 1;
  c.querySelector("#tourTitle").textContent = s.title;
  c.querySelector("#tourText").textContent = s.text();
  c.querySelector("#tourCount").textContent = `${i + 1} of ${STEPS.length}`;
  c.querySelector("[data-t=back]").hidden = i === 0;
  c.querySelector("[data-t=next]").textContent = last ? "Done" : "Next";
  const el = visible(s.sel), scrolled = el && bring(el);
  // glide the ring between steps, but not while the page scrolls under it
  T.spot.classList.toggle("moving", !scrolled); clearTimeout(T.mt); T.mt = setTimeout(() => T.spot.classList.remove("moving"), 500);
  G()?.fromTo(c, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
  c.querySelector("[data-t=next]").focus({ preventScroll: true });
}

function end() {
  if (!T) return;
  markSeen();
  cancelAnimationFrame(T.raf); clearTimeout(T.mt);
  document.removeEventListener("keydown", T.onEsc);
  T.spot.remove(); T.card.remove(); T = null;
  document.querySelector("#view").focus({ preventScroll: true });
}

export function startTour() {
  if (T) return;
  const spot = document.createElement("div"), card = document.createElement("div");
  spot.className = "tour-spot"; spot.setAttribute("popover", "manual"); spot.setAttribute("aria-hidden", "true");
  card.className = "tour-card"; card.setAttribute("popover", "manual"); card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "tourTitle"); card.setAttribute("aria-describedby", "tourText");
  card.innerHTML = `<div class="tour-head"><h2 id="tourTitle"></h2><button type="button" class="tour-skip" data-t="skip">Skip tour</button></div>
    <p id="tourText" aria-live="polite"></p>
    <div class="tour-foot"><span class="tour-count" id="tourCount"></span><button type="button" class="btn ghost small" data-t="back">Back</button><button type="button" class="btn small" data-t="next">Next</button></div>`;
  document.body.append(spot, card);
  spot.showPopover?.(); card.showPopover?.();
  const go = d => { const i = T.i + d; if (i < 0) return; if (i >= STEPS.length) end(); else show(i); };
  card.addEventListener("click", e => { const t = e.target.closest("[data-t]")?.dataset.t; if (t === "skip") end(); else if (t === "next") go(1); else if (t === "back") go(-1); });
  // arrows step the tour while focus is in the card; preventDefault keeps them from also changing month
  card.addEventListener("keydown", e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(e.key === "ArrowRight" ? 1 : -1); } });
  T = { i: 0, spot, card, onEsc: e => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) { e.preventDefault(); end(); } } };
  document.addEventListener("keydown", T.onEsc);
  show(0);
  const loop = () => { place(); T.raf = requestAnimationFrame(loop); }; // follows scrolling, re-renders and resizes
  loop();
}

// After a render: the first time someone sees a real Payday plan on this device, start the tour once the view has settled.
export function offerTour() {
  if (T || seen() || ui.tab !== "payday") return;
  clearTimeout(offerT);
  offerT = setTimeout(() => { if (!T && !seen() && ui.tab === "payday" && document.querySelector("#view #billsCard") && !document.querySelector("dialog[open]")) startTour(); }, 700);
}

// From Trends & setup: open a payday that has a plan, then run the tour.
export function replayTour() {
  if (!S.periods[pid(ui.month, ui.half)]) {
    const ids = Object.keys(S.periods).sort(), id = ids.filter(x => x <= currentPeriodId(todayISO())).pop() || ids[0];
    if (!id) return;
    ui.month = id.slice(0, 7); ui.half = id.endsWith("15") ? 1 : 2;
  }
  app.goTab("payday");
  setTimeout(startTour, 450);
}
