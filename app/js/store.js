// Data state and persistence. Two modes:
//  local: everything lives in this browser (localStorage).
//  sheet: the Google Sheet is the database; a local cache gives instant start and offline use,
//         and edits wait in an outbox until the Sheet confirms them.
import { normalizeData } from "./calc.js";
import * as api from "./api.js";
import { todayISO } from "./format.js";

export const S = { ...normalizeData({}), mode: "none" };
export const sync = { state: "idle", waiting: 0, message: "" }; // idle | syncing | saving | offline | signed-out
const K = { mode: "money-plan-mode-v1", local: "money-plan-local-v1", cache: "money-plan-cache-v1", outbox: "money-plan-outbox-v1" };
const ls = {
  get: k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};
const hooks = { status: () => {}, data: () => {}, toast: () => {} };
export const on = (name, f) => { hooks[name] = f; };

export const snapshot = () => ({ settings: S.settings, recurring: S.recurring, funds: S.funds, loans: S.loans, periods: S.periods });
const apply = d => Object.assign(S, normalizeData(d));
const setStatus = (state, message = "") => { Object.assign(sync, { state, message, waiting: outbox.size }); hooks.status(sync); };

// key "col/id" -> edit counter, so an edit made while its save is in flight is never dropped
let outbox = new Map();
const saveOutbox = () => ls.set(K.outbox, [...outbox]);
const saveCache = () => { if (!ls.set(K.cache, snapshot())) hooks.toast("This phone's storage is full. Your changes still go to the Sheet."); };

export function init() {
  const mode = ls.get(K.mode);
  if (mode === "local") { S.mode = "local"; apply(ls.get(K.local) || {}); }
  else if (mode === "sheet" && api.connected()) { S.mode = "sheet"; apply(ls.get(K.cache) || {}); outbox = new Map(ls.get(K.outbox) || []); }
  else S.mode = "none";
  return S.mode;
}

export function useLocal() { ls.set(K.mode, "local"); S.mode = "local"; apply(ls.get(K.local) || {}); }

const COLS = ["recurring", "funds", "loans", "periods"];
const hasData = d => COLS.some(c => Object.keys(d[c] || {}).length);
const editing = () => !!document.querySelector("dialog[open]");

// Loaded Sheet data wins, except records with edits still waiting in the outbox.
function mergeLoaded(next) {
  const mine = snapshot();
  for (const key of outbox.keys()) {
    const [col, id] = key.split("/");
    if (col === "settings") next.settings = mine.settings;
    else if (mine[col][id]) next[col][id] = mine[col][id];
    else delete next[col][id];
  }
  Object.assign(S, next);
}

// Connect (or reconnect) to a Sheet. The first load must succeed, so an empty default state can never be saved over real data.
export async function useSheet(url, passcode) {
  const prev = S.mode, localHad = prev === "local" && hasData(S);
  await api.connect(url, passcode);
  let next;
  try { next = normalizeData(await api.call("load")); }
  catch (e) { if (prev !== "sheet") api.forget(); throw e; }
  let uploaded = false;
  if (prev === "sheet") mergeLoaded(next); // reconnect after a sign-out: keep edits that never synced
  else {
    outbox = new Map();
    if (localHad && !hasData(next)) {
      // moving from device-only to an empty Sheet: upload this device's plan
      for (const c of COLS) for (const id of Object.keys(S[c])) outbox.set(c + "/" + id, 1);
      outbox.set("settings/settings", 1);
      uploaded = true;
    } else Object.assign(S, next);
  }
  ls.set(K.mode, "sheet"); S.mode = "sheet";
  saveOutbox(); saveCache();
  setStatus(outbox.size ? "saving" : "idle");
  flush();
  return { uploaded, keptLocal: localHad && !uploaded }; // keptLocal: the Sheet already had data, so this device's plan stays in local storage only
}

let saves = 0, again = 0;
export async function refresh() {
  if (S.mode !== "sheet") return;
  // an open edit sheet holds the objects being edited; refreshing would swap them out from under it
  if (editing()) { clearTimeout(again); again = setTimeout(refresh, 2000); return; }
  setStatus("syncing");
  const before = saves;
  try {
    const next = normalizeData(await api.call("load"));
    // a save finished while this load was in flight, so the load may predate it: load again
    if (saves !== before || editing()) { setStatus(outbox.size ? "saving" : "idle"); clearTimeout(again); again = setTimeout(refresh, editing() ? 2000 : 0); return; }
    mergeLoaded(next);
    saveCache();
    setStatus(outbox.size ? "saving" : "idle");
    hooks.data();
    flush();
  } catch (e) { onError(e); }
}

function persist(col, id) {
  if (S.mode === "local") { if (!ls.set(K.local, snapshot())) hooks.toast("This browser's storage is full. Export a backup, then delete old paydays."); return; }
  if (S.mode !== "sheet") return;
  const key = col + "/" + id;
  outbox.set(key, (outbox.get(key) || 0) + 1);
  saveOutbox(); saveCache();
  clearTimeout(timer); timer = setTimeout(flush, 350);
  setStatus("saving");
}

export function put(col, id, obj) { if (obj) { obj._id = id; S[col][id] = obj; } else delete S[col][id]; persist(col, id); }
export const putSettings = () => persist("settings", "settings");

let busy = false, timer = 0, backoff = 2000;
export async function flush() {
  if (busy || S.mode !== "sheet" || !outbox.size || sync.state === "signed-out") return;
  busy = true;
  try {
    while (outbox.size) {
      const [key, ver] = outbox.entries().next().value;
      const [col, id] = key.split("/");
      const src = col === "settings" ? S.settings : S[col][id];
      try {
        if (src) { const doc = JSON.parse(JSON.stringify(src)); delete doc._id; await api.call("put", { col, id, doc }); }
        else await api.call("delete", { col, id });
      } catch (e) {
        if (e.code !== "invalid") throw e;
        // the Sheet refused this record; drop it so the queue keeps moving, and reload the Sheet's version
        outbox.delete(key); saveOutbox();
        hooks.toast("The Sheet didn't accept that change: " + (e.message || "invalid data") + ".");
        setTimeout(refresh, 0);
        continue;
      }
      saves++;
      if (outbox.get(key) === ver) outbox.delete(key);
      saveOutbox();
      setStatus(outbox.size ? "saving" : "idle");
    }
    backoff = 2000;
  } catch (e) { onError(e); }
  finally { busy = false; }
}

function onError(e) {
  if (e.code === "auth") { setStatus("signed-out", "This device was signed out. Connect again to keep syncing."); return; }
  setStatus("offline", e.code === "network" ? "" : "The Sheet had a problem. Retrying.");
  clearTimeout(timer); timer = setTimeout(() => { flush(); if (!outbox.size) refresh(); }, backoff);
  backoff = Math.min(backoff * 2, 60000);
}

addEventListener("online", () => { backoff = 2000; flush(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.mode === "sheet" && !outbox.size && !busy) refresh(); });

export async function signOutAll() { await api.call("revokeAll"); forgetDevice(); }

export function forgetDevice() {
  Object.values(K).forEach(ls.del);
  api.forget();
  location.reload();
}

export function exportBackup() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "money-plan-backup-" + todayISO() + ".json" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// restore is local-mode only: the Sheet keeps its own version history
export async function restoreBackup(file) {
  if (S.mode !== "local") throw new Error("Restore works in device-only mode. In Sheet mode use the Sheet's version history.");
  const d = JSON.parse(await file.text());
  if (!d || typeof d !== "object" || !d.settings) throw new Error("That file isn't a Money Plan backup.");
  apply(d);
  ls.set(K.local, snapshot());
}
