import { esc, peso0, mLabel, mAdd, MONTHS, todayISO, fmtDate } from "../format.js";
import { fundBalance, fundTarget, loanStats, payoffPlan, sinkingPerPayday, monthlyEssentials } from "../calc.js";
import { S } from "../store.js";
import { ui } from "../app.js";
import { ic, ring } from "./common.js";
import { chartPayoff } from "../charts.js";

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

export const payoffInputs = today => Object.values(S.loans).map(l => {
  const st = loanStats(l, S, today);
  return { id: l._id, name: l.name, monthly: +l.monthly || 0, rate: +l.rate || 0, balance: +l.balance || st.remaining || 0 };
});

function fundCard(f, today) {
  const bal = fundBalance(f, S), t = fundTarget(f, S), w = t ? Math.min(100, Math.round(bal / t * 100)) : 0;
  const regular = [f.a15 ? peso0(f.a15) + " on 15th" : "", f.a30 ? peso0(f.a30) + " on 30th" : ""].filter(Boolean).join(" · ") || "No regular amount";
  let sub = t ? `<div class="progress"><i data-w="${w}"></i></div><span class="row-meta">${w}% of ${peso0(t)}${f.kind === "emergency" ? " · " + (+f.months || 3) + " months of essentials" : " target"}</span>` : `<span class="row-meta">No target set yet</span>`;
  if (f.kind === "sinking") { const s = sinkingPerPayday(f, bal, today); sub += `<span class="row-meta">${bal >= t ? "Fully funded for " : peso0(s.per) + " a payday covers it by "}${esc(MONTHS[(+f.dueMonth || 12) - 1])}</span>`; }
  const kind = f.kind === "emergency" ? '<span class="chip soft">Emergency</span>' : f.kind === "sinking" ? '<span class="chip soft">Yearly cost</span>' : "";
  return `<button class="card fund anim" data-act="edit-fund" data-id="${esc(f._id)}"><div class="fund-top"><b>${esc(f.name)}</b>${kind}</div><div class="fund-bal money" data-count="${bal}" data-key="fund-${esc(f._id)}">${peso0(bal)}</div>${sub}<span class="row-meta">${esc(regular)}</span></button>`;
}

function payoffCard(today) {
  const inputs = payoffInputs(today), withBal = inputs.filter(l => l.balance > 0 && l.monthly > 0);
  const head = `<div class="card-head"><h2>Debt payoff plan</h2><div class="opts" role="group" aria-label="Payoff method">${[["avalanche", "Avalanche"], ["snowball", "Snowball"]].map(([v, l]) => `<button type="button" data-act="payoff-method" data-m="${v}" aria-pressed="${ui.payoff === v}">${l}</button>`).join("")}</div></div>`;
  if (!withBal.length) return `<section class="card anim">${head}<p class="muted" style="margin:0">Add each loan or card's balance, interest rate and monthly payment to see the fastest way out of debt.</p></section>`;
  const plan = payoffPlan(withBal, ui.payoff), other = payoffPlan(withBal, ui.payoff === "avalanche" ? "snowball" : "avalanche");
  const start = todayISO().slice(0, 7);
  if (plan.never) return `<section class="card anim">${head}<p class="banner">At these payments the interest grows faster than you pay. Raise a monthly payment to see a payoff date.</p></section>`;
  const saving = Math.round(other.interest - plan.interest);
  return `<section class="card anim">${head}
    <div class="payoff-sum"><div><span class="eyebrow">Debt-free by</span><b class="fund-bal">${esc(mLabel(mAdd(start, plan.months)))}</b></div><div><span class="eyebrow">Interest to pay</span><b class="fund-bal money" data-count="${plan.interest}" data-key="payoff-int">${peso0(plan.interest)}</b></div></div>
    ${chartPayoff(plan, start)}
    <p class="note">${ui.payoff === "avalanche" ? "Avalanche pays the highest interest rate first: the least interest overall." : "Snowball clears the smallest balance first: quick wins that keep you going."} When one debt is gone, its payment rolls into the next. ${saving > 0 ? `This saves ${peso0(saving)} in interest compared with ${ui.payoff === "avalanche" ? "snowball" : "avalanche"}.` : saving < 0 ? `${ui.payoff === "avalanche" ? "Snowball" : "Avalanche"} would cost ${peso0(-saving)} less here.` : "Both methods cost the same here."}</p>
  </section>`;
}

export function viewFunds() {
  const today = todayISO(), funds = Object.values(S.funds).sort(byOrder), loans = Object.values(S.loans);
  const total = funds.reduce((t, f) => t + fundBalance(f, S), 0);
  const hasEmergency = funds.some(f => f.kind === "emergency"), ess = monthlyEssentials(S);
  const lc = loans.map(l => {
    const st = loanStats(l, S, today), term = +l.term || 0, f = term ? st.paid / term : 0;
    return `<button class="card fund anim loan" data-act="edit-loan" data-id="${esc(l._id)}">${ring(f)}<span class="loan-body"><b>${esc(l.name)}</b><span class="row-meta">${peso0(l.monthly)} a month · ${st.paid}${term ? " of " + term : ""} paid${l.rate ? " · " + esc(String(l.rate)) + "% a year" : ""}</span><span class="row-meta">${st.left == null ? (l.balance ? "Open-ended · see the payoff plan below" : "Add the number of months to see what's left") : st.left === 0 ? "Fully paid" : st.left + " months left · about " + peso0(st.remaining) + " to go · ends " + esc(st.ends)}</span>${l.balance ? `<span class="row-meta">Balance ${peso0(l.balance)}</span>` : ""}</span></button>`;
  }).join("");
  return `<div class="hero anim" style="margin-bottom:4px"><span class="eyebrow">All savings funds</span><div class="hero-big money" data-count="${total}" data-key="funds-total">${peso0(total)}</div><div class="hero-sub">Opening balance plus every transfer marked as moved, minus withdrawals${S.settings.trackFrom ? " since " + esc(fmtDate(S.settings.trackFrom)) + " " + esc(S.settings.trackFrom.slice(0, 4)) : ""}.</div></div>
  <div class="fu"><div class="fu-a">
  ${!hasEmergency && ess ? `<div class="card anim tip"><b>Start an emergency fund?</b><span class="muted">Three months of your essential bills is ${peso0(ess * 3)}. It covers a job loss or a hospital bill without new debt.</span><button class="btn ghost small" data-act="add-fund" data-kind="emergency">${ic.plus} Emergency fund</button></div>` : ""}
  <div class="section-title"><h2>Savings funds</h2><button class="btn ghost small" data-act="add-fund">${ic.plus} Fund</button></div>
  <div class="cards">${funds.map(f => fundCard(f, today)).join("") || '<div class="card muted">No funds yet.</div>'}</div>
  </div><div class="fu-b">
  <div class="section-title"><h2>Loans & installments</h2><button class="btn ghost small" data-act="add-loan">${ic.plus} Loan</button></div>
  <div class="cards">${lc || '<div class="card muted anim">Add a loan to count down the months left. Each paid bill with the same name counts as one installment.</div>'}</div>
  <div style="margin-top:14px">${payoffCard(today)}</div>
  </div></div>`;
}
