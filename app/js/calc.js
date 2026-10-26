// Money rules. Pure functions over the data D = {settings, recurring, funds, loans, periods}.
// Same rules as the original sheet: bills load <= comfortable is Comfortable, <= tight is Watch, above is Tight;
// unallocated above alert x income is "Assign it", below zero is "Over budget".
import { sum, round2, norm, mAdd, mLabel, pid, isISO, isMonth, lastDay, payDay, defaultPayDate, daysBetween, fmtDate } from "./format.js";

export const DEF_SETTINGS = {
  incomes: [{ name: "Income 1", a15: 0, a30: 0 }, { name: "Income 2", a15: 0, a30: 0 }],
  categories: ["Cards & Loans", "Family & Household", "Utilities", "Other"],
  comfortable: 0.5, tight: 0.7, alert: 0.05, carryOver: true, carryStart: "", trackFrom: "",
  envelope: { a15: 0, a30: 0 }, extras: []
};

/* ---------- shape: coerce anything loaded (cache, sheet, backup) into the expected types ---------- */
const str = v => v == null ? "" : String(v);
const n = v => { const x = +v; return isFinite(x) ? x : 0; };
const date = v => isISO(v) ? v : "";
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

export function normalizeData(d = {}) {
  const s = { ...DEF_SETTINGS, ...(d.settings || {}) };
  const settings = {
    incomes: (Array.isArray(s.incomes) ? s.incomes : []).map(i => ({ name: str(i.name), a15: n(i.a15), a30: n(i.a30) })),
    categories: (Array.isArray(s.categories) && s.categories.length ? s.categories : DEF_SETTINGS.categories).map(str),
    comfortable: n(s.comfortable) || DEF_SETTINGS.comfortable, tight: n(s.tight) || DEF_SETTINGS.tight, alert: n(s.alert),
    carryOver: s.carryOver !== false && s.carryOver !== "false", carryStart: str(s.carryStart), trackFrom: str(s.trackFrom),
    envelope: { a15: n(s.envelope?.a15), a30: n(s.envelope?.a30) },
    extras: (Array.isArray(s.extras) ? s.extras : []).map(x => ({ id: str(x.id), name: str(x.name), month: Math.min(12, Math.max(1, n(x.month) || 12)), payday: x.payday === "30" ? "30" : "15", amount: n(x.amount) }))
  };
  const map = (o, f) => Object.fromEntries(Object.entries(o || {}).map(([id, v]) => [id, { ...f(v || {}), _id: id }]));
  return {
    settings,
    recurring: map(d.recurring, r => ({ name: str(r.name), category: str(r.category), amount: n(r.amount), payday: ["15", "30", "both"].includes(str(r.payday)) ? str(r.payday) : "15", dueDay: Math.min(31, Math.max(0, Math.round(n(r.dueDay)))), endMonth: isMonth(r.endMonth) ? r.endMonth : "", active: r.active !== false && r.active !== "false", order: n(r.order) })),
    funds: map(d.funds, f => ({ name: str(f.name), kind: ["emergency", "sinking"].includes(f.kind) ? f.kind : "", a15: n(f.a15), a30: n(f.a30), opening: n(f.opening), target: n(f.target), months: n(f.months), yearly: n(f.yearly), dueMonth: n(f.dueMonth), order: n(f.order), withdrawals: (Array.isArray(f.withdrawals) ? f.withdrawals : []).map(w => ({ id: str(w.id), date: date(w.date), amount: n(w.amount), note: str(w.note) })) })),
    loans: map(d.loans, l => ({ name: str(l.name), monthly: n(l.monthly), term: n(l.term), paidBefore: n(l.paidBefore), balance: n(l.balance), rate: n(l.rate), bills: (Array.isArray(l.bills) ? l.bills : []).map(str).filter(Boolean) })),
    periods: map(d.periods, p => ({
      month: str(p.month), half: n(p.half) === 2 ? 2 : 1, payDate: str(p.payDate), source: str(p.source),
      incomes: (p.incomes || []).map(i => ({ name: str(i.name), amount: n(i.amount) })),
      bills: (p.bills || []).map(b => ({ id: str(b.id), recurringId: str(b.recurringId), name: str(b.name), category: str(b.category), amount: n(b.amount), status: ["paid", "partial"].includes(b.status) ? b.status : "unpaid", paidAmount: n(b.paidAmount), paidDate: str(b.paidDate), dueDate: str(b.dueDate), notes: str(b.notes) })),
      savings: (p.savings || []).map(x => ({ id: str(x.id), fundId: str(x.fundId), name: str(x.name), amount: n(x.amount), moved: x.moved === true || x.moved === "true" })),
      spending: { budget: n(p.spending?.budget), expenses: (p.spending?.expenses || []).map(e => ({ id: str(e.id), date: str(e.date), amount: n(e.amount), note: str(e.note) })) },
      bank: { balance: p.bank?.balance === "" || p.bank?.balance == null ? null : n(p.bank.balance), date: str(p.bank?.date) }
    }))
  };
}

