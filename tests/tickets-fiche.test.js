// « Ses tickets » dans la fiche d'un collègue (tkRowHtml, 60-fiches.js) : composant sorti du titre, points (0 compris),
// âge dans la colonne (orange au-delà de BLOCKED_DAYS en review ou en test), « Réouvert », PR ouvertes du ticket.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const T11 = Date.parse('2026-10-07T11:00:00+02:00');
const row = x => run(`(() => { T = ${T11}; DAY0 = parisMidnight(T); return tkRowHtml(${JSON.stringify(x)}); })()`);

test.beforeEach(() => run(`TEAM = {people: [{name: 'Pam', tickets: [], prs: [
    {n: 12, url: 'https://x/12', title: 'DM-2 b', review: 'changes', keys: ['DM-2']},
    {n: 14, url: 'https://x/14', title: 'DM-2 brouillon', draft: true, review: 'pending', keys: ['DM-2']}]}],
  unassigned: [], other_prs: []};`));

test('composant en étiquette, titre sans lui, points affichés même à 0', () => {
  const h = row({key: 'DM-1', summary: '[Panier] Alléger le bundle', cat: 'doing', status: 'En cours', points: 0, since: '2026-10-06T15:00:00+02:00'});
  assert.match(h, /<span class="tk-comp">Panier<\/span>/);
  assert.match(h, />Alléger le bundle<\/a>/);
  assert.match(h, />0 pt<\/span>/);
  assert.match(h, /depuis hier/);
  assert.doesNotMatch(h, /warn|tk-tag/);
  assert.match(row({key: 'DM-1', summary: 'Sans composant', cat: 'todo', points: 3}), />3 pts<\/span>/);
  assert.doesNotMatch(row({key: 'DM-1', summary: '[Panier]', cat: 'todo', points: null}), /tk-comp|pts/); // titre réduit au composant : gardé
});

test('âge : orange avec ⏳ en review au-delà de BLOCKED_DAYS, jamais pour un ticket à faire ou déployé', () => {
  const since = '2026-10-03T10:00:00+02:00';
  assert.match(row({key: 'DM-3', summary: 'a', cat: 'review', since}), /class="warn"[^>]*>⏳ depuis 4 j/);
  assert.match(row({key: 'DM-3', summary: 'a', cat: 'doing', since}), /<span>depuis 4 j/);
  assert.match(row({key: 'DM-3', summary: 'a', cat: 'test', since: '2026-10-07T09:00:00+02:00'}), /aujourd'hui/);
  for (const cat of ['todo', 'done']) assert.doesNotMatch(row({key: 'DM-3', summary: 'a', cat, since}), /depuis|tk-meta/);
  assert.doesNotMatch(row({key: 'DM-3', summary: 'a', cat: 'doing', since: '2026-10-07T15:00:00+02:00'}), /tk-meta/); // pas encore arrivé (rejeu)
});

test('Réouvert (statut jira_flow.reopened), PR du ticket avec leur review, bug signalé', () => {
  const h = row({key: 'DM-2', summary: 'b', cat: 'doing', status: 'Reopen', type: 'Bug', since: '2026-10-07T10:00:00+02:00'});
  assert.match(h, /<span class="tk-tag">Réouvert<\/span>/);
  assert.match(h, /href="https:\/\/x\/12"[^>]*>#12<\/a> changements demandés/);
  assert.match(h, />#14<\/a> brouillon/);
  assert.match(h, /title="Bug">🐛/);
  assert.doesNotMatch(row({key: 'DM-9', summary: 'c', cat: 'doing', status: 'En cours'}), /tk-tag|#12/);
});
