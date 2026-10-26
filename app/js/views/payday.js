import { esc, peso, peso0, pct, mLabel, mAdd, pid, fmtDate, todayISO } from "../format.js";
import { chain, loadLabel, unLabel, dueStatus, bankCheck, currentPeriodId } from "../calc.js";
import { S } from "../store.js";
import { ui } from "../app.js";
import { ic, catColor, empty } from "./common.js";

const halfLabel = h => (h == 1 ? "15th" : "30th");
const periodLabel = id => mLabel(id.slice(0, 7)) + " · " + (id.endsWith("15") ? "15th" : "30th");

function getStarted() {
  const st = S.settings, incOK = st.incomes.some(i => i.a15 || i.a30), recN = Object.keys(S.recurring).length, fundN = Object.keys(S.funds).length;
  const step = (n, done, title, body) => `<li class="step ${done ? "done" : ""}"><span class="step-n" aria-hidden="true">${done ? ic.check : n}</span><div class="step-body"><b>${title}</b>${done ? '<span class="sr-only"> (done)</span>' : ""}${body}</div></li>`;
  const cur = currentPeriodId(todayISO());
  return `<div class="grid start-grid"><section class="hero anim"><span class="eyebrow">Welcome</span><div class="hero-big" style="font-size:32px">Let's set up your money plan</div><div class="hero-sub">Four quick steps. You can change everything later in Trends › Setup.</div></section>
  <section class="card anim"><ol class="steps">
    ${step(1, incOK, "Your income on each payday", `<div class="list">${st.incomes.map((x, i) => `<div class="row"><button class="row-main" data-act="edit-src" data-i="${i}"><span class="row-name">${esc(x.name || "Income")}</span><span class="row-meta">${peso0(x.a15)} on 15th · ${peso0(x.a30)} on 30th</span></button></div>`).join("")}</div><button class="add" data-act="add-src">${ic.plus} Add income source</button>`)}
    ${step(2, recN > 0, "Bills you pay every month", `<p class="muted">${recN ? recN + " recurring bill" + (recN > 1 ? "s" : "") + " added." : "Cards, loans, rent, utilities, allowances. Pick which payday pays each one."}</p><button class="add" data-act="add-rec">${ic.plus} Add a recurring bill</button>`)}
    ${step(3, fundN > 0, "Savings funds (optional)", `<p class="muted">${fundN ? fundN + " fund" + (fundN > 1 ? "s" : "") + " added." : "An emergency fund, a sinking fund for yearly costs, or any goal."}</p><button class="add" data-act="add-fund">${ic.plus} Add a fund</button>`)}
    ${step(4, false, "Create your first payday plan", `<p class="muted">Builds the ${halfLabel(cur.endsWith("15") ? 1 : 2)} plan for ${esc(mLabel(cur.slice(0, 7)))} from the steps above.</p><button class="btn" data-act="create-first" ${incOK ? "" : "disabled"}>${ic.plus} Create my first plan</button>${incOK ? "" : '<p class="note">Add your income first.</p>'}`)}
  </ol></section></div>`;
}

function dueSoon(today) {
  const cur = currentPeriodId(today), rows = [];
  for (const [id, p] of Object.entries(S.periods)) {
    if (id > cur && id !== nextId(cur)) continue;
    for (const b of p.bills) { const d = dueStatus(b, today); if (d && d.days <= 3) rows.push({ id, b, d }); }
  }
  if (!rows.length) return "";
  rows.sort((a, b) => a.d.days - b.d.days);
  return `<section class="card anim due-card" aria-label="Bills due soon"><div class="card-head"><h2>Due soon</h2><span class="chip ${rows.some(r => r.d.cls === "bad") ? "bad" : "warn"}">${rows.length} bill${rows.length > 1 ? "s" : ""}</span></div>
    <div class="list">${rows.slice(0, 6).map(r => `<div class="row"><button class="row-main" data-act="jump-period" data-id="${esc(r.id)}"><span class="row-name">${esc(r.b.name)}</span><span class="row-meta">${esc(periodLabel(r.id))} · ${peso0(r.b.amount)}</span></button><span class="chip ${r.d.cls}">${esc(r.d.label)}</span></div>`).join("")}</div></section>`;
}
const nextId = id => id.endsWith("15") ? id.slice(0, 7) + "-30" : mAdd(id.slice(0, 7), 1) + "-15";

