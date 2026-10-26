// Everything a tap can do. Each handler changes S through put()/putSettings() and asks for a re-render.
import { esc, peso0, num, uid, todayISO, pid, mAdd, mLabel, MONTHS, isISO, isMonth, fmtDate } from "./format.js";
import { S, put, putSettings, refresh, exportBackup, restoreBackup, signOutAll, forgetDevice } from "./store.js";
import { makePeriod, fundBalance, fundTarget, loanStats, sinkingPerPayday, currentPeriodId } from "./calc.js";
import { ui, app } from "./app.js";
import { openSheet, fld, catSel, sel, opts, check, note } from "./forms.js";
import { pop, flip, sparkle } from "./motion.js";

const curPeriod = () => S.periods[pid(ui.month, ui.half)];
const savePeriod = p => { put("periods", pid(p.month, p.half), p); app.render(); };
const nextOrder = col => Math.max(0, ...Object.values(S[col]).map(x => +x.order || 0)) + 1;
const text = (fd, k) => String(fd.get(k) || "").trim();
const finishedLoans = () => Object.values(S.loans).filter(l => loanStats(l, S, todayISO()).left === 0).length;
const reached = () => new Set(Object.values(S.funds).filter(f => { const t = fundTarget(f, S); return t > 0 && fundBalance(f, S) >= t; }).map(f => f._id));
const inView = sel => document.querySelector("#view " + sel);
const flipId = id => `[data-flip-id="${CSS.escape(id)}"]`;
// select once to arm, again to confirm
const armed = (el, label, go) => { if (el.dataset.armed) { go(); return; } el.dataset.armed = "1"; el.textContent = label; };

function createPeriod(m, h) {
  put("periods", pid(m, h), makePeriod(S, m, h, uid, todayISO()));
  if (!S.settings.carryStart) { S.settings.carryStart = pid(m, h); S.settings.trackFrom = S.settings.trackFrom || pid(m, h); putSettings(); }
}

function toggleBill(id) {
  const p = curPeriod(), b = p?.bills.find(x => x.id === id);
  if (!b) return;
  const wasPaid = b.status === "paid", loansBefore = finishedLoans();
  if (wasPaid) { b.status = "unpaid"; b.paidDate = ""; } else { b.status = "paid"; b.paidDate = b.paidDate || todayISO(); }
  put("periods", pid(p.month, p.half), p);
  flip(() => app.render());
  if (wasPaid) return;
  const chk = inView(flipId(id) + " .check");
  pop(chk);
  if (p.bills.every(x => x.status === "paid")) { sparkle(inView("#billsCard .chip")); app.toast("Every bill on this payday is paid"); }
  if (finishedLoans() > loansBefore) { sparkle(chk); app.toast("That was the last installment. Loan paid off!"); }
}

