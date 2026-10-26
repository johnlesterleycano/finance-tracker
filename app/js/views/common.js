import { S } from "../store.js";

export const ic = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};
export const HOW_TO = "https://github.com/johnlesterleycano/finance-tracker/blob/main/docs/HOW-TO.md";
export const howTo = (label = "How to use the app") => `<a href="${HOW_TO}" target="_blank" rel="noopener noreferrer">${label}</a>`;
export const catColor = c => { const i = S.settings.categories.indexOf(c); return ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"][i < 0 ? 4 : i % 6]; };
// eyebrow and title must already be escaped by the caller
export const empty = (eyebrow, title, text, button) => `<div class="card empty anim">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h2 style="margin-top:8px">${title}</h2><p>${text}</p>${button || ""}</div>`;
export const ring = f => { const C = 2 * Math.PI * 22, arc = f > 0 ? `<circle class="arc" cx="27" cy="27" r="22" fill="none" stroke="var(--pink)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C * Math.min(1, f)} ${C}" transform="rotate(-90 27 27)"/>` : ""; return `<svg class="ring" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="var(--blush)" stroke-width="6"/>${arc}</svg>`; };
