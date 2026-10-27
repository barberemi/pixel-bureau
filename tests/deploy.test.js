// « 🚀 Déployer la branche » d'une PR hors prod (62-deploy.js) : envs du réglage deploy, occupant de chaque env (dataset
// live), libellé du bouton (déployer, remplacer, redéployer, relancer, grisé), « ⏳ demandé » juste après un lancement.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const J = code => JSON.parse(page.run('JSON.stringify(' + code + ')'));
const REPO = 'dunder-mifflin/front_api';
const PR = {n: 16, repo: REPO, head: 'feat/DM-7-carrousel'};

// état et libellé de l'env dev vu de PR, avec cet occupant (null : libre) et un lancement d'ici il y a « asked » ms
function dev(o, {asked = null} = {}) {
  return J(`(() => {
    const t0 = T, l0 = LIVE, a0 = DP_ASKED, dn = Date.now; T = Date.parse('2026-10-26T12:00:00Z'); Date.now = () => T;
    LIVE = {envs: ${JSON.stringify(o ? {[REPO + '|dev']: o} : {})}}; DP_ASKED = ${asked == null ? '{}' : `{'${REPO}|dev': T - ${asked}}`};
    try { const s = dpState(${JSON.stringify(PR)}, '${REPO}', 'dev');
      return {label: dpLabel(s), occ: dpOcc(s).replace(/<[^>]+>/g, ''), other: s.other, mine: s.mine}; }
    finally { T = t0; LIVE = l0; DP_ASKED = a0; Date.now = dn; }
  })()`);
}
const at = min => new Date(Date.parse('2026-10-26T12:00:00Z') - min * 60e3).toISOString();
const run = (o = {}) => ({ref: 'feat/DM-7-carrousel', tag: false, by: null, status: 'completed', conclusion: 'success', start: at(9), end: at(1), url: 'https://x/r', ...o});
const someone = () => J(`(chars.find(c => c.person && !c.boss) || {}).github || null`);

test('envs : ceux du réglage deploy du dépôt de la PR (casse ignorée), seulement avec le modèle et une branche connue', () => {
  const envs = (p, on = true) => J(`(() => { const a0 = ACTIONS.deploy, c0 = CFG.deploy_envs; ACTIONS.deploy = ${on};
    CFG.deploy_envs = {'Dunder-Mifflin/front_api': ['dev', 'stg']};
    try { return dpEnvs(${JSON.stringify(p)}).map(e => e.env); } finally { ACTIONS.deploy = a0; CFG.deploy_envs = c0; } })()`);
  assert.deepEqual(envs(PR), ['dev', 'stg']);
  assert.deepEqual(envs(PR, false), []); // modèle deploy pas installé
  assert.deepEqual(envs({...PR, head: undefined}), []); // ancien dataset team, sans branche
  assert.deepEqual(envs({...PR, merged: true}), []);
  assert.deepEqual(envs({...PR, repo: 'dunder-mifflin/site-web'}), []); // dépôt hors réglage
});

test('env libre : Déployer ; pris par la branche de quelqu\'un d\'autre : Remplacer…', () => {
  assert.deepEqual(dev(null), {label: '🚀 Déployer', occ: 'libre · aucun déploiement récent', other: false, mine: false});
  const login = someone();
  const r = dev(run({ref: 'feat/DM-1', by: login}));
  assert.equal(r.label, '⇄ Remplacer…');
  assert.ok(r.other && /^feat\/DM-1 · /.test(r.occ), r.occ);
  assert.equal(dev(run({ref: '17.2.0', tag: true, by: login})).label, '⇄ Remplacer…'); // une version de MEP aussi
});

test('env pris par toi (le boss) sur une autre branche : Déployer, sans avertissement', () => {
  const boss = J(`(chars.find(c => c.boss) || {}).github || null`);
  assert.ok(boss);
  assert.deepEqual([dev(run({ref: 'feat/DM-1', by: boss})).label, dev(run({ref: 'feat/DM-1', by: boss})).other], ['🚀 Déployer', false]);
});