export const A = {
  "month-prev": () => { ui.month = mAdd(ui.month, -1); app.render("slide", -1); },
  "month-next": () => { ui.month = mAdd(ui.month, 1); app.render("slide", 1); },
  half: el => { const h = +el.dataset.half; if (h === ui.half) return; const dir = h > ui.half ? 1 : -1; ui.half = h; app.render("slide", dir); },
  "jump-period": el => { const id = el.dataset.id; ui.month = id.slice(0, 7); ui.half = id.endsWith("15") ? 1 : 2; ui.tab = "payday"; app.render("enter"); },
  "create-first": () => { const id = currentPeriodId(todayISO()); ui.month = id.slice(0, 7); ui.half = id.endsWith("15") ? 1 : 2; createPeriod(ui.month, ui.half); app.toast("Your first plan is ready"); app.render("enter"); },
  "create-period": () => { createPeriod(ui.month, ui.half); app.toast("Plan created from your recurring bills"); app.render("enter"); },
  "create-month": () => { [1, 2].forEach(h => { if (!S.periods[pid(ui.month, h)]) createPeriod(ui.month, h); }); app.toast(mLabel(ui.month) + " created"); app.render("enter"); },
  "delete-period": el => armed(el, "Select again to delete this plan", () => { put("periods", pid(ui.month, ui.half), null); app.toast("Payday plan deleted"); app.render("enter"); }),
  "toggle-bill": el => toggleBill(el.dataset.id),
  "bill-partial": el => billSheet(curPeriod().bills.find(x => x.id === el.dataset.id), "partial"),
  "toggle-save": el => {
    const p = curPeriod(), s = p.savings.find(x => x.id === el.dataset.id); if (!s) return;
    const before = reached(); s.moved = !s.moved; savePeriod(p);
    const chk = inView(flipId(s.id) + " .check"); if (s.moved) pop(chk);
    const now = reached(); if ([...now].some(id => !before.has(id))) { sparkle(chk); app.toast(s.name + " reached its target"); }
  },
  "edit-bill": el => billSheet(curPeriod().bills.find(x => x.id === el.dataset.id)),
  "add-bill": () => billSheet(null),
  "edit-save": el => saveSheet(curPeriod().savings.find(x => x.id === el.dataset.id)),
  "add-save": () => saveSheet(null),
  "edit-income": el => incomeSheet(+el.dataset.i),
  "add-income": () => incomeSheet(-1),
  "edit-paydate": () => { const p = curPeriod(); openSheet("Pay date", fld("Pay date", "d", p.payDate, "date"), fd => { const d = text(fd, "d"); if (!isISO(d)) { app.toast("Pick a date"); return false; } p.payDate = d; savePeriod(p); }); },
  "add-expense": () => expenseSheet(null),
  "edit-expense": el => expenseSheet(curPeriod().spending.expenses.find(e => e.id === el.dataset.id)),
  "edit-envelope": envelopeSheet,
  "bank-check": bankSheet,
  "apply-suggest": el => {
    const r = S.recurring[el.dataset.id]; if (!r) return;
    flip(() => { put("recurring", r._id, { ...r, payday: el.dataset.to }); app.render(); });
    app.toast(r.name + " now comes from the " + (el.dataset.to === "15" ? "15th" : "30th"));
  },
  "edit-fund": el => fundSheet(S.funds[el.dataset.id]),
  "add-fund": el => fundSheet(null, el?.dataset?.kind || ""),
  "edit-loan": el => loanSheet(S.loans[el.dataset.id]),
  "add-loan": () => loanSheet(null),
  "payoff-method": el => { ui.payoff = el.dataset.m === "snowball" ? "snowball" : "avalanche"; app.render(); },
  "edit-rec": el => recSheet(S.recurring[el.dataset.id]),
  "add-rec": () => recSheet(null),
  "edit-src": el => srcSheet(+el.dataset.i),
  "add-src": () => srcSheet(-1),
  "edit-extra": el => extraSheet(S.settings.extras.find(x => x.id === el.dataset.id)),
  "add-extra": () => extraSheet(null),
  "edit-rules": rulesSheet,
  "sync-now": () => { refresh(); app.toast("Syncing with your Sheet"); },
  export: () => exportBackup(),
  restore: async el => { const f = el.files?.[0]; if (!f) return; try { await restoreBackup(f); app.toast("Backup restored"); app.boot(); } catch (e) { app.toast(e.message || "That file couldn't be read."); } el.value = ""; },
  "sign-out-all": el => armed(el, "Select again: sign out every device", async () => { try { await signOutAll(); } catch { app.toast("Couldn't reach the Sheet. Try again when you're online."); } }),
  "forget-device": el => armed(el, S.mode === "sheet" ? "Select again: remove data from this device" : "Select again: erase everything here", () => forgetDevice()),
  "go-connect": () => app.connect(),
  theme: el => { window.paydayTheme?.set(el.dataset.v); app.render(); }
};

