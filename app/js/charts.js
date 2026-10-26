// Hand-drawn SVG charts, one scale each. Colors come from CSS tokens so light and dark both work.
import { esc, peso0, pct, kfmt, sum, mAdd, mLabel, mShort } from "./format.js";
import { monthData } from "./calc.js";

function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const legend = items => `<div class="legend">${items.map(([n, c]) => `<div><i class="dot" style="background:${c}"></i><span>${esc(n)}</span></div>`).join("")}</div>`;

export function chartHalves(d) {
  const W = 340, H = 200, L = 44, R = 8, T = 12, B = 28, ser = [["Income", "var(--c7)", "inc"], ["Bills", "var(--c1)", "bills"], ["Savings", "var(--c6)", "save"]];
  const max = niceMax(Math.max(d.A.inc, d.B.inc, d.A.bills, d.B.bills, 1)), y = v => T + (H - T - B) * (1 - v / max);
  const gw = (W - L - R) / 2, bw = 22;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income, bills and savings for each payday">`;
  [0, .25, .5, .75, 1].map(f => f * max).forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${kfmt(t)}</text>`; });
  [["15th", d.A], ["30th", d.B]].forEach(([lab, h], gi) => {
    const cx = L + gw * gi + gw / 2;
    ser.forEach(([n, c, k], i) => { const x = cx + (i - 1) * (bw + 6) - bw / 2, v = h[k] || 0; s += `<rect class="bar" x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(0) - y(v))}" rx="6" fill="${c}"><title>${lab} ${n}: ${peso0(v)}</title></rect>`; });
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="lbl">${lab}</text>`;
  });
  return s + `</svg>` + legend(ser);
}

export function chartDonut(segs, inc) {
  const total = sum(segs, x => x.v) || 1, R = 58, C = 75, sw = 22;
  let a0 = -Math.PI / 2, s = `<div class="donut-wrap"><svg class="chart" viewBox="0 0 150 150" role="img" aria-label="Share of the month's income by use">`;
  s += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--blush)" stroke-width="${sw}"/>`;
  segs.forEach(g => {
    const a1 = a0 + 2 * Math.PI * g.v / total - 0.0001, large = a1 - a0 > Math.PI ? 1 : 0;
    s += `<path class="arc" d="M${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}" fill="none" stroke="${g.c}" stroke-width="${sw}"><title>${esc(g.k)}: ${peso0(g.v)}</title></path>`;
    a0 = a1 + 0.0001;
  });
  s += `<text x="${C}" y="${C - 2}" text-anchor="middle" class="lbl" style="font-size:15px;font-weight:800">${peso0(inc)}</text><text x="${C}" y="${C + 15}" text-anchor="middle">income</text></svg>`;
  return s + `<div class="legend" style="grid-template-columns:1fr;margin:0">${segs.map(g => `<div><i class="dot" style="background:${g.c}"></i><span>${esc(g.k)}</span><b class="money">${peso0(g.v)}</b></div>`).join("")}</div></div>`;
}

export function chartPaid(d) {
  const max = Math.max(d.A.bills, d.B.bills, 1);
  return [["15th", d.A], ["30th", d.B]].map(([lab, h]) => {
    const pw = h.paid / max * 100, tw = (h.bills - h.paid) / max * 100;
    return `<div class="paidbar"><b>${lab}</b><div><div class="paidbar-track"><span class="hbar" style="width:${pw}%;background:var(--pink)"></span><span class="hbar" style="width:${tw}%;background:var(--pink-soft)"></span></div><div class="row-meta" style="margin-top:4px">${peso0(h.paid)} paid · ${peso0(h.bills - h.paid)} to pay</div></div></div>`;
  }).join("") + legend([["Paid", "var(--pink)"], ["Still to pay", "var(--pink-soft)"]]);
}