test('ta branche : en cours (grisé, temps écoulé), déployée (Redéployer), en échec (Relancer)', () => {
  const going = dev(run({status: 'in_progress', conclusion: null, end: null, start: at(4)}));
  assert.equal(going.label, null);
  assert.match(going.occ, /^⏳ ta branche arrive · lancé il y a 4 min · run ↗$/);
  const done = dev(run());
  assert.equal(done.label, '↻ Redéployer');
  assert.match(done.occ, /^✅ ta branche · /);
  const ko = dev(run({conclusion: 'failure', start: at(12)}));
  assert.equal(ko.label, '↻ Relancer');
  assert.match(ko.occ, /^❌ échec · ta branche · lancé il y a 12 min · run ↗$/);
});

test('juste après un lancement : « ⏳ demandé » (grisé) jusqu\'au run GitHub, 15 min au plus', () => {
  const asked = dev(null, {asked: 30e3});
  assert.equal(asked.label, null);
  assert.match(asked.occ, /^⏳ demandé · lancé il y a 30 s$/);
  assert.equal(dev(run({status: 'queued', conclusion: null, end: null, start: at(0)}), {asked: 30e3}).occ.startsWith('⏳ ta branche arrive'), true); // run vu
  assert.equal(dev(run({ref: 'feat/DM-1', start: at(60)}), {asked: 30e3}).label, null); // vieux run : toujours demandé
  assert.equal(dev(null, {asked: 16 * 60e3}).label, '🚀 Déployer'); // 15 min passées sans run : on oublie
});

test('en tête du bloc : l\'agent du modèle deploy (« Stanley déploie la branche »), sinon le titre seul', () => {
  const head = wf => J(`(() => { const c0 = chars.slice(), a0 = CFG.action_wf;
    chars.push({key: 'stanley', name: 'Stanley', wf: ['ffff6666'], runs: []}); CFG.action_wf = {deploy: '${wf}'};
    try { return dpHead(actAgent('bureau-deploy')); } finally { chars.length = 0; chars.push(...c0); CFG.action_wf = a0; } })()`);
  assert.equal(head('ffff6666'), '<b>Stanley</b> déploie la branche');
  assert.equal(head('99999999'), '<b>Déployer la branche</b>');
});

// ---------- « 🌿 Générer l'env de branche » : où en est le build (LIVE.branch_envs), « ⏳ demandé » après un clic ----------
function eb(o, {url = null, asked = null} = {}) {
  return J(`(() => {
    const t0 = T, l0 = LIVE, a0 = EB_ASKED, dn = Date.now; T = Date.parse('2026-10-26T12:00:00Z'); Date.now = () => T;
    LIVE = {branch_envs: ${JSON.stringify(o ? {['Dunder-Mifflin/front_api|' + PR.head]: o} : {})}};
    EB_ASKED = ${asked == null ? '{}' : `{'${REPO}#16': T - ${asked}}`};
    try { const s = ebState(${JSON.stringify({...PR, env_url: url})});
      return {step: s.step, html: ebHtml(s).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim()}; }
    finally { T = t0; LIVE = l0; EB_ASKED = a0; Date.now = dn; }
  })()`);
}
const URL = 'https://www.dm7.testing.example.com';