function billSheet(b, forceStatus) {
  const p = curPeriod(), isNew = !b;
  if (!p) return;
  b = b || { id: uid(), name: "", category: S.settings.categories[0], amount: "", status: "unpaid", paidAmount: 0, paidDate: "", dueDate: "", notes: "" };
  const status = forceStatus || b.status || "unpaid";
  openSheet(isNew ? "Add bill" : "Edit bill",
    fld("Bill", "name", b.name, "text", 'required autocomplete="off" maxlength="200"') +
    `<div class="two-col">${fld("Amount (₱)", "amount", b.amount, "number")}${catSel(b.category)}</div>` +
    opts("Status", "status", status, [["unpaid", "Unpaid"], ["partial", "Partly paid"], ["paid", "Paid"]]) +
    `<div class="two-col" id="payFields">${fld("Amount paid (₱)", "paidAmount", b.paidAmount || "", "number")}${fld("Date paid", "paidDate", b.paidDate || todayISO(), "date")}</div>` +
    fld("Due date (optional)", "dueDate", b.dueDate || "", "date") +
    fld("Notes (running bill, GCash, deduction…)", "notes", b.notes || "", "text", 'maxlength="200"') +
    (isNew ? check("repeat", `Repeat on every ${ui.half == 1 ? "15th" : "30th"}`, false) : ""),
    fd => {
      const name = text(fd, "name"); if (!name) { app.toast("Give the bill a name"); return false; }
      const st = fd.get("status"), dueDate = isISO(text(fd, "dueDate")) ? text(fd, "dueDate") : "";
      Object.assign(b, { name, amount: num(fd.get("amount")), category: fd.get("category"), status: st, paidAmount: st === "partial" ? num(fd.get("paidAmount")) : 0, paidDate: st === "unpaid" ? "" : (isISO(text(fd, "paidDate")) ? text(fd, "paidDate") : todayISO()), dueDate, notes: text(fd, "notes") });
      if (isNew) {
        p.bills.push(b);
        if (fd.get("repeat")) { const id = uid(); put("recurring", id, { name, category: b.category, amount: b.amount, payday: ui.half == 1 ? "15" : "30", dueDay: dueDate ? +dueDate.slice(8, 10) : 0, endMonth: "", order: nextOrder("recurring"), active: true }); b.recurringId = id; }
      }
      savePeriod(p);
    },
    { del: isNew ? null : () => { p.bills = p.bills.filter(x => x.id !== b.id); savePeriod(p); },
      onReady: f => { const sync = () => { const s = f.querySelector("[name=status]").value; f.querySelector("#payFields").hidden = s === "unpaid"; f.querySelector("#f_paidAmount").closest(".field").hidden = s !== "partial"; }; f.querySelector("[name=status]").addEventListener("change", sync); sync(); if (forceStatus) f.querySelector("#f_paidAmount").focus(); },
      noFocus: !!forceStatus });
}

function saveSheet(s) {
  const p = curPeriod(), isNew = !s, funds = Object.values(S.funds).sort((a, b) => (a.order || 0) - (b.order || 0));
  s = s || { id: uid(), fundId: funds[0]?._id || "", name: "", amount: "", moved: false };
  openSheet(isNew ? "Add to a fund" : "Edit savings",
    sel("Fund", "fund", s.fundId, funds.map(f => [f._id, f.name]).concat([["", "Other (type a name)"]])) +
    fld("Name (if Other)", "name", s.fundId ? "" : s.name, "text", 'maxlength="200"') + fld("Amount (₱)", "amount", s.amount, "number") +
    check("moved", "Already moved to the fund", s.moved),
    fd => {
      const fid = String(fd.get("fund") || ""), name = fid && S.funds[fid] ? S.funds[fid].name : text(fd, "name");
      if (!name) { app.toast("Pick a fund or type a name"); return false; }
      Object.assign(s, { fundId: S.funds[fid] ? fid : "", name, amount: num(fd.get("amount")), moved: !!fd.get("moved") });
      if (isNew) p.savings.push(s); savePeriod(p);
    },
    { del: isNew ? null : () => { p.savings = p.savings.filter(x => x.id !== s.id); savePeriod(p); } });
}

