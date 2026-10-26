import { esc, peso, peso0, pct, mLabel, MONTHS, todayISO } from "../format.js";
import { chain, yearlyCost } from "../calc.js";
import { S, sync } from "../store.js";
import { ui } from "../app.js";
import { ic, catColor, HOW_TO } from "./common.js";
import { chartTrend } from "../charts.js";

const plans = () => { const n = Object.keys(S.periods).length; return n + " payday plan" + (n === 1 ? "" : "s"); };
const sortKey = r => r.payday + String(r.order || 0).padStart(4, "0");

export function viewTrends() {
  const rec = Object.values(S.recurring).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const from = todayISO().slice(0, 7), yearly = rec.reduce((t, r) => t + yearlyCost(r, from), 0);
  const rl = day => rec.filter(r => r.payday === day).map(r => {
    // yearly cost right after the category: phones cut the end of this line
    const meta = [r.category, r.active === false ? "paused" : peso0(yearlyCost(r, from)) + " a year", r.dueDay ? "due day " + r.dueDay : "", r.endMonth ? "ends " + mLabel(r.endMonth) : ""].filter(Boolean).join(" · ");
    return `<div class="row ${r.active === false ? "paused" : ""}" data-flip-id="rec-${esc(r._id)}"><button class="row-main" data-act="edit-rec" data-id="${esc(r._id)}"><span class="row-name">${esc(r.name)}</span><span class="row-meta"><span class="dot" style="background:${catColor(r.category)}"></span> ${esc(meta)}</span></button><span class="row-amt money">${peso(r.amount)}</span></div>`;
  }).join("") || '<p class="muted" style="margin:6px 0">None yet.</p>';
  const st = S.settings, theme = window.paydayTheme?.get() || "system";
  const mode = S.mode === "sheet"
    ? `<p class="muted" style="margin:0 0 10px">Saved to your Google Sheet${sync.waiting ? `, ${sync.waiting} change${sync.waiting > 1 ? "s" : ""} waiting to sync` : ""}. ${plans()}. The Sheet's version history (File › Version history) is your backup.</p>
       <div class="data-actions"><button class="btn ghost small" data-act="sync-now">Sync now</button><button class="btn ghost small" data-act="export">Export backup</button><button class="btn ghost small" data-act="sign-out-all">Sign out all devices</button><button class="btn danger small" data-act="forget-device">Forget this device</button></div>`
    : `<p class="muted" style="margin:0 0 10px">Saved in this browser only. ${plans()}. Export a backup now and then, or connect a Google Sheet to use the same plan on your computer and phone.</p>
       <div class="data-actions"><button class="btn ghost small" data-act="export">Export backup</button><label class="btn ghost small file-btn">Restore backup<input type="file" accept="application/json,.json" data-act-change="restore"></label><button class="btn ghost small" data-act="go-connect">Connect a Google Sheet</button><button class="btn danger small" data-act="forget-device">Erase this device</button></div>`;
  return `<div class="st">
  <div class="st-main">
   <section class="card sec anim"><div class="card-head"><h2>Last 12 months</h2><span class="muted small">to ${esc(mLabel(ui.month))}</span></div>${chartTrend(S, ui.month, chain(S))}</section>
   <section class="card sec anim"><div class="card-head"><h2>Recurring bills</h2>${yearly ? `<span class="muted small">${peso0(yearly)} a year</span>` : ""}<button class="btn ghost small" data-act="add-rec">${ic.plus} Bill</button></div>
     <div class="eyebrow" style="margin-top:4px">15th payday</div><div class="list">${rl("15")}</div>
     <div class="eyebrow" style="margin-top:14px">30th payday</div><div class="list">${rl("30")}</div>
     <div class="eyebrow" style="margin-top:14px">Both paydays</div><div class="list">${rl("both")}</div>
     <p class="note">New payday plans copy these. Changing one here doesn't change plans you've already made.</p></section>
   <section class="card sec anim"><div class="card-head"><h2>Income sources</h2><button class="btn ghost small" data-act="add-src">${ic.plus} Source</button></div>
     <div class="list">${st.incomes.map((x, i) => `<div class="row"><button class="row-main" data-act="edit-src" data-i="${i}"><span class="row-name">${esc(x.name)}</span><span class="row-meta">${peso0(x.a15)} on 15th · ${peso0(x.a30)} on 30th</span></button></div>`).join("") || '<p class="muted" style="margin:6px 0">None yet.</p>'}</div></section>
   <section class="card sec anim"><div class="card-head"><h2>Yearly extra income</h2><button class="btn ghost small" data-act="add-extra">${ic.plus} Extra</button></div>
     <div class="list">${st.extras.map(x => `<div class="row"><button class="row-main" data-act="edit-extra" data-id="${esc(x.id)}"><span class="row-name">${esc(x.name)}</span><span class="row-meta">Every ${esc(MONTHS[x.month - 1])}, ${x.payday === "15" ? "15th" : "30th"} payday</span></button><span class="row-amt money">${peso(x.amount)}</span></div>`).join("") || '<p class="muted" style="margin:6px 0">13th month pay, a yearly bonus or a tax refund. It\'s added to that payday\'s plan when you create it.</p>'}</div></section>
   <section class="card sec anim"><div class="card-head"><h2>Rules</h2><button class="btn ghost small" data-act="edit-rules">Edit</button></div>
     <div class="checks">
      <div class="check-row"><span>Comfortable up to</span><b>${pct(st.comfortable)} of income</b></div>
      <div class="check-row"><span>Tight above</span><b>${pct(st.tight)}</b></div>
      <div class="check-row"><span>Alert if unallocated is above</span><b>${pct(st.alert)}</b></div>
      <div class="check-row"><span>Carry leftover to the next payday</span><b>${st.carryOver ? "On" + (st.carryStart ? " from " + esc(mLabel(st.carryStart.slice(0, 7))) : "") : "Off"}</b></div>
      <div class="check-row"><span>Spending money</span><b>${peso0(st.envelope.a15)} / ${peso0(st.envelope.a30)}</b></div>
      <div class="check-row"><span>Categories</span><b class="wrap-right">${esc(st.categories.join(", "))}</b></div>
     </div></section>
  </div>
  <div class="st-rail static">
   <section class="card anim"><h2 style="margin-bottom:6px">Help</h2><p class="muted" style="margin:0 0 10px">A one-minute tour of the Payday screen, or the full guide to every screen.</p>
     <div class="data-actions">${Object.keys(S.periods).length ? '<button class="btn small" data-act="tour">Take the tour</button>' : ""}<a class="btn ghost small" href="${HOW_TO}" target="_blank" rel="noopener noreferrer">How-to guide</a></div></section>
   <section class="card anim"><h2 style="margin-bottom:6px">Your data</h2>${mode}</section>
   <section class="card anim"><h2 style="margin-bottom:10px">Appearance</h2>
     <div class="opts one-row" role="group" aria-label="Theme">${[["system", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<button type="button" data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join("")}</div>
     <p class="note">Saved on this device only, so each person can pick their own.</p></section>
  </div>
</div>`;
}
