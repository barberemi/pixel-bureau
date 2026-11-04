// Les agents des étages au RDC (69-metiers.js) : métier à la place du prénom, toujours à leur place, en couleurs pleines,
// ce qu'ils lancent depuis leur fiche, la barre « AGENTS » au-dessus des étages.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test.beforeEach(() => run(`TEAM = {people: [{name: 'Pam', tickets: [
    {key: 'DM-1', summary: 'Le tri des devis', cat: 'todo'}, {key: 'DM-2', summary: 'Avec sa PR', cat: 'doing'},
    {key: 'DM-3', summary: 'Déjà fait', cat: 'done'}, {key: 'DM-4', summary: 'Hors des données des boutons', cat: 'todo'}], prs: [
    {n: 12, title: 'DM-2 b', review: 'changes', threads: 3, keys: ['DM-2']},
    {n: 14, title: 'brouillon', draft: true, review: 'pending', keys: []},
    {n: 15, title: 'à relire', review: 'pending', threads: 0, keys: []},
    {n: 16, title: 'approuvée', review: 'approved', keys: []},
    {n: 17, title: 'pas dans les boutons', review: 'pending', keys: []}]}],
  unassigned: [], other_prs: []};
  ACTS = {tickets: [{key: 'DM-1'}, {key: 'DM-2'}, {key: 'DM-3'}],
    prs: TEAM.people[0].prs.filter(p => p.n !== 17).map(p => ({id: prId(p)}))};
  ACTIONS.review = true; ACTIONS.fix_pr = true; ACTIONS.impl = true;`));

test('les agents de métier de la démo, dans l\'ordre de la barre : Support, Revue, Implé', () => {
  assert.deepEqual(J('mtAgents().map(c => c.key)'), ['nellie', 'dwight', 'ryan']);
  assert.equal(J('metierOf(byKey.dwight).lbl'), 'Revue');
  assert.equal(J('metierOf(byKey.jim)'), null);
  assert.equal(J('metierOf(byKey.p_pam)'), null); // un collègue n'a pas de métier d'étage
});

test('une copie dessinée à un étage (atWorker) ne porte pas la tenue du RDC', () => {
  assert.equal(J('metierOf(Object.assign(Object.create(byKey.dwight), byKey.dwight, {key: "at_3"}))'), null);
  assert.equal(J('metierOf({...byKey.dwight})'), null);
});

test('étiquette : le métier et son icône, pas le prénom, en mode TV aussi', () => {
  assert.equal(J('labelText(byKey.nellie)'), '🚒 Support');
  assert.equal(J('labelText(byKey.ryan)'), '🏗 Implé');
  run('TV=true;');
  try { assert.equal(J('labelText(byKey.dwight)'), '🔍 Revue'); } finally { run('TV=false;'); }
  assert.match(J('labelText(byKey.jim)'), /Jim/); // les autres agents gardent leur prénom
});

test('toujours à sa place : sans run du jour, reparti ou absent, il est au repos à son bureau', () => {
  assert.deepEqual(J(`mtState(byKey.dwight, {st: 'off', label: "Absent aujourd'hui"})`),
    {st: 'idle', label: "À son poste · Absent aujourd'hui", zone: 'desk'});
  assert.equal(J(`mtState(byKey.dwight, {st: 'gone', label: 'Reparti'}).zone`), 'desk');
  assert.deepEqual(J(`mtState(byKey.dwight, {st: 'work', zone: 'srv', label: 'x'})`), {st: 'work', zone: 'srv', label: 'x'});
});

test('à lancer, Revue : les PR ouvertes connues des boutons, ni brouillon ni approuvée', () => {
  assert.deepEqual(J('mtRows("revue").map(r => r.name)'), ['#12 DM-2 b', '#15 à relire']);
  run('ACTIONS.review = false;');
  assert.deepEqual(J('mtRows("revue")'), []);
});

test('à lancer, Retours : les PR qui ont des fils à traiter (ou des changements demandés, fils inconnus)', () => {
  const r = J('mtRows("retours")');
  assert.deepEqual(r.map(x => x.name), ['#12 DM-2 b']);
  assert.match(r[0].sub, /^3 fils à traiter/);
});

test('à lancer, Implé : les tickets à faire ou en cours, sans PR, connus des boutons', () => {
  assert.deepEqual(J('mtRows("impl").map(r => r.bind.key)'), ['DM-1']);
});

test('la barre : métier, étage et état ; pas de prénom affiché', () => {
  const h = run('mtBarHtml()');
  assert.match(h, /🚒 Support<span class="mt-fl">-1<\/span>/);
  assert.match(h, /🔍 Revue<span class="mt-fl">2e<\/span>/);
  assert.match(h, /🏗 Implé<span class="mt-fl">1er<\/span>/);
  assert.match(h, /data-mt="dwight"/);
  assert.doesNotMatch(h.replace(/title="[^"]*"/g, ''), /Dwight|Ryan|Nellie/); // le prénom seulement dans l'infobulle
  assert.doesNotMatch(h, /mt-go|▸/); // toute la carte se clique : pas de bouton ▸ à part
});

test('état d\'un agent dans la barre : sa validation passe avant le travail', () => {
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'gate'}}).b`), '✋');
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'work'}}).txt`), 'au travail');
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'idle'}}).txt`), 'libre');
});
