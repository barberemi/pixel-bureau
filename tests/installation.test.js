// État de l'installation (47-installation.js) : une ligne par capacité, son état lu dans les réglages et la fraîcheur,
// le coût (0 jeton pour un cron, IA pour un agent) et la commande pour agir.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

test('sans réglage : chaque capacité non installée renvoie à l\'installateur', () => {
  const p = load({demo: false});
  const J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('CFG.workflows = {}; CFG.support = null; SUPPORT = null;');
  const st = J('INSTALL_CAPS.map(c => installState(c, Date.now()))');
  assert.equal(st.length, J('INSTALL_CAPS.length'));
  for (const [t, l, act] of st) {
    assert.deepEqual([t, l], ['info', 'non installé']);
    assert.match(act, /tools\/install\.py/);
  }
});

test('un cron en échec, en retard ou avec un avertissement le dit, avec quoi faire', () => {
  const p = load({demo: false});
  const J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CFG.workflows = {team: 'aaaa', payroll: 'bbbb', office: 'cccc'};
    OFFICE = {bureau_failed: {team: {step: 'jira', err: 'refusé'}}, generated_at: new Date().toISOString()};
    PAYROLL = {generated_at: new Date(Date.now() - 6 * 36e5).toISOString()};
    WARNINGS = {office: ['miniature absente']};`);
  const at = k => J(`installState(INSTALL_CAPS.find(c => c.k === '${k}'), Date.now())`);
  assert.deepEqual(at('team').slice(0, 2), ['err', 'en échec']);
  assert.match(at('team')[2], /étape jira : refusé/);
  assert.deepEqual(at('payroll').slice(0, 2), ['warn', 'en retard']);
  assert.deepEqual(at('office'), ['warn', 'à vérifier', 'miniature absente']);
  assert.deepEqual(at('canard').slice(0, 2), ['info', 'non installé']);
});

test('la fenêtre : version, commande de mise à jour, coût par capacité', () => {
  const p = load();
  const h = JSON.parse(p.run('JSON.stringify(installHtml(Date.now()))'));
  assert.match(h, /git pull &amp;&amp; python3 tools\/publish\.py all/);
  assert.match(h, /<b>Atelier \(1er\)<\/b>.*?IA, voir la fiche de paie/s);
  assert.match(h, /<b>Équipe \(Jira, GitHub\)<\/b>.*?0 jeton/s);
  assert.doesNotMatch(h, /est sorti|nouvelle version/, 'la page ne connaît pas la dernière version : elle ne l\'annonce pas');
});
