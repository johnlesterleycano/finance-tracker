// Synthetic fixtures only: no real finances belong in this public repo.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../app/js/calc.js";
import { num, sum, fmtDate, peso } from "../app/js/format.js";

const bill = (amount, status = "unpaid", extra = {}) => ({ id: "b" + amount, name: "Bill " + amount, category: "Utilities", amount, status, paidAmount: 0, paidDate: "", dueDate: "", notes: "", ...extra });
const data = (over = {}) => C.normalizeData({
  settings: { carryStart: "2030-01-15", trackFrom: "2030-01-15", ...over.settings },
  periods: {
    "2030-01-15": { month: "2030-01", half: 1, payDate: "2030-01-15", incomes: [{ name: "A", amount: 50000 }, { name: "B", amount: 10000 }],
      bills: [bill(12000, "paid"), bill(6000), bill(3000, "partial", { paidAmount: 1000 })], savings: [{ id: "s1", fundId: "f1", name: "Fund", amount: 9000, moved: true }] },
    "2030-01-30": { month: "2030-01", half: 2, payDate: "2030-01-30", incomes: [{ name: "A", amount: 40000 }],
      bills: [bill(28000)], savings: [{ id: "s2", fundId: "f1", name: "Fund", amount: 10000, moved: false }] },
    ...over.periods
  },
  recurring: over.recurring, funds: over.funds, loans: over.loans
});

test("payday totals follow the sheet formulas", () => {
  const t = C.totals(data().periods["2030-01-15"]);
  assert.deepEqual([t.inc, t.bills, t.paid, t.toPay, t.save, t.left], [60000, 21000, 13000, 8000, 9000, 39000]);
});

test("unallocated with and without carry-over, and month totals", () => {
  const D = data(), ch = C.chain(D);
  assert.equal(ch["2030-01-15"].un, 30000);
  assert.equal(ch["2030-01-30"].cin, 30000);
  assert.equal(ch["2030-01-30"].un, 32000);
  const off = data({ settings: { carryOver: false } }), ch2 = C.chain(off);
  assert.equal(ch2["2030-01-30"].un, 2000);
  const md = C.monthData(D, "2030-01");
  assert.deepEqual([md.inc, md.bills, md.save, md.un], [100000, 49000, 19000, 32000]);
  assert.equal(C.monthData(off, "2030-01").un, 32000); // without carry the month adds both halves
});

test("carry-over only starts at carryStart", () => {
  const D = data({ settings: { carryStart: "2030-01-30" } });
  assert.equal(C.chain(D)["2030-01-30"].cin, 0);
});

test("health labels at the exact thresholds", () => {
  const s = C.normalizeData({}).settings;
  assert.equal(C.loadLabel(0.5, s)[0], "Comfortable");
  assert.equal(C.loadLabel(0.5000001, s)[0], "Watch");
  assert.equal(C.loadLabel(0.7, s)[0], "Watch");
  assert.equal(C.loadLabel(0.71, s)[0], "Tight");
  assert.equal(C.unLabel(2000, 40000, s)[0], "On track"); // exactly 5% is not above it
  assert.equal(C.unLabel(2001, 40000, s)[0], "Assign it");
  assert.equal(C.unLabel(-1, 40000, s)[0], "Over budget");
});

test("spending envelope reserves its budget and overspending reduces unallocated", () => {
  const withEnv = (budget, spent) => C.chain(data({ settings: { carryOver: false }, periods: { "2030-01-30": { month: "2030-01", half: 2, payDate: "2030-01-30", incomes: [{ name: "A", amount: 40000 }], bills: [bill(28000)], savings: [], spending: { budget, expenses: spent ? [{ id: "e", date: "2030-02-01", amount: spent, note: "" }] : [] } } } }))["2030-01-30"].un;
  assert.equal(withEnv(0, 0), 12000);
  assert.equal(withEnv(5000, 2000), 7000);
  assert.equal(withEnv(5000, 7000), 5000);
});

test("money sums do not drift", () => {
  assert.equal(sum([0.1, 0.2], x => x), 0.3);
  assert.equal(C.totals({ bills: [bill(0.1), bill(0.2)] }).bills, 0.3);
});

test("peso shows centavos with two digits", () => {
  assert.equal(peso(38749.5), "₱38,749.50");
  assert.equal(peso(1200), "₱1,200");
  assert.equal(peso(-0.1), "−₱0.10");
});

test("num accepts commas, peso signs and a typed minus sign", () => {
  assert.equal(num("₱1,234.50"), 1234.5);
  assert.equal(num("−500"), -500);
  assert.equal(num("abc"), 0);
});

