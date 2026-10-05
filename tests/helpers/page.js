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
function pageConfig(cfg) {
  return {kronn_ui: (cfg.kronn || {}).ui, jira_site: (cfg.jira || {}).site, github_repo: (cfg.github || {}).repo, github_login: (cfg.github || {}).login,
    rhythm: cfg.rhythm || {}, mep_workflow: cfg.mep_workflow, workflows: cfg.workflows || {}, agents: cfg.agents || [], ui: cfg.ui || {},
    schedules: Object.fromEntries(['office', 'live', 'team', 'payroll'].map(k => [k, ((JSON.parse(read('workflows', 'templates', k + '.json')).definition.trigger) || {}).schedule]))};
}

// mêmes roster (et invités), morceaux, recettes et sprites que roster(), guests(), music(), recipes() et sprites() de tools/assemble.py :
// le commun, puis le profil d'équipe (clé team), puis l'installation
function team(cfg) {
  const dir = cfg.team ? path.join(ROOT, 'teams', cfg.team) : null;
  const file = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'roster.json'), 'utf8')) : {};
  const people = file.people || [], guests = [...(file.guests || []), ...(cfg.guests || [])];
  const music = dir && fs.existsSync(path.join(dir, 'music', 'music.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'music', 'music.json'), 'utf8')) : {};
  const opt = (...p) => fs.existsSync(path.join(ROOT, ...p)) ? JSON.parse(read(...p)) : {};
  const common = JSON.parse(read('sprites', 'cast.json'));
  const local = Object.fromEntries(Object.entries(opt('sprites', 'sprites.json')).filter(([k]) => !(k in common)));
  return {roster: {people: [...people, ...(cfg.people || [])], guests}, music: {...music, ...(cfg.music || {})},
    cast: {...common, ...(dir ? opt('teams', cfg.team, 'cast.json') : {})},
    custom: {...local, ...(dir ? opt('teams', cfg.team, 'sprites.json') : {})}};
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
    __LAYOUT__: layout ? read('layouts', layout + '.json') : read(cfg.layout || (cfg.team && JSON.parse(read('teams', cfg.team, 'team.json')).layout) || 'layouts/open-space.json'),
    __CONFIG__: JSON.stringify(pageConfig(cfg)),
    __OWNER__: JSON.stringify(owner === undefined ? JSON.parse(read('tests', 'fixtures', 'bureau.config.json')).owner : owner),
    __SNAP__: demo ? read('data', 'office_snapshot.json') : 'null',
    __TEAM__: demo ? read('data', 'team_snapshot.json') : 'null',
    __DEMO__: String(!!demo),
    __ACTIONS__: JSON.stringify({avatar: actions, gate: actions, relaunch: actions, ask: actions}),
  };
  return js.replace(/__(SPRITES|LAYERS|MUSIC|CAST|ROSTER|LAYOUT|CONFIG|OWNER|DEMO|ACTIONS|AVATAR_WF|GATE_WF|RELAUNCH_WF|ASK_QP|SNAP|TEAM)__/g, m => data[m]);
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

function load({kronnPageData, owner, demo, actions, config, layout} = {}) {
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
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(pageJs(owner, {demo, actions, config, layout}), ctx, {filename: 'office.js'});
  return {ctx, run: code => vm.runInContext(code, ctx)};
}

module.exports = {load, pageJs};
