// Light / dark choice for this device. A plain (non-module) script in <head>, so a saved choice applies before the
// first paint instead of flashing the other theme. "system" follows the device setting.
(() => {
  const KEY = "money-plan-theme-v1", BAR = { light: "#f4c2c2", dark: "#211517" };
  const apply = t => {
    const root = document.documentElement;
    if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
    // browser toolbar color: the forced theme's, or each media variant's own when following the device
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = BAR[t] || (m.media.includes("dark") ? BAR.dark : BAR.light); });
  };
  let saved = "";
  try { saved = localStorage.getItem(KEY) || ""; } catch {}
  apply(saved);
  window.paydayTheme = {
    get: () => document.documentElement.dataset.theme || "system",
    set: t => { try { if (t === "light" || t === "dark") localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch {} apply(t); }
  };
})();
