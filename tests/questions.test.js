// Questions de discussion en attente (KT-27, dataset gates.questions) : le visiteur revient d'un autre jour et attend au
// bureau du boss tant que la question est ouverte (daté par la question, rejouable), le boss les compte, y compris
// celles des discussions du Bureau (canard), qui n'ont pas de visiteur.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const q = (id, disc, since, extra = {}) => ({id, disc, title: 'Validation de l\'audit', agent: 'ClaudeCode', bureau: false, since,
  question: 'Que fait-on ?', context: '', options: [{id: 'confirm', label: 'Confirmer', desc: ''}], rec: [], multiple: false, items: [], ...extra});

test('une question d\'un autre jour ramène son visiteur, qui attend au bureau du boss depuis l\'heure de la question', () => {
  const since = J('new Date(DAY0 - 864e5).toISOString()'); // posée la veille
  run(`QUESTIONS = ${JSON.stringify([q('q1', 'aaaa1111-0000', since), q('q2', 'aaaa1111-0000', since)])}; setData(DATA, false);`);
  const v = J(`(() => { const c = byKey['v_aaaa1111']; const s = stateAt(c, DAY0 + 11 * 3600e3); return {name: c.name, st: s.st, zone: s.zone, label: s.label, n: s.qs.length}; })()`);
  assert.deepEqual(v, {name: 'Claude Code', st: 'ask', zone: 'gate', label: 'Attend ta réponse (2 questions)', n: 2});
  assert.equal(J(`stateAt(byKey['v_aaaa1111'], DAY0 - 2 * 864e5).st`), 'absent'); // avant la question : pas encore là
});

test('le boss compte les questions des visiteurs et celles des discussions du Bureau (le canard), une fois posées', () => {
  const t = J('DAY0 + 11 * 3600e3'), iso = h => J(`new Date(DAY0 + ${h} * 3600e3).toISOString()`);
  run(`QUESTIONS = ${JSON.stringify([q('q1', 'bbbb2222-0000', iso(9)), q('q3', 'cccc3333-0000', iso(10), {bureau: true, title: '🦆 Le menu casse'}),
    q('q4', 'dddd4444-0000', iso(12))])}; setData(DATA, false); for (const c of chars) if (!c.boss && !c.guest) c._st = stateAt(c, ${t});`);
  assert.equal(J(`byKey['v_cccc3333'] === undefined`), true); // discussion du Bureau : pas un visiteur
  assert.deepEqual(J(`loneQuestions(${t}).map(x => x.id)`), ['q3']); // q4 : pas encore posée à 11h
  assert.equal(J(`askCount(${t})`), 2);
  assert.equal(J(`askerOf(QUESTIONS[1])`), '🦆 Le canard');
});

test('sans question en attente, rien ne change : pas de visiteur ajouté, rien à compter', () => {
  run('QUESTIONS = []; setData(DATA, false);');
  assert.equal(J(`chars.filter(c => c.key.startsWith('v_aaaa') || c.key.startsWith('v_bbbb')).length`), 0);
  assert.equal(J('loneQuestions(T).length'), 0);
});

test('attente d\'une question : à l\'heure de la page, avec le jour quand elle date d\'avant', () => {
  const t = J('DAY0 + 11 * 3600e3');
  assert.equal(J(`qWaitTxt(${t} - 20 * 60e3, ${t})`), 'depuis 10:40 (20 min)');
  assert.equal(J(`qWaitTxt(DAY0 - 6 * 3600e3, ${t})`), 'depuis hier 18:00 (17 h)');
  assert.match(J(`qWaitTxt(DAY0 - 3 * 864e5, ${t})`), /^depuis le \d\d\/\d\d \(3 j\)$/);
  assert.equal(J(`qWaitTxt(${t}, ${t})`), 'depuis 11:00');
});
