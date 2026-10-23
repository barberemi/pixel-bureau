// Mur Kanban (63-kanban.js) : la barre de personnes filtre les colonnes sur les tickets d'un personnage (ceux de sa
// fiche), « Tous » sur le sprint entier, « Non assigné » sur les tickets sans personne.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const keys = () => J('kbCols().flatMap(c=>c.list.map(x=>x.key)).sort()');

test('« Tous » : tout le sprint, comme les colonnes du mur', () => {
  run("KB_WHO='';");
  assert.deepEqual(keys(), J('kanbanCols().flatMap(c=>c.list.map(x=>x.key)).sort()'));
  assert.ok(keys().length > 0);
});

test('un personnage : les tickets de sa fiche, et rien d\'autre', () => {
  const who = J('kbPeople()[0].key');
  run(`KB_WHO=${JSON.stringify(who)};`);
  assert.deepEqual(keys(), J(`byKey[${JSON.stringify(who)}].team.tickets.map(x=>x.key).sort()`));
  assert.match(J('kbTitle()'), new RegExp('· ' + J(`byKey[${JSON.stringify(who)}].name`)));
});

test('« Non assigné » : les tickets sans personne', () => {
  run("KB_WHO='-';");
  assert.deepEqual(keys(), J('(TEAM.unassigned||[]).map(x=>x.key).sort()'));
  run("KB_WHO='';");
});

test('la barre ne montre que les personnages qui ont des tickets', () => {
  assert.ok(J('kbPeople().every(c=>c.person&&c.team.tickets.length>0)'));
});
