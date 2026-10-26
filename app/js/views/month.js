import { esc, peso0, pct, amt0, mLabel, pid } from "../format.js";
import { chain, monthData, loadLabel, unLabel, balanceSuggest } from "../calc.js";
import { S } from "../store.js";
import { ui } from "../app.js";
import { ic, catColor, empty } from "./common.js";
import { chartHalves, chartDonut, chartPaid } from "../charts.js";

const dayName = d => d === "15" ? "15th" : "30th";

function balanceCard() {
  const sug = balanceSuggest(S), st = S.settings;
  const noInc = !st.incomes.some(i => i.a15) || !st.incomes.some(i => i.a30);
  const body = noInc ? `<p class="muted" style="margin:0">Add your usual income for both paydays (Trends › Income sources) to get suggestions.</p>`
    : !sug.length ? `<p class="muted" style="margin:0">Your recurring bills are already spread evenly between the 15th and the 30th.</p>`
    : `<p class="muted" style="margin:0 0 6px">Bills take <b>${pct(sug[0].before15)}</b> of the 15th and <b>${pct(sug[0].before30)}</b> of the 30th. These moves even it out:</p>
      <div class="list">${sug.map(s => `<div class="row" data-flip-id="sg-${esc(s.id)}"><div class="row-main"><span class="row-name">Move ${esc(s.name)} to the ${dayName(s.to)}</span><span class="row-meta">${peso0(s.amount)} · then 15th ${pct(s.load15)}, 30th ${pct(s.load30)}</span></div><button class="btn small" data-act="apply-suggest" data-id="${esc(s.id)}" data-to="${s.to}">Apply</button></div>`).join("")}</div>
      <p class="note">Only bills whose due day still fits the new payday are suggested. Applying changes new plans, not ones you've made.</p>`;
  return `<section class="card anim"><div class="card-head"><h2>Balance my paydays</h2></div>${body}</section>`;
}

export function viewMonth() {
  const m = ui.month, d = monthData(S, m, chain(S)), st = S.settings;
  if (!d.a && !d.b) return empty("", `Nothing planned for ${esc(mLabel(m))}`, "Create the 15th and 30th plans from your recurring bills and funds.", `<button class="btn" data-act="create-month">${ic.plus} Create ${esc(mLabel(m))}</button>`) + balanceCard();
  const ratio = (x, y) => y ? x / y : 0;
  const row = (name, fa, fb, fm, f = amt0, cls = "") => `<tr class="${cls}"><td>${name}</td><td class="money">${f(fa)}</td><td class="money">${f(fb)}</td><td class="money">${f(fm)}</td></tr>`;
  const qc = (name, r) => { const [l, c] = loadLabel(r, st); return `<div class="check-row"><span>${name} <span class="muted">${pct(r)}</span></span><span class="chip ${c}">${l}</span></div>`; };
  const [ul, uc] = unLabel(d.un, d.inc, st);
  const cats = {};
  for (const p of [S.periods[pid(m, 1)], S.periods[pid(m, 2)]].filter(Boolean)) for (const bl of p.bills) cats[bl.category || "Other"] = (cats[bl.category || "Other"] || 0) + (+bl.amount || 0);
  const segs = Object.entries(cats).filter(([, v]) => v > 0).map(([k, v]) => ({ k, v, c: catColor(k) }));
  segs.push({ k: "Savings plan", v: d.save, c: "var(--c6)" });
  if (d.env > 0) segs.push({ k: "Spending money", v: d.env, c: "var(--c2)" });
  const unalloc = Math.max(0, d.inc - d.bills - d.save - d.env); if (unalloc > 0) segs.push({ k: "Unallocated", v: unalloc, c: "var(--c7)" });
  return `<div class="grid two">
   <div class="grid">
    <section class="card anim">
      <div class="card-head"><h2>Month at a glance</h2><span class="chip ${uc}">${ul}</span></div>
      <div class="scroll-x"><table class="glance">
        <thead><tr><th scope="col">₱</th><th scope="col">15th</th><th scope="col">30th</th><th scope="col">Month</th></tr></thead>
        <tbody>
        ${row("Income", d.A.inc, d.B.inc, d.inc)}
        ${row("Bills", d.A.bills, d.B.bills, d.bills)}
        ${row("Left after bills", d.A.left, d.B.left, d.left, amt0, "strong")}
        ${row("Savings plan", d.A.save, d.B.save, d.save)}
        ${d.env ? row("Spending money", d.A.env, d.B.env, d.env) : ""}
        ${st.carryOver ? row("Carried in", d.A.cin, d.B.cin, d.cin) : ""}
        ${row("Unallocated cash", d.A.un, d.B.un, d.un, amt0, "strong")}
        ${row("Bills as % of income", ratio(d.A.bills, d.A.inc), ratio(d.B.bills, d.B.inc), ratio(d.bills, d.inc), pct)}
        ${row("Bills paid so far", ratio(d.A.paid, d.A.bills), ratio(d.B.paid, d.B.bills), ratio(d.paid, d.bills), pct)}
        </tbody></table></div>
      ${!d.a || !d.b ? `<button class="add" data-act="create-month">${ic.plus} Create the missing payday</button>` : ""}
    </section>
    <section class="card anim">
      <div class="card-head"><h2>Quick check</h2></div>
      <div class="checks">
        ${qc("15th bills load", ratio(d.A.bills, d.A.inc))}
        ${qc("30th bills load", ratio(d.B.bills, d.B.inc))}
        ${qc("Whole month bills load", ratio(d.bills, d.inc))}
        <div class="check-row"><span>Savings rate <span class="muted">plan ÷ income</span></span><b>${pct(ratio(d.save, d.inc))}</b></div>
        <div class="check-row"><span>Still to pay this month</span><b class="money">${peso0(d.bills - d.paid)}</b></div>
      </div>
      <p class="note">Comfortable up to ${pct(st.comfortable)} of income, Tight above ${pct(st.tight)}. Change these in Trends › Rules.</p>
    </section>
    ${balanceCard()}
   </div>
   <div class="grid">
    <section class="card anim"><div class="card-head"><h2>Income vs bills vs savings</h2></div>${chartHalves(d)}</section>
    <section class="card anim"><div class="card-head"><h2>Where the month's income goes</h2></div>${chartDonut(segs, d.inc)}</section>
    <section class="card anim"><div class="card-head"><h2>Bills: paid vs still to pay</h2></div>${chartPaid(d)}</section>
   </div>
  </div>`;
}
