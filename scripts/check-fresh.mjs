// Local check (not run in CI): the old personal data and legacy code are gone; the original spreadsheet is untouched on disk.
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const gone = ["data", "artifact-version", "app/seed-data.js"].filter(p => existsSync(new URL(p, root)));
const kept = existsSync(new URL("spreadsheet/Finances_2026_Improved.xlsx", root));
if (gone.length) { console.log("still present: " + gone.join(", ")); process.exit(1); }
if (!kept) { console.log("the original spreadsheet is missing"); process.exit(1); }
console.log("fresh start verified");
