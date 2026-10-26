// Client for the Apps Script web app. The device keeps the Sheet link and a revocable token, never the passcode.
const CONN = "money-plan-conn-v1";
const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const fail = (code, message = "") => Object.assign(new Error(message || code), { code });
let conn = null;
try { conn = JSON.parse(localStorage.getItem(CONN) || "null"); } catch { conn = null; }

export const connected = () => !!(conn && URL_RE.test(conn.url) && typeof conn.token === "string");
export const validUrl = u => URL_RE.test(String(u || "").trim());

async function post(url, body) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  } catch { throw fail("network"); }
  if (!res.ok) throw fail(res.status >= 500 ? "server" : "network");
  let j;
  try { j = await res.json(); } catch { throw fail("server", "The link didn't answer like the Money Plan script. Check it's the /exec link and access is set to Anyone."); }
  if (!j || j.ok !== true) throw fail(j?.error || "server", j?.message);
  return j;
}

export async function connect(url, passcode) {
  url = String(url || "").trim();
  if (!URL_RE.test(url)) throw fail("url", "Paste the web app link that ends in /exec.");
  const r = await post(url, { action: "connect", passcode: String(passcode || "") });
  conn = { url, token: r.token };
  try { localStorage.setItem(CONN, JSON.stringify(conn)); } catch { throw fail("storage", "This browser won't save data. Turn off private browsing and try again."); }
}

export async function call(action, payload = {}) {
  if (!connected()) throw fail("auth");
  return (await post(conn.url, { ...payload, action, token: conn.token })).data;
}

export function forget() { conn = null; try { localStorage.removeItem(CONN); } catch {} }
