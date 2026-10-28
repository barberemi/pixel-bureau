// Tableau des départs (62-departs.js) : vols du panneau (mises en prod, la plus récente d'abord, rejouables), heure ou
// jour du départ, fenêtre DEV/STG/PRD (liens release, Jira, branche, PR ; qui a déployé), bloc « Les envs » du mode TV.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const J = code => JSON.parse(page.run('JSON.stringify(' + code + ')'));
const NOW = '2026-10-28T12:00:00Z';
const at = h => new Date(Date.parse(NOW) - h * 36e5).toISOString();
const DEPARTS = [
  {repo: 'dunder-mifflin/site-web', label: 'site-web', dev: {ref: 'feat/DM-7-carrousel', tag: false, by: 'jimh', end: at(2), url: 'https://x/1'},
    stg: {ref: '17.2.0', tag: true, by: 'pambeesly', end: at(30), url: 'https://x/2'}, prd: {ref: '17.2.0', tag: true, by: 'pambeesly', end: at(26), url: 'https://x/3'}},
  {repo: 'dunder-mifflin/intranet', label: 'intranet', prd: {ref: '3.1.0', tag: true, by: null, end: at(1), url: 'https://x/4'}},
  {repo: 'dunder-mifflin/api', label: 'api', stg: {ref: 'ci/outillage', tag: false, by: null, end: at(5), url: 'https://x/5'}},
];
// évalue code avec LIVE.departs = DEPARTS et T = NOW (ou t)
const withDeparts = (code, t = NOW) => J(`(() => { const l0 = LIVE, t0 = T; LIVE = {runs: [], departs: ${JSON.stringify(DEPARTS)}};
  T = Date.parse('${t}'); try { return ${code}; } finally { LIVE = l0; T = t0; } })()`);

test('panneau : les mises en prod, la plus récente en haut ; une MEP d\'après le moment rejoué n\'est pas encore partie', () => {
  assert.deepEqual(withDeparts(`depFlights(T).map(r => r.label)`), ['intranet', 'site-web']); // api : pas de PRD
  assert.deepEqual(withDeparts(`depFlights(T).map(r => r.label)`, at(10)), ['site-web']); // l'intranet part à 11h
});

test('panneau : l\'heure du départ le jour même, sinon le jour (JJ/MM), à l\'heure du bureau', () => {
  assert.equal(withDeparts(`depWhen('${at(1)}', T)`), '12:00'); // 11h UTC = midi à Paris (heure d'hiver le 28/10)
  assert.equal(withDeparts(`depWhen('${at(26)}', T)`), '27/10');
  assert.equal(withDeparts(`depWhen(null, T)`), '');
});

test('fenêtre : une ligne par dépôt, version -> release, branche d\'un ticket -> Jira, autre branche -> GitHub, — sans déploiement', () => {
  const html = withDeparts(`(() => { const b = document.createElement('div'); departsFill(b); return b.innerHTML; })()`);
  assert.equal((html.match(/<tr><td class="dep-n">/g) || []).length, 3);
  assert.match(html, /href="https:\/\/github\.com\/dunder-mifflin\/site-web\/releases\/tag\/17\.2\.0"/);
  assert.match(html, /class="dep-prd"[^>]*>17\.2\.0</); // PRD mise en avant
  assert.match(html, /\/browse\/DM-7"[^>]*>DM-7</);
  assert.match(html, /href="https:\/\/github\.com\/dunder-mifflin\/api\/tree\/ci\/outillage"/);
  assert.equal((html.match(/dep-none/g) || []).length, 4); // intranet sans DEV ni STG, api sans DEV ni PRD
});

test('fenêtre : sans données publiées, le dit', () => {
  const html = J(`(() => { const l0 = LIVE; LIVE = {runs: []}; const b = document.createElement('div');
    try { departsFill(b); return b.innerHTML; } finally { LIVE = l0; } })()`);
  assert.match(html, /Pas encore de déploiement relu/);
});

test('mode TV : « Les envs », trois lignes par dépôt, la clé du ticket plutôt que la branche ; rien sans données', () => {
  const html = withDeparts(`tvDeparts()`);
  assert.match(html, /^<h2>Les envs<\/h2>/);
  assert.equal((html.match(/class="tve-l"/g) || []).length, 9);
  assert.match(html, /<em class="dep-br">DM-7<\/em>/);
  assert.match(html, /<em class="dep-prd">3\.1\.0<\/em>/);
  assert.equal(J(`(() => { const l0 = LIVE; LIVE = null; try { return tvDeparts(); } finally { LIVE = l0; } })()`), '');
});

test('clé de ticket : en majuscules seulement (« ci/tpl-bluegreen-17.5.0 » n\'en a pas)', () => {
  assert.deepEqual(J(`['feat/EW-7399-audio', 'ci/tpl-bluegreen-17.5.0', 'dev_EW-7712-2'].map(depKey)`), ['EW-7399', null, 'EW-7712']);
});
