/**
 * Payday Money Plan: Google Sheet backend (Apps Script web app, bound to the Sheet).
 * Setup steps are in docs/SETUP.md. Security model is in docs/SECURITY.md.
 *
 * Every request is a POST with a JSON body (sent as text/plain so browsers skip the CORS preflight):
 *   {action:"connect", passcode}          -> {ok, token}   (token is stored on the device; only its hash is kept here)
 *   {action:"ping"|"load", token}         -> {ok, data}
 *   {action:"put", token, col, id, doc}   -> {ok}
 *   {action:"delete", token, col, id}     -> {ok}
 *   {action:"revokeAll", token}           -> {ok}          (signs out every device)
 */

var MAX_BODY = 200000, MAX_TEXT = 200, MAX_TOKENS = 20, MAX_FAILS = 10;
var TEXT = 'text', NUM = 'num', NUMN = 'numOrNull', INT = 'int', BOOL = 'bool', DATE = 'date', MONTH = 'month', ID = 'id', LIST = 'list';

// [path in the doc, type, column header (defaults to the last path segment)]; an array type is an allowed-values list.
var SCHEMA = {
  recurring: { tab: 'RecurringBills', cols: [['id', ID], ['name', TEXT], ['category', TEXT], ['amount', NUM], ['payday', ['15', '30', 'both']], ['dueDay', INT], ['endMonth', MONTH], ['active', BOOL], ['order', INT]] },
  funds: { tab: 'Funds', cols: [['id', ID], ['name', TEXT], ['kind', ['', 'emergency', 'sinking']], ['a15', NUM], ['a30', NUM], ['opening', NUM], ['target', NUM], ['months', NUM], ['yearly', NUM], ['dueMonth', INT], ['order', INT]],
    children: [{ path: 'withdrawals', tab: 'FundWithdrawals', parent: 'fundId', cols: [['id', ID], ['date', DATE], ['amount', NUM], ['note', TEXT]] }] },
  loans: { tab: 'Loans', cols: [['id', ID], ['name', TEXT], ['monthly', NUM], ['term', INT], ['paidBefore', INT], ['balance', NUM], ['rate', NUM], ['bills', LIST]] },
  periods: { tab: 'Paydays', cols: [['id', ID], ['month', MONTH], ['half', INT], ['payDate', DATE], ['source', TEXT], ['spending.budget', NUM, 'envelope'], ['bank.balance', NUMN, 'bankBalance'], ['bank.date', DATE, 'bankDate']],
    children: [
      { path: 'incomes', tab: 'PaydayIncome', parent: 'paydayId', cols: [['name', TEXT], ['amount', NUM]] },
      { path: 'bills', tab: 'PaydayBills', parent: 'paydayId', cols: [['id', ID], ['recurringId', TEXT], ['name', TEXT], ['category', TEXT], ['amount', NUM], ['status', ['unpaid', 'partial', 'paid']], ['paidAmount', NUM], ['paidDate', DATE], ['dueDate', DATE], ['notes', TEXT]] },
      { path: 'savings', tab: 'PaydaySavings', parent: 'paydayId', cols: [['id', ID], ['fundId', TEXT], ['name', TEXT], ['amount', NUM], ['moved', BOOL]] },
      { path: 'spending.expenses', tab: 'PaydaySpending', parent: 'paydayId', cols: [['id', ID], ['date', DATE], ['amount', NUM], ['note', TEXT]] }
    ] }
};
var SETTINGS = {
  tab: 'Settings',
  keys: [['comfortable', NUM], ['tight', NUM], ['alert', NUM], ['carryOver', BOOL], ['carryStart', TEXT], ['trackFrom', TEXT], ['envelope.a15', NUM, 'envelope15'], ['envelope.a30', NUM, 'envelope30']],
  lists: [
    { path: 'incomes', tab: 'IncomeSources', cols: [['name', TEXT], ['a15', NUM], ['a30', NUM]] },
    { path: 'categories', tab: 'Categories', cols: [['name', TEXT]], scalar: true },
    { path: 'extras', tab: 'ExtraIncome', cols: [['id', ID], ['name', TEXT], ['month', INT], ['payday', ['15', '30']], ['amount', NUM]] }
  ]
};
var COLLECTIONS = ['recurring', 'funds', 'loans', 'periods'];