function billRow(b, today) {
  const st = b.status, due = dueStatus(b, today);
  const meta = [b.category, st === "paid" && b.paidDate ? "paid " + fmtDate(b.paidDate) : "", st === "partial" ? peso0(b.paidAmount) + " paid" : "", b.notes].filter(Boolean).join(" · ");
  return `<div class="swipe" data-flip-id="${esc(b.id)}">
    <div class="row ${st === "paid" ? "done" : ""}">
      <button class="check ${st === "paid" ? "on" : st === "partial" ? "part" : ""}" data-act="toggle-bill" data-id="${esc(b.id)}" aria-label="Mark ${esc(b.name)} ${st === "paid" ? "unpaid" : "paid"}">${ic.check}</button>
      <button class="row-main" data-act="edit-bill" data-id="${esc(b.id)}"><span class="row-name">${esc(b.name)}</span><span class="row-meta"><span class="dot" style="background:${catColor(b.category)}"></span> ${due ? `<span class="chip tiny ${due.cls}">${esc(due.label)}</span> ` : ""}${esc(meta)}</span></button>
      <span class="row-amt money">${peso(b.amount)}</span>
    </div>
    <div class="swipe-actions" role="group" aria-label="More for ${esc(b.name)}">
      <button class="sa-paid" data-act="toggle-bill" data-id="${esc(b.id)}">${st === "paid" ? "Unpaid" : "Paid"}</button>
      <button class="sa-part" data-act="bill-partial" data-id="${esc(b.id)}">Part paid</button>
      <button class="sa-edit" data-act="edit-bill" data-id="${esc(b.id)}">Edit</button>
    </div>
  </div>`;
}