function incomeSheet(i) {
  const p = curPeriod(), isNew = i < 0, x = isNew ? { name: "", amount: "" } : p.incomes[i];
  openSheet(isNew ? "Add income" : "Edit income", fld("Name", "name", x.name, "text", 'required maxlength="200"') + fld("Amount (₱)", "amount", x.amount, "number"),
    fd => { const v = { name: text(fd, "name") || "Income", amount: num(fd.get("amount")) }; if (isNew) p.incomes.push(v); else p.incomes[i] = v; savePeriod(p); },
    { del: isNew ? null : () => { p.incomes.splice(i, 1); savePeriod(p); }, noFocus: !isNew });
}

function expenseSheet(e) {
  const p = curPeriod(), isNew = !e;
  e = e || { id: uid(), date: todayISO(), amount: "", note: "" };
  openSheet(isNew ? "Add expense" : "Edit expense",
    `<div class="two-col">${fld("Amount (₱)", "amount", e.amount, "number", "required")}${fld("Date", "date", e.date, "date")}</div>` + fld("What for (groceries, gas…)", "note", e.note, "text", 'maxlength="200"'),
    fd => {
      const amount = num(fd.get("amount")); if (!amount) { app.toast("Enter the amount"); return false; }
      Object.assign(e, { amount, date: isISO(text(fd, "date")) ? text(fd, "date") : todayISO(), note: text(fd, "note") });
      if (isNew) p.spending.expenses.push(e); savePeriod(p);
    },
    { del: isNew ? null : () => { p.spending.expenses = p.spending.expenses.filter(x => x.id !== e.id); savePeriod(p); } });
}

function envelopeSheet() {
  const p = curPeriod(), key = ui.half == 1 ? "a15" : "a30", day = ui.half == 1 ? "15th" : "30th";
  openSheet("Spending money", fld("Budget until the next payday (₱)", "budget", p.spending.budget || "", "number") +
    check("def", `Use this for every ${day} payday`, S.settings.envelope[key] === p.spending.budget && p.spending.budget > 0) +
    note("The budget is set aside like a bill. If you spend more, the extra comes out of unallocated cash."),
    fd => { const v = Math.max(0, num(fd.get("budget"))); p.spending.budget = v; if (fd.get("def")) { S.settings.envelope[key] = v; putSettings(); } savePeriod(p); });
}

function bankSheet() {
  const p = curPeriod();
  openSheet("Bank check", `<div class="two-col">${fld("Balance right now (₱)", "bal", p.bank.balance ?? "", "number", "required")}${fld("Checked on", "date", p.bank.date || todayISO(), "date")}</div>` +
    note("Use the account your pay goes into. The app compares it with what the plan expects after the bills you've ticked, savings moved and spending logged."),
    fd => { if (String(fd.get("bal")).trim() === "") { app.toast("Enter the balance"); return false; } p.bank = { balance: num(fd.get("bal")), date: isISO(text(fd, "date")) ? text(fd, "date") : todayISO() }; savePeriod(p); },
    { del: p.bank.balance == null ? null : () => { p.bank = { balance: null, date: "" }; savePeriod(p); }, delLabel: "Clear" });
}