/* ---------- pure mapping (no Google services; tested in node) ---------- */
function invalid_(msg) { var e = new Error(msg); e.code = 'invalid'; return e; }
function head_(c) { return c[2] || c[0].split('.').pop(); }
function getPath_(o, p) { return p.split('.').reduce(function (x, k) { return x == null ? undefined : x[k]; }, o); }
function setPath_(o, p, v) { var ks = p.split('.'), x = o; for (var i = 0; i < ks.length - 1; i++) x = x[ks[i]] = x[ks[i]] || {}; x[ks[ks.length - 1]] = v; }
function isText_(t) { return t === TEXT || t === DATE || t === MONTH || t === ID || t === LIST || Array.isArray(t); }
// Sheets runs any cell that starts with = + - @ as a formula (e.g. =IMPORTXML could send data out), so store it as text.
function guard_(s) { return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
function unguard_(s) { return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s; }
function cleanText_(v, label, strict) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (s.length > MAX_TEXT) { if (strict) throw invalid_(label + ' is too long'); s = s.slice(0, MAX_TEXT); }
  return s;
}

function toCell_(type, v, label, strict) {
  if (Array.isArray(type)) {
    var e = v == null ? type[0] : String(v);
    if (type.indexOf(e) < 0) { if (strict) throw invalid_(label + ' must be one of ' + type.join(', ')); e = type[0]; }
    return e;
  }
  switch (type) {
    case TEXT: return guard_(cleanText_(v, label, strict));
    case LIST: return guard_((Array.isArray(v) ? v : []).map(function (x) { return cleanText_(x, label, strict); }).filter(String).join('\n'));
    case ID: { var id = String(v == null ? '' : v); if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) { if (strict) throw invalid_(label + ' is not a valid id'); } return guard_(id.slice(0, 40)); }
    case DATE: case MONTH: {
      var d = v == null ? '' : String(v), re = type === DATE ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
      if (d && !re.test(d)) { if (strict) throw invalid_(label + ' is not a valid date'); return guard_(cleanText_(d, label, false)); }
      return d;
    }
    case BOOL: return v === true || v === 'true' || v === 'TRUE';
    case NUMN: if (v === null || v === '' || v === undefined) return '';
    // falls through
    case NUM: case INT: {
      var n = Number(v == null || v === '' ? 0 : v);
      if (!isFinite(n) || Math.abs(n) > 1e9) { if (strict) throw invalid_(label + ' is not a valid amount'); n = 0; }
      return type === INT ? Math.round(n) : Math.round(n * 100) / 100;
    }
  }
  throw invalid_('unknown type for ' + label);
}

function fromCell_(type, v, fmtDate) {
  if (v instanceof Date || (v && typeof v.getTime === 'function' && typeof v.getFullYear === 'function')) v = fmtDate(v, type === MONTH ? 'month' : 'date');
  if (Array.isArray(type)) { var s = String(v == null ? '' : v); return s === '' ? type[0] : s; }
  switch (type) {
    case TEXT: case ID: case DATE: case MONTH: return unguard_(String(v == null ? '' : v));
    case LIST: return unguard_(String(v == null ? '' : v)).split('\n').map(function (x) { return x.trim(); }).filter(String);
    case BOOL: return v === true || String(v).toUpperCase() === 'TRUE';
    case NUMN: if (v === '' || v == null) return null;
    // falls through
    case NUM: case INT: { var n = Number(v); return isFinite(n) ? n : 0; }
  }
  return v;
}

function rowsFor_(spec, docs, strict, parentId) {
  return docs.map(function (pair) {
    var row = spec.cols.map(function (c) { return toCell_(c[1], c[0] === 'id' && pair.id != null ? pair.id : getPath_(pair.doc, c[0]), spec.tab + '.' + head_(c), strict); });
    return parentId == null ? row : [parentId(pair)].concat(row);
  });
}

// data {settings, recurring, funds, loans, periods} -> {TabName: [header, ...rows]}; only the collections listed in `only`.
function docsToTables(data, strict, only) {
  var out = {}, cols = only || COLLECTIONS.concat(['settings']);
  cols.forEach(function (col) {
    if (col === 'settings') {
      var s = data.settings || {};
      out[SETTINGS.tab] = [['key', 'value']].concat(SETTINGS.keys.map(function (k) { return [head_(k), toCell_(k[1], getPath_(s, k[0]), 'Settings.' + head_(k), strict)]; }));
      SETTINGS.lists.forEach(function (l) {
        var items = (getPath_(s, l.path) || []).map(function (x) { return { doc: l.scalar ? { name: x } : x }; });
        out[l.tab] = [l.cols.map(head_)].concat(rowsFor_(l, items, strict));
      });
      return;
    }
    var spec = SCHEMA[col], ids = Object.keys(data[col] || {}).sort();
    ids.forEach(function (id) { if (strict && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw invalid_(col + ' id is not valid'); });
    out[spec.tab] = [spec.cols.map(head_)].concat(rowsFor_(spec, ids.map(function (id) { return { id: id, doc: data[col][id] }; }), strict));
    (spec.children || []).forEach(function (ch) {
      var rows = [];
      ids.forEach(function (id) {
        var items = (getPath_(data[col][id], ch.path) || []).map(function (x) { return { doc: x }; });
        rows = rows.concat(rowsFor_(ch, items, strict, function () { return id; }));
      });
      out[ch.tab] = [[ch.parent].concat(ch.cols.map(head_))].concat(rows);
    });
  });
  return out;
}

function readRows_(table, cols, fmtDate, extra) {
  if (!table || !table.length) return [];
  var header = table[0].map(String), idx = cols.map(function (c) { return header.indexOf(head_(c)); });
  var pIdx = extra ? header.indexOf(extra) : -1;
  return table.slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v != null; }); }).map(function (r) {
    var o = {};
    cols.forEach(function (c, i) { setPath_(o, c[0], fromCell_(c[1], idx[i] < 0 ? '' : r[idx[i]], fmtDate)); });
    return { doc: o, parent: pIdx < 0 ? '' : fromCell_(TEXT, r[pIdx], fmtDate) }; // a hand-typed id can arrive as a Date
  });
}

