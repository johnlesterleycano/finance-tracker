import { mLabel, todayISO } from "./format.js";
import { currentPeriodId } from "./calc.js";
import { S, sync, init, on, useLocal, useSheet, refresh } from "./store.js";
import { ui, app } from "./app.js";
import { A } from "./actions.js";
import { initMotion, animateView, placePill } from "./motion.js";
import { fld } from "./forms.js";
import { viewPayday } from "./views/payday.js";
import { viewMonth } from "./views/month.js";
import { viewFunds } from "./views/funds.js";
import { viewTrends } from "./views/trends.js";

// GitHub Pages can't send X-Frame-Options, so refuse to run inside someone else's frame (clickjacking)
if (window.top !== window.self) { document.body.textContent = "This page can't be shown inside another site."; throw new Error("framed"); }

const $ = s => document.querySelector(s);
const TABS = ["payday", "month", "funds", "more"];
const VIEWS = { payday: viewPayday, month: viewMonth, funds: viewFunds, more: viewTrends };
const SETUP_GUIDE = "https://github.com/johnlesterleycano/finance-tracker/blob/main/docs/SETUP.md";

function render(kind = "update", dir = 1) {
  if (S.mode === "none" || ui.connecting) { showConnect(); return; }
  if (!ui.month) return;
  document.body.dataset.screen = "app";
  $("#monthTitle").textContent = mLabel(ui.month);
  $("#halfSeg").hidden = ui.tab !== "payday";
  document.querySelectorAll("#halfSeg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.half === ui.half)));
  document.querySelectorAll("#tabbar button").forEach(b => { if (b.dataset.tab === ui.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = $("#view"), y = window.scrollY;
  v.innerHTML = VIEWS[ui.tab]();
  window.scrollTo(0, kind === "update" ? y : 0);
  placePills(kind !== "update");
  animateView(v, kind, dir);
}
function placePills(animate) {
  const seg = $("#halfSeg");
  if (!seg.hidden) placePill($("#segPill"), seg.querySelector('[aria-pressed="true"]'), animate);
  placePill($("#tabBlob"), $("#tabbar [aria-current='page']"), animate);
}

function boot() {
  if (S.mode === "none" || ui.connecting) { showConnect(); return; }
  const cur = currentPeriodId(todayISO()), ids = Object.keys(S.periods).sort();
  const open = ids.find(id => id >= cur && S.periods[id].bills.some(b => b.status !== "paid")) || ids.filter(id => id <= cur).pop() || ids[0] || cur;
  const fromHash = (location.hash || "").slice(1);
  if (TABS.includes(fromHash)) ui.tab = fromHash;
  ui.month = open.slice(0, 7); ui.half = open.endsWith("15") ? 1 : 2;
  setSync();
  render("enter");
}

function showConnect(message = "") {
  document.body.dataset.screen = "connect";
  $("#monthTitle").textContent = "Your money plan";
  $("#view").innerHTML = `<section class="card connect anim" aria-labelledby="connectTitle">
    <span class="eyebrow">Get started</span><h2 id="connectTitle">Where should your plan live?</h2>
    <p class="muted">Connect the Google Sheet you set up to sync between phones, or keep everything in this browser.</p>
    <form id="connectForm" class="form" novalidate>
      <input type="text" name="username" autocomplete="username" value="Payday Money Plan" hidden>
      ${fld("Google Sheet web app link", "url", "", "url", 'placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false" required')}
      ${fld("Passcode", "pass", "", "password", 'autocomplete="current-password" required')}
      <p class="note connect-msg" id="connectMsg" role="alert">${message}</p>
      <button class="btn" type="submit">Connect my Sheet</button>
    </form>
    <div class="or"><span>or</span></div>
    ${S.mode === "none" ? `<button class="btn ghost" data-act="use-local" style="width:100%">Use on this device only</button>` : ""}
    ${S.mode !== "none" ? `<button class="btn ghost" data-act="connect-back" style="width:100%">Back to my plan</button>` : ""}
    <p class="note">New here? Follow the <a href="${SETUP_GUIDE}" target="_blank" rel="noopener noreferrer">setup guide</a> to make your Sheet. Your passcode is never stored on this device.</p>
  </section>`;
  animateView($("#view"), "enter");
  const form = $("#connectForm"), msg = $("#connectMsg"), btn = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(form);
    btn.disabled = true; btn.textContent = "Connecting…"; msg.textContent = "";
    try {
      const r = await useSheet(fd.get("url"), fd.get("pass"));
      ui.connecting = false; boot();
      toast(r.uploaded ? "Connected. Uploading this device's plan to your Sheet" : r.keptLocal ? "Connected. Your Sheet already had a plan, so it's shown instead of this device's" : "Connected to your Sheet");
    }
    catch (err) {
      msg.textContent = { url: "Paste the web app link that ends in /exec.", passcode: "That passcode didn't match.", locked: "Too many wrong tries. Wait 15 minutes and try again.", setup: "The Sheet isn't set up yet: set a PASSCODE of 10+ characters in the script, then run setup.", network: "Couldn't reach the Sheet. Check your connection and the link." }[err.code] || err.message || "Something went wrong. Try again.";
      btn.disabled = false; btn.textContent = "Connect my Sheet";
    }
  });
}

function setSync() {
  const el = $("#sync"), w = sync.waiting;
  const [cls, label] = S.mode === "local" ? ["local", "Saved on this device"]
    : sync.state === "syncing" ? ["busy", "Syncing…"]
    : sync.state === "saving" ? ["busy", "Saving" + (w ? " · " + w : "") + "…"]
    : sync.state === "offline" ? ["warn", "Offline" + (w ? " · " + w + " waiting" : "")]
    : sync.state === "signed-out" ? ["bad", "Signed out · tap to connect"]
    : ["", "Synced to your Sheet"];
  el.className = "sync " + cls;
  el.querySelector("span").textContent = label;
  el.title = sync.message || label;
}

let toastT;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  const g = window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches ? window.gsap : null;
  if (g) g.fromTo(el, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" });
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2800);
}

Object.assign(app, { render, toast, boot, connect: () => { ui.connecting = true; showConnect(); } });
A["use-local"] = () => { ui.connecting = false; useLocal(); boot(); };
A["connect-back"] = () => { ui.connecting = false; boot(); };
on("status", setSync);
on("data", () => render());
on("toast", toast);

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t) {
    const to = t.dataset.tab, dir = TABS.indexOf(to) >= TABS.indexOf(ui.tab) ? 1 : -1;
    if (to === ui.tab) return;
    ui.tab = to;
    try { history.replaceState(null, "", "#" + to); } catch {}
    window.scrollTo({ top: 0 });
    render("slide", dir);
    return;
  }
  if (e.target.closest("#sync")) { if (sync.state === "signed-out") app.connect(); else if (S.mode === "sheet") A["sync-now"](); return; }
  const a = e.target.closest("[data-act]");
  if (a && A[a.dataset.act] && !a.disabled) { e.preventDefault(); A[a.dataset.act](a); }
});
document.addEventListener("change", e => { const a = e.target.closest("[data-act-change]"); if (a && A[a.dataset.actChange]) A[a.dataset.actChange](a); });
// keyboard focus on a swiped-open row's main content slides the row closed again
document.addEventListener("focusin", e => { const row = e.target.closest(".swipe > .row"); if (row && e.target.matches(":focus-visible")) row.parentElement.scrollTo({ left: 0 }); });
window.addEventListener("resize", () => placePills(false));

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});

initMotion();
init();
boot();
if (S.mode === "sheet") refresh();