function fundSheet(f, kindIn = "") {
  const isNew = !f, today = todayISO();
  f = f || { name: kindIn === "emergency" ? "Emergency fund" : "", kind: kindIn, a15: 0, a30: 0, target: 0, opening: 0, months: 3, yearly: 0, dueMonth: 12, withdrawals: [] };
  const bal = isNew ? 0 : fundBalance(f, S);
  const recent = (f.withdrawals || []).slice(-3).reverse().map(w => `${esc(fmtDate(w.date))} ${peso0(w.amount)}${w.note ? " " + esc(w.note) : ""}`).join(" · ");
  openSheet(isNew ? "New savings fund" : f.name,
    fld("Fund name", "name", f.name, "text", 'required maxlength="200"') +
    opts("Type", "kind", f.kind || "", [["", "Regular"], ["emergency", "Emergency"], ["sinking", "Yearly cost"]]) +
    `<div class="two-col">${fld("On the 15th (₱)", "a15", f.a15 || "", "number")}${fld("On the 30th (₱)", "a30", f.a30 || "", "number")}</div>` +
    `<div data-kind="">${fld("Target (₱, optional)", "target", f.target || "", "number")}</div>` +
    `<div data-kind="emergency">${sel("Cover how many months of essential bills", "months", f.months || 3, [[1, "1 month"], [3, "3 months"], [6, "6 months"], [12, "12 months"]])}</div>` +
    `<div data-kind="sinking"><div class="two-col">${fld("Yearly cost (₱)", "yearly", f.yearly || "", "number")}${sel("Due in", "dueMonth", f.dueMonth || 12, MONTHS.map((m, i) => [i + 1, m]))}</div><p class="note" id="sinkHint" style="margin:6px 0 0"></p><button type="button" class="btn ghost small" id="useSink" style="margin-top:6px">Use this amount on both paydays</button></div>` +
    fld("Current balance (₱)", "balance", Math.round(bal * 100) / 100, "number") +
    (isNew ? "" : `<div class="two-col">${fld("Withdraw (₱)", "wAmt", "", "number")}${fld("For", "wNote", "", "text", 'maxlength="200"')}</div>${recent ? note("Recent withdrawals: " + recent) : ""}`) +
    note("Set the balance to what the account holds today. Transfers you mark as moved add to it; withdrawals take from it."),
    fd => {
      const name = text(fd, "name"); if (!name) { app.toast("Name the fund"); return false; }
      const id = f._id || uid();
      const next = { ...f, name, kind: String(fd.get("kind") || ""), a15: num(fd.get("a15")), a30: num(fd.get("a30")), target: num(fd.get("target")) || 0, months: num(fd.get("months")) || 3, yearly: num(fd.get("yearly")), dueMonth: num(fd.get("dueMonth")) || 12, order: f.order || nextOrder("funds"), withdrawals: [...(f.withdrawals || [])] };
      next._id = id;
      next.opening = (+f.opening || 0) + (num(fd.get("balance")) - fundBalance(next, S));
      const w = num(fd.get("wAmt"));
      if (w > 0) next.withdrawals.push({ id: uid(), date: todayISO(), amount: w, note: text(fd, "wNote") });
      put("funds", id, next); app.render();
    },
    { del: isNew ? null : () => { put("funds", f._id, null); app.render(); },
      onReady: form => {
        const kindIn = form.querySelector("[name=kind]");
        const show = () => form.querySelectorAll("[data-kind]").forEach(d => { d.hidden = d.dataset.kind !== kindIn.value; });
        const hint = () => { const s = sinkingPerPayday({ yearly: num(form.yearly.value), dueMonth: +form.dueMonth.value }, num(form.balance.value), today); form.querySelector("#sinkHint").textContent = `Set aside ${peso0(s.per)} on each of the next ${s.paydays} paydays to have it by ${MONTHS[+form.dueMonth.value - 1]}.`; return s; };
        kindIn.addEventListener("change", show); ["yearly", "dueMonth", "balance"].forEach(n => form[n].addEventListener("input", hint));
        form.querySelector("#useSink").addEventListener("click", () => { const s = hint(); form.a15.value = s.per; form.a30.value = s.per; });
        show(); hint();
      } });
}

