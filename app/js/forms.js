// Bottom sheet on a native <dialog>: showModal() gives focus trapping, Esc and an inert page for free.
import { esc } from "./format.js";
import { S } from "./store.js";
import { G, draggableSheet } from "./motion.js";

let dlg = null, opener = null;
const closeIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// remember how to find the button that opened the sheet, since views re-render and replace it
function openerKey(el) {
  if (!el || !el.dataset) return null;
  const k = ["act", "id", "i", "half"].filter(a => el.dataset[a] != null).map(a => `[data-${a}="${CSS.escape(el.dataset[a])}"]`).join("");
  return k || null;
}

export function openSheet(title, body, onSave, opts = {}) {
  closeNow();
  opener = openerKey(document.activeElement?.closest?.("[data-act]"));
  dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("closedby", "any");
  dlg.setAttribute("aria-labelledby", "sheetTitle");
  dlg.innerHTML = `<div class="grab" title="Drag down to close"><span></span></div>
    <div class="sheet-head"><h3 id="sheetTitle">${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${closeIcon}</button></div>
    <form class="form" novalidate>${body}<div class="actions">${opts.del ? `<button type="button" class="btn danger" data-del>${esc(opts.delLabel || "Delete")}</button>` : ""}${onSave ? `<button type="submit" class="btn">${esc(opts.saveLabel || "Save")}</button>` : ""}</div></form>`;
  document.body.appendChild(dlg);
  const d = dlg, form = d.querySelector("form");
  d.addEventListener("cancel", e => { e.preventDefault(); closeSheet(); });
  d.addEventListener("close", () => { if (dlg === d) finish(); });
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    // light-dismiss fallback (Safari): a click on the backdrop targets the dialog itself, outside its box
    d.addEventListener("click", e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeSheet();
    });
  }
  d.querySelector("[data-close]").addEventListener("click", () => closeSheet());
  form.addEventListener("submit", e => { e.preventDefault(); if (onSave && onSave(new FormData(form), form) !== false) closeSheet(); });
  form.querySelectorAll(".opts").forEach(grp => grp.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    grp.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    const h = form.querySelector(`input[name="${grp.dataset.name}"]`);
    if (h) { h.value = b.dataset.v; h.dispatchEvent(new Event("change", { bubbles: true })); }
  }));
  if (opts.del) {
    const del = d.querySelector("[data-del]"); let armed = false;
    del.addEventListener("click", () => { if (!armed) { armed = true; del.textContent = "Tap again to delete"; return; } opts.del(); closeSheet(); });
  }
  d.showModal();
  if (opts.onReady) opts.onReady(form);
  const first = form.querySelector("input:not([type=hidden]),select,textarea");
  if (first && !opts.noFocus) first.focus({ preventScroll: true });
  draggableSheet(d, d.querySelector(".grab"), () => closeSheet());
  const g = G();
  if (g) g.from(d, { yPercent: 100, duration: 0.35, ease: "power3.out" });
}

function finish() {
  const d = dlg; dlg = null;
  if (d) { if (d.open) d.close(); d.remove(); }
  const back = opener && document.querySelector("#view " + opener + ", nav " + opener);
  opener = null;
  if (back) back.focus({ preventScroll: true });
}
function closeNow() { if (dlg) { const d = dlg; dlg = null; if (d.open) d.close(); d.remove(); } }

export function closeSheet() {
  if (!dlg) return;
  const d = dlg, g = G();
  if (g) g.to(d, { yPercent: 100, duration: 0.25, ease: "power2.in", onComplete: () => { if (dlg === d) finish(); } });
  else finish();
}

export const fld = (label, name, val, type = "text", extra = "") => `<div class="field"><label for="f_${name}">${label}</label><input id="f_${name}" name="${name}" type="${type}" value="${esc(val)}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} ${extra}></div>`;
// keeps a category that is no longer in the list, so saving an old bill never silently changes it
export const catSel = val => { const cats = S.settings.categories.includes(val) || !val ? S.settings.categories : [val, ...S.settings.categories]; return `<div class="field"><label for="f_category">Category</label><select id="f_category" name="category">${cats.map(c => `<option ${c === val ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>`; };
export const sel = (label, name, val, choices) => `<div class="field"><label for="f_${name}">${label}</label><select id="f_${name}" name="${name}">${choices.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
export const opts = (label, name, val, choices) => `<div class="field"><span class="lab">${label}</span><input type="hidden" name="${name}" value="${esc(val)}"><div class="opts" data-name="${name}">${choices.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === val}">${esc(l)}</button>`).join("")}</div></div>`;
export const check = (name, label, on) => `<label class="toggle"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${label}</label>`;
export const note = t => `<p class="note" style="margin:0">${t}</p>`;
