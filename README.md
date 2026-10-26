# Payday Money Plan

A phone-first budget for people paid twice a month, on the 15th and the 30th. Each payday you tick bills paid, move money into savings funds, and see what's left to assign. Leftover cash carries into the next payday.

Live site: https://johnlesterleycano.github.io/finance-tracker/

It runs as a static site on GitHub Pages. Your data lives in **your own private Google Sheet**, reached through a small Apps Script web app that you deploy. This repo holds code only, never data.

## What it does

| Tab | What you see and do |
| --- | --- |
| **Payday** | Income, bills and savings for one payday, plus what's left to assign. Tap to tick a bill paid, or swipe it for "part paid" and "edit". Also here: alerts for bills due soon, a spending-money envelope with an expense log, and a bank check that compares your real balance with the plan. |
| **Month** | Both paydays side by side, Comfortable / Watch / Tight health checks, charts, and **Balance my paydays**, which suggests bills to move between the 15th and the 30th. |
| **Funds** | Savings funds with balances and targets: an emergency fund sized from your bills, and sinking funds for yearly costs. Loans count down their remaining months, and a debt payoff planner compares avalanche and snowball. |
| **Trends** | The last 12 months, plus setup: recurring bills (15th, 30th or both, with due days and end months), income sources, yearly extras such as 13th month pay, rules, and your data settings. |

## Health rules

- **Bills load** is bills ÷ income: up to 50% is Comfortable, up to 70% is Watch, above that is Tight.
- **Unallocated cash** is income + carried in − bills − savings − spending money. Above 5% of income the app says "Assign it"; below zero it says "Over budget".
- You can change all thresholds in Trends › Rules.

## Project layout

| Path | What it is |
| --- | --- |
| `app/` | The website (plain HTML, CSS and JavaScript modules, no build step). GitHub Pages serves this folder. |
| `app/js/calc.js` | All money rules as pure functions. |
| `app/js/store.js`, `app/js/api.js` | Local cache, offline outbox and the Sheet client. |
| `apps-script/Code.gs` | The Google Sheet backend (paste it into the Sheet's Apps Script editor). |
| `tests/` | Node tests: money rules, Sheet mapping and auth, site security headers, the personal-data scan. |
| `scripts/scan.sh` | Blocks spreadsheets, exports, Sheet links and passcodes from ever being committed. |
| `docs/SETUP.md` | Step by step: Sheet, Apps Script, GitHub Pages. |
| `docs/SECURITY.md` | Threat model and protections. |

## Run it locally

```sh
cd app && python3 -m http.server 8000   # then open http://localhost:8000
npm test                                 # node 20+; no dependencies to install
sh scripts/scan.sh                       # personal-data check
git config core.hooksPath scripts/hooks  # once per clone: runs the scan before every commit
```

Choose "Use on this device only" to try it without a Sheet.

## Deploy

See [docs/SETUP.md](docs/SETUP.md). Pushing to `main` runs the scan and the tests, then deploys `app/` to GitHub Pages.