test("current payday, including short Februaries", () => {
  const cases = { "2027-02-27": "2027-02-15", "2027-02-28": "2027-02-30", "2028-02-28": "2028-02-15", "2028-02-29": "2028-02-30",
    "2026-11-14": "2026-10-30", "2026-11-15": "2026-11-15", "2026-11-29": "2026-11-15", "2026-11-30": "2026-11-30", "2026-12-31": "2026-12-30", "2027-01-01": "2026-12-30" };
  for (const [day, want] of Object.entries(cases)) assert.equal(C.currentPeriodId(day), want, day);
});

test("due dates land on the first matching day on or after payday", () => {
  assert.equal(C.dueDateFor(5, "2026-11-15"), "2026-12-05");
  assert.equal(C.dueDateFor(20, "2026-11-15"), "2026-11-20");
  assert.equal(C.dueDateFor(15, "2026-11-15"), "2026-11-15");
  assert.equal(C.dueDateFor(31, "2027-02-15"), "2027-02-28");
  assert.equal(C.dueDateFor(0, "2026-11-15"), "");
});

test("due status labels", () => {
  const b = d => ({ status: "unpaid", dueDate: d });
  assert.equal(C.dueStatus(b("2026-11-20"), "2026-11-18").label, "Due in 2 days");
  assert.equal(C.dueStatus(b("2026-11-18"), "2026-11-18").label, "Due today");
  assert.equal(C.dueStatus(b("2026-11-17"), "2026-11-18").cls, "bad");
  assert.equal(C.dueStatus(b("2026-11-30"), "2026-11-18").cls, "soft");
  assert.equal(C.dueStatus({ status: "paid", dueDate: "2026-11-17" }, "2026-11-18"), null);
});

test("new plans: both paydays, end month, finished loans, one-off income, envelope", () => {
  const D = C.normalizeData({
    settings: { incomes: [{ name: "A", a15: 100, a30: 200 }], extras: [{ id: "x", name: "13th month", month: 12, payday: "15", amount: 5000 }], envelope: { a15: 300, a30: 0 } },
    recurring: {
      both: { name: "Gym", category: "Other", amount: 10, payday: "both", order: 1 },
      ended: { name: "Old", category: "Other", amount: 20, payday: "15", endMonth: "2026-11", order: 2 },
      loan: { name: "Car", category: "Cards & Loans", amount: 30, payday: "15", dueDay: 20, order: 3 },
      paused: { name: "Paused", category: "Other", amount: 40, payday: "15", active: false }
    },
    loans: { car: { name: "Car loan", monthly: 30, term: 1, paidBefore: 1, bills: ["Car"] } }
  });
  let k = 0; const id = () => "id" + k++;
  const p15 = C.makePeriod(D, "2026-12", 1, id, "2026-12-01");
  assert.deepEqual(p15.bills.map(b => b.name), ["Gym"]);
  assert.deepEqual(p15.incomes.map(i => i.amount), [100, 5000]);
  assert.equal(p15.spending.budget, 300);
  assert.deepEqual(C.makePeriod(D, "2026-12", 2, id, "2026-12-01").bills.map(b => b.name), ["Gym"]);
  const D2 = C.normalizeData({ ...D, loans: {} });
  const p = C.makePeriod(D2, "2026-11", 1, id, "2026-11-01");
  assert.deepEqual(p.bills.map(b => b.name), ["Gym", "Old", "Car"]);
  assert.equal(p.bills[2].dueDate, "2026-11-20");
});

test("balance my paydays moves the bill that best evens the load and respects due days", () => {
  const D = C.normalizeData({
    settings: { incomes: [{ name: "A", a15: 50000, a30: 50000 }] },
    recurring: {
      x: { name: "X", amount: 8000, payday: "15" }, w: { name: "W", amount: 4000, payday: "15" },
      y: { name: "Y", amount: 5000, payday: "15", dueDay: 20 }, z: { name: "Z", amount: 3000, payday: "30" }
    }
  });
  const s = C.balanceSuggest(D);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].id, s[0].from, s[0].to], ["x", "15", "30"]);
  assert.ok(Math.abs(s[0].load15 - 0.18) < 1e-9 && Math.abs(s[0].load30 - 0.22) < 1e-9);
  assert.equal(C.fitsPayday(20, "30"), false);
  assert.equal(C.fitsPayday(5, "30"), true);
});

