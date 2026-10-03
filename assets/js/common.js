/* Shared by the public site and the admin console. */
(function (global) {
  'use strict';

  const DRAFT_KEY = 'ksv:draft';
  const TOKEN_KEY = 'ksv:gh-token';
  const STATUS_RANK = { live: 0, building: 1, shipped: 2, archived: 3 };
  const STATUSES = ['live', 'building', 'shipped', 'archived'];

  function store(kind) {
    try { return kind === 'session' ? global.sessionStorage : global.localStorage; } catch (e) { return null; }
  }
  function getItem(key) {
    for (const s of [store('local'), store('session')]) {
      try { const v = s && s.getItem(key); if (v) return v; } catch (e) { /* blocked */ }
    }
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Only http(s), mailto, relative and anchor links survive; anything else becomes "#".
  function safeUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '#';
    if (/^(https?:|mailto:|tel:)/i.test(s) || /^[#./a-z0-9_-]/i.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return '#';
  }

  function isExternal(u) { return /^https?:/i.test(u || ''); }

  // Tiny inline markdown: **bold**, *em*, `code`, [text](url). Paragraphs split on blank lines.
  function inline(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      const url = safeUrl(u.replace(/&amp;/g, '&'));
      const ext = isExternal(url) ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + esc(url) + '"' + ext + '>' + t + '</a>';
    });
    return s;
  }
  function md(text) {
    return String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
      .map(p => '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>').join('');
  }

  // "2024-08" -> comparable number; null end = now.
  function ym(s) {
    if (!s) return null;
    const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(s);
    return m ? Number(m[1]) * 12 + (Number(m[2] || 1) - 1) : null;
  }
  function nowYm() { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtYm(s) {
    const v = ym(s);
    if (v == null) return 'Present';
    return MONTHS[v % 12] + ' ' + Math.floor(v / 12);
  }
  function fmtRange(a, b) {
    const left = fmtYm(a);
    const right = b ? fmtYm(b) : 'Present';
    return left === right ? left : left + ' – ' + right;
  }
  function duration(a, b) {
    const s = ym(a); const e = b ? ym(b) : nowYm();
    if (s == null || e == null) return '';
    const months = Math.max(1, e - s + 1);
    const y = Math.floor(months / 12); const m = months % 12;
    return [y ? y + 'y' : '', m ? m + 'm' : ''].filter(Boolean).join(' ');
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // Auto order: featured first, then live work, then conviction, then most recent activity.
  function sortProjects(list, mode) {
    const arr = list.slice();
    if (mode === 'manual') return arr;
    const recent = p => (p.end ? ym(p.end) : nowYm()) * 1000 + (ym(p.start) || 0) / 1000;
    const by = {
      auto: (a, b) =>
        cmp(!!b.featured, !!a.featured) ||
        cmp(STATUS_RANK[a.status] ?? 9, STATUS_RANK[b.status] ?? 9) ||
        cmp(Number(b.conviction) || 0, Number(a.conviction) || 0) ||
        cmp(recent(b), recent(a)),
      newest: (a, b) => cmp(ym(b.start) || 0, ym(a.start) || 0),
      conviction: (a, b) => cmp(Number(b.conviction) || 0, Number(a.conviction) || 0) || cmp(recent(b), recent(a)),
      name: (a, b) => cmp(String(a.name).toLowerCase(), String(b.name).toLowerCase()),
      symbol: (a, b) => cmp(String(a.symbol), String(b.symbol)),
      status: (a, b) => cmp(STATUS_RANK[a.status] ?? 9, STATUS_RANK[b.status] ?? 9) || cmp(recent(b), recent(a)),
    };
    return arr.sort(by[mode] || by.auto);
  }

  // Auto order: current roles first, then by end date, then start date, newest first.
  function sortByDates(list, mode) {
    const arr = list.slice();
    if (mode === 'manual') return arr;
    return arr.sort((a, b) =>
      cmp(!!a.end, !!b.end) ||
      cmp(ym(b.end) || 0, ym(a.end) || 0) ||
      cmp(ym(b.start) || 0, ym(a.start) || 0));
  }

  function readDraft() {
    try { const raw = store('local') && store('local').getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  async function loadSite() {
    const params = new URLSearchParams(global.location.search);
    if (params.has('draft')) {
      const d = readDraft();
      if (d) return { data: d, draft: true };
    }
    const base = global.KSV_BASE || '';
    const res = await fetch(base + 'data/site.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('site.json ' + res.status);
    return { data: await res.json(), draft: false };
  }

  global.KSV = {
    DRAFT_KEY, TOKEN_KEY, STATUSES, STATUS_RANK,
    esc, safeUrl, isExternal, inline, md, ym, nowYm, fmtYm, fmtRange, duration,
    sortProjects, sortByDates, loadSite, readDraft, getItem,
    isAdmin: () => !!getItem(TOKEN_KEY),
  };
})(window);
