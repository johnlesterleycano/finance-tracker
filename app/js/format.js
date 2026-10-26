// Formatting and date helpers. Pure: no DOM, so node tests can import them.
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
export const round2 = v => Math.round((+v || 0) * 100) / 100;
// whole pesos show no decimals; anything with centavos shows both digits (₱38,749.50, not ₱38,749.5)
export const peso = v => { const a = Math.abs(round2(v)); return (v < 0 ? "−₱" : "₱") + (Number.isInteger(a) ? nf : nf2).format(a); };
export const peso0 = v => (v < 0 ? "−₱" : "₱") + nf0.format(Math.abs(+v || 0));
export const pct = v => Math.round((+v || 0) * 100) + "%";
export const kfmt = v => v >= 1000 ? "₱" + nf.format(Math.round(v / 100) / 10) + "k" : "₱" + nf0.format(v);
export const amt0 = v => (v < 0 ? "−" : "") + nf0.format(Math.abs(Math.round(v)));
// accepts "1,234.50", "₱500" and a typed minus sign (U+2212)
export const num = v => { const n = parseFloat(String(v ?? "").replace(/−/g, "-").replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; };
export const uid = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a, b => b.toString(36).padStart(2, "0")).join("").slice(0, 10); };
// sum in centavos so 0.1 + 0.2 stays 0.3
export const sum = (a, f) => Math.round(a.reduce((t, x) => t + Math.round((+f(x) || 0) * 100), 0)) / 100;
export const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const isMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m));
export const isISO = s => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));
export const mLabel = m => isMonth(m) ? MONTHS[+m.slice(5, 7) - 1] + " " + m.slice(0, 4) : String(m ?? "");
export const mShort = m => isMonth(m) ? MONTHS[+m.slice(5, 7) - 1].slice(0, 3) : "";
export const mAdd = (m, n) => { let y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + String(mo + 1).padStart(2, "0"); };
export const pid = (m, h) => m + "-" + (h == 1 ? "15" : "30");
export const lastDay = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
export const payDay = (m, h) => h == 1 ? 15 : Math.min(30, lastDay(m));
export const defaultPayDate = (m, h) => m + "-" + String(payDay(m, h)).padStart(2, "0");
export const isoOf = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const todayISO = () => isoOf(new Date());
// whole days from a to b (both ISO dates), DST-safe
export const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
// sheet cells can be hand-edited, so a bad date shows as typed instead of crashing the screen
export const fmtDate = iso => { if (!iso) return ""; if (!isISO(iso)) return String(iso); return MONTHS[+iso.slice(5, 7) - 1].slice(0, 3) + " " + (+iso.slice(8, 10)); };