test("emergency target and sinking fund per payday", () => {
  const D = C.normalizeData({ recurring: {
    a: { name: "A", category: "Utilities", amount: 10000, payday: "15" }, b: { name: "B", category: "Other", amount: 5000, payday: "30" },
    c: { name: "C", category: "Cards & Loans", amount: 2000, payday: "both" }, d: { name: "D", category: "Utilities", amount: 3000, payday: "15", active: false } } });
  assert.equal(C.monthlyEssentials(D), 14000);
  assert.equal(C.emergencyTarget({ months: 3 }, D), 42000);
  assert.deepEqual(C.sinkingPerPayday({ yearly: 12000, dueMonth: 6 }, 0, "2026-11-26"), { paydays: 14, per: 858 });
  assert.equal(C.sinkingPerPayday({ yearly: 12000, dueMonth: 6 }, 2000, "2026-11-26").per, 715);
  assert.deepEqual(C.sinkingPerPayday({ yearly: 1000, dueMonth: 11 }, 0, "2026-11-26"), { paydays: 1, per: 1000 });
});

test("debt payoff: interest, rollover, method order, never", () => {
  const one = C.payoffPlan([{ id: "a", name: "A", balance: 1000, rate: 12, monthly: 500 }]);
  assert.deepEqual([one.months, one.interest], [3, 15.25]);
  const roll = C.payoffPlan([{ id: "a", name: "A", balance: 300, rate: 0, monthly: 100 }, { id: "b", name: "B", balance: 600, rate: 0, monthly: 100 }], "snowball");
  assert.equal(roll.months, 5);
  assert.deepEqual(roll.order.map(o => [o.id, o.month]), [["a", 3], ["b", 5]]);
  const debts = [{ id: "tiny", name: "Tiny", balance: 500, rate: 1, monthly: 100 }, { id: "mid", name: "Mid", balance: 3000, rate: 5, monthly: 100 }, { id: "big", name: "Big", balance: 10000, rate: 30, monthly: 400 }];
  const av = C.payoffPlan(debts, "avalanche"), sn = C.payoffPlan(debts, "snowball");
  assert.ok(av.interest < sn.interest, `avalanche ${av.interest} should cost less than snowball ${sn.interest}`);
  assert.equal(C.payoffPlan([{ id: "a", name: "A", balance: 1000, rate: 120, monthly: 100 }]).never, true);
});

test("bank check compares with the previous check plus what was logged since", () => {
  const per = (id, extra) => ({ month: id.slice(0, 7), half: id.endsWith("15") ? 1 : 2, payDate: id, incomes: [{ name: "A", amount: 60000 }], bills: [bill(13000, "paid"), bill(5000)], savings: [{ id: "s", fundId: "f", name: "F", amount: 4000, moved: true }], spending: { budget: 3000, expenses: [{ id: "e", date: id, amount: 2000, note: "" }] }, ...extra });
  // each payday logs 60000 in, 13000 paid, 4000 moved, 2000 spent = 41000 net; unpaid bills and unspent envelope stay in the bank
  const D = C.normalizeData({ periods: { "2030-01-15": per("2030-01-15", { bank: { balance: 150000, date: "2030-01-16" } }), "2030-01-30": per("2030-01-30"), "2030-02-15": per("2030-02-15", { bank: { balance: 231500, date: "2030-02-16" } }) } });
  assert.deepEqual(C.bankCheck(D, "2030-01-15"), { first: true });
  assert.deepEqual(C.bankCheck(D, "2030-02-15"), { first: false, prev: "2030-01-15", expected: 232000, gap: -500 });
  assert.equal(C.bankCheck(D, "2030-01-30"), null);
});

test("month unallocated adds both halves when the 30th got no carry-over", () => {
  const D = data({ settings: { carryStart: "2030-01-30" } }); // before the start: the 15th's 30000 is not carried into the 30th
  assert.equal(C.chain(D)["2030-01-30"].un, 2000);
  assert.equal(C.monthData(D, "2030-01").un, 32000);
});

test("fund balance counts moved savings from trackFrom, minus withdrawals", () => {
  const D = data({ funds: { f1: { name: "Fund", opening: 500, withdrawals: [{ id: "w", date: "2030-01-20", amount: 1500, note: "" }] } } });
  assert.equal(C.fundBalance(D.funds.f1, D), 8000);
});

test("normalizeData coerces hand-edited values instead of trusting them", () => {
  const D = C.normalizeData({ periods: { "2030-01-15": { payDate: "<img src=x onerror=alert(1)>", bills: [{ amount: "12abc", status: "weird" }] } } });
  const p = D.periods["2030-01-15"];
  assert.equal(p.bills[0].amount, 0);
  assert.equal(p.bills[0].status, "unpaid");
  assert.equal(fmtDate(p.payDate), "<img src=x onerror=alert(1)>"); // returned raw; every view escapes it
});
