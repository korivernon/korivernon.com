(function () {
  'use strict';
  const K = window.KSV;
  const { esc, md, inline, safeUrl, isExternal } = K;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = { data: null, draft: false, cat: 'All', showAll: false, open: new Set() };
  const LIST_LIMIT = 10;

  const lic = d => (d.licenses || []).filter(l => l && !l.hidden).map(l => typeof l === 'string' ? { code: l, name: '' } : l);
  const vis = list => (list || []).filter(x => x && !x.hidden);
  const ext = u => (isExternal(u) || /\.pdf$/i.test(u || '') ? ' target="_blank" rel="noopener"' : '');
  const link = (u, label, cls) => '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(safeUrl(u)) + '"' + ext(u) + '>' + esc(label) + '</a>';
  const pen = path => K.isAdmin() ? '<a class="edit-pen" href="admin/#' + esc(path) + '" title="Edit in admin">✎</a>' : '';
  const year = s => { const v = K.ym(s); return v == null ? '' : String(Math.floor(v / 12)); };

  /* ---------------- render ---------------- */
  function render() {
    const d = state.data;
    const p = d.profile || {};
    const s = d.settings || {};
    if (s.accent && /^#[0-9a-f]{3,8}$/i.test(s.accent)) document.documentElement.style.setProperty('--accent-custom', s.accent);
    if (p.resume) $('#nav-resume').href = safeUrl(p.resume);
    renderNavLinks(p);
    renderMoreMenu(d.archive || []);

    const projects = vis(d.projects);
    const allExp = K.sortByDates(vis(d.experience), s.experienceSort);
    const exp = allExp.filter(e => e.kind !== 'volunteer');
    const vol = allExp.filter(e => e.kind === 'volunteer');

    const on = k => s[k] !== false;  // sections default to shown
    const showProjects = on('showProjects') && projects.length;
    $$('.nav-links a[href^="#"]').forEach(a => {
      const key = { '#projects': 'showProjects', '#experience': 'showExperience', '#education': 'showEducation', '#skills': 'showSkills', '#volunteering': 'showVolunteering' }[a.getAttribute('href')];
      a.hidden = !!key && !on(key);
    });

    $('#app').innerHTML =
      hero(p, s.showName === true) +
      (on('showExperience') && exp.length ? section('experience', 'Work Experience', experienceHtml(exp, d.experienceGroups || {})) : '') +
      (showProjects ? section('projects', 'Projects', projectsHtml(projects)) : '') +
      (on('showEducation') ? section('education', 'Education', educationHtml(d, on('showVideo')), d.educationImage) : '') +
      (on('showSkills') ? section('skills', 'Skills', skillsHtml(d)) : '') +
      (on('showVolunteering') && vol.length ? section('volunteering', (d.experienceGroups || {}).volunteer || 'Volunteering & Mentorship', jobs(vol), d.volunteeringImage) : '') +
      footerHtml(d);

    if (showProjects) wireProjects();
    if (p.logo && /\.svg$/i.test(p.logo)) inlineSvg($('#logo'), p.logo);
    startTyped(p.taglines || [], p.typingLoop === true);
    if (state.draft) showDraftBanner();
    if (K.isAdmin()) showEditFab();
    if (location.hash.length > 1) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView(), 0);
    }
  }

  function section(id, title, body, image) {
    return '<section class="block wrap" id="' + id + '">' +
      '<h2 class="sec-title">' + esc(title) + '</h2><div class="heading-line"></div>' +
      (image ? '<img class="sec-img" src="' + esc(safeUrl(image)) + '" alt="">' : '') + body + '</section>';
  }

  // Links with a known icon show under the photo; every other link goes in the top navigation.
  const ICONS = {
    github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  };
  const iconKey = l => { const k = String(l.label || '').toLowerCase().replace(/[^a-z]/g, ''); return ICONS[k] ? k : null; };

  function renderNavLinks(p) {
    $$('.nav-links [data-extra]').forEach(a => a.remove());
    const resume = $('#nav-resume');
    resume.hidden = !p.resume;
    (p.links || []).filter(l => !iconKey(l)).forEach(l => {
      const a = document.createElement('a');
      a.dataset.extra = '1'; a.href = safeUrl(l.url); a.textContent = l.label;
      if (isExternal(l.url)) { a.target = '_blank'; a.rel = 'noopener'; }
      resume.before(a);
    });
  }

  // Small "More" dropdown for older pages (Resources, Learn Python, CS-1114).
  function renderMoreMenu(items) {
    const menu = $('#more-menu'), btn = $('#more-btn'), panel = $('#more-panel');
    menu.hidden = !items.length;
    panel.innerHTML = items.map(l => link(l.url, l.label)).join('');
    if (menu.dataset.wired) return;
    menu.dataset.wired = '1';
    const set = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', e => { e.stopPropagation(); set(panel.hidden); });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  // Inline an SVG logo so its colors follow the theme toggle; drops scripts and event handlers.
  function inlineSvg(host, url) {
    fetch(safeUrl(url)).then(r => r.ok ? r.text() : Promise.reject()).then(txt => {
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      const svg = doc.documentElement;
      if (svg.nodeName.toLowerCase() !== 'svg') return;
      svg.querySelectorAll('script, foreignObject').forEach(n => n.remove());
      svg.querySelectorAll('*').forEach(n => Array.from(n.attributes).forEach(a => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
      host.replaceChildren(document.importNode(svg, true));
    }).catch(() => { /* keep the <img> fallback */ });
  }

  function hero(p, showName) {
    const icons = (p.links || []).filter(iconKey).map(l =>
      '<a class="icon-link" href="' + esc(safeUrl(l.url)) + '"' + ext(l.url) + ' aria-label="' + esc(l.label) + '" title="' + esc(l.label) + '">' + ICONS[iconKey(l)] + '</a>');
    if (p.email) icons.push('<a class="icon-link" href="mailto:' + esc(p.email) + '" aria-label="Email ' + esc(p.email) + '" title="' + esc(p.email) + '">' + ICONS.email + '</a>');
    return '<section class="hero wrap" id="top" data-edit="profile">' + pen('profile') +
      (p.logo ? '<a class="logo" href="#top" id="logo" aria-label="KSV"><img src="' + esc(safeUrl(p.logo)) + '" alt="KSV logo"></a>' : '') +
      '<h1 class="name' + (showName ? '' : ' sr-only') + '">' + esc(p.name || '') + '</h1>' +
      (showName && p.headline ? '<p class="headline">' + esc(p.headline) + '</p>' : '') +
      ((p.taglines || []).length ? '<p class="typed mono" aria-live="off"><span id="typed"></span><span class="cursor">▍</span></p>' : '') +
      (p.photo ? '<img class="photo" src="' + esc(safeUrl(p.photo)) + '" alt="Kori Vernon" width="260" height="260">' : '') +
      '<div class="hero-links">' + icons.join('') + '</div>' +
      '<h2 class="sec-title">About Me</h2><div class="heading-line"></div>' +
      '<div class="bio">' + md(p.bio) + '</div>' +
    '</section>';
  }

  /* ---------------- projects ---------------- */
  function projectsHtml(projects) {
    const sorted = K.sortProjects(projects, state.data.settings.projectSort);
    const featured = sorted.filter(x => x.featured);
    const cats = ['All'].concat(state.data.categories || []);
    const count = c => c === 'All' ? projects.length : projects.filter(x => x.category === c).length;
    return (featured.length ? '<div class="featured">' + featured.map(card).join('') + '</div>' : '') +
      '<div class="chips" role="group" aria-label="Filter projects">' +
        cats.filter(c => count(c)).map(c => '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' + esc(c) + ' <span class="n">' + count(c) + '</span></button>').join('') +
      '</div>' +
      '<div class="plist" id="plist"></div>';
  }

  function card(x) {
    return '<article class="card" data-edit="projects/' + esc(x.id) + '">' + pen('projects/' + x.id) +
      (x.image ? '<div class="img"><img src="' + esc(safeUrl(x.image)) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="card-top">' + (x.icon ? '<img class="picon" src="' + esc(safeUrl(x.icon)) + '" alt="" width="40" height="40">' : '') +
        '<h3>' + esc(x.name) + '</h3><span class="status ' + esc(x.status) + '">' + esc(x.status) + '</span></div>' +
      '<p>' + inline(x.summary) + '</p>' +
      '<div class="tags">' + (x.stack || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' +
      ((x.links || []).length ? '<div class="links">' + x.links.map(l => link(l.url, l.label + ' ↗')).join('') + '</div>' : '') +
    '</article>';
  }

  function renderList() {
    let list = K.sortProjects(vis(state.data.projects), state.data.settings.projectSort);
    if (state.cat !== 'All') list = list.filter(x => x.category === state.cat);
    else list = list.filter(x => !x.featured);
    const shown = state.showAll || list.length <= LIST_LIMIT + 2 ? list : list.slice(0, LIST_LIMIT);
    let html = shown.map(x => {
      const open = state.open.has(x.id);
      return '<div class="prow' + (open ? ' open' : '') + '" id="p-' + esc(x.id) + '">' +
        '<button type="button" class="prow-btn" data-id="' + esc(x.id) + '" aria-expanded="' + open + '">' +
          '<span class="pname">' + (x.icon ? '<img class="picon sm" src="' + esc(safeUrl(x.icon)) + '" alt="" width="22" height="22">' : '') + esc(x.name) + '</span>' +
          '<span class="psum">' + esc(x.summary) + '</span>' +
          '<span class="pyear mono">' + esc(year(x.start)) + '</span>' +
        '</button>' +
        (open ? '<div class="pdetail" data-edit="projects/' + esc(x.id) + '">' + pen('projects/' + x.id) +
          (x.description ? md(x.description) : '') +
          '<div class="tags">' + (x.stack || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '<span class="status ' + esc(x.status) + '">' + esc(x.status) + '</span></div>' +
          '<p class="meta mono">' + esc(K.fmtRange(x.start, x.end)) + '</p>' +
          ((x.links || []).length ? '<div class="links">' + x.links.map(l => link(l.url, l.label + ' ↗')).join('') + '</div>' : '') +
        '</div>' : '') +
      '</div>';
    }).join('');
    if (!list.length) html = '<p class="empty">Nothing here yet.</p>';
    if (shown.length < list.length) html += '<div class="more"><button class="btn" type="button" id="show-all">Show all ' + list.length + '</button></div>';
    $('#plist').innerHTML = html;
  }

  function wireProjects() {
    renderList();
    $$('[data-cat]').forEach(b => b.addEventListener('click', () => {
      state.cat = b.dataset.cat;
      $$('[data-cat]').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderList();
    }));
    $('#plist').addEventListener('click', e => {
      if (e.target.id === 'show-all') { state.showAll = true; renderList(); return; }
      const row = e.target.closest('.prow-btn');
      if (!row) return;
      const id = row.dataset.id;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      renderList();
    });
  }

  /* ---------------- experience / education / skills ---------------- */
  // Jobs are split into subsections by their kind (professional first, then entrepreneurial).
  function experienceHtml(exp, labels) {
    const kinds = ['professional', 'entrepreneurial'];
    const groups = kinds.map(k => [k, exp.filter(e => (e.kind || 'professional') === k)]).filter(g => g[1].length);
    if (groups.length < 2) return jobs(exp);
    return groups.map(([k, list]) => '<h3 class="subsec">' + esc(labels[k] || (k === 'professional' ? 'Professional Experience' : 'Entrepreneurial Ventures')) + '</h3>' + jobs(list)).join('');
  }
  function jobs(exp) {
    return exp.map(e =>
      '<article class="job" data-edit="experience/' + esc(e.id) + '">' + pen('experience/' + e.id) +
        '<h3>' + (e.logo ? '<img class="org-logo" src="' + esc(safeUrl(e.logo)) + '" alt="" width="28" height="28">' : '') +
          esc(e.title) + ' @ ' + (e.orgUrl ? link(e.orgUrl, e.org) : esc(e.org)) + '</h3>' +
        ((e.start || e.team) ? '<p class="when">' + [e.start ? K.fmtRange(e.start, e.end) : '', e.team || ''].filter(Boolean).map(esc).join(' · ') + '</p>' : '') +
        ((e.bullets || []).length ? '<ul>' + e.bullets.map(b => '<li>' + inline(b) + '</li>').join('') + '</ul>' : '') +
      '</article>').join('');
  }

  function educationHtml(d, showVideo) {
    const edu = K.sortByDates(vis(d.education), 'auto');
    const b = d.beyond || {};
    const vid = !b.hidden && showVideo && b.video && /^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com)\//.test(b.video) ? b.video : '';
    return edu.map(e => '<div class="edu" data-edit="education/' + esc(e.id) + '">' + pen('education/' + e.id) +
        '<h3>' + esc(e.school) + '</h3><p class="when">' + esc(e.degree) + ' · ' + esc(K.fmtRange(e.start, e.end)) + '</p>' +
        (e.notes ? '<p>' + inline(e.notes) + '</p>' : '') + '</div>').join('') +
      (!b.hidden && (b.text || vid) ? '<div class="beyond" data-edit="extras">' + pen('extras') + md(b.text) +
        (vid ? '<div class="video"><iframe src="' + esc(vid) + '" title="Video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>' : '') + '</div>' : '');
  }

  function skillsHtml(d) {
    const groups = vis(d.skills);
    const host = groups.findIndex(g => /language/i.test(g.group || ''));
    const licHtml = lic(d).length ? '<div class="skill-group" data-edit="licenses">' + pen('licenses') + '<h3>Licenses</h3><div class="pills">' +
      lic(d).map(l => '<span class="pill" title="' + esc(l.name + (l.year ? ' · ' + l.year : '')) + '">' + esc(l.code) + '</span>').join('') + '</div></div>' : '';
    const group = (title, items, edit) => '<div class="skill-group" data-edit="' + edit + '">' + pen(edit.split('/')[0]) + '<h3>' + esc(title) + '</h3><div class="pills">' +
      (items || []).map(s => '<span class="pill">' + esc(s) + '</span>').join('') + '</div></div>';
    return '<div class="skills">' +
      groups.map((g, i) => group(g.group, g.items, 'skills/' + i) + (i === host ? licHtml : '')).join('') +
      (host < 0 ? licHtml : '') +
      ((d.interests || []).length ? group('Interests', d.interests, 'extras') : '') +
    '</div>';
  }

  function footerHtml(d) {
    const p = d.profile || {};
    const q = d.quote || {};
    return '<footer><div class="wrap">' +
      (q.text ? '<p class="quote">“' + esc(q.text) + '”</p><p class="quote-by">— ' + esc(q.by || '') + '</p>' : '') +
      '<div class="foot-links">' +
        '<a href="https://github.com/korivernon/korivernon.com" target="_blank" rel="noopener">Website source code</a>' +
      '</div>' +
      '<p class="copy">© ' + new Date().getFullYear() + ' ' + esc(p.name || '') + '</p>' +
    '</div></footer>';
  }

  /* ---------------- chrome ---------------- */
  let typedTimer;
  function startTyped(lines, loop) {
    clearTimeout(typedTimer);
    const el = $('#typed');
    if (!el || !lines.length) return;
    const last = lines.length - 1;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = lines[last]; return; }
    let i = 0, j = 0, del = false;
    // Types each line once and stops on the last one, unless loop is on.
    (function tick() {
      const line = lines[i % lines.length];
      j += del ? -1 : 1;
      el.textContent = line.slice(0, j);
      let wait = del ? 28 : 55;
      if (!del && j === line.length) { if (!loop && i === last) return; del = true; wait = 1100; }
      else if (del && j === 0) { del = false; i++; wait = 350; }
      typedTimer = setTimeout(tick, wait);
    })();
  }

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ksv:theme', root.dataset.theme); } catch (e) { /* private mode */ }
  }

  function showDraftBanner() {
    if ($('.banner')) return;
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = 'DRAFT PREVIEW · not published <a href="admin/">back to admin</a>';
    document.body.appendChild(b);
  }
  function showEditFab() {
    if ($('.edit-fab')) return;
    const b = document.createElement('button');
    b.className = 'btn edit-fab'; b.type = 'button'; b.textContent = '✎ Edit mode';
    b.addEventListener('click', () => {
      const on = document.body.classList.toggle('editing');
      b.textContent = on ? '✓ Done' : '✎ Edit mode';
    });
    document.body.appendChild(b);
  }

  /* ---------------- hidden terminal (⌘K or /) ---------------- */
  const cmd = { items: [], sel: 0 };
  function commands() {
    const p = state.data.profile || {};
    const go = id => () => { closeCmd(); const el = document.getElementById(id); if (el) el.scrollIntoView(); };
    const open = u => () => { closeCmd(); window.open(u, isExternal(u) || /\.pdf$/i.test(u) ? '_blank' : '_self'); };
    const list = [
      { k: 'help', t: 'list commands', run: () => say(commands().filter(c => !c.proj).map(c => c.k.padEnd(10) + c.t).join('\n')) },
      { k: 'about', t: 'about me', run: go('top') },
      { k: 'projects', t: 'jump to projects', run: go('projects') },
      { k: 'exp', t: 'jump to work experience', run: go('experience') },
      { k: 'skills', t: 'jump to skills', run: go('skills') },
      { k: 'resume', t: 'open resumé (PDF)', run: open(p.resume || 'documents/Kori_Vernon_CV.pdf') },
      { k: 'email', t: p.email || '', run: open('mailto:' + p.email) },
      { k: 'theme', t: 'toggle light / dark', run: () => { toggleTheme(); closeCmd(); } },
      { k: 'buy', t: 'buy $KSV', run: () => say('ORDER FILLED  BUY 1 KSV @ MKT\ngreat trade. now send an email: ' + p.email) },
    ];
    (p.links || []).forEach(l => list.push({ k: l.label.toLowerCase().replace(/[^a-z]/g, ''), t: l.url, run: open(l.url) }));
    vis(state.data.projects).forEach(x => list.push({ k: x.symbol || x.id, t: x.name, proj: true, run: () => { closeCmd(); gotoProject(x.id); } }));
    return list;
  }
  function gotoProject(id) {
    const x = vis(state.data.projects).find(p => p.id === id);
    if (!x) return;
    state.cat = 'All'; state.showAll = true;
    if (!x.featured) state.open.add(id);
    $$('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === 'All'));
    renderList();
    const el = document.getElementById('p-' + id) || document.getElementById('projects');
    el.scrollIntoView({ block: 'center' });
  }
  function say(text) { $('#cmd-out').innerHTML = '<div class="msg">' + esc(text) + '</div>'; cmd.items = []; }
  function filterCmd() {
    const q = $('#cmd-input').value.trim().toLowerCase();
    const all = commands();
    cmd.items = (q ? all.filter(c => c.k.toLowerCase().startsWith(q) || c.t.toLowerCase().includes(q)) : all.filter(c => !c.proj)).slice(0, 40);
    cmd.sel = 0;
    $('#cmd-out').innerHTML = cmd.items.length
      ? cmd.items.map((c, i) => '<div class="row" data-i="' + i + '" aria-selected="' + (i === cmd.sel) + '"><span class="k">' + esc(c.k) + '</span><span class="t">' + esc(c.t) + '</span></div>').join('')
      : '<div class="msg">command not found. try "help".</div>';
  }
  function moveSel(n) {
    cmd.sel = Math.max(0, Math.min(cmd.items.length - 1, cmd.sel + n));
    $$('#cmd-out .row').forEach((r, i) => r.setAttribute('aria-selected', i === cmd.sel));
    const s = $('#cmd-out [aria-selected="true"]'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function openCmd() { $('#cmd').hidden = false; const i = $('#cmd-input'); i.value = ''; filterCmd(); i.focus(); }
  function closeCmd() { $('#cmd').hidden = true; }
  function wireCmd() {
    $('#cmd').addEventListener('click', e => { if (e.target.id === 'cmd') closeCmd(); });
    $('#cmd-input').addEventListener('input', filterCmd);
    $('#cmd-out').addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) cmd.items[r.dataset.i].run(); });
    $('#cmd-input').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { moveSel(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { moveSel(-1); e.preventDefault(); }
      else if (e.key === 'Enter') {
        const q = e.target.value.trim().toLowerCase();
        const c = commands().find(c => c.k.toLowerCase() === q) || cmd.items[cmd.sel];
        if (c) c.run(); else say('command not found: ' + q);
      }
    });
    document.addEventListener('keydown', e => {
      const typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmd').hidden ? openCmd() : closeCmd(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); openCmd(); }
      else if (e.key === 'Escape') closeCmd();
    });
  }

  /* ---------------- boot ---------------- */
  $('#theme-btn').addEventListener('click', toggleTheme);
  K.loadSite().then(res => {
    state.data = res.data; state.draft = res.draft;
    state.data.settings = state.data.settings || {};
    render();
    wireCmd();
  }).catch(err => {
    $('#app').innerHTML = '<p class="wrap loading">Could not load the site (' + esc(err.message) + '). Please refresh the page.</p>';
  });
})();