test('env de branche : aucun build ni adresse ; en construction (lien du run) ; prêt avec son adresse ; en échec', () => {
  assert.equal(eb(null).step, 'none');
  const going = eb(run({status: 'in_progress', conclusion: null, end: null, start: at(2)}), {url: URL});
  assert.equal(going.step, 'run');
  assert.match(going.html, /⏳ construction en cours · lancée il y a 2 min · run ↗/);
  assert.match(going.html, /2 · build en cours/);
  assert.match(going.html, /version d'avant ↗/); // l'ancienne version reste en ligne pendant le build
  const ok = eb(run(), {url: URL});
  assert.equal(ok.step, 'ok');
  assert.match(ok.html, /✅ en ligne · construit il y a 1 min/);
  assert.match(ok.html, /3 · en ligne ouvrir ↗/);
  assert.equal(eb(null, {url: URL}).step, 'ok'); // adresse relevée, build hors des 30 derniers runs
  assert.match(eb(run(), {url: null}).html, /adresse au prochain relevé/);
  const ko = eb(run({conclusion: 'failure', start: at(8), end: at(6)}));
  assert.equal(ko.step, 'ko');
  assert.match(ko.html, /❌ build en échec · il y a 6 min/);
});

test('env de branche : « ⏳ demandé » juste après le clic, jusqu\'au run GitHub, 15 min au plus', () => {
  const asked = eb(run({start: at(60), end: at(55)}), {url: URL, asked: 20e3});
  assert.equal(asked.step, 'asked');
  assert.match(asked.html, /⏳ demandé · il y a 20 s, GitHub démarre/);
  assert.equal(eb(run({status: 'queued', conclusion: null, end: null, start: at(0)}), {asked: 20e3}).step, 'run'); // run vu
  assert.equal(eb(null, {asked: 16 * 60e3}).step, 'none'); // 15 min sans run : on oublie
});

test('env de branche dans la fiche : grisé pendant le build, « ✓ Label reposé » au lancement ; une ligne avant les envs partagés', () => {
  const blocks = live => J(`(() => {
    const calls = [], lb = launchBlock, db = deployBlock, l0 = LIVE, a0 = {...ACTIONS}, e0 = CFG.env_repos, d0 = CFG.deploy_envs, ac0 = ACTS;
    launchBlock = (box, o) => { calls.push([o.action, o.off || null, /Label reposé/.test(o.done || '')]); };
    deployBlock = () => calls.push(['deploy']);
    LIVE = {branch_envs: ${JSON.stringify(live)}}; Object.assign(ACTIONS, {env: true, deploy: true});
    CFG.env_repos = ['${REPO}']; CFG.deploy_envs = {'${REPO}': ['dev']}; ACTS = {prs: [{id: '${REPO}#16', n: '16', repo: '${REPO}'}]};
    const box = {kids: [], appendChild(x) { this.kids.push(x.className || ''); }};
    try { prLaunch(box, ${JSON.stringify(PR)}); return {calls, kids: box.kids}; }
    finally { launchBlock = lb; deployBlock = db; LIVE = l0; Object.assign(ACTIONS, a0); CFG.env_repos = e0; CFG.deploy_envs = d0; ACTS = ac0; }
  })()`);
  const idle = blocks({});
  assert.deepEqual(idle.calls.slice(0, 2), [['bureau-env', null, true], ['deploy']]);
  assert.deepEqual(idle.kids, ['eb-sep']);
  const busy = blocks({[REPO + '|' + PR.head]: run({status: 'in_progress', conclusion: null, end: null})});
  assert.match(busy.calls[0][1], /se construit/);
});

test('Kanban : pastille ⏳ pendant le build, ❌ après un échec, sinon le lien de l\'env', () => {
  const chips = live => J(`(() => { const l0 = LIVE, p0 = prsOf; LIVE = {branch_envs: ${JSON.stringify(live)}};
    prsOf = () => [{...${JSON.stringify(PR)}, env_url: '${URL}'}];
    try { return kbPrChips('DM-7').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); } finally { LIVE = l0; prsOf = p0; } })()`);
  const k = REPO + '|' + PR.head;
  assert.match(chips({[k]: run({status: 'in_progress', conclusion: null, end: null})}), /🌿 ⏳ env/);
  assert.match(chips({[k]: run({conclusion: 'failure'})}), /🌿 ❌ env/);
  assert.match(chips({[k]: run()}), /🌿 env ↗/);
});