export function viewPayday() {
  const id = pid(ui.month, ui.half), p = S.periods[id], label = halfLabel(ui.half) + " payday", today = todayISO();
  if (!Object.keys(S.periods).length) return getStarted();
  if (!p) return dueSoon(today) + empty(`${esc(mLabel(ui.month))} · ${label}`, "No plan for this payday yet", "Create it from your recurring bills, income and savings funds. You can change any amount afterwards.", `<button class="btn" data-act="create-period">${ic.plus} Create ${halfLabel(ui.half)} plan</button>`);
  const c = chain(S)[id], st = S.settings, [ll, lc] = loadLabel(c.inc ? c.bills / c.inc : 0, st), [ul, uc] = unLabel(c.un, c.inc, st);
  const paidPct = c.bills ? c.paid / c.bills : 0;
  const unpaid = p.bills.filter(b => b.status !== "paid"), paid = p.bills.filter(b => b.status === "paid");
  const sav = p.savings.map(s => `<div class="row ${s.moved ? "done" : ""}" data-flip-id="${esc(s.id)}"><button class="check ${s.moved ? "on" : ""}" data-act="toggle-save" data-id="${esc(s.id)}" aria-label="Mark ${esc(s.name)} ${s.moved ? "not moved" : "moved"}">${ic.check}</button><button class="row-main" data-act="edit-save" data-id="${esc(s.id)}"><span class="row-name">${esc(s.name)}</span><span class="row-meta">${s.moved ? "Moved to fund" : "To move"}</span></button><span class="row-amt money">${peso(s.amount)}</span></div>`).join("");
  const incs = p.incomes.map((x, i) => `<div class="row"><button class="row-main" data-act="edit-income" data-i="${i}"><span class="row-name">${esc(x.name)}</span><span class="row-meta">Change amount</span></button><span class="row-amt money">${peso(x.amount)}</span></div>`).join("");
  const sp = p.spending, envLeft = sp.budget - c.spent, envPct = sp.budget ? Math.min(1, c.spent / sp.budget) : 0;
  const exp = sp.expenses.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => `<div class="row"><button class="row-main" data-act="edit-expense" data-id="${esc(e.id)}"><span class="row-name">${esc(e.note || "Expense")}</span><span class="row-meta">${esc(fmtDate(e.date))}</span></button><span class="row-amt money">${peso(e.amount)}</span></div>`).join("");
  const bank = bankCheck(S, id);
  const gapChip = !bank || bank.first ? "" : Math.abs(bank.gap) < 1 ? `<span class="chip good">Matches the plan</span>` : bank.gap < 0 ? `<span class="chip warn">${peso0(-bank.gap)} not in the plan</span>` : `<span class="chip soft">${peso0(bank.gap)} more than planned</span>`;
  return `${dueSoon(today)}
    <section class="hero hero-band anim" aria-label="Payday summary">
      <div class="hero-main"><div class="hero-top"><span class="eyebrow">${label} · ${esc(fmtDate(p.payDate))}</span><span class="chip ${uc}">${ul}</span></div>
      <div class="hero-big money" data-count="${c.un}" data-key="pd-un">${peso0(c.un)}</div>
      <div class="hero-sub">left to assign after bills, savings and spending${c.cin ? ` · includes ${peso0(c.cin)} carried in` : ""}</div></div>
      <div class="hero-stats">
        <div><b class="money" data-count="${c.inc}" data-key="pd-inc">${peso0(c.inc)}</b><span>Income</span></div>
        <div><b class="money" data-count="${c.bills}" data-key="pd-bills">${peso0(c.bills)}</b><span>Bills · ${pct(c.inc ? c.bills / c.inc : 0)}</span></div>
        <div><b class="money" data-count="${c.save}" data-key="pd-save">${peso0(c.save)}</b><span>Savings</span></div>
        <div><b class="money" data-count="${c.env}" data-key="pd-spend">${peso0(c.env)}</b><span>Spending money</span></div>
      </div>
    </section>
  <div class="pd">
   <div class="grid pd-a">
    <section class="card anim" id="billsCard">
      <div class="card-head"><h2>Bills</h2><span class="chip ${lc}">${ll} load</span></div>
      <div class="paid-line"><span class="muted">${peso0(c.paid)} paid of ${peso0(c.bills)}</span><b>${pct(paidPct)}</b></div>
      <div class="progress"><i data-w="${Math.round(paidPct * 100)}"></i></div>
      <div class="list" style="margin-top:8px">${unpaid.map(b => billRow(b, today)).join("") || (p.bills.length ? '<p class="muted all-paid">Every bill is paid.</p>' : '<p class="muted" style="margin:12px 0 0">No bills yet.</p>')}</div>
      ${paid.length ? `<div class="eyebrow" style="margin-top:12px">Paid</div><div class="list">${paid.map(b => billRow(b, today)).join("")}</div>` : ""}
      <button class="add" data-act="add-bill">${ic.plus} Add bill</button>
      <p class="note swipe-hint">Swipe a bill left for more options.</p>
      <div class="totals"><span>Total bills</span><b class="money">${peso(c.bills)}</b><span>Still to pay</span><b class="money">${peso(c.toPay)}</b></div>
    </section>
   </div>
   <div class="grid pd-b">
    <section class="card anim">
      <div class="card-head"><h2>Spending money</h2><button class="btn ghost small" data-act="edit-envelope">Budget ${peso0(sp.budget)}</button></div>
      ${sp.budget || sp.expenses.length ? `<div class="env-top"><span class="fund-bal money ${envLeft < 0 ? "neg" : ""}" data-count="${envLeft}" data-key="pd-env">${peso0(envLeft)}</span><span class="muted">${envLeft < 0 ? "over budget" : "left until next payday"}</span></div>
      <div class="progress ${envLeft < 0 ? "over" : ""}"><i data-w="${Math.round(envPct * 100)}"></i></div>
      <div class="list" style="margin-top:8px">${exp || '<p class="muted" style="margin:10px 0 0">Nothing spent yet.</p>'}</div>` : `<p class="muted" style="margin:0">Set a budget for groceries, gas and eating out until the next payday, then log what you spend.</p>`}
      <button class="add" data-act="add-expense">${ic.plus} Add expense</button>
    </section>
    <section class="card anim">
      <div class="card-head"><h2>Savings plan</h2><span class="muted small">${peso0(c.left)} left after bills</span></div>
      <div class="list">${sav || '<p class="muted" style="margin:0">Nothing set aside yet.</p>'}</div>
      <button class="add" data-act="add-save">${ic.plus} Add to a fund</button>
      <div class="totals"><span>Total allocated</span><b class="money">${peso(c.save)}</b>${c.env ? `<span>Spending money</span><b class="money">${peso(c.env)}</b>` : ""}${c.cin ? `<span>Carried in</span><b class="money">${peso(c.cin)}</b>` : ""}<span>Unallocated cash</span><b class="money ${c.un < 0 ? "neg" : ""}">${peso(c.un)}</b></div>
    </section>
   </div>
   <div class="grid pd-c">
    <section class="card anim">
      <div class="card-head"><h2>Income</h2><button class="btn ghost small" data-act="edit-paydate">Pay date: ${esc(fmtDate(p.payDate))}</button></div>
      <div class="list">${incs}</div>
      <button class="add" data-act="add-income">${ic.plus} Add income</button>
    </section>
    <section class="card anim">
      <div class="card-head"><h2>Bank check</h2><button class="btn ghost small" data-act="bank-check">${p.bank.balance != null ? "Update" : "Enter balance"}</button></div>
      ${!bank ? `<p class="muted" style="margin:0">Enter what your account holds after your pay arrives and you've ticked what you paid. Next payday the app compares again, to catch spending you forgot to log.</p>`
      : bank.first ? `<div class="checks"><div class="check-row"><span>In the bank ${p.bank.date ? `<span class="muted">${esc(fmtDate(p.bank.date))}</span>` : ""}</span><b class="money">${peso(p.bank.balance)}</b></div><div class="check-row"><span>Starting point</span><span class="chip good">Saved</span></div></div>
      <p class="note">Check again on a later payday: the app compares that balance with this one plus everything you log in between.</p>`
      : `<div class="checks"><div class="check-row"><span>Plan expects <span class="muted">last check + logged since</span></span><b class="money">${peso(bank.expected)}</b></div><div class="check-row"><span>In the bank ${p.bank.date ? `<span class="muted">${esc(fmtDate(p.bank.date))}</span>` : ""}</span><b class="money">${peso(p.bank.balance)}</b></div><div class="check-row"><span>Gap</span>${gapChip}</div></div>
      <p class="note">${bank.gap < -1 ? "Spending or a bill you haven't logged yet? Add it so the plan matches." : bank.gap > 1 ? "Income or a refund you haven't logged? Add it, or move the extra to a fund." : "Everything you logged adds up."}</p>`}
    </section>
    <button class="btn ghost anim" data-act="delete-period" style="justify-self:start">Delete this payday plan</button>
   </div>
  </div>`;
}
