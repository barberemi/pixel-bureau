// Charge le JS de la page (page/src/*.js concaténés dans l'ordre, comme tools/assemble.py) dans un contexte vm
// avec des bouchons DOM / canvas minimaux. Les déclarations de haut niveau (let/const/function) restent dans la
// portée globale du contexte : on les lit et on les modifie avec page.run('expression').
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'page', 'src');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// même découpe que page_config() de tools/assemble.py
// dossier de l'équipe, comme team_dir() de tools/assemble.py : un pack (clé team = chemin, ~ compris, relatif au dépôt)
// ou teams/<id> ; null pour une équipe neuve
function teamDir(cfg) {
  const t = cfg.team;
  if (!t) return null;
  if (t.includes('/') || t.startsWith('~') || t.startsWith('.')) return path.resolve(ROOT, t.replace(/^~(?=\/|$)/, require('os').homedir()));
  const d = path.join(ROOT, 'teams', t);
  return fs.existsSync(d) ? d : null;
}
// thèmes d'interface {id: nom}, comme assemble.themes() : ceux de page/src, puis ceux du pack (themes/theme-<id>.css)
const themeName = f => (fs.readFileSync(f, 'utf8').match(/^\/\*\s*@nom:\s*(.+?)\s*\*\//) || [])[1];
function themes(cfg = {}) {
  const out = {}, add = dir => { if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => /^theme-.+\.css$/.test(f)).sort()) out[f.slice('theme-'.length, -'.css'.length)] = themeName(path.join(dir, f)); };
  add(SRC);
  const d = teamDir(cfg);
  if (d) add(path.join(d, 'themes'));
  return out;
}
function pageConfig(cfg) {
  return {kronn_ui: (cfg.kronn || {}).ui, jira_site: (cfg.jira || {}).site, jira_flow: {triage_from: 'Proposed', test: 'To Test', validated: 'To Deploy', reopened: 'Reopen', ...((cfg.jira || {}).flow || {})}, github_repo: (cfg.github || {}).repo,
    rhythm: cfg.rhythm || {}, mep_workflow: cfg.mep_workflow, workflows: cfg.workflows || {}, agents: cfg.agents || [], ui: cfg.ui || {}, skins: themes(cfg),
    schedules: Object.fromEntries(['office', 'live', 'team', 'payroll', 'canard'].map(k => [k, ((JSON.parse(read('workflows', 'templates', k + '.json')).definition.trigger) || {}).schedule.replace('@@cron_hours@@', '4-20')]))}; // heures de Paris, comme cron_hours()
}

