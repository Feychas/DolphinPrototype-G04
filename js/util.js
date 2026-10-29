/* Dolphin AutoTrack prototype — shared utilities.
   Everything is deterministic: no machine clock, no storage, no network. */
(function (global) {
  'use strict';

  const Util = {};

  /* ---------- cloning / ids ---------- */
  Util.deepCopy = function (value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  };

  let seq = 0;
  Util.uid = function (prefix) {
    seq += 1;
    return (prefix || 'id') + '-' + seq;
  };

  /* ---------- numbers & money ---------- */
  Util.isNum = function (v) {
    return typeof v === 'number' && isFinite(v);
  };
  Util.parseNum = function (v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim().replace(/,/g, '');
    if (s === '') return NaN;
    return Number(s);
  };
  Util.parseIntStrict = function (v) {
    const n = Util.parseNum(v);
    if (!isFinite(n)) return NaN;
    if (Math.abs(n - Math.round(n)) > 1e-9) return NaN;
    return Math.round(n);
  };
  Util.round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  Util.roundHalfUp = function (n) { return Math.floor(n + 0.5); };

  /** Whole MMK, half up. */
  Util.mmk = function (n) {
    if (!Util.isNum(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  };
  Util.mmkSigned = function (n) {
    if (!Util.isNum(n)) return '—';
    const r = Math.round(n);
    if (r === 0) return '0';
    return (r > 0 ? '+' : '−') + Math.abs(r).toLocaleString('en-US');
  };
  Util.qty = function (n) {
    if (!Util.isNum(n)) return '—';
    const r = Math.round(n * 100) / 100;
    return String(r);
  };

  /* ---------- text ---------- */
  Util.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  Util.norm = function (s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase(); };
  Util.normPlate = function (s) { return Util.norm(s).replace(/\s+/g, ''); };
  Util.pad4 = function (n) { return String(n).padStart(4, '0'); };

  /* ---------- dates (demo clock is the only clock) ---------- */
  const TZ = 'Asia/Yangon';
  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

  Util.parseDate = function (iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  };
  Util.fmtDate = function (iso) {
    const d = Util.parseDate(iso);
    return d ? dateFmt.format(d) : '—';
  };
  Util.fmtDateTime = function (iso) {
    const d = Util.parseDate(iso);
    return d ? dateTimeFmt.format(d) : '—';
  };
  Util.fmtTime = function (iso) {
    const d = Util.parseDate(iso);
    return d ? timeFmt.format(d) : '—';
  };
  /** Local workshop date as YYYY-MM-DD (Asia/Yangon). */
  Util.dayKey = function (iso) {
    const d = Util.parseDate(iso);
    if (!d) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
  };
  Util.fmtWeekday = function (iso) {
    const d = Util.parseDate(iso);
    if (!d) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(d);
  };
  Util.addDays = function (iso, days) {
    const d = Util.parseDate(iso);
    if (!d) return null;
    const nd = new Date(d.getTime() + days * 86400000);
    return nd.toISOString();
  };
  Util.addDaysToKey = function (dayKey, days) {
    const d = new Date(dayKey + 'T00:00:00+06:30');
    const nd = new Date(d.getTime() + days * 86400000);
    return Util.dayKey(nd.toISOString());
  };
  Util.msBetween = function (a, b) {
    const da = Util.parseDate(a), db = Util.parseDate(b);
    if (!da || !db) return 0;
    return db.getTime() - da.getTime();
  };
  Util.hoursBetween = function (a, b) { return Util.msBetween(a, b) / 3600000; };
  Util.daysBetween = function (a, b) { return Util.msBetween(a, b) / 86400000; };
  /** Local datetime string for <input type="datetime-local"> in Asia/Yangon. */
  Util.toLocalInput = function (iso) {
    const d = Util.parseDate(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const map = {};
    p.forEach(x => { map[x.type] = x.value; });
    return map.year + '-' + map.month + '-' + map.day + 'T' + map.hour + ':' + map.minute;
  };
  /** Convert a datetime-local input value (assumed Asia/Yangon) to an ISO string with +06:30. */
  Util.fromLocalInput = function (value) {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (!m) return null;
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':00+06:30';
  };

  /* ---------- collections ---------- */
  Util.byId = function (list, id) {
    if (!list) return null;
    for (let i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
    return null;
  };
  Util.sum = function (list, fn) {
    return list.reduce((acc, x) => acc + (fn ? fn(x) : x), 0);
  };
  Util.groupBy = function (list, fn) {
    const out = {};
    list.forEach(x => {
      const k = fn(x);
      (out[k] = out[k] || []).push(x);
    });
    return out;
  };
  Util.sortBy = function (list, fn) {
    return list.slice().sort((a, b) => {
      const ka = fn(a), kb = fn(b);
      if (ka === kb) return 0;
      return ka < kb ? -1 : 1;
    });
  };

  /* ---------- dom ---------- */
  Util.el = function (selector, root) { return (root || document).querySelector(selector); };
  Util.els = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  Util.on = function (root, type, sel, fn) {
    root.addEventListener(type, function (ev) {
      const t = ev.target.closest(sel);
      if (t && root.contains(t)) fn(ev, t);
    });
  };

  global.Util = Util;
})(window);
