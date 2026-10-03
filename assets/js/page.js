/* Shared frame for the secondary pages (food, resources, learn python…):
   draws the same nav, More menu, theme toggle and footer as the homepage. */
(function () {
  'use strict';
  const K = window.KSV;
  const { esc, safeUrl, isExternal } = K;
  const $ = (s, r) => (r || document).querySelector(s);

  const SECTIONS = [['top', 'About Me'], ['experience', 'Experience'], ['projects', 'Projects'], ['education', 'Education'], ['volunteering', 'Volunteering'], ['skills', 'Skills']];
  const ext = u => (isExternal(u) || /\.pdf$/i.test(u || '') ? ' target="_blank" rel="noopener"' : '');
  const link = (u, label, attrs) => '<a href="' + esc(safeUrl(u)) + '"' + ext(u) + (attrs || '') + '>' + esc(label) + '</a>';
  const here = location.pathname.split('/').pop() || 'index.html';

  function header(d) {
    const p = d.profile || {};
    const navExtra = (p.links || []).filter(l => !/^(github|linkedin|email)$/i.test(String(l.label).replace(/[^a-z]/gi, '')));
    return '<header class="nav"><div class="wrap nav-inner">' +
      '<a class="nav-home" href="index.html" aria-label="Home"><img src="' + esc(safeUrl(p.logo || 'images/ksv-logo.svg')) + '" alt="KSV"></a>' +
      '<nav class="nav-links" aria-label="Sections">' +
        SECTIONS.map(s => '<a href="index.html#' + s[0] + '">' + s[1] + '</a>').join('') +
        navExtra.map(l => link(l.url, l.label)).join('') +
        (p.resume ? link(p.resume, 'Resumé') : '') +
      '</nav>' +
      ((d.archive || []).length ? '<div class="more-menu"><button class="more-btn" id="more-btn" type="button" aria-expanded="false" aria-controls="more-panel">More ▾</button>' +
        '<div class="more-panel" id="more-panel" hidden>' + d.archive.map(l => link(l.url, l.label, String(l.url) === here ? ' aria-current="page"' : '')).join('') + '</div></div>' : '') +
      '<button class="icon-btn" id="theme-btn" type="button" aria-label="Toggle light or dark theme">◐</button>' +
    '</div></header>';
  }

  function footer(d) {
    const p = d.profile || {};
    const q = d.quote || {};
    return '<footer><div class="wrap">' +
      (q.text ? '<p class="quote">“' + esc(q.text) + '”</p><p class="quote-by">— ' + esc(q.by || '') + '</p>' : '') +
      '<div class="foot-links"><a href="index.html">Home</a>' +
        '<a href="https://github.com/korivernon/korivernon.com" target="_blank" rel="noopener">Website source code</a></div>' +
      '<p class="copy">© ' + new Date().getFullYear() + ' ' + esc(p.name || 'Kori S. Vernon') + '</p>' +
    '</div></footer>';
  }

  function wire() {
    const btn = $('#more-btn'), panel = $('#more-panel');
    if (btn) {
      const set = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', open); };
      btn.addEventListener('click', e => { e.stopPropagation(); set(panel.hidden); });
      document.addEventListener('click', e => { if (!e.target.closest('.more-menu')) set(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    }
    $('#theme-btn').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('ksv:theme', root.dataset.theme); } catch (e) { /* private mode */ }
    });
  }

  // Draw a minimal frame right away so the page never flashes without a nav, then fill it from site.json.
  const fallback = { profile: { name: 'Kori S. Vernon', resume: 'documents/Kori_Vernon_CV.pdf', logo: 'images/ksv-logo.svg' }, archive: [] };
  function mount(d) {
    $('#site-header').outerHTML = header(d);
    $('#site-footer').outerHTML = footer(d);
    wire();
  }
  K.loadSite().then(r => mount(r.data)).catch(() => mount(fallback));
})();
