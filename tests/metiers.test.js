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
  assert.equal(J('labelText(byKey.ryan)'), '🏭 Implé', 'au plan, le nom court ; l\'icône de son étage');
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
  run(`TEAM.people[0].name = 'Michael Scott';`); // le boss de la démo : la liste ne montre que ses PR
  const r = J('mtRows("retours")');
  assert.deepEqual(r.map(x => x.name), ['#12 DM-2 b']);
  assert.match(r[0].sub, /^3 fils à traiter/);
});

test('à lancer, Retours : seulement les PR du boss (nom sans accents ni ordre, ou son login GitHub)', () => {
  const t0 = run('JSON.stringify(TEAM)');
  try {
    run(`TEAM.people[0].name = 'Scott Michaël'; TEAM.people[0].gh = ['mscott'];
      TEAM.people.push({name: 'Pam', tickets: [], prs: [{n: 30, title: 'de Pam', review: 'changes', threads: 2, keys: []}]});
      TEAM.other_prs = [{n: 31, title: 'hors Jira', review: 'changes', threads: 1, author: 'mscott', keys: []},
        {n: 32, title: 'autre', review: 'changes', threads: 1, author: 'quelqu1', keys: []}];
      ACTS.prs.push(...[30, 31, 32].map(n => ({id: prId({n})})));`);
    assert.deepEqual(J('mtRows("retours").map(r => r.name)'), ['#12 DM-2 b', '#31 hors Jira']);
    assert.equal(J('mtRows("retours")[0].sub'), '3 fils à traiter');
  } finally { run(`TEAM = ${t0};`); }
});

test('à lancer, Implé : les tickets à faire ou en cours, sans PR, connus des boutons', () => {
  assert.deepEqual(J('mtRows("impl").map(r => r.bind.key)'), ['DM-1']);
});

test('la barre : métier, étage et état ; pas de prénom affiché', () => {
  const h = run('mtBarHtml()');
  assert.match(h, /🚒 Support<span class="mt-fl">-1<\/span>/);
  assert.match(h, /🔍 Revue<span class="mt-fl">2e<\/span>/);
  assert.match(h, /🏭 Implémentation<span class="mt-fl">1er<\/span>/, 'dans la barre, le nom en entier et l\'icône de l\'onglet');
  assert.match(h, /data-mt="dwight"/);
  assert.doesNotMatch(h.replace(/title="[^"]*"/g, ''), /Dwight|Ryan|Nellie/); // le prénom seulement dans l'infobulle
  assert.doesNotMatch(h, /mt-go|▸/); // toute la carte se clique : pas de bouton ▸ à part
});

test('état d\'un agent dans la barre : sa validation passe avant le travail', () => {
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'gate'}}).b`), '✋');
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'work'}}).txt`), 'au travail');
  assert.equal(J(`mtStatus({...byKey.dwight, _st: {st: 'idle'}}).txt`), 'libre');
});

test('le petit robot du soir suit les agents des étages au RDC, pas les collègues ni les autres agents (audit produit V6)', () => {
  run('setFloor(0);');
  const robot = k => J(`floorAgentRobot(byKey.${k})`);
  assert.equal(robot('nellie'), true, 'Support');
  assert.equal(robot('dwight'), true, 'Revue');
  assert.equal(robot('ryan'), true, 'Implé : le lanceur de la chaîne');
  assert.equal(robot('jim'), false, 'un agent en hologramme n\'en a pas besoin');
  assert.equal(robot('p_pam'), false, 'un collègue');
  assert.equal(J('floorAgentRobot(Object.assign(Object.create(byKey.dwight), byKey.dwight, {key: "at_3"}))'), false, 'une copie dessinée à un étage');
  run('setFloor(1);');
  assert.equal(robot('dwight'), false, 'aux étages, pas de robot');
  run('setFloor(0);');
  // il se dessine : drawRobot appelé à l'épaule, du côté où l'agent regarde
  const at = J(`(() => {const c = byKey.dwight, keep = drawRobot, pos = c.pos, dir = c.dir; let got = null;
    drawRobot = (x, y) => { got = [x, y]; }; c.pos = {x: 100, y: 200};
    try { c.dir = 'left'; drawAgentRobot(c, 0); const l = got; c.dir = 'right'; drawAgentRobot(c, 0); return [l, got]; }
    finally { drawRobot = keep; c.pos = pos; c.dir = dir; }})()`);
  assert.deepEqual(at, [[78, 166], [118, 166]]);
});