// {TabName: [header, ...rows]} -> data. Lenient: columns can be reordered and bad cells become defaults.
function tablesToDocs(tables, fmtDate) {
  fmtDate = fmtDate || function (d, kind) { var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); return kind === 'month' ? iso.slice(0, 7) : iso; };
  var data = { settings: {} };
  var st = tables[SETTINGS.tab] || [];
  SETTINGS.keys.forEach(function (k) {
    var row = st.slice(1).filter(function (r) { return String(r[0]) === head_(k); })[0];
    if (row) setPath_(data.settings, k[0], fromCell_(k[1], row[1], fmtDate));
  });
  SETTINGS.lists.forEach(function (l) {
    var rows = readRows_(tables[l.tab], l.cols, fmtDate).map(function (x) { return l.scalar ? x.doc.name : x.doc; });
    if (tables[l.tab]) setPath_(data.settings, l.path, rows);
  });
  COLLECTIONS.forEach(function (col) {
    var spec = SCHEMA[col], docs = {};
    readRows_(tables[spec.tab], spec.cols, fmtDate).forEach(function (x) { var id = x.doc.id; delete x.doc.id; if (id) docs[id] = x.doc; });
    (spec.children || []).forEach(function (ch) {
      Object.keys(docs).forEach(function (id) { setPath_(docs[id], ch.path, []); });
      readRows_(tables[ch.tab], ch.cols, fmtDate, ch.parent).forEach(function (x) { if (docs[x.parent]) getPath_(docs[x.parent], ch.path).push(x.doc); });
    });
    data[col] = docs;
  });
  return data;
}

function tabsFor_(col) {
  if (col === 'settings') return [SETTINGS.tab].concat(SETTINGS.lists.map(function (l) { return l.tab; }));
  return [SCHEMA[col].tab].concat((SCHEMA[col].children || []).map(function (c) { return c.tab; }));
}
function textColumns_(tab) {
  var all = [[SETTINGS.tab, [['key', TEXT], ['value', TEXT]]]].concat(SETTINGS.lists.map(function (l) { return [l.tab, l.cols]; }));
  COLLECTIONS.forEach(function (c) { all.push([SCHEMA[c].tab, SCHEMA[c].cols]); (SCHEMA[c].children || []).forEach(function (ch) { all.push([ch.tab, [[ch.parent, ID]].concat(ch.cols)]); }); });
  var found = all.filter(function (x) { return x[0] === tab; })[0];
  return found ? found[1].map(function (c, i) { return isText_(c[1]) ? i + 1 : 0; }).filter(Boolean) : [];
}

