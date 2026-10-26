// GSAP motion. Everything is optional: if the CDN fails or the user prefers reduced motion, the app works the same, just still.
import { peso0, pct } from "./format.js";

const gs = () => window.gsap || null;
let motionOK = false, ctx = null;
const lastCount = new Map(); // data-key -> last shown value, so edits count from the old number, not from 0

export function initMotion() {
  const g = gs();
  if (!g) return;
  g.config({ nullTargetWarn: false }); // views without charts select nothing, which is fine
  if (window.Flip) g.registerPlugin(window.Flip);
  if (window.Draggable) g.registerPlugin(window.Draggable);
  g.matchMedia().add("(prefers-reduced-motion: no-preference)", () => { motionOK = true; return () => { motionOK = false; }; });
}
export const G = () => (motionOK ? gs() : null);

// Animate a freshly rendered view. kind: "enter" (stagger cards in), "slide" (direction-aware), "update" (numbers only)
export function animateView(root, kind = "update", dir = 1) {
  ctx?.revert(); ctx = null;
  const g = G();
  const counts = root.querySelectorAll("[data-count]");
  const fmt = el => el.dataset.fmt === "pct" ? pct : peso0;
  if (!g) {
    counts.forEach(el => { el.textContent = fmt(el)(+el.dataset.count); if (el.dataset.key) lastCount.set(el.dataset.key, +el.dataset.count); });
    root.querySelectorAll("[data-w]").forEach(el => { el.style.width = el.dataset.w + "%"; });
    return;
  }
  ctx = g.context(() => {
    counts.forEach(el => {
      const to = +el.dataset.count, key = el.dataset.key, f = fmt(el);
      const from = kind === "update" && key && lastCount.has(key) ? lastCount.get(key) : kind === "update" ? to : 0;
      if (key) lastCount.set(key, to);
      if (from === to) { el.textContent = f(to); return; }
      const o = { v: from };
      g.to(o, { v: to, duration: kind === "update" ? 0.4 : 0.45, ease: "power2.out", onUpdate: () => { el.textContent = f(o.v); }, onComplete: () => { el.textContent = f(to); } });
    });
    root.querySelectorAll("[data-w]").forEach(el => {
      if (kind === "update") g.to(el, { width: el.dataset.w + "%", duration: 0.35, ease: "power2.out" });
      else g.fromTo(el, { width: "0%" }, { width: el.dataset.w + "%", duration: 0.45, ease: "power3.out", delay: 0.1 });
    });
    if (kind === "update") return;
    if (kind === "slide") g.from(root, { x: 28 * dir, opacity: 0, duration: 0.3, ease: "power3.out", clearProps: "transform,opacity" });
    else g.from(root.querySelectorAll(".anim"), { y: 16, opacity: 0, duration: 0.4, stagger: 0.05, ease: "power3.out", clearProps: "transform,opacity" });
    g.from(root.querySelectorAll(".bar"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.45, stagger: 0.02, ease: "power3.out", delay: 0.08 });
    g.from(root.querySelectorAll(".hbar"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.45, stagger: 0.04, ease: "power3.out", delay: 0.08 });
    root.querySelectorAll(".arc").forEach((a, i) => {
      const len = a.getTotalLength ? a.getTotalLength() : 0;
      g.fromTo(a, { strokeDasharray: len + " " + len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.45, delay: 0.08 + i * 0.04, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" });
    });
    g.from(root.querySelectorAll(".line"), { strokeDashoffset: 1000, strokeDasharray: 1000, duration: 0.5, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" });
  }, root);
}

export function placePill(pill, on, animate) {
  if (!pill || !on) return;
  const r = { left: on.offsetLeft, width: on.offsetWidth }, g = G();
  if (g && animate) g.to(pill, { left: r.left, width: r.width, duration: 0.35, ease: "power3.out" });
  else Object.assign(pill.style, { left: r.left + "px", width: r.width + "px" });
}

export function pop(el) { const g = G(); if (g && el) g.fromTo(el, { scale: 0.6 }, { scale: 1, duration: 0.4, ease: "back.out(3)" }); }

// Run a DOM change and let Flip glide the [data-flip-id] elements from their old to their new places.
export function flip(change) {
  const g = G();
  if (!g || !window.Flip) { change(); return; }
  const state = window.Flip.getState("#view [data-flip-id]");
  change();
  window.Flip.from(state, { targets: "#view [data-flip-id]", duration: 0.4, ease: "power2.inOut", nested: true, prune: true });
}

// A short burst of pink sparks from an element (all bills paid, fund target reached, loan finished).
export function sparkle(el) {
  const g = G();
  if (!g || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const colors = ["var(--pink)", "var(--hero-a)", "var(--c3)", "var(--c6)"];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("i");
    s.className = "spark";
    s.style.cssText = `left:${cx - 4}px;top:${cy - 4}px;background:${colors[i % 4]}`;
    document.body.appendChild(s);
    const a = (i / 14) * Math.PI * 2, d = 36 + Math.random() * 34;
    g.to(s, { x: Math.cos(a) * d, y: Math.sin(a) * d, scale: 0.2, opacity: 0, duration: 0.6, ease: "power2.out", onComplete: () => s.remove() });
  }
}

// Drag the sheet down by its handle to close it. Works with reduced motion too (it's a gesture, not decoration).
export function draggableSheet(dialog, handle, close) {
  const D = window.Draggable, g = gs();
  if (!D || !g) return null;
  return D.create(dialog, {
    type: "y", trigger: handle, bounds: { minY: 0, maxY: 2000 }, zIndexBoost: false,
    onRelease() { if (this.y > Math.min(140, dialog.offsetHeight * 0.3)) close(this.y); else if (G()) g.to(dialog, { y: 0, duration: 0.25, ease: "power3.out" }); else g.set(dialog, { y: 0 }); }
  })[0];
}