/* ---------- payday totals and the carry-over chain ---------- */
export function totals(p) {
  const inc = sum(p.incomes || [], i => i.amount), bills = sum(p.bills || [], b => b.amount);
  const paid = sum(p.bills || [], b => b.status === "paid" ? b.amount : b.status === "partial" ? Math.min(b.paidAmount || 0, b.amount) : 0);
  const save = sum(p.savings || [], s => s.amount), moved = sum(p.savings || [], s => s.moved ? s.amount : 0);
  const budget = +(p.spending?.budget) || 0, spent = sum(p.spending?.expenses || [], e => e.amount);
  // the envelope reserves its budget; overspending eats into unallocated cash
  const env = Math.max(budget, spent);
  return { inc, bills, paid, toPay: round2(bills - paid), save, moved, budget, spent, env, left: round2(inc - bills) };
}

export function chain(D) {
  const ids = Object.keys(D.periods).sort(), start = D.settings.carryStart || "", out = {};
  let prev = null;
  for (const id of ids) {
    const t = totals(D.periods[id]);
    let cin = 0;
    if (D.settings.carryOver && prev && id >= start && prev >= start) cin = out[prev].un;
    out[id] = { ...t, cin, un: round2(t.inc + cin - t.bills - t.save - t.env) };
    prev = id;
  }
  return out;
}

export const loadLabel = (r, s) => r <= s.comfortable ? ["Comfortable", "good"] : r <= s.tight ? ["Watch", "warn"] : ["Tight", "bad"];
export const unLabel = (un, inc, s) => un < 0 ? ["Over budget", "bad"] : un > s.alert * inc ? ["Assign it", "warn"] : ["On track", "good"];

export function monthData(D, m, ch = chain(D)) {
  const a = ch[pid(m, 1)], b = ch[pid(m, 2)];
  const z = { inc: 0, bills: 0, paid: 0, toPay: 0, save: 0, moved: 0, budget: 0, spent: 0, env: 0, left: 0, cin: 0, un: 0 };
  const A = a || z, B = b || z;
  const add = k => round2(A[k] + B[k]);
  // the 30th already includes the 15th's leftover only when carry-over reached it
  const carried = D.settings.carryOver && a && b && pid(m, 1) >= (D.settings.carryStart || "");
  const un = carried ? B.un : add("un");
  return { A, B, a, b, inc: add("inc"), bills: add("bills"), save: add("save"), paid: add("paid"), env: add("env"), spent: add("spent"), left: round2(add("inc") - add("bills")), un, cin: A.cin || 0 };
}

// The 15th payday covers the 15th up to the day before the 30th payday; the 30th payday (the last day in February) covers the rest.
export function currentPeriodId(today) {
  const m = today.slice(0, 7), d = +today.slice(8, 10);
  if (d < 15) return pid(mAdd(m, -1), 2);
  return d >= payDay(m, 2) ? pid(m, 2) : pid(m, 1);
}

/* ---------- funds and loans ---------- */
export function fundBalance(f, D) {
  const from = D.settings.trackFrom || "";
  let moved = 0;
  for (const [id, p] of Object.entries(D.periods)) { if (id < from) continue; for (const s of p.savings || []) if (s.fundId === f._id && s.moved) moved += +s.amount || 0; }
  return round2((+f.opening || 0) + moved - sum(f.withdrawals || [], w => w.amount));
}

export function loanStats(l, D, today) {
  const names = (l.bills || []).map(norm).filter(Boolean);
  let paid = 0, last = "";
  for (const [id, p] of Object.entries(D.periods)) for (const b of p.bills || []) if (names.includes(norm(b.name)) && b.status === "paid") { paid++; if (id > last) last = id; }
  paid += +l.paidBefore || 0;
  const term = +l.term || 0, left = term ? Math.max(0, term - paid) : null;
  return { paid, left, remaining: left == null ? null : left * (+l.monthly || 0), ends: left == null ? "" : mLabel(mAdd(last ? last.slice(0, 7) : today.slice(0, 7), left)) };
}

