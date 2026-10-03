(function () {
  'use strict';
  const K = window.KSV;
  const { esc } = K;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const CFG_KEY = 'ksv:gh-config';
  const DRAFT_BASE_KEY = 'ksv:draft-base';
  const DATA_PATH = 'data/site.json';
  const DEFAULT_REPO = 'korivernon/korivernon.com';
  const DEFAULT_BRANCH = 'master';

  const S = { mode: null, token: '', repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, data: null, base: '', sha: '', view: 'projects', q: '', showHidden: true, login: '' };

  /* ---------------- storage ---------------- */
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function ss() { try { return window.sessionStorage; } catch (e) { return null; } }
  function put(store, k, v) { try { store && (v == null ? store.removeItem(k) : store.setItem(k, v)); } catch (e) { /* blocked */ } }
  function saveCreds(remember) {
    put(ls(), K.TOKEN_KEY, null); put(ss(), K.TOKEN_KEY, null);
    put(remember ? ls() : ss(), K.TOKEN_KEY, S.token);
    put(ls(), CFG_KEY, JSON.stringify({ repo: S.repo, branch: S.branch }));
  }
  function forget() { put(ls(), K.TOKEN_KEY, null); put(ss(), K.TOKEN_KEY, null); }

  /* ---------------- utils ---------------- */
  function toast(msg, kind) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast ' + (kind || ''); }, kind === 'err' ? 6000 : 2800);
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  function uniqueId(list, base) {
    let id = base || 'item', n = 2;
    while (list.some(x => x.id === id)) id = base + '-' + n++;
    return id;
  }
  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split('.'); let cur = o;
    ks.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
    cur[ks[ks.length - 1]] = v;
  }
  function b64encode(bytes) {
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  const b64utf8 = s => b64encode(new TextEncoder().encode(s));
  function utf8b64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  const serialize = d => JSON.stringify(d, null, 2) + '\n';

  /* ---------------- GitHub ---------------- */
  async function gh(path, opts) {
    const res = await fetch('https://api.github.com' + path, Object.assign({}, opts, {
      headers: Object.assign({
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        Authorization: 'Bearer ' + S.token,
      }, opts && opts.body ? { 'Content-Type': 'application/json' } : {}),
    }));
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) {
      const err = new Error((body && body.message) || ('GitHub ' + res.status));
      err.status = res.status; throw err;
    }
    return body;
  }
  const contentsUrl = p => '/repos/' + S.repo + '/contents/' + p.split('/').map(encodeURIComponent).join('/');

  async function ghLoad() {
    const f = await gh(contentsUrl(DATA_PATH) + '?ref=' + encodeURIComponent(S.branch) + '&t=' + Date.now());
    return { data: JSON.parse(utf8b64(f.content)), sha: f.sha };
  }
  async function ghPutFile(path, b64, message, sha) {
    return gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify({ message, content: b64, branch: S.branch, sha: sha || undefined }) });
  }
  async function ghSha(path) {
    try { return (await gh(contentsUrl(path) + '?ref=' + encodeURIComponent(S.branch))).sha; } catch (e) { if (e.status === 404) return null; throw e; }
  }

  /* ---------------- draft persistence ---------------- */
  const dirty = () => S.data && serialize(S.data) !== S.base;
  let saveT;
  function changed() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (dirty()) { put(ls(), K.DRAFT_KEY, JSON.stringify(S.data)); put(ls(), DRAFT_BASE_KEY, S.sha || 'local'); }
      else { put(ls(), K.DRAFT_KEY, null); put(ls(), DRAFT_BASE_KEY, null); }
    }, 250);
    renderTopbar();
    renderSideCounts();
  }
  window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- field schema ---------------- */
  const STATUS_OPTS = K.STATUSES.map(s => [s, s.toUpperCase()]);
  const SCHEMA = {
    projects: [
      { row: [{ k: 'name', label: 'Name', req: true }, { k: 'symbol', label: 'Ticker symbol', hint: '2–5 letters, shows on the tape' }] },
      { row: [{ k: 'category', label: 'Category', type: 'category' }, { k: 'status', label: 'Status', type: 'select', opts: STATUS_OPTS }] },
      { k: 'summary', label: 'One-liner', type: 'textarea', rows: 2 },
      { k: 'description', label: 'Details', type: 'textarea', rows: 6, hint: 'Shown when the row is expanded. **bold**, *italic*, `code`, [link](https://…). Blank line = new paragraph.' },
      { k: 'stack', label: 'Stack', type: 'list', hint: 'comma separated' },
      { row: [{ k: 'start', label: 'Start', type: 'month' }, { k: 'end', label: 'End', type: 'month', hint: 'blank = ongoing' }, { k: 'conviction', label: 'Conviction', type: 'range', hint: 'how much it matters, 1–5. Drives auto-sort.' }] },
      { row: [{ k: 'featured', label: 'Featured (card at the top)', type: 'check' }, { k: 'hidden', label: 'Hidden from the site', type: 'check' }] },
      { k: 'links', label: 'Links', type: 'links' },
      { k: 'icon', label: 'App icon', type: 'file', dir: 'images/projects', accept: 'image/*', hint: 'small square icon shown next to the name' },
      { k: 'image', label: 'Banner image', type: 'file', dir: 'images/projects', accept: 'image/*', hint: 'optional wide picture across the top of a featured card' },
      { k: 'id', label: 'ID (used in links like #p-id)', hint: 'auto from name if blank' },
    ],
    experience: [
      { row: [{ k: 'title', label: 'Title', req: true }, { k: 'org', label: 'Company / org', req: true }] },
      { k: 'kind', label: 'Subsection', type: 'select', opts: [['professional', 'Professional Experience'], ['entrepreneurial', 'Entrepreneurial Ventures']] },
      { row: [{ k: 'team', label: 'Team / desk' }, { k: 'orgUrl', label: 'Company URL' }] },
      { row: [{ k: 'start', label: 'Start', type: 'month' }, { k: 'end', label: 'End', type: 'month', hint: 'blank = present' }] },
      { k: 'bullets', label: 'Bullets', type: 'lines', rows: 6, hint: 'one per line' },
      { k: 'hidden', label: 'Hidden from the site', type: 'check' },
    ],
    education: [
      { row: [{ k: 'school', label: 'School', req: true }, { k: 'degree', label: 'Degree / program' }] },
      { row: [{ k: 'start', label: 'Start', type: 'month' }, { k: 'end', label: 'End', type: 'month' }] },
      { k: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      { k: 'hidden', label: 'Hidden from the site', type: 'check' },
    ],
    licenses: [
      { row: [{ k: 'code', label: 'Exam', req: true, hint: 'e.g. Series 7' }, { k: 'year', label: 'Year passed', hint: 'optional' }] },
      { k: 'name', label: 'Full name', hint: 'e.g. General Securities Representative' },
      { k: 'hidden', label: 'Hidden from the site', type: 'check' },
    ],
    profile: [
      { k: 'profile.taglines', label: 'Typing text (under the logo)', type: 'lines', rows: 5, hint: 'One line per phrase, typed out in order. With “keep cycling” off, it stops on the last line.' },
      { k: 'profile.typingLoop', label: 'Keep cycling through the lines instead of stopping on the last one', type: 'check' },
      { row: [{ k: 'profile.name', label: 'Name' }, { k: 'profile.ticker', label: 'Short handle', hint: 'used in the hidden terminal' }] },
      { k: 'profile.headline', label: 'Headline', hint: 'only shows if “Show my name and headline” is on in Settings' },
      { k: 'profile.bio', label: 'Bio', type: 'textarea', rows: 9, hint: 'Blank line = new paragraph. **bold**, [link](https://…) work.' },
      { row: [{ k: 'profile.location', label: 'Location' }, { k: 'profile.email', label: 'Public email' }] },
      { k: 'profile.resume', label: 'Resume PDF', type: 'file', dir: 'documents', accept: 'application/pdf', keepName: true },
      { k: 'profile.photo', label: 'Photo', type: 'file', dir: 'images', accept: 'image/*' },
      { k: 'profile.links', label: 'Links', type: 'links', hint: 'Label a link GitHub or LinkedIn and it shows as an icon under your photo. Any other label (e.g. Ahïa Solutions) goes in the top navigation, before Resumé. The email icon comes from “Public email” above.' },
    ],
    extras: [
      { row: [{ k: 'experienceGroups.professional', label: 'Experience subsection 1 title' }, { k: 'experienceGroups.entrepreneurial', label: 'Experience subsection 2 title' }] },
      { k: 'categories', label: 'Project categories (filter chips, in order)', type: 'list' },
      { k: 'interests', label: 'Interests', type: 'list' },
      { k: 'educationImage', label: 'Picture above Education', type: 'file', dir: 'images', accept: 'image/*', hint: 'leave blank for no picture' },
      { k: 'beyond.title', label: '“Beyond” section title' },
      { k: 'beyond.text', label: '“Beyond” text', type: 'textarea', rows: 4 },
      { k: 'beyond.video', label: 'Video embed URL', hint: 'YouTube/Vimeo embed link, e.g. https://www.youtube-nocookie.com/embed/ID' },
      { k: 'beyond.hidden', label: 'Hide the “Beyond” section', type: 'check' },
      { row: [{ k: 'quote.text', label: 'Footer quote', type: 'textarea', rows: 2 }, { k: 'quote.by', label: 'Quote by' }] },
      { k: 'archive', label: 'Hidden “More” menu links', type: 'links', hint: 'Shown only when someone opens the More menu in the top navigation.' },
    ],
    settings: [
      { k: 'settings.showName', label: 'Show my name and headline at the top', type: 'check' },
      { row: [{ k: 'settings.showProjects', label: 'Projects section', type: 'check' }, { k: 'settings.showExperience', label: 'Work Experience section', type: 'check' }] },
      { row: [{ k: 'settings.showEducation', label: 'Education section', type: 'check' }, { k: 'settings.showSkills', label: 'Skills section', type: 'check' }] },
      { k: 'settings.showVideo', label: 'Mental-health video (in Education)', type: 'check' },
      { row: [
        { k: 'settings.projectSort', label: 'Project order', type: 'select', opts: [['auto', 'Auto: featured → live → conviction → recent'], ['manual', 'Manual: the order I set']] },
        { k: 'settings.experienceSort', label: 'Experience order', type: 'select', opts: [['auto', 'Auto: current roles, then newest'], ['manual', 'Manual']] },
      ] },
      { k: 'settings.accent', label: 'Accent color', type: 'color' },
    ],
  };

  const COLLECTIONS = {
    projects: {
      label: 'Projects', sortKey: 'projectSort', sorter: (l, m) => K.sortProjects(l, m), feature: true,
      sym: x => x.symbol, title: x => x.name, sub: x => [x.category, x.status, K.fmtRange(x.start, x.end), '●'.repeat(Number(x.conviction) || 0)].join(' · '),
      blank: () => ({ id: '', symbol: '', name: '', icon: '', summary: '', description: '', category: (S.data.categories || ['Trading'])[0], stack: [], status: 'building', start: new Date().toISOString().slice(0, 7), end: null, conviction: 3, featured: false, hidden: false, links: [], image: '' }),
      idFrom: x => slug(x.name),
    },
    experience: {
      label: 'Experience', sortKey: 'experienceSort', sorter: (l, m) => K.sortByDates(l, m),
      sym: x => (x.org || '').split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase(), title: x => x.title + ' · ' + x.org, sub: x => (x.kind === 'entrepreneurial' ? 'Entrepreneurial · ' : '') + K.fmtRange(x.start, x.end) + (x.team ? ' · ' + x.team : ''),
      blank: () => ({ id: '', kind: 'professional', org: '', orgUrl: '', title: '', team: '', start: new Date().toISOString().slice(0, 7), end: null, hidden: false, bullets: [] }),
      idFrom: x => slug(x.org + ' ' + x.title),
    },
    education: {
      label: 'Education', sorter: (l) => K.sortByDates(l, 'auto'),
      sym: () => 'EDU', title: x => x.school, sub: x => (x.degree || '') + ' · ' + K.fmtRange(x.start, x.end),
      blank: () => ({ id: '', school: '', degree: '', start: '', end: '', notes: '', hidden: false }),
      idFrom: x => slug(x.school),
    },
    licenses: {
      label: 'Licenses', sorter: l => l, manualOnly: true,
      sym: x => (x.code || '').replace('Series ', 'S'), title: x => x.code + (x.name ? ' · ' + x.name : ''), sub: x => x.year ? 'passed ' + x.year : 'year not set',
      blank: () => ({ id: '', code: '', name: '', year: '', hidden: false }),
      idFrom: x => slug(x.code),
    },
  };

  const NAV = [
    ['profile', 'Profile'], ['projects', 'Projects'], ['experience', 'Experience'], ['licenses', 'Licenses'],
    ['education', 'Education'], ['skills', 'Skills'], ['extras', 'Extras'], ['settings', 'Settings'], ['raw', 'Raw JSON'],
  ];

  /* ---------------- form engine ---------------- */
  function fieldHtml(f, obj) {
    const v = getPath(obj, f.k);
    const id = 'f-' + f.k.replace(/\./g, '-');
    const lab = '<span>' + esc(f.label) + (f.req ? ' *' : '') + '</span>';
    const hint = f.hint ? '<small>' + esc(f.hint) + '</small>' : '';
    const a = ' id="' + id + '" data-k="' + esc(f.k) + '" data-type="' + (f.type || 'text') + '"';
    switch (f.type) {
      case 'textarea': return '<label class="field">' + lab + '<textarea' + a + ' rows="' + (f.rows || 3) + '">' + esc(v || '') + '</textarea>' + hint + '</label>';
      case 'lines': return '<label class="field">' + lab + '<textarea' + a + ' rows="' + (f.rows || 4) + '">' + esc((v || []).join('\n')) + '</textarea>' + hint + '</label>';
      case 'list': return '<label class="field">' + lab + '<input type="text"' + a + ' value="' + esc((v || []).join(', ')) + '">' + hint + '</label>';
      case 'month': return '<label class="field">' + lab + '<input type="month"' + a + ' value="' + esc(v || '') + '">' + hint + '</label>';
      case 'color': return '<label class="field">' + lab + '<input type="color"' + a + ' value="' + esc(v || '#0bb5c9') + '">' + hint + '</label>';
      case 'check': return '<label class="check"><input type="checkbox"' + a + (v === true || (v !== false && f.k.startsWith('settings.show') && f.k !== 'settings.showName') ? ' checked' : '') + '>' + esc(f.label) + '</label>';
      case 'range': return '<label class="field">' + lab + '<input type="range" min="1" max="5" step="1"' + a + ' value="' + esc(v || 3) + '"><small class="mono" data-range-out="' + id + '">' + '●'.repeat(Number(v) || 3) + '</small>' + hint + '</label>';
      case 'select': return '<label class="field">' + lab + '<select' + a + '>' + f.opts.map(o => '<option value="' + esc(o[0]) + '"' + ((v || f.opts[0][0]) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' + hint + '</label>';
      case 'category': return '<label class="field">' + lab + '<input type="text" list="cat-list"' + a + ' value="' + esc(v || '') + '"><datalist id="cat-list">' + (S.data.categories || []).map(c => '<option value="' + esc(c) + '">').join('') + '</datalist><small>pick one or type a new category</small></label>';
      case 'links': return '<div class="field">' + lab + '<div class="rep" data-links="' + esc(f.k) + '">' + (v || []).map((l, i) => linkRow(f.k, l, i)).join('') + '</div><div><button type="button" class="btn sm" data-add-link="' + esc(f.k) + '">+ Add link</button></div>' + hint + '</div>';
      case 'file': return '<div class="field">' + lab + '<div class="upl">' + (v && f.accept === 'image/*' ? '<img class="thumb" src="../' + esc(v) + '" alt="">' : '') +
        '<input type="text"' + a + ' value="' + esc(v || '') + '" placeholder="' + esc(f.dir) + '/file">' +
        '<label class="btn sm" style="cursor:pointer">Upload<input type="file" hidden accept="' + esc(f.accept) + '" data-upload="' + esc(f.k) + '" data-dir="' + esc(f.dir) + '"' + (f.keepName ? ' data-keep="1"' : '') + '></label></div>' +
        '<small>' + (S.mode === 'github' ? 'Uploads commit the file straight to the repo.' : 'Uploads need GitHub mode. You can still type a path.') + '</small></div>';
      default: return '<label class="field">' + lab + '<input type="text"' + a + ' value="' + esc(v == null ? '' : v) + '">' + hint + '</label>';
    }
  }
  function linkRow(k, l, i) {
    return '<div class="rep-row" data-i="' + i + '"><input placeholder="Label" data-lk="' + esc(k) + '" data-li="' + i + '" data-lf="label" value="' + esc(l.label || '') + '">' +
      '<input placeholder="https://… or page.html" data-lk="' + esc(k) + '" data-li="' + i + '" data-lf="url" value="' + esc(l.url || '') + '">' +
      '<button type="button" class="ib danger" title="Remove link" data-del-link="' + esc(k) + '" data-li="' + i + '">✕</button></div>';
  }
  function formHtml(fields, obj) {
    return fields.map(f => f.row
      ? '<div class="row' + f.row.length + '">' + f.row.map(x => fieldHtml(x, obj)).join('') + '</div>'
      : fieldHtml(f, obj)).join('');
  }
  function readField(el) {
    const t = el.dataset.type;
    if (t === 'check') return el.checked;
    if (t === 'list') return el.value.split(',').map(s => s.trim()).filter(Boolean);
    if (t === 'lines') return el.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (t === 'range') return Number(el.value);
    if (t === 'month') return el.value || null;
    return el.value;
  }
  // Wires inputs inside `root` to `obj`; calls onChange after each edit.
  function bindForm(root, obj, onChange, rerender) {
    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.k && el.type !== 'file') {
        setPath(obj, el.dataset.k, readField(el));
        if (el.dataset.type === 'range') { const o = root.querySelector('[data-range-out="' + el.id + '"]'); if (o) o.textContent = '●'.repeat(Number(el.value)); }
        onChange();
      } else if (el.dataset.lk) {
        const arr = getPath(obj, el.dataset.lk) || [];
        arr[Number(el.dataset.li)][el.dataset.lf] = el.value;
        onChange();
      }
    });
    root.addEventListener('change', async e => {
      const el = e.target;
      if (!el.dataset.upload || !el.files || !el.files[0]) return;
      const path = await upload(el.files[0], el.dataset.dir, !!el.dataset.keep);
      if (path) { setPath(obj, el.dataset.upload, path); onChange(); rerender(); }
    });
    root.addEventListener('click', e => {
      const add = e.target.closest('[data-add-link]');
      const del = e.target.closest('[data-del-link]');
      if (add) { const k = add.dataset.addLink; const arr = getPath(obj, k) || []; arr.push({ label: '', url: '' }); setPath(obj, k, arr); onChange(); rerender(); }
      if (del) { const k = del.dataset.delLink; const arr = getPath(obj, k) || []; arr.splice(Number(del.dataset.li), 1); onChange(); rerender(); }
    });
  }

  async function upload(file, dir, keepName) {
    if (S.mode !== 'github') { toast('Connect GitHub to upload files', 'err'); return null; }
    if (file.size > 15 * 1024 * 1024) { toast('File is over 15 MB', 'err'); return null; }
    const dot = file.name.lastIndexOf('.');
    const ext = dot > 0 ? file.name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
    const name = keepName ? file.name.replace(/[^\w.-]+/g, '_') : (slug(dot > 0 ? file.name.slice(0, dot) : file.name) || 'file') + '-' + Date.now().toString(36) + ext;
    const path = dir + '/' + name;
    try {
      toast('Uploading ' + name + '…');
      const buf = new Uint8Array(await file.arrayBuffer());
      const sha = await ghSha(path);
      await ghPutFile(path, b64encode(buf), 'Upload ' + path + ' via console', sha);
      toast('Uploaded ' + path + '. Publish to use it.', 'ok');
      return path;
    } catch (err) { toast('Upload failed: ' + err.message, 'err'); return null; }
  }

  /* ---------------- shell ---------------- */
  function renderShell() {
    $('#root').innerHTML =
      '<div class="shell"><aside class="side">' +
        '<a class="brand" href="../" target="_blank" rel="noopener"><span class="brand-sym">$KSV</span><span class="brand-dot"></span></a>' +
        '<nav id="sidenav">' + NAV.map(n => '<a href="#' + n[0] + '" data-view="' + n[0] + '">' + n[1] + '<span class="n" data-count="' + n[0] + '"></span></a>').join('') + '</nav>' +
        '<div class="who">' + (S.mode === 'github'
          ? '<span class="mode-pill gh">GITHUB</span><br>' + esc(S.login ? '@' + S.login : '') + '<br>' + esc(S.repo) + ' @ ' + esc(S.branch)
          : '<span class="mode-pill">LOCAL</span><br>changes download as site.json') +
          '<br><button class="btn sm" id="signout" type="button">' + (S.mode === 'github' ? 'Sign out' : 'Connect GitHub') + '</button></div>' +
      '</aside><div><div class="topbar" id="topbar"></div><div class="content" id="view"></div></div></div>';
    $('#signout').addEventListener('click', () => {
      if (dirty() && !confirm('You have unpublished changes. They stay saved as a draft on this device. Continue?')) return;
      forget(); location.hash = ''; location.reload();
    });
    renderSideCounts();
  }
  function renderSideCounts() {
    Object.keys(COLLECTIONS).forEach(k => {
      const el = $('[data-count="' + k + '"]'); if (!el) return;
      const list = S.data[k] || [];
      const h = list.filter(x => x.hidden).length;
      el.textContent = list.length + (h ? ' (' + h + ' hidden)' : '');
    });
  }
  function renderTopbar() {
    const tb = $('#topbar'); if (!tb) return;
    const title = (NAV.find(n => n[0] === S.view) || [, ''])[1];
    const d = dirty();
    tb.innerHTML = '<h1>' + esc(title) + '</h1>' +
      (d ? '<span class="dirty">● unpublished changes</span>' : '<span class="clean">✓ in sync</span>') +
      '<span class="sp"></span>' +
      '<button class="btn sm" type="button" id="preview">Preview</button>' +
      '<button class="btn sm danger" type="button" id="discard"' + (d ? '' : ' disabled') + '>Discard</button>' +
      '<button class="btn sm primary" type="button" id="publish"' + (d ? '' : ' disabled') + '>' + (S.mode === 'github' ? 'Publish' : 'Download JSON') + '</button>';
    $('#preview').onclick = () => { put(ls(), K.DRAFT_KEY, JSON.stringify(S.data)); window.open('../?draft=1', '_blank'); };
    $('#discard').onclick = () => {
      if (!confirm('Throw away all unpublished changes?')) return;
      S.data = JSON.parse(S.base); changed(); renderView();
    };
    $('#publish').onclick = publish;
  }

  function go() {
    const [view, id] = decodeURIComponent(location.hash.slice(1)).split('/');
    S.view = NAV.some(n => n[0] === view) ? view : 'projects';
    $$('#sidenav a').forEach(a => { if (a.dataset.view === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderTopbar();
    renderView();
    if (id && COLLECTIONS[S.view]) {
      const item = (S.data[S.view] || []).find(x => x.id === id);
      if (item) editItem(S.view, item);
    }
  }

  function renderView() {
    const v = $('#view');
    if (COLLECTIONS[S.view]) return renderList(v, S.view);
    if (S.view === 'skills') return renderSkills(v);
    if (S.view === 'raw') return renderRaw(v);
    const hints = {
      profile: 'The top of the page: typing text, photo, buttons, resume and your About Me.',
      extras: 'The Education picture, categories, interests, the “Beyond” section, the footer quote and the hidden More menu.',
      settings: 'Turn whole sections on or off, choose the ordering, and set the accent color. Individual projects, jobs and licenses have an On/Off switch in their own tabs.',
    };
    v.innerHTML = '<p class="hint">' + (hints[S.view] || '') + '</p><div class="formcard" id="form">' + formHtml(SCHEMA[S.view], S.data) + '</div>';
    bindForm($('#form'), S.data, () => { changed(); }, () => renderView());
  }

  /* ---------------- collection list ---------------- */
  function renderList(v, key) {
    const C = COLLECTIONS[key];
    const list = S.data[key] = S.data[key] || [];
    const mode = C.manualOnly ? 'manual' : C.sortKey ? (S.data.settings[C.sortKey] || 'auto') : 'auto';
    const q = S.q.toLowerCase();
    const shown = C.sorter(list, mode).filter(x => (S.showHidden || !x.hidden) && (!q || JSON.stringify(x).toLowerCase().includes(q)));
    const manual = mode === 'manual';
    v.innerHTML =
      '<div class="listbar">' +
        '<button class="btn sm primary" type="button" id="add">+ Add ' + esc(C.label.replace(/s$/, '').toLowerCase()) + '</button>' +
        '<input class="input" id="q" type="search" placeholder="search" value="' + esc(S.q) + '">' +
        '<label class="check" style="margin:0"><input type="checkbox" id="showhidden"' + (S.showHidden ? ' checked' : '') + '>show hidden</label>' +
        '<span class="sp"></span>' +
        (C.sortKey ? '<span class="mono" style="font-size:12px;color:var(--muted)">order: <b>' + mode + '</b></span>' +
          '<button class="btn sm" type="button" id="togglesort">' + (manual ? 'Switch to auto-sort' : 'Order manually') + '</button>' : '') +
      '</div>' +
      (C.sortKey && !manual ? '<p class="hint">Auto-sorted exactly as the site shows it' + (key === 'projects' ? ': featured, then live, then conviction, then most recent.' : ': current roles first, then newest.') + ' Switch to manual to set your own order.</p>' : '') +
      '<div class="list" id="list">' + (shown.length ? shown.map(x => {
        const i = list.indexOf(x);
        return '<div class="item' + (x.hidden ? ' is-hidden' : '') + '" data-id="' + esc(x.id) + '">' +
          '<span class="s">' + esc(C.sym(x)) + '</span>' +
          '<span class="t"><b>' + esc(C.title(x)) + '</b><small>' + esc(C.sub(x)) + '</small></span>' +
          '<span class="acts">' +
            (manual ? '<button class="ib" title="Move up" data-act="up"' + (i === 0 || q ? ' disabled' : '') + '>↑</button><button class="ib" title="Move down" data-act="down"' + (i === list.length - 1 || q ? ' disabled' : '') + '>↓</button>' : '') +
            (C.feature ? '<button class="ib' + (x.featured ? ' on' : '') + '" title="' + (x.featured ? 'Unfeature' : 'Feature as a card') + '" data-act="feature">' + (x.featured ? '★' : '☆') + '</button>' : '') +
            '<button class="switch" type="button" role="switch" aria-checked="' + !x.hidden + '" title="' + (x.hidden ? 'Hidden. Click to show on the site' : 'Shown. Click to hide from the site') + '" data-act="hide"><span class="knob"></span><span class="lbl">' + (x.hidden ? 'Off' : 'On') + '</span></button>' +
            '<button class="ib" title="Edit" data-act="edit">✎</button>' +
            '<button class="ib" title="Duplicate" data-act="dup">⧉</button>' +
            '<button class="ib danger" title="Delete" data-act="del">🗑</button>' +
          '</span></div>';
      }).join('') : '<div class="empty">nothing here yet</div>') + '</div>';

    $('#add').onclick = () => editItem(key, null);
    $('#q').oninput = e => { S.q = e.target.value; const pos = e.target.selectionStart; renderList(v, key); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#showhidden').onchange = e => { S.showHidden = e.target.checked; renderList(v, key); };
    if ($('#togglesort')) $('#togglesort').onclick = () => {
      if (!manual) S.data[key] = C.sorter(list, 'auto');  // freeze the current auto order as the starting point
      S.data.settings[C.sortKey] = manual ? 'auto' : 'manual';
      changed(); renderList(v, key);
    };
    $('#list').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = b.closest('.item').dataset.id;
      const i = list.findIndex(x => x.id === id); const x = list[i];
      switch (b.dataset.act) {
        case 'up': if (i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); } break;
        case 'down': if (i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); } break;
        case 'feature': x.featured = !x.featured; break;
        case 'hide': x.hidden = !x.hidden; toast((C.title(x)) + (x.hidden ? ' hidden' : ' visible')); break;
        case 'edit': return editItem(key, x);
        case 'dup': { const c = clone(x); c.id = uniqueId(list, x.id + '-copy'); if (c.name) c.name += ' (copy)'; c.hidden = true; list.splice(i + 1, 0, c); toast('Duplicated as hidden copy'); break; }
        case 'del': if (!confirm('Delete “' + C.title(x) + '”? (Hide keeps it but takes it off the site.)')) return; list.splice(i, 1); break;
      }
      changed(); renderList(v, key);
    };
  }

  function editItem(key, item) {
    const C = COLLECTIONS[key];
    const isNew = !item;
    const work = isNew ? C.blank() : clone(item);
    const m = $('#modal');
    const draw = () => {
      m.innerHTML = '<form method="dialog" id="mform">' +
        '<div class="modal-head"><h2>' + (isNew ? 'New ' : 'Edit ') + esc(C.label.replace(/s$/, '').toLowerCase()) + '</h2><button class="ib" value="cancel" title="Close">✕</button></div>' +
        '<div class="modal-body" id="mbody">' + formHtml(SCHEMA[key], work) + '</div>' +
        '<div class="modal-foot">' + (isNew ? '' : '<button class="btn sm danger" type="button" id="mdel" style="margin-right:auto">Delete</button>') +
        '<button class="btn sm" value="cancel">Cancel</button><button class="btn sm primary" type="submit" value="save" id="msave">' + (isNew ? 'Add' : 'Apply') + '</button></div></form>';
      bindForm($('#mbody'), work, () => {}, () => { const st = $('#mbody').scrollTop; draw(); $('#mbody').scrollTop = st; });
      if ($('#mdel')) $('#mdel').onclick = () => {
        if (!confirm('Delete this item?')) return;
        const list = S.data[key]; list.splice(list.findIndex(x => x.id === item.id), 1);
        m.close(); changed(); renderView();
      };
      $('#mform').onsubmit = e => {
        if (e.submitter && e.submitter.value !== 'save') return;
        const missing = SCHEMA[key].flatMap(f => f.row || [f]).filter(f => f.req && !String(getPath(work, f.k) || '').trim());
        if (missing.length) { e.preventDefault(); toast('Fill in: ' + missing.map(f => f.label).join(', '), 'err'); return; }
        const list = S.data[key];
        if (key === 'projects' && !work.symbol) work.symbol = (work.name || 'NEW').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
        if (key === 'projects') work.symbol = work.symbol.toUpperCase();
        work.id = slug(work.id) || C.idFrom(work) || 'item';
        if (list.some(x => x.id === work.id && x !== item)) work.id = uniqueId(list.filter(x => x !== item), work.id);
        if (isNew) list.unshift(work); else list.splice(list.indexOf(item), 1, work);
        if (key === 'projects' && work.category && !(S.data.categories || []).includes(work.category)) (S.data.categories = S.data.categories || []).push(work.category);
        changed(); renderView();
        toast((isNew ? 'Added ' : 'Updated ') + (C.title(work)) + '. Publish when ready.', 'ok');
      };
    };
    draw();
    m.onclose = () => { if (location.hash.split('/').length > 1) history.replaceState(null, '', '#' + key); };
    m.showModal();
    const first = $('#mbody input, #mbody textarea'); if (first) first.focus();
  }

  /* ---------------- skills ---------------- */
  function renderSkills(v) {
    const groups = S.data.skills = S.data.skills || [];
    v.innerHTML = '<p class="hint">Skill groups show as panels. Items are comma separated. Licenses have their own tab.</p>' +
      groups.map((g, i) => '<div class="formcard" data-g="' + i + '"><div class="row2">' +
        '<label class="field"><span>Group</span><input data-gk="group" value="' + esc(g.group) + '"></label>' +
        '<label class="field"><span>Items</span><input data-gk="items" value="' + esc((g.items || []).join(', ')) + '"></label></div>' +
        '<div style="display:flex;gap:6px;align-items:center"><button class="switch" type="button" role="switch" aria-checked="' + !g.hidden + '" data-gtoggle><span class="knob"></span><span class="lbl">' + (g.hidden ? 'Off' : 'On') + '</span></button><button class="btn sm" type="button" data-gm="-1"' + (i ? '' : ' disabled') + '>↑</button><button class="btn sm" type="button" data-gm="1"' + (i < groups.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<button class="btn sm danger" type="button" data-gdel style="margin-left:auto">Remove group</button></div></div>').join('') +
      '<button class="btn sm primary" type="button" id="addg">+ Add group</button>';
    v.oninput = e => {
      const card = e.target.closest('[data-g]'); if (!card) return;
      const g = groups[Number(card.dataset.g)];
      if (e.target.dataset.gk === 'group') g.group = e.target.value;
      else g.items = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
      changed();
    };
    v.onclick = e => {
      const card = e.target.closest('[data-g]');
      if (e.target.id === 'addg') { groups.push({ group: 'New group', items: [], hidden: false }); }
      else if (card && e.target.closest('[data-gtoggle]')) { const g = groups[Number(card.dataset.g)]; g.hidden = !g.hidden; }
      else if (card && e.target.dataset.gdel !== undefined) { if (!confirm('Remove this group?')) return; groups.splice(Number(card.dataset.g), 1); }
      else if (card && e.target.dataset.gm) { const i = Number(card.dataset.g), j = i + Number(e.target.dataset.gm); groups.splice(j, 0, groups.splice(i, 1)[0]); }
      else return;
      changed(); renderSkills(v);
    };
  }

  /* ---------------- raw ---------------- */
  function renderRaw(v) {
    v.innerHTML = '<p class="hint">The whole site in one file. Edit anything, then Apply. Invalid JSON is rejected.</p>' +
      '<div class="formcard"><label class="field"><textarea id="raw" rows="30" spellcheck="false">' + esc(serialize(S.data)) + '</textarea></label>' +
      '<button class="btn sm primary" type="button" id="apply">Apply</button></div>';
    $('#apply').onclick = () => {
      try {
        const d = JSON.parse($('#raw').value);
        if (!d || typeof d !== 'object' || !d.profile) throw new Error('missing "profile"');
        S.data = d; normalize(); changed(); toast('Applied', 'ok');
      } catch (err) { toast('Invalid JSON: ' + err.message, 'err'); }
    };
  }

  /* ---------------- publish ---------------- */
  async function publish() {
    if (S.mode !== 'github') {
      const blob = new Blob([serialize(S.data)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'site.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Downloaded site.json. Replace data/site.json in the repo with it.', 'ok');
      return;
    }
    const msg = prompt('Commit message', 'Update site content');
    if (msg === null) return;
    const btn = $('#publish'); btn.disabled = true; btn.textContent = 'Publishing…';
    const body = serialize(S.data);
    try {
      let res;
      try { res = await ghPutFile(DATA_PATH, b64utf8(body), msg || 'Update site content', S.sha); }
      catch (err) {
        if (err.status !== 409 && err.status !== 422) throw err;
        if (!confirm('site.json changed on GitHub since you loaded it (another device or a commit). Overwrite it with your version?')) throw new Error('Publish cancelled');
        const fresh = await ghSha(DATA_PATH);
        res = await ghPutFile(DATA_PATH, b64utf8(body), msg || 'Update site content', fresh);
      }
      S.sha = res.content.sha; S.base = body;
      put(ls(), K.DRAFT_KEY, null); put(ls(), DRAFT_BASE_KEY, null);
      renderTopbar();
      toast('Published. The live site updates in about a minute.', 'ok');
    } catch (err) {
      toast((err.status === 401 || err.status === 403 || err.status === 404 ? 'GitHub refused the write (' + err.status + '). Check the token has Contents: read & write on ' + S.repo + '. ' : '') + err.message, 'err');
      renderTopbar();
    }
  }

  /* ---------------- boot ---------------- */
  function normalize() {
    const d = S.data;
    d.settings = d.settings || {};
    ['projects', 'experience', 'education', 'skills', 'archive', 'categories', 'interests'].forEach(k => { d[k] = d[k] || []; });
    d.licenses = (d.licenses || []).map(l => typeof l === 'string' ? { id: slug(l), code: l, name: '', year: '', hidden: false } : l);
    d.beyond = d.beyond || {}; d.quote = d.quote || {};
    ['projects', 'experience', 'education', 'licenses'].forEach(k => d[k].forEach(x => { if (!x.id) x.id = uniqueId(d[k], COLLECTIONS[k].idFrom(x)); }));
  }

  function offerDraftRestore() {
    let raw; try { raw = ls() && ls().getItem(K.DRAFT_KEY); } catch (e) { raw = null; }
    let parsed; try { parsed = raw && JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || serialize(parsed) === S.base) return;
    let base; try { base = ls().getItem(DRAFT_BASE_KEY); } catch (e) { base = null; }
    const stale = base && S.sha && base !== S.sha;
    if (confirm('You have unpublished changes saved on this device.' + (stale ? '\n\nHeads up: the live site changed since that draft was made. Restoring will replace those newer changes when you publish.' : '') + '\n\nRestore them?')) {
      S.data = parsed; normalize();
    } else {
      put(ls(), K.DRAFT_KEY, null); put(ls(), DRAFT_BASE_KEY, null);
    }
  }

  async function start(mode) {
    S.mode = mode;
    $('#root').innerHTML = '<p class="wrap loading mono">&gt; loading site.json<span class="cursor">▍</span></p>';
    try {
      if (mode === 'github') {
        const [user, file] = await Promise.all([gh('/user').catch(() => ({})), ghLoad()]);
        S.login = user.login || '';
        S.data = file.data; S.sha = file.sha;
      } else {
        const res = await fetch('../' + DATA_PATH + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('could not load site.json (' + res.status + ')');
        S.data = await res.json();
      }
    } catch (err) {
      if (mode === 'github') forget();
      return gate(mode === 'github' ? 'GitHub said: ' + err.message + (err.status === 401 ? ' (bad or expired token)' : err.status === 404 ? ' (token cannot see ' + S.repo + ', or the branch/file does not exist)' : '') : err.message);
    }
    normalize();
    S.base = serialize(S.data);
    offerDraftRestore();
    renderShell();
    window.addEventListener('hashchange', go);
    go();
  }

  function gate(error) {
    let cfg = {}; try { cfg = JSON.parse((ls() && ls().getItem(CFG_KEY)) || '{}'); } catch (e) { cfg = {}; }
    const newTokenUrl = 'https://github.com/settings/personal-access-tokens/new';
    $('#root').innerHTML = '<div class="gate"><form class="gate-box" id="gate" autocomplete="off">' +
      '<h1>$KSV console</h1><p>Edits to the site are committed to GitHub, and GitHub Pages publishes them.</p>' +
      (error ? '<p style="color:var(--down)">' + esc(error) + '</p>' : '') +
      '<label class="field"><span>GitHub token</span><input id="tok" type="password" required placeholder="github_pat_…" autocomplete="off"></label>' +
      '<div class="row2"><label class="field"><span>Repo</span><input id="repo" value="' + esc(cfg.repo || DEFAULT_REPO) + '"></label>' +
      '<label class="field"><span>Branch</span><input id="branch" value="' + esc(cfg.branch || DEFAULT_BRANCH) + '"></label></div>' +
      '<label class="check"><input type="checkbox" id="remember" checked>Remember on this device</label>' +
      '<button class="btn primary" type="submit" style="width:100%;justify-content:center">Unlock</button>' +
      '<details style="margin-top:14px"><summary class="mono" style="cursor:pointer;font-size:12px;color:var(--muted)">How do I get a token?</summary><ol>' +
        '<li>Open <a href="' + newTokenUrl + '" target="_blank" rel="noopener">GitHub → Fine-grained tokens → Generate</a>.</li>' +
        '<li>Repository access: <b>Only select repositories</b> → <code>korivernon.com</code>.</li>' +
        '<li>Permissions → Repository → <b>Contents: Read and write</b>. Nothing else.</li>' +
        '<li>Pick an expiry, generate, paste it here. It stays in this browser only.</li></ol></details>' +
      '<div class="or">or</div>' +
      '<button class="btn" type="button" id="local" style="width:100%;justify-content:center">Edit without GitHub (download JSON)</button>' +
      '</form></div>';
    $('#gate').onsubmit = e => {
      e.preventDefault();
      S.token = $('#tok').value.trim(); S.repo = $('#repo').value.trim() || DEFAULT_REPO; S.branch = $('#branch').value.trim() || DEFAULT_BRANCH;
      saveCreds($('#remember').checked);
      start('github');
    };
    $('#local').onclick = () => start('local');
  }

  (function boot() {
    const tok = K.getItem(K.TOKEN_KEY);
    let cfg = {}; try { cfg = JSON.parse((ls() && ls().getItem(CFG_KEY)) || '{}'); } catch (e) { cfg = {}; }
    if (tok) { S.token = tok; S.repo = cfg.repo || DEFAULT_REPO; S.branch = cfg.branch || DEFAULT_BRANCH; start('github'); }
    else gate();
  })();
})();
