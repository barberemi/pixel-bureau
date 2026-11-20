// Scènes pop du RDC (43-pop.js) : l'amiral Ackbar d'une grosse PR (seuils, cri, départ), les lettres de Poudlard (seuil
// franchi dans la journée), le verdict de la revue en hologramme, l'hyperespace (sans transition hors navigateur) et
// leurs entrées dans la galerie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = h => J(`DAY0 + ${h} * 36e5`);

test('Ackbar : une PR ouverte au-delà d\'un seuil le fait venir, il crie avec les chiffres, puis repart', () => {
  const dev = J(`(chars.find(c => c.person && c.seat && c.team) || {}).key`);
  run(`TEAM = {...TEAM, events: [...(TEAM.events || []),
    {t: new Date(${at(10)}).toISOString(), kind: 'pr', n: 9999, repo: '', title: 'Grosse', author: byKey['${dev}'].team.id, author_name: byKey['${dev}'].person, lines: 2140, files: 12},
    {t: new Date(${at(10.5)}).toISOString(), kind: 'pr', n: 9998, repo: '', title: 'Petite', author: byKey['${dev}'].team.id, author_name: byKey['${dev}'].person, lines: 40, files: 3}]};`);
  const ak = `chars.find(c => c.guest && c.on === 'bigpr')`;
  assert.ok(J(`!!${ak}`), 'l\'invité commun est là');
  assert.deepEqual(J(`bigPrs().map(p => p.n)`), [9999]); // 2140 lignes > 1000 ; la petite non
  assert.equal(J(`bigPrHeraldState(${ak}, ${at(9.9)}).st`), 'off');
  const s = J(`bigPrHeraldState(${ak}, ${at(10)} + 60e3)`);
  assert.equal(s.st, 'bigpr');
  assert.equal(s.zone, 'visit');
  assert.equal(s.bubble, 'IT\'S A TRAP! #9999 : 2 140 lignes, 12 fichiers');
  assert.equal(J(`bigPrHeraldState(${ak}, ${at(10)} + HERALD_MS + 1e3).st`), 'gone');
  run(`POP_CFG.grosse_pr.lignes = 5000; BIGPR_MEMO = {team: null, list: []};`);
  assert.deepEqual(J(`bigPrs().map(p => p.n)`), [], 'seuil relevé : plus rien');
  run(`POP_CFG.grosse_pr.lignes = 1000; BIGPR_MEMO = {team: null, list: []};`);
});

test('lettres : le n-ième mail utile d\'un compte arrivé aujourd\'hui déclenche la scène, une fois ; pas la veille ni en dessous', () => {
  const mails = (n, h0) => JSON.stringify(Array.from({length: n}, (_, i) => ({id: 'm' + i, at: new Date(J(`DAY0`) + (h0 + i * .1) * 36e5).toISOString()})));
  run(`MAILS = {sorted: true, accounts: [{id: 'pro', label: 'Pro', ok: true, unread: 12, useful_n: 10, useful: ${mails(10, 9)}},
    {id: 'perso', label: 'Perso', ok: true, unread: 9, useful_n: 9, useful: ${mails(9, 9)}},
    {id: 'vieux', label: 'Vieux', ok: true, unread: 12, useful_n: 12, useful: ${mails(12, -30)}}]};`);
  const l = J(`letterFloods(${at(15)}).map(x => [x.a.id, x.n, x.at])`);
  assert.deepEqual(l.map(x => x[0]), ['pro']);
  assert.equal(l[0][2], at(9 + 9 * .1)); // l'heure du 10e
  assert.match(J(`(() => { const e = letterFloods(${at(15)})[0]; return e.a.label + ' ' + e.n; })()`), /Pro 10/);
});

test('verdict : une revue du cron postée apparaît chez l\'auteur, avec le verdict ; doré si elle approuve', () => {
  const who = J(`(chars.find(c => c.person && c.seat) || {}).key`);
  run(`REDACTION = {...(REDACTION || {}), revue: {batches: {}, verdicts: {r1: 'approve', r2: 'request_changes', r3: 'bizarre'}}};
    const _rv = rvRuns, _gh = ghChar;
    rvRuns = () => [{run: 'r1', status: 'Success', _e: ${at(11)}, vars: {'current_task.number': '7', 'current_task.repo': 'acme/web', 'current_task.author': 'x'}},
      {run: 'r2', status: 'Success', _e: ${at(12)}, vars: {'current_task.number': '8', 'current_task.author': 'x'}},
      {run: 'r3', status: 'Success', _e: ${at(12)}, vars: {}}, {run: 'r4', status: 'Failed', _e: ${at(12)}, vars: {}}];
    ghChar = () => byKey['${who}']; globalThis.__restore = () => { rvRuns = _rv; ghChar = _gh; };`);
  assert.deepEqual(J(`holoReviews().map(r => [r.run, r.v, r.n, r.c.key])`), [['r1', 'approve', '7', who], ['r2', 'request_changes', '8', who]]);
  assert.match(J(`POP_VERDICT.approve[1]`), /Approuvée/);
  run(`__restore()`);
});

test('hyperespace : il fige l\'heure le temps de la transition ; Échap ou sa fin lance la suite ; rien en mode TV', () => {
  const r = J(`(() => { let done = 0; hyperGo('k', 'Le héraut', 's', () => { done++; }); const during = {done, hyper: !!HYPER};
    hyperEnd(); const after = {done, hyper: !!HYPER}; hyperEnd(); return {during, after, again: done}; })()`);
  assert.deepEqual(r, {during: {done: 0, hyper: true}, after: {done: 1, hyper: false}, again: 1});
  const tv = J(`(() => { const t0 = TV; TV = true; let done = false; hyperGo('k', 't', 's', () => { done = true; }); TV = t0; return {done, hyper: !!HYPER}; })()`);
  assert.deepEqual(tv, {done: true, hyper: false});
});

test('galerie : Ackbar (avec les équipiers), le verdict de la revue et les lettres (petits moments)', () => {
  const L = J(`galleryScenes().map(x => [x.fam, x.n])`);
  assert.ok(L.some(([f, n]) => f === 'Équipe et cérémonies' && /grosse PR/.test(n)), JSON.stringify(L));
  assert.ok(L.some(([f, n]) => f === 'Petits moments' && n === 'Le verdict de la revue'));
  assert.ok(!L.some(([f, n]) => f === 'Invités' && /Ackbar/.test(n)), 'pas aussi en simple visite');
});
