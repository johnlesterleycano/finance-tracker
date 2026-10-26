# Payday Money Plan: notes for Claude

A twice-a-month (15th / 30th payday) budget web app. Static site on GitHub Pages (`app/`), with a Google Sheet as the database through an Apps Script web app (`apps-script/Code.gs`). Personal notes, if any, are in `CLAUDE.local.md` (gitignored).

## Hard rules
- **This repo is public. Never commit personal data**: no real amounts, names, Sheet links, passcodes, tokens, exports or spreadsheets. Tests use synthetic fixtures only. Run `sh scripts/scan.sh` before committing; CI runs it too.
- Never modify `spreadsheet/` (the original source spreadsheet; gitignored).
- Work autonomously and note decisions in this file or the README.

## Layout
- `app/js/calc.js`: all money rules, pure, tested in `tests/calc.test.js`. Change rules here, not in views.
- `app/js/store.js`: state `S`, local and sheet modes, localStorage cache, outbox (key `col/id` → edit counter), `put()` / `putSettings()`.
- `app/js/api.js`: Apps Script client. The Sheet link must match `https://script.google.com/macros/s/…/exec`.
- `app/js/views/*.js`: return HTML strings. **Every interpolated value goes through `esc()` or a number formatter.**
- `app/js/actions.js`: tap handlers and edit sheets (bottom sheets on native `<dialog>`, in `forms.js`).
- `app/js/motion.js`: GSAP 3.13.0 (cdnjs + SRI): `gsap.matchMedia` for reduced motion, Flip, Draggable (sheet handle only), sparkles. Bill swipe uses CSS scroll-snap, not JS gestures.
- `apps-script/Code.gs`: typed schema, `docsToTables` / `tablesToDocs` (pure, tested with fakes in `tests/sheet.test.js`), auth with hashed device tokens, lockout, formula-injection escaping.

## Data model (`normalizeData` in calc.js is the source of truth)
- `settings`: incomes [{name, a15, a30}], categories, comfortable 0.5, tight 0.7, alert 0.05, carryOver, carryStart, trackFrom, envelope {a15, a30}, extras [{id, name, month, payday, amount}].
- `recurring`: name, category, amount, payday "15" / "30" / "both", dueDay, endMonth, active, order.
- `funds`: name, kind "" / "emergency" / "sinking", a15, a30, opening, target, months, yearly, dueMonth, order, withdrawals[].
- `loans`: name, monthly, term, paidBefore, balance, rate (% a year), bills (names of linked bills).
- `periods` (id `YYYY-MM-15` / `YYYY-MM-30`): incomes, bills (status unpaid/partial/paid, paidAmount, paidDate, dueDate, notes), savings (moved), spending {budget, expenses[]}, bank {balance, date}.
- Unallocated = income + carried in − bills − savings − max(envelope budget, spent).

## Decisions
- Fresh start on 2026-10-26: the old data and the legacy single-file / claude.ai-artifact versions were removed.
- Default income names are generic ("Income 1", "Income 2"); people's names are typed in the app, so none live in this public code.
- Pull-to-refresh and swipe-to-change-month were dropped: they would fight the swipeable bill rows, and the web guidance says not to intercept touch scrolling. The sync chip is tap-to-sync instead.
- Restore from a backup file works in device-only mode only; in Sheet mode the Sheet's version history is the backup.

## Commands
`npm test` · `sh scripts/scan.sh` · `cd app && python3 -m http.server 8000` · `git config core.hooksPath scripts/hooks`
