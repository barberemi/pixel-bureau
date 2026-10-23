// Fiche d'un collègue (60-fiches.js) : la barre de « Ses tickets » (les tickets eux-mêmes sont dans le Mur Kanban,
// 63-kanban.js) et « Ses autres PR ouvertes ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const T11 = Date.parse('2026-10-07T11:00:00+02:00');

test.beforeEach(() => run(`TEAM = {people: [{name: 'Pam', tickets: [], prs: [
    {n: 12, url: 'https://x/12', title: 'DM-2 b', review: 'changes', keys: ['DM-2']},
    {n: 14, url: 'https://x/14', title: 'DM-2 brouillon', draft: true, review: 'pending', keys: ['DM-2']}]}],
  unassigned: [], other_prs: []};`));

test('barre : un segment par colonne en points, en tickets si aucun n\'est estimé', () => {
  const h = run(`tkBarHtml([{cat: 'done', points: 8}, {cat: 'doing', points: 3}, {cat: 'doing', points: 0}, {cat: 'review', points: null}])`);
  assert.match(h, /flex:3;background:#2e9e5b" title="En cours : 3 pts"/); // en cours : vert, comme partout
  assert.match(h, /flex:8;[^>]*title="Déployé : 8 pts"/);
  assert.doesNotMatch(h, /En review/); // ticket non estimé : 0 pt, pas de segment
  assert.match(h, /<b>8 pts<\/b> déployés sur 11 pts/);
  assert.match(run(`tkBarHtml([{cat: 'todo'}, {cat: 'test'}, {cat: 'test'}])`), /<b>0 ticket<\/b> déployé sur 3 tickets/);
  assert.equal(run('tkBarHtml([])'), '');
});

test('« Ses autres PR ouvertes » : seulement celles qui ne citent aucun de ses tickets', () => {
  const p = {tickets: [{key: 'DM-1'}, {key: 'DM-2'}], prs: [{n: 1, keys: ['DM-1']}, {n: 2, keys: []}, {n: 3, keys: ['DM-9']}, {n: 4}]};
  assert.deepEqual(JSON.parse(run(`JSON.stringify(loosePrs(${JSON.stringify(p)}).map(x => x.n))`)), [2, 3, 4]);
});

test('« Ses autres PR » : groupe par état de review, titre sans préfixe, ticket cité, ⏳ si elle attend une review depuis trop longtemps', () => {
  const g = x => run(`prGroup(${JSON.stringify(x)})`);
  assert.equal(g({review: 'changes'}), 'changes');
  assert.equal(g({review: 'approved', draft: true}), 'draft');
  assert.equal(g({review: 'bizarre'}), 'pending');
  const pr = x => run(`(() => { T = ${T11}; return prRowHtml(${JSON.stringify(x)}); })()`);
  const h = pr({n: 1432, url: 'https://x/1432', title: 'feat(DM-6305): [Devis] Corriger le tri', review: 'changes', keys: ['DM-6305'], updated: '2026-08-07T10:00:00Z'});
  // le numéro ouvre la fiche de la PR, « ↗ » ouvre GitHub (#74)
  assert.match(h, /data-pr="[^"]*#1432"[^>]*>#1432<\/a><a class="tk-gh" href="https:\/\/x\/1432"[^>]*>↗<\/a><a class="tk-key tk-cite"[^>]*DM-6305[^>]*>DM-6305<\/a><span class="tk-comp">Devis<\/span>/);
  const st = pr({n: 5, title: 'x', review: 'approved', conflict: true, behind: 3, threads: 4});
  assert.match(st, /⛔ conflit.*⟳ 3 de retard.*💬 4 fils/);
  assert.doesNotMatch(pr({n: 6, title: 'x', review: 'approved', behind: 0, threads: 0}), /prm/);
  assert.match(h, /<div class="tk-t">Corriger le tri<\/div>/);
  assert.match(h, /activité il y a 2 mois/);
  assert.match(pr({n: 7, title: 'chore: mettre à jour', review: 'approved', updated: '2026-10-06T10:00:00+02:00'}), /tk-t">mettre à jour<\/div>.*activité hier/);
  assert.match(pr({n: 8, title: 'x', review: 'pending', created: '2026-10-04T10:00:00+02:00', updated: '2026-10-07T10:00:00+02:00'}),
    /class="warn"[^>]*>⏳ attend une review depuis 3 j/);
  assert.doesNotMatch(pr({n: 9, title: 'x', draft: true, review: 'pending', created: '2026-10-04T10:00:00+02:00'}), /warn/); // brouillon : n'attend rien
  // sans date de création, pas d'attente déduite de updated (réécrit par les pushs) : seulement la dernière activité
  assert.match(pr({n: 10, title: 'x', review: 'pending', updated: '2026-10-04T10:00:00+02:00'}), /activité il y a 3 j/);
});

test('palette : une seule table des statuts de ticket, « en cours » vert et distinct de « déployé »', () => {
  const t = JSON.parse(run(`JSON.stringify({tcat: Object.fromEntries(Object.entries(TCAT).map(([k, v]) => [k, v.c])), cat: CAT_COLOR})`));
  assert.deepEqual(t.cat, t.tcat); // bulles, KPI, fil, « Qui fait quoi », TV : les couleurs de TCAT
  assert.equal(t.tcat.doing, '#2e9e5b');
  assert.equal(new Set(Object.values(t.tcat)).size, Object.keys(t.tcat).length); // six statuts, six couleurs
});
