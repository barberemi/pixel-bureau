// Absences et télétravail (36-absences.js, KT-1) : dataset absences du planning, lu à l'instant affiché ; l'absent n'est
// pas au bureau (ni au daily, ni aux cérémonies), le télétravail reste à sa place en transparence ; jamais la raison.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`${d}T${hm}:00+02:00`);
const D = '2026-10-01', D2 = '2026-10-02';

// démo du jeudi 1er octobre, avec un planning écrit à la main
function setup(people, ferie = []) {
  run(`TEAM = mergedTeam(); refreshAll();
    ABSENCES = {generated_at: '${D}T07:30:00Z', days: ['${D}', '${D2}'], ferie: ${JSON.stringify(ferie)}, people: ${JSON.stringify(people)}};`);
}
const pres = (k, t) => J(`presenceAt(byKey.${k}, ${t})`);
const st = (k, t) => J(`(s => ({st: s.st, abs: s.abs || null, tt: !!s.tt, label: s.label}))(stateAt(byKey.${k}, ${t}))`);

test('présence : journée, matin (arrive vers 13h30), après-midi (part vers 12h30), télétravail par demi-journée', () => {
  setup({p_clark: {[D]: 'aa'}, p_darryl: {[D]: 'at'}, p_pam: {[D]: 'ba'}, p_holly: {[D]: 'tb'}});
  assert.equal(pres('p_clark', at(D, '16:00')).abs, 'journee');
  assert.equal(pres('p_darryl', at(D, '11:00')).abs, 'matin');
  assert.deepEqual(pres('p_darryl', at(D, '14:00')), {abs: null, tt: true}); // arrivé, en télétravail l'après-midi
  assert.equal(pres('p_pam', at(D, '12:00')).abs, null);
  assert.equal(pres('p_pam', at(D, '12:30')).abs, 'aprem');
  assert.deepEqual(pres('p_holly', at(D, '11:00')), {abs: null, tt: true});
  assert.deepEqual(pres('p_holly', at(D, '15:00')), {abs: null, tt: false});
  assert.deepEqual(pres('p_kelly', at(D, '11:00')), {abs: null, tt: false}); // rien dans le planning : au bureau
  assert.deepEqual(pres('p_clark', at(D2, '11:00')), {abs: null, tt: false}); // autre jour
});

test('plan : l\'absent n\'est pas là (même pas au daily) ; le télétravail garde sa journée, marqué tt ; le boss reste', () => {
  setup({p_clark: {[D]: 'aa'}, p_holly: {[D]: 'tt'}, p_michael: {[D]: 'aa'}});
  assert.deepEqual(st('p_clark', at(D, '11:00')), {st: 'off', abs: 'journee', tt: false, label: 'Absence toute la journée'});
  assert.equal(st('p_clark', at(D, '09:45')).st, 'off'); // pas au daily
  assert.equal(st('p_holly', at(D, '09:45')).st, 'daily'); // le daily en visio
  const h = st('p_holly', at(D, '11:00'));
  assert.equal(h.tt, true);
  assert.match(h.label, /^En télétravail · /);
  assert.notEqual(st('p_michael', at(D, '11:00')).st, 'off'); // le boss reste à son bureau
  assert.equal(J('TT_ALPHA'), .45);
});

test('jour férié : personne au bureau, sauf le boss', () => {
  setup({}, [D]);
  assert.deepEqual(st('p_pam', at(D, '11:00')), {st: 'off', abs: 'ferie', tt: false, label: 'Jour férié'});
  assert.notEqual(st('p_michael', at(D, '11:00')).st, 'off');
});

test('cérémonies : un absent n\'anime pas (la facilitatrice absente laisse le planning au boss)', () => {
  const cr = `({k: 'planning', title: 'Sprint planning', start: ${at(D2, '10:00')}, end: ${at(D2, '10:30')}})`;
  setup({});
  assert.equal(J(`ceremonyHost(${cr}).key`), 'p_kelly');
  setup({p_kelly: {[D2]: 'aa'}});
  assert.equal(J(`ceremonyHost(${cr}).boss`), true);
});

test('Qui fait quoi : l\'absent en carte grisée, en dernier ; pas sa raison ; le stand-up TV le saute et le cite', () => {
  setup({p_clark: {[D]: 'aa'}, p_holly: {[D]: 'tt'}});
  run(`T = ${at(D, '11:00')}; for (const c of chars) c._st = stateAt(c, T);`);
  const cards = J(`whoCards(T).map(x => [x.c.key, x.st.abs || null, x.what])`);
  assert.deepEqual(cards[cards.length - 1], ['p_clark', 'journee', 'Absence toute la journée']);
  assert.equal(J(`shortSt(byKey.p_clark._st)`), 'absence');
  assert.match(J(`shortSt(byKey.p_holly._st)`), /^🏠 télétravail · /);
  assert.ok(!J(`standupPeople().map(c => c.key)`).includes('p_clark'));
  const away = J(`sceneAway(T)`);
  assert.match(away, /Absences aujourd'hui : <b>Clark<\/b>/);
  assert.match(away, /🏠 En télétravail : <b>Holly<\/b>/);
});

test('calendrier : cases bureau, télétravail, absence, demi-journée coupée, férié ; le jour encadré', () => {
  setup({p_pam: {[D]: 'tt', [D2]: 'ba'}}, [D2]);
  run(`T = ${at(D, '11:00')};`);
  assert.match(J(`calCell(byKey.p_pam, '${D}')`), /class="calc t today" title="télétravail">🏠</);
  assert.match(J(`calCell(byKey.p_pam, '${D2}')`), /class="calc ferie"/);
  run(`ABSENCES.ferie = [];`);
  assert.match(J(`calCell(byKey.p_pam, '${D2}')`), /class="calc split" title="matin : au bureau · après-midi : absence"><i class="b">●<\/i><i class="a">—<\/i>/);
  assert.match(J(`calCell(byKey.p_kelly, '${D}')`), /class="calc none/); // pas dans le planning
});

test('Qui fait quoi, le soir et le week-end : plus de carte d\'absence (plus personne au bureau)', () => {
  setup({p_clark: {[D]: 'aa'}});
  const has = t => { run(`T = ${t}; for (const c of chars) c._st = stateAt(c, T);`); return J(`whoCards(T).some(x => x.c.key === 'p_clark')`); };
  assert.equal(has(at(D, '11:00')), true);
  assert.equal(has(at(D, '21:30')), false);
  assert.equal(has(at(D, '07:30')), false);
});