/* ---------- Google services ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheetDate_(d, kind) { return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), kind === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd'); }
function readAll_() {
  var tables = {};
  ss_().getSheets().forEach(function (sh) { tables[sh.getName()] = sh.getDataRange().getValues(); });
  return tablesToDocs(tables, sheetDate_);
}
// shortcut: each save rewrites the collection's tabs in full; fine for a few thousand rows, switch to per-row updates if saves get slow
function writeTab_(name, rows) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  var width = rows[0].length, lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  // plain-text format for whole columns, so Sheets keeps "2026-11-15" and "007" as typed, even in rows added by hand later
  textColumns_(name).forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  // write first, then clear what is left below or to the right, so a timeout never leaves a half-empty tab
  sh.getRange(1, 1, rows.length, width).setValues(rows);
  if (lastRow > rows.length) sh.getRange(rows.length + 1, 1, lastRow - rows.length, Math.max(lastCol, width)).clearContent();
  if (lastCol > width) sh.getRange(1, width + 1, rows.length, lastCol - width).clearContent();
  sh.setFrozenRows(1);
}
function writeCollection_(data, col) {
  var t = docsToTables(data, false, [col]);
  tabsFor_(col).forEach(function (tab) { writeTab_(tab, t[tab]); });
}

function props_() { return PropertiesService.getScriptProperties(); }
function sha256_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function tokens_() { try { return JSON.parse(props_().getProperty('TOKENS') || '[]'); } catch (e) { return []; } }
function hasToken_(t) { if (typeof t !== 'string' || t.length < 32) return false; var h = sha256_(t); return tokens_().some(function (x) { return x.h === h; }); }

function connect_(b) {
  var cache = CacheService.getScriptCache();
  if (cache.get('locked')) return { ok: false, error: 'locked' };
  var pass = props_().getProperty('PASSCODE') || '';
  if (pass.length < 10) return { ok: false, error: 'setup' };
  // compare hashes so the check does not leak the passcode length or prefix through timing
  if (sha256_(String(b.passcode || '')) !== sha256_(pass)) {
    var fails = Number(cache.get('fails') || 0) + 1;
    if (fails >= MAX_FAILS) { cache.put('locked', '1', 900); cache.remove('fails'); } else cache.put('fails', String(fails), 600);
    Utilities.sleep(800);
    return { ok: false, error: 'passcode' };
  }
  cache.remove('fails');
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var list = tokens_().concat([{ h: sha256_(token), t: new Date().toISOString() }]).slice(-MAX_TOKENS);
  props_().setProperty('TOKENS', JSON.stringify(list));
  return { ok: true, token: token };
}

function handle_(b) {
  if (b.action === 'connect') return connect_(b);
  if (!hasToken_(b.token)) return { ok: false, error: 'auth' };
  if (b.action === 'ping') return { ok: true };
  if (b.action === 'load') return { ok: true, data: readAll_() };
  if (b.action === 'revokeAll') { props_().deleteProperty('TOKENS'); return { ok: true }; }
  if (b.action !== 'put' && b.action !== 'delete') throw invalid_('unknown action');
  var col = String(b.col || '');
  if (col !== 'settings' && COLLECTIONS.indexOf(col) < 0) throw invalid_('unknown collection');
  var id = String(b.id || '');
  if (col !== 'settings' && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw invalid_('id is not valid');
  var data = readAll_();
  if (b.action === 'put') {
    if (!b.doc || typeof b.doc !== 'object' || Array.isArray(b.doc)) throw invalid_('doc must be an object');
    var probe = { settings: {} }; if (col === 'settings') probe.settings = b.doc; else { probe[col] = {}; probe[col][id] = b.doc; }
    docsToTables(probe, true, [col]); // strict check of the incoming doc only
    if (col === 'settings') data.settings = b.doc; else data[col][id] = b.doc;
  } else {
    if (col === 'settings') throw invalid_('settings cannot be deleted');
    delete data[col][id];
  }
  writeCollection_(data, col);
  return { ok: true };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return ContentService.createTextOutput('Payday Money Plan backend is running.'); }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var raw = e && e.postData ? e.postData.contents : '';
    if (!raw || raw.length > MAX_BODY) return json_({ ok: false, error: 'invalid', message: 'request too large or empty' });
    var body = JSON.parse(raw);
    lock.waitLock(20000);
    return json_(handle_(body));
  } catch (err) {
    if (err && err.code === 'invalid') return json_({ ok: false, error: 'invalid', message: err.message });
    console.error(err);
    return json_({ ok: false, error: 'server' }); // no stack traces to the client
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- run these from the Apps Script editor ---------- */
function setup() {
  var pass = props_().getProperty('PASSCODE') || '';
  if (pass.length < 10) throw new Error('First set Project Settings > Script properties > PASSCODE to at least 10 characters.');
  var empty = { settings: { comfortable: 0.5, tight: 0.7, alert: 0.05, carryOver: true, envelope: { a15: 0, a30: 0 }, incomes: [{ name: 'Income 1', a15: 0, a30: 0 }, { name: 'Income 2', a15: 0, a30: 0 }], categories: ['Cards & Loans', 'Family & Household', 'Utilities', 'Other'], extras: [] }, recurring: {}, funds: {}, loans: {}, periods: {} };
  var data = readAll_();
  COLLECTIONS.concat(['settings']).forEach(function (col) {
    var has = tabsFor_(col).some(function (t) { return ss_().getSheetByName(t); });
    writeCollection_(has ? data : empty, col);
  });
  var first = ss_().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss_().getSheets().length > 1) ss_().deleteSheet(first);
  console.log('Setup done. Now Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}
function signOutAllDevices() { props_().deleteProperty('TOKENS'); console.log('Every device is signed out.'); }

// node test hook (Apps Script ignores this)
if (typeof module !== 'undefined') module.exports = { docsToTables: docsToTables, tablesToDocs: tablesToDocs, guard_: guard_, unguard_: unguard_ };