export function chartTrend(D, month, ch) {
  const months = []; for (let i = 11; i >= 0; i--) months.push(mAdd(month, -i));
  const data = months.map(m => { const d = monthData(D, m, ch); return { m, inc: d.inc, bills: d.bills, has: !!(d.a || d.b) }; });
  const W = 420, H = 220, L = 54, R = 6, T = 14, B = 30, max = niceMax(Math.max(...data.map(x => Math.max(x.inc, x.bills)), 1)), y = v => T + (H - T - B) * (1 - v / max);
  const gw = (W - L - R) / 12, bw = Math.min(14, gw / 2 - 3), st = D.settings;
  let s = `<div class="scroll-x"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and bills for the last 12 months">`;
  [0, .25, .5, .75, 1].forEach(f => { const t = f * max; s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${kfmt(t)}</text>`; });
  data.forEach((x, i) => {
    const cx = L + gw * i + gw / 2;
    if (x.has) s += `<rect class="bar" x="${cx - bw - 1}" y="${y(x.inc)}" width="${bw}" height="${y(0) - y(x.inc)}" rx="4" fill="var(--c7)"><title>${mLabel(x.m)} income ${peso0(x.inc)}</title></rect><rect class="bar" x="${cx + 1}" y="${y(x.bills)}" width="${bw}" height="${y(0) - y(x.bills)}" rx="4" fill="var(--c1)"><title>${mLabel(x.m)} bills ${peso0(x.bills)}</title></rect>`;
    s += `<text x="${cx}" y="${H - 10}" text-anchor="middle" ${x.m === month ? 'class="lbl"' : ""}>${mShort(x.m)}</text>`;
  });
  s += `</svg></div>` + legend([["Income", "var(--c7)"], ["Bills", "var(--c1)"]]);
  const H2 = 150, y2 = v => T + (H2 - T - B) * (1 - Math.min(v, 1.2) / 1.2);
  const pts = data.map((x, i) => x.has && x.inc ? [L + gw * i + gw / 2, y2(x.bills / x.inc), x] : null).filter(Boolean);
  let s2 = `<div class="scroll-x" style="margin-top:14px"><svg class="chart" viewBox="0 0 ${W} ${H2}" role="img" aria-label="Bills as a share of income by month">`;
  s2 += `<rect x="${L}" y="${y2(st.tight)}" width="${W - L - R}" height="${y2(0) - y2(st.tight)}" fill="var(--warn-bg)" opacity=".55"/><rect x="${L}" y="${y2(st.comfortable)}" width="${W - L - R}" height="${y2(0) - y2(st.comfortable)}" fill="var(--good-bg)" opacity=".8"/>`;
  [0, .5, 1].forEach(t => { s2 += `<text x="${L - 6}" y="${y2(t) + 4}" text-anchor="end">${pct(t)}</text>`; });
  if (pts.length > 1) s2 += `<polyline class="line" points="${pts.map(p => p[0] + "," + p[1]).join(" ")}" fill="none" stroke="var(--pink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p, i) => { const last = i === pts.length - 1; s2 += `<circle cx="${p[0]}" cy="${p[1]}" r="${last ? 5 : 3.5}" fill="${last ? "var(--pink)" : "var(--surface)"}" stroke="var(--pink)" stroke-width="2"><title>${mLabel(p[2].m)}: ${pct(p[2].bills / p[2].inc)}</title></circle>`; });
  data.forEach((x, i) => { s2 += `<text x="${L + gw * i + gw / 2}" y="${H2 - 10}" text-anchor="middle">${mShort(x.m)}</text>`; });
  return s + s2 + `</svg></div><p class="note">Green band: Comfortable (up to ${pct(st.comfortable)} of income). Amber: Watch (up to ${pct(st.tight)}). Above that is Tight.</p>`;
}

// One bar per debt from now to the month it is paid off.
export function chartPayoff(plan, startMonth) {
  if (!plan.order.length) return "";
  const max = plan.months || 1;
  return `<div class="timeline" role="list">${plan.order.map((o, i) => `<div class="tl-row" role="listitem"><span class="tl-name">${i + 1}. ${esc(o.name)}</span><div class="tl-track"><span class="hbar" style="width:${Math.max(4, o.month / max * 100)}%"></span></div><span class="tl-when">${esc(mLabel(mAdd(startMonth, o.month)))}</span></div>`).join("")}</div>`;
}
