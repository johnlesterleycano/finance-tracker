// The personal-data scan must pass a clean repo and block each kind of leak (positive controls).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scan = new URL("../scripts/scan.sh", import.meta.url).pathname;
const hook = new URL("../scripts/hooks/pre-commit", import.meta.url).pathname;
const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: "utf8" });

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "scan-test-"));
  run(dir, "git", ["init", "-q"]);
  mkdirSync(join(dir, "scripts/hooks"), { recursive: true });
  copyFileSync(scan, join(dir, "scripts/scan.sh"));
  copyFileSync(hook, join(dir, "scripts/hooks/pre-commit"));
  chmodSync(join(dir, "scripts/hooks/pre-commit"), 0o755); // git skips hooks that aren't executable
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(dir, name, ".."), { recursive: true }); writeFileSync(join(dir, name), text); }
  return dir;
}
// built from parts so this test file itself never contains a real-looking link or token
const execUrl = "https://script.google.com/macros/s/" + "AKfy" + "x".repeat(40) + "/exec";
const token = "a".repeat(64);

test("a clean repo passes", () => {
  const dir = repo({ "README.md": "hello", "app/x.js": "const re = /script\\.google\\.com\\/macros\\/s\\//;", "apps-script/Code.gs": "getProperty('PASSCODE')" });
  const r = run(dir, "sh", ["scripts/scan.sh"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /scan passed/);
  rmSync(dir, { recursive: true, force: true });
});

test("each kind of leak is blocked", () => {
  const leaks = {
    "Finances.xlsx": "fake", "spreadsheet/notes.txt": "x", "data/export.json": "{}", "money-plan-backup-2030-01-01.json": "{}",
    "notes.local.md": "x", "app/config.js": `const url = "${execUrl}";`, "docs/secret.md": "PASS" + "CODE = hunter2hunter2",
    "dump.json": '{ "settings": {}, "periods": { "2030-01-15": {} } }', "conn.json": `{ "token": "${token}" }`
  };
  const dir = repo(leaks);
  const r = run(dir, "sh", ["scripts/scan.sh"]);
  assert.equal(r.status, 1);
  for (const f of Object.keys(leaks)) assert.match(r.stdout, new RegExp("BLOCKED: " + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), f + " was not blocked");
  rmSync(dir, { recursive: true, force: true });
});

test("the denylist blocks private words", () => {
  const dir = repo({ ".gitignore": "*.local.txt\n", "scripts/denylist.local.txt": "Secretname\n", "README.md": "Thanks secretname!" });
  const r = run(dir, "sh", ["scripts/scan.sh"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /README\.md contains a word/);
  assert.doesNotMatch(r.stdout, /BLOCKED: scripts\/denylist/); // ignored, so never published
  rmSync(dir, { recursive: true, force: true });
});

test("the pre-commit hook blocks a staged spreadsheet and allows clean commits", () => {
  const dir = repo({ "README.md": "hello" });
  run(dir, "git", ["config", "core.hooksPath", "scripts/hooks"]);
  run(dir, "git", ["config", "user.email", "t@example.com"]); run(dir, "git", ["config", "user.name", "t"]);
  run(dir, "git", ["add", "README.md", "scripts"]);
  assert.equal(run(dir, "git", ["commit", "-qm", "ok"]).status, 0);
  writeFileSync(join(dir, "budget.xlsx"), "fake");
  run(dir, "git", ["add", "-f", "budget.xlsx"]);
  const r = run(dir, "git", ["commit", "-qm", "leak"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /BLOCKED: budget\.xlsx/);
  rmSync(dir, { recursive: true, force: true });
});