// Monthly essentials: active recurring bills outside "Other"; a bill on both paydays counts twice.
export function monthlyEssentials(D) {
  return sum(Object.values(D.recurring).filter(r => r.active !== false && r.category !== "Other"), r => r.amount * (r.payday === "both" ? 2 : 1));
}
// Cost over the next 12 months from `from` (YYYY-MM): stops at endMonth; a bill on both paydays counts twice; paused bills cost 0.
export function yearlyCost(r, from) {
  if (r.active === false) return 0;
  const months = !r.endMonth ? 12 : Math.min(12, Math.max(0, (r.endMonth.slice(0, 4) - from.slice(0, 4)) * 12 + (r.endMonth.slice(5, 7) - from.slice(5, 7)) + 1));
  return round2((+r.amount || 0) * months * (r.payday === "both" ? 2 : 1));
}
export const emergencyTarget = (f, D) => round2((+f.months || 3) * monthlyEssentials(D));
export const fundTarget = (f, D) => f.kind === "emergency" ? emergencyTarget(f, D) : f.kind === "sinking" ? +f.yearly || 0 : +f.target || 0;

// Sinking fund: what is still needed, spread over the paydays left before the due month (whole pesos, rounded up).
export function sinkingPerPayday(f, balance, today) {
  const due = Math.min(12, Math.max(1, +f.dueMonth || 12)), now = +today.slice(5, 7);
  let months = due - now; if (months < 0) months += 12;
  const paydays = Math.max(1, months * 2);
  return { paydays, per: Math.max(0, Math.ceil(((+f.yearly || 0) - balance) / paydays)) };
}

/* ---------- bills: due dates, plan creation, balance suggestions ---------- */
// First date on or after the pay date that falls on the bill's due day (clamped to short months).
export function dueDateFor(dueDay, payDate) {
  if (!dueDay || !isISO(payDate)) return "";
  let m = payDate.slice(0, 7);
  for (let i = 0; i < 2; i++, m = mAdd(m, 1)) {
    const d = m + "-" + String(Math.min(dueDay, lastDay(m))).padStart(2, "0");
    if (d >= payDate) return d;
  }
  return "";
}

export function dueStatus(b, today) {
  if (b.status === "paid" || !isISO(b.dueDate)) return null;
  const days = daysBetween(today, b.dueDate);
  if (days < 0) return { days, label: "Overdue " + fmtDate(b.dueDate), cls: "bad" };
  if (days === 0) return { days, label: "Due today", cls: "warn" };
  if (days <= 3) return { days, label: "Due in " + days + (days === 1 ? " day" : " days"), cls: "warn" };
  return { days, label: "Due " + fmtDate(b.dueDate), cls: "soft" };
}

const loanDone = (D, name, today) => Object.values(D.loans).some(l => (l.bills || []).map(norm).includes(norm(name)) && loanStats(l, D, today).left === 0);

export function makePeriod(D, m, h, newId, today) {
  const day = h == 1 ? "15" : "30", key = "a" + day, payDate = defaultPayDate(m, h);
  const extras = (D.settings.extras || []).filter(x => +x.month === +m.slice(5, 7) && x.payday === day);
  return {
    month: m, half: h, payDate, source: "app",
    incomes: D.settings.incomes.map(i => ({ name: i.name, amount: +i[key] || 0 })).concat(extras.map(x => ({ name: x.name, amount: +x.amount || 0 }))),
    bills: Object.values(D.recurring)
      .filter(r => r.active !== false && (r.payday === day || r.payday === "both") && (!r.endMonth || r.endMonth >= m) && !loanDone(D, r.name, today))
      .sort(byOrder)
      .map(r => ({ id: newId(), recurringId: r._id, name: r.name, category: r.category, amount: +r.amount || 0, status: "unpaid", paidAmount: 0, paidDate: "", dueDate: dueDateFor(+r.dueDay || 0, payDate), notes: "" })),
    savings: Object.values(D.funds).filter(f => (+f[key] || 0) > 0).sort(byOrder)
      .map(f => ({ id: newId(), fundId: f._id, name: f.name, amount: +f[key] || 0, moved: false })),
    spending: { budget: +(D.settings.envelope?.[key]) || 0, expenses: [] },
    bank: { balance: null, date: "" }
  };
}

// Can a bill due on day d be paid on time from this payday? 15th covers days 15-29, 30th covers 30-14.
export const fitsPayday = (dueDay, to) => !dueDay || (to === "15" ? dueDay >= 15 && dueDay <= 29 : dueDay >= 30 || dueDay <= 14);

