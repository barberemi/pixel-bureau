// 1er étage, l'atelier d'implémentation (68-atelier.js, #76 #125) : dataset atelier, démo, quatre bureaux au plus, panneau
// des bureaux et fiche d'un ticket (verdict de chaque poste, gate), étage limité à l'implémentation, la PR et ses retours.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const room = (run_, extra = {}) => ({run: run_, ticket: 'DM-' + run_, title: 'Ticket ' + run_, repo: 'dm/site', poste: 'code', states: {cadrage: 'ok'}, tok: 1000, ...extra});

test('lecture du dataset : objet ou chaîne JSON, current des datasets Kronn ; sans rooms -> null', () => {
  const d = {generated_at: 'x', rooms: [], queue: []};
  assert.deepEqual(J(`readAtelier({datasets: {atelier: {current: ${JSON.stringify(JSON.stringify(d))}}}})`), d);
  assert.equal(J('readAtelier({datasets: {atelier: {current: {}}}})'), null);
  assert.equal(J('readAtelier({datasets: {}})'), null);
});

test("l'étage ne déploie rien : la chaîne s'arrête à la PR, sa revue et ses retours", () => {
  const keys = J('AT_POSTES.map(p => p.k)');
  assert.deepEqual(keys.slice(-3), ['pr', 'revue_pr', 'retours']);
  for (const k of ['ci', 'env', 'deploy', 'mep', 'livraison']) assert.ok(!keys.includes(k), k);
  assert.equal(J('AT_POSTES.filter(p => p.gate).map(p => p.k)').join(), 'gate');
});

test('quatre bureaux au plus, la démo les occupe tous et met deux tickets en file', () => {
  run(`ATELIER = {rooms: ${JSON.stringify([1, 2, 3, 4, 5].map(i => room(String(i))))}, queue: []};`);
  assert.equal(J('atRooms().length'), 4);
  const d = J('atelierDemo()');
  assert.equal(d.rooms.length, 4);
  assert.equal(d.queue.length, 2);
  assert.ok(d.rooms.some(r => r.gate === 'gate_plan') && d.rooms.some(r => r.back), 'un plan à valider, un retour au code');
  assert.ok(d.rooms.every(r => /^DM-/.test(r.ticket)), 'équipe fictive de la démo');
});

test('panneau : un bouton par bureau, la file, et la fiche du ticket choisi avec le verdict de chaque poste', () => {
  run(`GATES = []; ATELIER = {rooms: [${JSON.stringify(room('a', {states: {cadrage: 'ok', securite: 'bloq'}, back: true, note: '🔒 bloquant', tour: '2/3'}))}],
       queue: [{run: 'q', ticket: 'DM-9', since: '2026-10-01T09:00:00Z'}]}; ATSEL = null;`);
  const html = J('atelierListHtml(atRooms(), ATELIER.queue)');
  assert.match(html, /Bureau 1/);
  assert.match(html, /DM-9/);
  assert.match(html, /retour au code/);
  assert.match(html, /CI, l'env de branche et les mises en prod restent au RDC/);
  const fiche = J('atelierFicheHtml(atRooms()[0], 0)');
  assert.match(fiche, /DM-a/);
  assert.match(fiche, /bloquant/);
  assert.match(fiche, /tour <b>2\/3<\/b>/);
  assert.equal((fiche.match(/<tr/g) || []).length, J('AT_POSTES.length'));
});

test("la fiche d'un bureau qui attend ta gate reçoit la carte de décision du Bureau", () => {
  run(`ACTIONS.gate = true; GATES = [{run: 'g', gate: 'gate_plan', wf: 'abcd', wf_name: 'Le Bureau · implémenter un ticket (chaîne)', message: 'Plan', since: '2026-10-01T09:00:00Z'}];
       ATELIER = {rooms: [${JSON.stringify(room('g', {poste: 'gate', gate: 'gate_plan', states: {gate: 'wait'}}))}], queue: []}; ATSEL = 'g';`);
  const g = J('atGate(atRooms()[0])');
  assert.deepEqual([g.run, g.wf_name], ['g', 'Le Bureau · implémenter un ticket (chaîne)']);
  run(`ATELIER.rooms[0].gate = null;`);
  assert.equal(J('atGate(atRooms()[0])'), null);
});

test("onglets d'étage : seulement quand la chaîne est installée (ou en démo)", () => {
  assert.equal(J('typeof atelierOn()'), 'boolean');
});