function loanSheet(l) {
  const isNew = !l; l = l || { name: "", monthly: "", term: "", paidBefore: 0, balance: "", rate: "", bills: [] };
  openSheet(isNew ? "New loan" : l.name,
    fld("Loan or card name", "name", l.name, "text", 'required maxlength="200"') +
    `<div class="two-col">${fld("Monthly payment (₱)", "monthly", l.monthly, "number")}${fld("Total months (0 if open-ended)", "term", l.term, "number")}</div>` +
    `<div class="two-col">${fld("Balance left today (₱)", "balance", l.balance || "", "number")}${fld("Interest rate (% a year)", "rate", l.rate || "", "number")}</div>` +
    fld("Bill names that pay it (comma separated)", "bills", (l.bills || []).join(", "), "text", 'maxlength="200"') +
    fld("Installments paid before these records", "paidBefore", l.paidBefore || 0, "number") +
    note("Each paid bill with one of these names counts as one installment. When none are left, the bill stops appearing in new plans. A monthly rate of 2% is 24% a year."),
    fd => {
      const name = text(fd, "name"); if (!name) { app.toast("Name the loan"); return false; }
      const id = l._id || uid();
      put("loans", id, { ...l, name, monthly: num(fd.get("monthly")), term: Math.max(0, Math.round(num(fd.get("term")))), paidBefore: Math.max(0, Math.round(num(fd.get("paidBefore")))), balance: Math.max(0, num(fd.get("balance"))), rate: Math.max(0, num(fd.get("rate"))), bills: text(fd, "bills").split(",").map(s => s.trim()).filter(Boolean) });
      app.render();
    },
    { del: isNew ? null : () => { put("loans", l._id, null); app.render(); } });
}

function recSheet(r) {
  const isNew = !r; r = r || { name: "", category: S.settings.categories[0], amount: "", payday: "15", dueDay: 0, endMonth: "", active: true };
  openSheet(isNew ? "New recurring bill" : "Recurring bill",
    fld("Bill", "name", r.name, "text", 'required maxlength="200"') +
    `<div class="two-col">${fld("Usual amount (₱)", "amount", r.amount, "number")}${catSel(r.category)}</div>` +
    opts("Paid from", "payday", r.payday, [["15", "15th"], ["30", "30th"], ["both", "Both paydays"]]) +
    `<div class="two-col">${fld("Due day of the month (optional)", "dueDay", r.dueDay || "", "number", 'min="1" max="31"')}${fld("Last month (optional)", "endMonth", r.endMonth || "", "month")}</div>` +
    check("active", "Include in new plans", r.active !== false) +
    note("With a due day, each plan shows when it's due and warns you three days before."),
    fd => {
      const name = text(fd, "name"); if (!name) { app.toast("Name the bill"); return false; }
      const dueDay = Math.round(num(fd.get("dueDay"))); if (dueDay < 0 || dueDay > 31) { app.toast("Due day must be 1 to 31"); return false; }
      const id = r._id || uid();
      put("recurring", id, { ...r, name, amount: num(fd.get("amount")), category: fd.get("category"), payday: fd.get("payday"), dueDay, endMonth: isMonth(text(fd, "endMonth")) ? text(fd, "endMonth") : "", active: !!fd.get("active"), order: r.order || nextOrder("recurring") });
      app.render();
    },
    { del: isNew ? null : () => { put("recurring", r._id, null); app.render(); } });
}

