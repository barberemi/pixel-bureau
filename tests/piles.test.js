// Piles sur les bureaux (40-furniture.js) : une barre par ticket ouvert de son côté de la table, et sur un caisson dans l'allée
// les feuilles de la facilitatrice (tickets créés depuis le daily) et les dossiers du testeur (tickets en test), avec leur nombre.
// Démo à 11h : Kelly facilitatrice, Karen testeuse.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

run(`TEAM=mergedTeam();T=Date.parse('2026-10-01T11:00:00+02:00');for(const c of chars)c._st=stateAt(c,T);`);

test('feuilles de la facilitatrice et dossiers du testeur ; rien pour les autres', () => {
  const sm = J(`(p=>({kind:p.kind,n:p.list.length}))(roleItems(byKey.p_kelly))`);
  assert.equal(sm.kind, 'doc');
  assert.equal(sm.n, J(`teamCreated(lastDaily(T),T).length`));
  assert.ok(sm.n > 0);
  const qa = J(`(p=>({kind:p.kind,n:p.list.length}))(roleItems(byKey.p_karen))`);
  assert.deepEqual(qa, {kind: 'folder', n: J(`sprintTickets().filter(k=>k.cat==='test').length`)});
  assert.equal(J('roleItems(byKey.p_pam)'), null);
});

test('infobulles : le détail de chaque pile', () => {
  assert.match(J(`pileTip({kind:'doc',o:byKey.p_kelly,list:roleItems(byKey.p_kelly).list})`), /^Kelly : \d+ tickets? créés? par l'équipe depuis le daily · DM-\d+/);
  assert.match(J(`pileTip({kind:'folder',o:byKey.p_karen,list:roleItems(byKey.p_karen).list})`), /^Karen : \d+ tickets? à tester · DM-/);
  const t = J(`pileTip({kind:'tk',o:byKey.p_andy})`);
  assert.match(t, /^Andy : \d+ tickets? ouverts? · /);
  assert.match(t, /en cours/);
});

test('plus de 6 tickets : la liste de l\'infobulle est coupée', () => {
  const list = Array.from({length: 9}, (_, i) => ({key: 'DM-' + i}));
  assert.equal(J(`pileTip({kind:'folder',o:byKey.p_karen,list:${JSON.stringify(list)}})`), 'Karen : 9 tickets à tester · DM-0, DM-1, DM-2, DM-3, DM-4, DM-5…');
});
