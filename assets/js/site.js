(function () {
  'use strict';
  const K = window.KSV;
  const { esc, md, inline, safeUrl, isExternal } = K;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = { data: null, draft: false, cat: 'All', q: '', sort: 'auto', showAll: false, open: new Set() };
  const STATUS_TAPE = {
    live: ['▲ LIVE', 'up'], building: ['◆ BLDG', 'flat'], shipped: ['✓ SHIP', ''], archived: ['— ARCH', ''],
  };

  const lic = d => (d.licenses || []).filter(l => l && !l.hidden).map(l => typeof l === 'string' ? { code: l, name: '' } : l);
  const vis = list => (list || []).filter(x => x && !x.hidden);
  const ext = u => (isExternal(u) ? ' target="_blank" rel="noopener"' : '');
  const link = (u, label, cls) => '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(safeUrl(u)) + '"' + ext(u) + '>' + esc(label) + '</a>';
  const pen = path => K.isAdmin() ? '<a class="edit-pen" href="admin/#' + esc(path) + '" title="Edit in admin">✎</a>' : '';
  const dots = n => { n = Math.max(0, Math.min(5, Number(n) || 0)); return '●'.repeat(n) + '○'.repeat(5 - n); };

  /* ---------------- render ---------------- */
  function render() {
    const d = state.data;
    const p = d.profile || {};
    const s = d.settings || {};
    document.body.classList.toggle('tape-off', s.showTicker === false);
    $('#clock').hidden = s.showMarketClock === false;
    if (s.accent && /^#[0-9a-f]{3,8}$/i.test(s.accent)) {
      let st = $('#accent-style');
      if (!st) { st = document.createElement('style'); st.id = 'accent-style'; document.head.appendChild(st); }
      st.textContent = ':root:not([data-theme="light"]){--accent:' + s.accent + '}';
    }
    if (p.resume) $('#nav-resume').href = safeUrl(p.resume);

    renderTape();
    const projects = vis(d.projects);
    const exp = K.sortByDates(vis(d.experience), s.experienceSort);

    $('#app').innerHTML =
      hero(p, d, exp, projects) +
      section('projects', '01', 'Projects', projects.length + ' positions · ' + projects.filter(x => x.status === 'live').length + ' live', projectsHtml(projects)) +
      section('experience', '02', 'Experience', 'auto-sorted, newest first', timeline(exp)) +
      section('skills', '03', 'Skills & Education', '', skillsHtml(d)) +
      (d.beyond && !d.beyond.hidden ? section('about', '04', esc(d.beyond.title || 'Beyond the desk'), '', aboutHtml(d.beyond)) : '') +
      footerHtml(d);

    wireProjects();
    startTyped(p.taglines || []);
    if (state.draft) showDraftBanner();
    if (K.isAdmin()) showEditFab();
    if (location.hash && location.hash.length > 1) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView(), 0);
    }
  }

  function section(id, idx, title, sub, body) {
    return '<section class="block wrap" id="' + id + '"><div class="sec-head"><span class="idx">' + idx + '</span><h2>' + title + '</h2>' +
      (sub ? '<span class="sub mono">' + esc(sub) + '</span>' : '') + '</div>' + body + '</section>';
  }

  function renderTape() {
    const d = state.data;
    const items = K.sortProjects(vis(d.projects), 'auto').filter(x => x.status !== 'archived' || x.conviction >= 2).slice(0, 24);
    const html = items.map(x => {
      const t = STATUS_TAPE[x.status] || ['', ''];
      return '<a href="#p-' + esc(x.id) + '" data-goto="' + esc(x.id) + '"><span class="sym">' + esc(x.symbol) + '</span><span class="chg ' + t[1] + '">' + t[0] + '</span></a>';
    }).join('');
    $('#tape-track').innerHTML = html + html;
    $$('#tape-track [data-goto]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); gotoProject(a.dataset.goto); }));
  }

  function hero(p, d, exp, projects) {
    const starts = exp.map(e => K.ym(e.start)).filter(v => v != null);
    const years = starts.length ? Math.floor((K.nowYm() - Math.min.apply(null, starts)) / 12) : 0;
    const current = exp.find(e => !e.end) || exp[0] || {};
    const stats = [
      [years + 'y', 'Building'],
      [projects.filter(x => x.status === 'live').length, 'Live systems'],
      [projects.length, 'Projects'],
      [projects.filter(x => x.status === 'shipped').length, 'Shipped'],
    ];
    const rows = [
      ['ROLE', current.title || p.headline || ''],
      ['DESK', current.team ? current.team.replace(/^.*\(([^)]+)\).*$/, '$1') : (current.org || '')],
      ['FIRM', current.org || ''],
      ['LOC', p.location || ''],
    ].filter(r => r[1]);
    return '<section class="hero wrap" id="top">' +
      '<div data-edit="profile">' + pen('profile') +
        '<p class="prompt-line mono"><span class="p">ksv@nyc</span>:~$ whoami</p>' +
        '<h1>' + esc(p.name || '') + '<span class="tick">$' + esc(p.ticker || 'KSV') + '</span></h1>' +
        '<p class="headline">' + esc(p.headline || '') + '</p>' +
        '<p class="typed" aria-live="off"><span id="typed"></span><span class="cursor">▍</span></p>' +
        '<div class="bio">' + md(p.bio) + '</div>' +
        '<div class="cta">' +
          (p.resume ? '<a class="btn primary" href="' + esc(safeUrl(p.resume)) + '" target="_blank" rel="noopener">Resume <span class="k">PDF</span></a>' : '') +
          (p.email ? '<a class="btn" href="mailto:' + esc(p.email) + '">Email</a>' : '') +
          (p.links || []).map(l => link(l.url, l.label, 'btn')).join('') +
          '<button class="btn" type="button" data-cmd-open><span class="k">⌘K</span> Terminal</button>' +
        '</div>' +
      '</div>' +
      '<aside class="qpanel" aria-label="Quick profile">' +
        '<div class="qhead"><span>' + esc(p.ticker || 'KSV') + ' US EQUITY · PROFILE</span><span class="live">● LIVE</span></div>' +
        '<div class="qbody">' +
          (p.photo ? '<img src="' + esc(safeUrl(p.photo)) + '" alt="Portrait of ' + esc(p.name || '') + '" width="132" height="132">' : '') +
          '<div class="qrows">' + rows.map(r => '<div><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>').join('') + '</div>' +
        '</div>' +
        '<div class="stats">' + stats.map(s => '<div class="stat"><div class="v">' + esc(s[0]) + '</div><div class="l">' + s[1] + '</div></div>').join('') + '</div>' +
        '<div class="chart"><div class="chart-title">Position history</div>' + careerChart(exp) + '</div>' +
      '</aside>' +
    '</section>';
  }

  // Gantt of roles over time; the current employer is green, everything else blue.
  function careerChart(exp) {
    if (!exp.length) return '';
    const rows = exp.slice().reverse();
    const s0 = Math.min.apply(null, rows.map(e => K.ym(e.start)));
    const s1 = K.nowYm() + 2;
    const W = 400, rowH = 11, gap = 4, left = 0, top = 4;
    const H = top + rows.length * (rowH + gap) + 16;
    const x = v => left + (v - s0) / (s1 - s0) * (W - left);
    const mainOrg = (exp.find(e => !e.end && /trad|engineer|analyst|associate/i.test(e.title)) || exp[0]).org;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Career timeline">';
    const y0 = Math.floor(s0 / 12), y1 = Math.floor(s1 / 12);
    const step = (y1 - y0) > 8 ? 2 : 1;
    for (let y = y0 + 1; y <= y1; y += step) {
      const xx = x(y * 12);
      svg += '<line class="grid" x1="' + xx + '" x2="' + xx + '" y1="0" y2="' + (H - 14) + '"/>';
      svg += '<text class="axis" x="' + xx + '" y="' + (H - 2) + '" text-anchor="middle">’' + String(y).slice(2) + '</text>';
    }
    rows.forEach((e, i) => {
      const a = x(K.ym(e.start)), b = x(e.end ? K.ym(e.end) + 1 : K.nowYm() + 1);
      const y = top + i * (rowH + gap);
      svg += '<rect class="bar' + (e.org === mainOrg ? '' : ' side') + '" x="' + a + '" y="' + y + '" width="' + Math.max(3, b - a) + '" height="' + rowH + '" rx="2"><title>' +
        esc(e.title + ' · ' + e.org + ' · ' + K.fmtRange(e.start, e.end)) + '</title></rect>';
    });
    return svg + '</svg>';
  }

  /* ---------------- projects ---------------- */
  function projectsHtml(projects) {
    const featured = K.sortProjects(projects.filter(x => x.featured), state.data.settings.projectSort);
    const cats = ['All'].concat(state.data.categories || []);
    const count = c => c === 'All' ? projects.length : projects.filter(x => x.category === c).length;
    return '<div class="featured">' + featured.map(card).join('') + '</div>' +
      '<div class="toolbar">' +
        cats.filter(c => count(c)).map(c => '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (state.cat === c) + '">' + esc(c) + '<span class="n">' + count(c) + '</span></button>').join('') +
        '<span class="grow"></span>' +
        '<input class="input" id="p-search" type="search" placeholder="filter: python, kalshi…" aria-label="Filter projects" value="' + esc(state.q) + '">' +
        '<select class="input" id="p-sort" aria-label="Sort projects">' +
          [['auto', 'Sort: auto'], ['newest', 'Newest'], ['conviction', 'Conviction'], ['status', 'Status'], ['name', 'A–Z']]
            .concat(state.data.settings.projectSort === 'manual' ? [['manual', 'Pinned order']] : [])
            .map(o => '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="blotter" id="blotter"></div>';
  }

  function card(x) {
    return '<article class="card" id="p-' + esc(x.id) + '-card" data-edit="projects/' + esc(x.id) + '">' + pen('projects/' + x.id) +
      (x.image ? '<div class="img"><img src="' + esc(safeUrl(x.image)) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="card-top"><span class="sym-chip">' + esc(x.symbol) + '</span><span class="status ' + esc(x.status) + '">' + esc(x.status) + '</span></div>' +
      '<h3>' + esc(x.name) + '</h3><p>' + inline(x.summary) + '</p>' +
      '<div class="tags">' + (x.stack || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' +
      ((x.links || []).length ? '<div class="links">' + x.links.map(l => link(l.url, l.label + ' ↗')).join('') + '</div>' : '') +
    '</article>';
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = vis(state.data.projects);
    if (state.cat !== 'All') list = list.filter(x => x.category === state.cat);
    if (q) list = list.filter(x => [x.symbol, x.name, x.summary, x.description, x.category, x.status].concat(x.stack || []).join(' ').toLowerCase().includes(q));
    return K.sortProjects(list, state.sort);
  }

  function renderBlotter() {
    const list = filtered();
    const LIMIT = 14;
    const shown = state.showAll || state.q || list.length <= LIMIT + 3 ? list : list.slice(0, LIMIT);
    const h = (key, label, cls) => '<span class="' + (cls || '') + '"><button type="button" data-sort="' + key + '"' + (state.sort === key ? ' aria-sort="descending"' : '') + '>' + label + '</button></span>';
    let html = '<div class="brow head">' + h('symbol', 'Sym') + h('name', 'Project') + '<span class="h-st">Stack</span>' + h('status', 'Status') + h('newest', 'Since', 'h-d') + h('conviction', 'Conv', 'h-cv') + '<span></span></div>';
    if (!list.length) html += '<div class="empty">no positions match. try another filter.</div>';
    shown.forEach(x => {
      const open = state.open.has(x.id);
      html += '<button type="button" class="brow" id="p-' + esc(x.id) + '" data-id="' + esc(x.id) + '" aria-expanded="' + open + '">' +
        '<span class="s">' + esc(x.symbol) + '</span>' +
        '<span class="n" title="' + esc(x.name) + '">' + esc(x.name) + '</span>' +
        '<span class="st">' + esc((x.stack || []).slice(0, 3).join(' · ')) + '</span>' +
        '<span><span class="status ' + esc(x.status) + '">' + esc(x.status) + '</span></span>' +
        '<span class="d">' + esc(K.fmtYm(x.start)) + '</span>' +
        '<span class="cv" title="Conviction ' + esc(x.conviction) + '/5">' + dots(x.conviction) + '</span>' +
        '<span class="chev">›</span></button>';
      if (open) {
        html += '<div class="bdetail" data-edit="projects/' + esc(x.id) + '">' + pen('projects/' + x.id) +
          '<p>' + inline(x.summary) + '</p>' + (x.description ? md(x.description) : '') +
          '<div class="tags">' + (x.stack || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' +
          '<p class="meta">' + esc(x.category) + ' · ' + esc(K.fmtRange(x.start, x.end)) + ' · ' + esc(K.duration(x.start, x.end)) + '</p>' +
          ((x.links || []).length ? '<div class="links">' + x.links.map(l => link(l.url, l.label + ' ↗')).join('') + '</div>' : '') +
        '</div>';
      }
    });
    if (shown.length < list.length) html += '<div class="more"><button class="btn" type="button" id="show-all">Show all ' + list.length + '</button></div>';
    $('#blotter').innerHTML = html;
  }

  function wireProjects() {
    renderBlotter();
    $$('[data-cat]').forEach(b => b.addEventListener('click', () => {
      state.cat = b.dataset.cat;
      $$('[data-cat]').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderBlotter();
    }));
    $('#p-search').addEventListener('input', e => { state.q = e.target.value; renderBlotter(); });
    $('#p-sort').addEventListener('change', e => { state.sort = e.target.value; renderBlotter(); });
    $('#blotter').addEventListener('click', e => {
      const sortBtn = e.target.closest('[data-sort]');
      if (sortBtn) { state.sort = sortBtn.dataset.sort; $('#p-sort').value = ['auto', 'newest', 'conviction', 'status', 'name'].includes(state.sort) ? state.sort : 'auto'; renderBlotter(); return; }
      if (e.target.id === 'show-all') { state.showAll = true; renderBlotter(); return; }
      if (e.target.closest('a')) return;
      const row = e.target.closest('.brow[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      renderBlotter();
    });
  }

  function gotoProject(id) {
    state.cat = 'All'; state.q = ''; state.showAll = true; state.open.add(id);
    $$('[data-cat]').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === 'All'));
    const si = $('#p-search'); if (si) si.value = '';
    renderBlotter();
    const el = document.getElementById('p-' + id);
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
  }

  /* ---------------- experience / skills / about ---------------- */
  function timeline(exp) {
    return '<div class="timeline">' + exp.map(e =>
      '<div class="job' + (e.end ? '' : ' current') + '" data-edit="experience/' + esc(e.id) + '">' + pen('experience/' + e.id) +
        '<div class="job-head"><h3>' + esc(e.title) + '</h3>' +
        (e.orgUrl ? link(e.orgUrl, e.org, 'org') : '<span class="org">' + esc(e.org) + '</span>') +
        '<span class="when">' + esc(K.fmtRange(e.start, e.end)) + ' · ' + esc(K.duration(e.start, e.end)) + '</span></div>' +
        (e.team ? '<div class="team">' + esc(e.team) + '</div>' : '') +
        ((e.bullets || []).length ? '<ul>' + e.bullets.map(b => '<li>' + inline(b) + '</li>').join('') + '</ul>' : '') +
      '</div>').join('') + '</div>';
  }

  function skillsHtml(d) {
    const edu = K.sortByDates(vis(d.education), 'auto');
    const groups = d.skills || [];
    // Licenses sit under the Languages group (or get their own panel if there isn't one).
    const host = groups.findIndex(g => /language/i.test(g.group || ''));
    const licHtml = lic(d).length ? '<div data-edit="licenses">' + pen('licenses') + '<h3 style="margin-top:18px">Licenses</h3><div class="lics">' +
      lic(d).map(l => '<div class="lic-row"><span class="pill lic">' + esc(l.code) + '</span><span>' + esc(l.name) + (l.year ? ' <em class="mono">' + esc(l.year) + '</em>' : '') + '</span></div>').join('') + '</div></div>' : '';
    return '<div class="grid3">' +
      groups.map((g, i) => '<div class="panel" data-edit="skills/' + i + '">' + pen('skills') + '<h3>' + esc(g.group) + '</h3><div class="pills">' +
        (g.items || []).map(s => '<span class="pill">' + esc(s) + '</span>').join('') + '</div>' + (i === host ? licHtml : '') + '</div>').join('') +
      (host < 0 && licHtml ? '<div class="panel">' + licHtml + '</div>' : '') +
      ((d.interests || []).length ? '<div class="panel" data-edit="extras">' + pen('extras') + '<h3>Interests</h3><div class="pills">' + d.interests.map(s => '<span class="pill">' + esc(s) + '</span>').join('') + '</div></div>' : '') +
      '<div class="panel" data-edit="education" style="grid-column: span 2">' + pen('education') + '<h3>Education</h3>' +
        edu.map(e => '<div class="edu"><b>' + esc(e.school) + '</b><span>' + esc(e.degree) + '</span> <span class="when">' + esc(K.fmtRange(e.start, e.end)) + '</span>' +
          (e.notes ? '<div><span>' + inline(e.notes) + '</span></div>' : '') + '</div>').join('') +
      '</div>' +
    '</div>';
  }

  function aboutHtml(b) {
    const vid = b.video && /^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com)\//.test(b.video) ? b.video : '';
    return '<div class="about" data-edit="beyond">' + pen('extras') + '<div>' + md(b.text) + '</div>' +
      (vid ? '<div class="video"><iframe src="' + esc(vid) + '" title="Video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>' : '') + '</div>';
  }

  function footerHtml(d) {
    const p = d.profile || {};
    const q = d.quote || {};
    return '<footer><div class="wrap">' +
      (q.text ? '<p class="quote">“' + esc(q.text) + '”</p><p class="quote-by">— ' + esc(q.by || '') + '</p>' : '') +
      '<div class="foot-row">' +
        (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '') +
        (p.links || []).map(l => link(l.url, l.label)).join('') +
        (d.archive || []).map(l => link(l.url, l.label)).join('') +
        '<a href="classic.html">Classic site</a>' +
        '<span class="r">© ' + new Date().getFullYear() + ' ' + esc(p.name || '') + ' · <a href="https://github.com/korivernon/korivernon.com" target="_blank" rel="noopener">source</a></span>' +
      '</div></div></footer>';
  }

  /* ---------------- chrome: typed, clock, theme, admin ---------------- */
  let typedTimer;
  function startTyped(lines) {
    clearTimeout(typedTimer);
    const el = $('#typed');
    if (!el || !lines.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = lines[0]; return; }
    let i = 0, j = 0, del = false;
    (function tick() {
      const line = lines[i % lines.length];
      j += del ? -1 : 1;
      el.textContent = line.slice(0, j);
      let wait = del ? 28 : 55;
      if (!del && j === line.length) { del = true; wait = 1800; }
      else if (del && j === 0) { del = false; i++; wait = 350; }
      typedTimer = setTimeout(tick, wait);
    })();
  }

  function clock() {
    const el = $('#clock');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
    const g = t => (parts.find(p => p.type === t) || {}).value;
    const h = Number(g('hour')) % 24, m = Number(g('minute'));
    const mins = h * 60 + m, wk = !['Sat', 'Sun'].includes(g('weekday'));
    let label = 'CLOSED', cls = 'closed';
    if (wk && mins >= 570 && mins < 960) { label = 'OPEN'; cls = 'open'; }
    else if (wk && mins >= 240 && mins < 570) { label = 'PRE'; cls = 'ext'; }
    else if (wk && mins >= 960 && mins < 1200) { label = 'AFTER'; cls = 'ext'; }
    el.innerHTML = '<b class="' + cls + '">NYSE ' + label + '</b><span class="t">' + String(h).padStart(2, '0') + ':' + g('minute') + ':' + g('second') + ' ET</span>';
  }

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('ksv:theme', next); } catch (e) { /* private mode */ }
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

  /* ---------------- command palette ---------------- */
  const cmd = { items: [], sel: 0 };
  function commands() {
    const p = state.data.profile || {};
    const go = id => () => { closeCmd(); document.getElementById(id).scrollIntoView(); };
    const open = u => () => { closeCmd(); window.open(u, isExternal(u) || /\.pdf$/i.test(u) ? '_blank' : '_self'); };
    const list = [
      { k: 'help', t: 'list commands', run: () => say(listing()) },
      { k: 'projects', t: 'jump to projects', run: go('projects') },
      { k: 'exp', t: 'jump to experience', run: go('experience') },
      { k: 'skills', t: 'jump to skills & education', run: go('skills') },
      { k: 'resume', t: 'open resume (PDF)', run: open(p.resume || 'documents/Kori_Vernon_CV.pdf') },
      { k: 'email', t: p.email || '', run: open('mailto:' + p.email) },
      { k: 'whoami', t: 'print profile', run: () => say(p.name + ' · ' + p.headline + '\n' + (p.location || '')) },
      { k: 'theme', t: 'toggle light / dark', run: () => { toggleTheme(); closeCmd(); } },
      { k: 'buy', t: 'buy $KSV', run: () => say('ORDER FILLED  BUY 1 KSV @ MKT\nexcellent trade. now send an email: ' + p.email) },
      { k: 'ls', t: 'list live positions', run: () => say(K.sortProjects(vis(state.data.projects).filter(x => x.status === 'live'), 'auto').map(x => x.symbol.padEnd(6) + x.name).join('\n')) },
    ];
    (p.links || []).forEach(l => list.push({ k: l.label.toLowerCase().replace(/[^a-z]/g, ''), t: l.url, run: open(l.url) }));
    vis(state.data.projects).forEach(x => list.push({ k: x.symbol, t: x.name, proj: true, run: () => { closeCmd(); gotoProject(x.id); } }));
    return list;
  }
  function listing() { return commands().filter(c => !c.proj).map(c => c.k.padEnd(10) + c.t).join('\n') + '\n\nor type any ticker, e.g. POMT, PMM, EMON'; }
  function say(text) { $('#cmd-out').innerHTML = '<div class="msg">' + esc(text) + '</div>'; cmd.items = []; }
  function filterCmd() {
    const q = $('#cmd-input').value.trim().toLowerCase();
    const all = commands();
    cmd.items = (q ? all.filter(c => c.k.toLowerCase().startsWith(q) || c.t.toLowerCase().includes(q)) : all.filter(c => !c.proj).concat(all.filter(c => c.proj).slice(0, 6))).slice(0, 40);
    cmd.sel = 0;
    drawCmd();
  }
  function drawCmd() {
    $('#cmd-out').innerHTML = cmd.items.length
      ? cmd.items.map((c, i) => '<div class="row" role="option" data-i="' + i + '" aria-selected="' + (i === cmd.sel) + '"><span class="k">' + esc(c.k) + '</span><span class="t">' + esc(c.t) + '</span></div>').join('')
      : '<div class="msg">command not found. try "help".</div>';
    const s = $('#cmd-out [aria-selected="true"]'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function openCmd() { $('#cmd').hidden = false; const i = $('#cmd-input'); i.value = ''; filterCmd(); i.focus(); }
  function closeCmd() { $('#cmd').hidden = true; }
  function wireCmd() {
    $('#open-cmd').addEventListener('click', openCmd);
    document.addEventListener('click', e => { if (e.target.closest('[data-cmd-open]')) openCmd(); });
    $('#cmd').addEventListener('click', e => { if (e.target.id === 'cmd') closeCmd(); });
    $('#cmd-input').addEventListener('input', filterCmd);
    $('#cmd-out').addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) cmd.items[r.dataset.i].run(); });
    $('#cmd-input').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { cmd.sel = Math.min(cmd.items.length - 1, cmd.sel + 1); drawCmd(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cmd.sel = Math.max(0, cmd.sel - 1); drawCmd(); e.preventDefault(); }
      else if (e.key === 'Enter') {
        const q = e.target.value.trim().toLowerCase();
        const exact = commands().find(c => c.k.toLowerCase() === q);
        const c = exact || cmd.items[cmd.sel];
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
  clock(); setInterval(clock, 1000);
  K.loadSite().then(res => {
    state.data = res.data; state.draft = res.draft;
    state.data.settings = state.data.settings || {};
    state.sort = state.data.settings.projectSort === 'manual' ? 'manual' : 'auto';
    render();
    wireCmd();
  }).catch(err => {
    $('#app').innerHTML = '<p class="wrap loading mono">&gt; feed error: ' + esc(err.message) + '. <a href="classic.html">open the classic site</a></p>';
  });
})();