function srcSheet(i) {
  const isNew = i < 0, x = isNew ? { name: "", a15: 0, a30: 0 } : S.settings.incomes[i];
  openSheet(isNew ? "New income source" : "Income source", fld("Name (for example, whose salary)", "name", x.name, "text", 'required maxlength="200"') + `<div class="two-col">${fld("Usual on 15th (₱)", "a15", x.a15 || "", "number")}${fld("Usual on 30th (₱)", "a30", x.a30 || "", "number")}</div>`,
    fd => {
      const v = { name: text(fd, "name") || "Income", a15: num(fd.get("a15")), a30: num(fd.get("a30")) };
      if (isNew) S.settings.incomes.push(v);
      else {
        const old = S.settings.incomes[i].name; S.settings.incomes[i] = v;
        // rename in plans from the payday on screen onwards
        if (ui.month && old !== v.name) for (const [id, p] of Object.entries(S.periods)) if (id >= pid(ui.month, ui.half)) { let ch = false; p.incomes.forEach(z => { if (z.name === old) { z.name = v.name; ch = true; } }); if (ch) put("periods", id, p); }
      }
      putSettings(); app.render();
    },
    { del: isNew ? null : () => { S.settings.incomes.splice(i, 1); putSettings(); app.render(); } });
}

function extraSheet(x) {
  const isNew = !x; x = x || { id: uid(), name: "", month: 12, payday: "15", amount: "" };
  openSheet(isNew ? "Yearly extra income" : x.name,
    fld("Name", "name", x.name, "text", 'required maxlength="200" placeholder="13th month pay"') +
    `<div class="two-col">${sel("Month", "month", x.month, MONTHS.map((m, i) => [i + 1, m]))}${fld("Amount (₱)", "amount", x.amount, "number")}</div>` +
    opts("Payday", "payday", x.payday, [["15", "15th"], ["30", "30th"]]),
    fd => {
      const name = text(fd, "name"); if (!name) { app.toast("Name it"); return false; }
      Object.assign(x, { name, month: num(fd.get("month")) || 12, payday: fd.get("payday") === "30" ? "30" : "15", amount: num(fd.get("amount")) });
      if (isNew) S.settings.extras.push(x); putSettings(); app.render();
    },
    { del: isNew ? null : () => { S.settings.extras = S.settings.extras.filter(e => e.id !== x.id); putSettings(); app.render(); } });
}

function rulesSheet() {
  const s = S.settings;
  openSheet("Rules",
    `<div class="two-col">${fld("Comfortable up to (%)", "c", Math.round(s.comfortable * 100), "number")}${fld("Tight above (%)", "t", Math.round(s.tight * 100), "number")}</div>` +
    fld("Alert if unallocated is above (% of income)", "a", Math.round(s.alert * 100), "number") +
    check("carry", "Carry leftover cash to the next payday", s.carryOver) +
    fld("Carry over starting from payday", "cs", s.carryStart || "", "text", 'placeholder="2026-11-15" pattern="\\d{4}-\\d{2}-(15|30)"') +
    `<div class="two-col">${fld("Spending money, 15th (₱)", "e15", s.envelope.a15 || "", "number")}${fld("Spending money, 30th (₱)", "e30", s.envelope.a30 || "", "number")}</div>` +
    fld("Categories (comma separated)", "cats", s.categories.join(", "), "text", 'maxlength="200"'),
    fd => {
      const c = num(fd.get("c")), t = num(fd.get("t")), a = num(fd.get("a")), cs = text(fd, "cs");
      if (!(c > 0 && c < t && t <= 100)) { app.toast("Comfortable must be above 0 and below Tight, and Tight at most 100"); return false; }
      if (a < 0 || a > 100) { app.toast("The alert must be 0 to 100"); return false; }
      if (cs && !/^\d{4}-(0[1-9]|1[0-2])-(15|30)$/.test(cs)) { app.toast("Carry-over start looks like 2026-11-15 or 2026-11-30"); return false; }
      Object.assign(s, { comfortable: c / 100, tight: t / 100, alert: a / 100, carryOver: !!fd.get("carry"), carryStart: cs, envelope: { a15: Math.max(0, num(fd.get("e15"))), a30: Math.max(0, num(fd.get("e30"))) } });
      const cats = text(fd, "cats").split(",").map(x => x.trim()).filter(Boolean); if (cats.length) s.categories = cats;
      putSettings(); app.render();
    }, { noFocus: true });
}