// Up to 3 greedy moves of recurring bills between paydays, each one lowering the gap between the two bills loads.
export function balanceSuggest(D, maxMoves = 3) {
  const inc15 = sum(D.settings.incomes, i => i.a15), inc30 = sum(D.settings.incomes, i => i.a30);
  if (!inc15 || !inc30) return [];
  const bills = Object.values(D.recurring).filter(r => r.active !== false && (r.payday === "15" || r.payday === "30")).map(r => ({ ...r }));
  const both = sum(Object.values(D.recurring).filter(r => r.active !== false && r.payday === "both"), r => r.amount);
  const load = () => { const b15 = sum(bills.filter(b => b.payday === "15"), b => b.amount) + both, b30 = sum(bills.filter(b => b.payday === "30"), b => b.amount) + both; return [b15 / inc15, b30 / inc30]; };
  const out = [];
  for (let k = 0; k < maxMoves; k++) {
    const [l15, l30] = load(), gap = Math.abs(l15 - l30);
    let best = null;
    for (const b of bills) {
      const to = b.payday === "15" ? "30" : "15";
      if (!fitsPayday(b.dueDay, to) || out.some(o => o.id === b._id)) continue;
      const n15 = l15 + (to === "15" ? b.amount / inc15 : -b.amount / inc15), n30 = l30 + (to === "30" ? b.amount / inc30 : -b.amount / inc30);
      const g = Math.abs(n15 - n30);
      if (g < gap - 0.02 && (!best || g < best.g)) best = { b, to, g, n15, n30 };
    }
    if (!best) break;
    out.push({ id: best.b._id, name: best.b.name, amount: best.b.amount, from: best.b.payday, to: best.to, load15: best.n15, load30: best.n30, before15: l15, before30: l30 });
    best.b.payday = best.to;
  }
  return out;
}

/* ---------- debt payoff ---------- */
// Pay every minimum each month; when a debt is gone its payment rolls into the target debt
// (avalanche: highest rate first; snowball: smallest balance first).
export function payoffPlan(loans, method = "avalanche", maxMonths = 600) {
  const ds = loans.filter(l => l.balance > 0 && l.monthly > 0).map(l => ({ id: l.id, name: l.name, bal: round2(l.balance), rate: +l.rate || 0, min: +l.monthly, month: 0, interest: 0 }));
  if (!ds.length) return { months: 0, interest: 0, order: [], never: false };
  const budget = sum(ds, d => d.min);
  const rank = method === "snowball" ? (a, b) => a.bal - b.bal || b.rate - a.rate : (a, b) => b.rate - a.rate || a.bal - b.bal;
  let month = 0;
  while (ds.some(d => d.bal > 0)) {
    if (++month > maxMonths) return { months: null, interest: round2(sum(ds, d => d.interest)), order: [], never: true };
    const live = ds.filter(d => d.bal > 0);
    for (const d of live) { const i = round2(d.bal * d.rate / 1200); d.bal = round2(d.bal + i); d.interest = round2(d.interest + i); }
    let cash = budget;
    for (const d of live) { const p = Math.min(d.bal, d.min); d.bal = round2(d.bal - p); cash = round2(cash - p); }
    for (const d of live.filter(d => d.bal > 0).sort(rank)) { if (cash <= 0) break; const p = Math.min(d.bal, cash); d.bal = round2(d.bal - p); cash = round2(cash - p); }
    for (const d of live) if (d.bal <= 0 && !d.month) d.month = month;
  }
  return { months: month, interest: round2(sum(ds, d => d.interest)), order: ds.slice().sort((a, b) => a.month - b.month).map(d => ({ id: d.id, name: d.name, month: d.month, interest: d.interest })), never: false };
}

/* ---------- payday bank check ---------- */
// Cash actually logged for one payday: income in, minus bills paid, savings moved out and envelope spent.
const flow = p => { const t = totals(p); return round2(t.inc - t.paid - t.moved - t.spent); };

// Compares this payday's bank balance with the previous bank check plus everything logged since,
// so money that was already in the account before tracking cancels out. The first check is the starting point.
export function bankCheck(D, id) {
  const p = D.periods[id];
  if (!p || p.bank?.balance == null) return null;
  const earlier = Object.keys(D.periods).sort().filter(x => x < id);
  const prev = earlier.filter(x => D.periods[x].bank?.balance != null).pop();
  if (!prev) return { first: true };
  const since = earlier.filter(x => x > prev).concat(id);
  const expected = round2(D.periods[prev].bank.balance + sum(since, x => flow(D.periods[x])));
  return { first: false, prev, expected, gap: round2(p.bank.balance - expected) };
}
