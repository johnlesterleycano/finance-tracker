# Payday Money Plan: notes for Claude

A twice-a-month (15th / 30th payday) budget web app. Static site on GitHub Pages (`app/`), with a Google Sheet as the database through an Apps Script web app (`apps-script/Code.gs`). Personal notes, if any, are in `CLAUDE.local.md` (gitignored).

## Hard rules
- **This repo is public. Never commit personal data**: no real amounts, names, Sheet links, passcodes, tokens, exports or spreadsheets. Tests use synthetic fixtures only. Run `sh scripts/scan.sh` before committing; CI runs it too.
- Never modify `spreadsheet/` (the original source spreadsheet; gitignored).
- Work autonomously and note decisions in this file or the README.

## Design
- Desktop-first: used mainly in a computer or laptop browser, the phone is secondary. From 900px wide: sidebar navigation (keyboard: ← → month, 1–4 sections), one-row header, centered dialogs, bill actions on hover/focus. Below 900px: bottom tab bar, bottom sheets, swipeable bill rows.
- Statement + summary rail (chosen 2026-10-26 to replace the "task board" grid of equal cards): every view is `.st > .st-main + .st-rail`. From 900px `.st-main` is one flat sheet whose sections (`.card.sec` / `.sec`) are split by hairlines, with section totals (`.sec-total`) in one right-hand column; bills show due and category as columns (`.col-when`, `.col-cat`). From 1100px the rail sits on the right and its first panel is sticky (`.st-rail.static` opts out). Below 900px the wrappers are `display: contents`, so sections stay cards; `.ph-first` / `.ph-last` reorder non-interactive items only, and `.ph-only` / `.eq-only` swap phone and desktop wording.
- Pink design system: rose/blush tokens on `:root` in `app/css/app.css`; green/amber/red only for Comfortable/Watch/Tight. White text sits on `--accent`, never `--pink` (contrast).

## Layout
- `app/js/calc.js`: all money rules, pure, tested in `tests/calc.test.js`. Change rules here, not in views.
- `app/js/store.js`: state `S`, local and sheet modes, localStorage cache, outbox (key `col/id` → edit counter), `put()` / `putSettings()`.
- `app/js/api.js`: Apps Script client. The Sheet link must match `https://script.google.com/macros/s/…/exec`.
- `app/js/views/*.js`: return HTML strings. **Every interpolated value goes through `esc()` or a number formatter.**
- `app/js/actions.js`: tap handlers and edit sheets (bottom sheets on native `<dialog>`, in `forms.js`).
- `app/js/tour.js`: first-run tour of the Payday screen (7 steps). Spotlight + card are `popover="manual"`, non-modal so the page stays usable; offered once per device (localStorage `money-plan-tour-v1`), replayed from Trends & setup. Steps target `.hero-band`, `#billsCard`, `#savingsCard`, `#spendCard`, `.top-row`, `.side-nav`/`#tabbar`, `.sync`: keep those when changing views. User guide: `docs/HOW-TO.md`.
- `app/js/theme.js`: plain (non-module) script in `<head>` so the saved Light / Dark / Match device choice applies before first paint (CSP forbids inline scripts). Sets `data-theme` on `<html>` (the CSS already keys dark tokens off it) and the `theme-color` metas; per device in localStorage `money-plan-theme-v1`, not synced to the Sheet. Picker: Trends & setup › Appearance.
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
