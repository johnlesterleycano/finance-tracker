// Static checks of the deployed site shell: the security headers we can set from a static host.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const app = p => new URL("../app/" + p, import.meta.url);
const html = readFileSync(app("index.html"), "utf8");
const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
const directive = name => (csp.split(";").map(s => s.trim()).find(s => s.startsWith(name + " ")) || "").split(/\s+/).slice(1);

test("CSP blocks inline scripts and limits where data can go", () => {
  assert.ok(csp, "CSP meta tag present");
  assert.ok(!directive("script-src").includes("'unsafe-inline'") && !directive("script-src").includes("'unsafe-eval'"));
  assert.deepEqual(directive("script-src").sort(), ["'self'", "https://cdnjs.cloudflare.com"].sort());
  assert.deepEqual(directive("connect-src").sort(), ["'self'", "https://script.google.com", "https://script.googleusercontent.com"].sort());
  for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), d);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("no inline script, and every CDN script has SRI", () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 4);
  for (const [, attrs, body] of scripts) {
    assert.match(attrs, /\bsrc="/, "inline script found");
    assert.equal(body.trim(), "");
    if (/src="https:/.test(attrs)) { assert.match(attrs, /integrity="sha384-[A-Za-z0-9+/=]{64}"/); assert.match(attrs, /crossorigin="anonymous"/); }
  }
  assert.doesNotMatch(html, /\son[a-z]+="/i, "inline event handler found");
});

test("JS never uses eval-like sinks and refuses to run in a frame", () => {
  const files = ["js", "js/views"].flatMap(d => readdirSync(app(d)).filter(f => f.endsWith(".js")).map(f => d + "/" + f));
  for (const f of files) {
    const src = readFileSync(app(f), "utf8");
    assert.doesNotMatch(src, /\beval\(|new Function\(|document\.write\(|insertAdjacentHTML\(/, f);
  }
  assert.match(readFileSync(app("js/main.js"), "utf8"), /window\.top !== window\.self/);
});

test("installable PWA that never caches the Sheet", () => {
  const m = JSON.parse(readFileSync(app("manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  for (const i of m.icons) assert.ok(existsSync(app(i.src)), "missing icon " + i.src);
  assert.ok(existsSync(app("icons/apple-touch-icon.png")));
  const sw = readFileSync(app("sw.js"), "utf8");
  assert.doesNotMatch(sw, /script\.google/);
  assert.match(sw, /req\.method !== "GET"/);
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell.filter(f => f !== "./")) assert.ok(existsSync(app(f)), "service worker lists a missing file: " + f);
});
