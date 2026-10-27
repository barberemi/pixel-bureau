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
