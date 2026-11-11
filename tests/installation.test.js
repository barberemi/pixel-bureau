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

test('l\'écran mural : l\'adresse autonome de Kronn, faite avec kronn.ui et l\'id de la page', () => {
  const fx = require('./fixtures/bureau.config.json');
  const p = load({config: {...fx, kronn: {...fx.kronn, ui: 'http://localhost:3140'}}});
  const J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  assert.equal(J(`wallUrl('4f38f114-e010')`), 'http://localhost:3140/standalone/pages/4f38f114-e010?tv=1&floor=alt',
    'plusieurs étages : ils alternent ; une barre oblique entre l\'interface et le chemin');
  p.run(`WALL.floor = '3'; WALL.scene = 'standup'; WALL.loupe = '0';`);
  assert.equal(J(`wallUrl('x')`), 'http://localhost:3140/standalone/pages/x?tv=1&floor=3&scene=standup&loupe=0');
  p.run(`WALL.floor = '0';`);
  assert.doesNotMatch(J(`wallUrl('x')`), /floor/, 'le RDC est l\'étage par défaut');
  assert.match(J('wallUrl(null)'), /\/standalone\/pages\/<id de la page>\?tv=1/, 'sans id (démo) : la place de l\'id');
  assert.equal(J(`pageIdOf({page: {id: 'abc'}})`), 'abc');
  assert.equal(J(`pageIdOf({page: {}})`), null);
  p.run(`WALL.floor = '3';`);
  const h = J('installHtml(Date.now())');
  assert.match(h, /<b>Écran mural \(mode TV\)<\/b>.*?0 jeton/s);
  assert.match(h, /il faut Kronn 0\.15\.2 ou plus/);
  for (const f of ['Alterner', 'RDC', '-1', '1er', '2e', '3e']) assert.match(h, new RegExp(`data-wall="floor"[^>]*>${f}<`), f);
  assert.match(h, /data-wall="floor" data-v="3" aria-pressed="true"/, 'le choix reste au nouveau rendu');
});
