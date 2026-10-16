// Agents ajoutés depuis la page (#64) : dataset agents lu, casting complété, place attribuée, retrait.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const CLARK = {name: 'Clark', role: 'Issue GitHub', wf: ['e5ce6732'], seat: null, sprite: 'p_clark', at: 1};

test('le dataset agents se lit en texte comme en objet, et rien sans lui', () => {
  const {run} = load();
  const read = d => run(`JSON.stringify(readAgents(${JSON.stringify({datasets: {agents: {current: d}}})}))`);
  assert.equal(read({agents: {a_clark: CLARK}}), JSON.stringify({a_clark: CLARK}));
  assert.equal(read(JSON.stringify({agents: {a_clark: CLARK}})), JSON.stringify({a_clark: CLARK}));
  assert.equal(run('readAgents({datasets: {}})'), null);
  assert.equal(run('readAgents({datasets: {agents: {current: "{pas du json"}}})'), null);
});

test('un agent ajouté rejoint le casting, prend une place et garde ses workflows', () => {
  const {run} = load();
  const before = run('chars.length');
  assert.equal(run(`applyAgents({a_clark: ${JSON.stringify(CLARK)}})`), true);
  assert.equal(run('chars.length'), before + 1);
  assert.equal(run('famOf(byKey.a_clark)'), 'wf');
  assert.deepEqual(Array.from(run('byKey.a_clark.wf')), ['e5ce6732']);
  assert.ok(Array.isArray(run('byKey.a_clark.seat')), 'une place libre lui est donnée');
  assert.equal(run('!!lookOf(byKey.a_clark)'), true, 'son avatar se dessine');
  assert.equal(run(`applyAgents({a_clark: ${JSON.stringify(CLARK)}})`), false, 'rien de changé : pas de rafraîchissement');
  assert.equal(run('applyAgents({})'), true);
  assert.equal(run('byKey.a_clark'), undefined, 'retiré du dataset : retiré du bureau');
  assert.equal(run('chars.length'), before);
});

test('jamais la clé d\'une personne, d\'un invité ou d\'un agent de la config ; apparence propre fusionnée à sa recette', () => {
  const {run} = load();
  const agent = run('AGENTS[0].key'), person = run('ROSTER[0].key');
  run(`applyAgents({${JSON.stringify(agent)}: ${JSON.stringify(CLARK)}, ${JSON.stringify(person)}: ${JSON.stringify(CLARK)},
    a_sans_wf: {name: 'X', wf: []}, a_look: {name: 'Nate', wf: ['367b1841'], sprite: 'p_clark', look: {shirt: '#123456'}, at: 2}})`);
  assert.equal(run(`AGENTS.filter(a => a.added).map(a => a.key).join()`), 'a_look');
  assert.equal(run(`lookOf(byKey.a_look).shirt`), '#123456');
  assert.equal(run(`lookOf(byKey.a_look).hair`), run('RECIPES.p_clark.hair'));
});

test('ajouter un agent ne déplace pas ceux de la config (CAST garde des copies : leur siège demandé reste lisible)', () => {
  const {run} = load();
  const seats = () => JSON.parse(run(`JSON.stringify(Object.fromEntries(CAST.filter(c=>!c.added&&!c.person).map(c=>[c.key,c.seat])))`));
  const before = seats();
  run(`applyAgents({a_clark: ${JSON.stringify(CLARK)}})`);
  assert.deepEqual(seats(), before);
  run('placeCast()');
  assert.deepEqual(seats(), before, 'un second placement (changement de plan) non plus');
  assert.equal(run('AGENTS.every(a=>!Array.isArray(a.seat)||a.added)'), true, 'AGENTS jamais réécrit en [x, y]');
});