// mêmes roster (et invités), morceaux, recettes et sprites que roster(), guests(), music(), recipes() et sprites() de tools/assemble.py :
// le commun, puis le profil d'équipe (clé team), puis l'installation
function team(cfg) {
  const dir = teamDir(cfg);
  const file = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'roster.json'), 'utf8')) : {};
  const people = file.people || [], byKey = new Map();
  const shared = cfg.common_guests === false ? [] : JSON.parse(read('team', 'guests.json')).guests;
  for (const g of [...shared, ...(file.guests || []), ...(cfg.guests || [])]) { byKey.delete(g.key); byKey.set(g.key, g); }
  const guests = [...byKey.values()];
  const music = dir && fs.existsSync(path.join(dir, 'music', 'music.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'music', 'music.json'), 'utf8')) : {};
  const opt = (...p) => fs.existsSync(path.join(ROOT, ...p)) ? JSON.parse(read(...p)) : {};
  const common = JSON.parse(read('sprites', 'cast.json'));
  const local = Object.fromEntries(Object.entries(opt('sprites', 'sprites.json')).filter(([k]) => !(k in common)));
  return {roster: {people: [...people, ...(cfg.people || [])], guests}, music: {...music, ...(cfg.music || {})},
    cast: {...common, ...(dir ? opt(path.relative(ROOT, path.join(dir, 'cast.json'))) : {})},
    custom: {...opt('sprites', 'common.json'), ...local, ...(dir ? opt(path.relative(ROOT, path.join(dir, 'sprites.json'))) : {})}};
}

// plan de l'installation, comme layout_path() : clé layout, sinon celui de l'équipe (relatif au pack s'il y est), sinon le plan type
function layoutPath(cfg) {
  if (cfg.layout) return path.resolve(ROOT, cfg.layout);
  const d = teamDir(cfg), meta = d && fs.existsSync(path.join(d, 'team.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'team.json'), 'utf8')) : {};
  if (meta.layout && fs.existsSync(path.join(d, meta.layout))) return path.join(d, meta.layout);
  return path.resolve(ROOT, meta.layout || 'layouts/open-space.json');
}

function pageJs(owner, {demo = true, actions = true, config, layout} = {}) {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
  const js = files.map(f => { const s = fs.readFileSync(path.join(SRC, f), 'utf8'); return s.endsWith('\n') ? s : s + '\n'; }).join('');
  const cfg = config === undefined ? JSON.parse(read('tests', 'fixtures', 'bureau.config.json')) : config;
  const {cast, custom} = team(cfg);
  // mêmes remplacements que tools/assemble.py (les pochettes de music.json restent des chemins : inutiles ici)
  const data = {
    __SPRITES__: JSON.stringify(custom),
    __LAYERS__: read('sprites', 'layers.json'),
    __MUSIC__: JSON.stringify(team(cfg).music),
    __CAST__: JSON.stringify(cast),
    __AVATAR_WF__: 'avatar-wf', __GATE_WF__: 'gate-wf', __RELAUNCH_WF__: 'relaunch-wf', __ASK_QP__: 'ask-qp',
    __ROSTER__: JSON.stringify(team(cfg).roster),
    // même plan que layout_path() de tools/assemble.py : celui demandé, sinon celui de la config, du profil, ou le plan type
    __LAYOUT__: layout ? (layout.includes('/') ? fs.readFileSync(path.resolve(ROOT, layout), 'utf8') : read('layouts', layout + '.json')) : fs.readFileSync(layoutPath(cfg), 'utf8'),
    __CONFIG__: JSON.stringify(pageConfig(cfg)),
    __OWNER__: JSON.stringify(owner === undefined ? JSON.parse(read('tests', 'fixtures', 'bureau.config.json')).owner : owner),
    __SNAP__: demo ? read('data', 'office_snapshot.json') : 'null',
    __TEAM__: demo ? read('data', 'team_snapshot.json') : 'null',
    __DEMO__: String(!!demo),
    __ACTIONS__: JSON.stringify({avatar: actions, gate: actions, relaunch: actions, ask: actions, impl: actions, mep: actions, review: actions, fix: actions, comment: actions, duck: actions}),
    // comme action_binds() de tools/assemble.py, sur les blocs du squelette (noms par défaut)
    __ACTION_BINDS__: JSON.stringify(Object.fromEntries([...read('page', 'office_template.html').matchAll(/data-action-id="([^"]+)">(.*?)<\/script>/gs)]
      .map(([, id, body]) => [id, Object.fromEntries(JSON.parse(body).values.filter(v => v.provenance === 'dynamic_binding')
        .map(v => [v.name, ((v.source_ref || '').match(/\.find\((\w+)\)/) || [])[1]]).filter(([, f]) => f))]))),
  };
  return js.replace(/__(SPRITES|LAYERS|MUSIC|CAST|ROSTER|LAYOUT|CONFIG|OWNER|DEMO|ACTIONS|ACTION_BINDS|AVATAR_WF|GATE_WF|RELAUNCH_WF|ASK_QP|SNAP|TEAM)__/g, m => data[m]);
}

// objet « fourre-tout » : toute propriété lue est un nouveau bouchon (mémorisé), appelable et constructible ;
// les écritures sont conservées ; converti en nombre il vaut 0, en texte ''.
function stub(name) {
  const store = new Map();
  const target = function () {};
  const p = new Proxy(target, {
    get(_, k) {
      if (store.has(k)) return store.get(k);
      if (k === Symbol.toPrimitive) return hint => (hint === 'number' ? 0 : '');
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined; // pas une promesse
      if (k === 'length') return 0;
      if (typeof k === 'symbol') return undefined;
      const v = stub(name + '.' + String(k));
      store.set(k, v);
      return v;
    },
    set(_, k, v) { store.set(k, v); return true; },
    has() { return true; },
    apply() { return stub(name + '()'); },
    construct() { return stub('new ' + name); },
  });
  return p;
}

function load({kronnPageData, owner, demo, actions, config, layout, globals} = {}) {
  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  };
  const ctx = {
    console,
    document: stub('document'),
    navigator: stub('navigator'),
    localStorage,
    performance: {now: () => 0},
    innerWidth: 1400,
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {},
    Image: function Image() { return stub('Image'); },
    ImageData: function ImageData() { return stub('ImageData'); },
    MutationObserver: function MutationObserver() { return stub('MutationObserver'); },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    KronnPageData: kronnPageData,
  };
  Object.assign(ctx, globals); // globaux du navigateur simulés par un test (matchMedia…)
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(pageJs(owner, {demo, actions, config, layout}), ctx, {filename: 'office.js'});
  return {ctx, run: code => vm.runInContext(code, ctx)};
}

module.exports = {load, pageJs};
