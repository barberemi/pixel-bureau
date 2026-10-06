// Passions de l'équipe (38-passions.js, roster passion) : un moment par jour ouvré (volant, panier, sac de frappe) à une
// heure tirée au sort, le soir en semi-hologramme, et la lecture du dataset des cartes GitFut.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`2026-10-${d}T${hm}:00+02:00`);
run(`TEAM=mergedTeam();byKey.p_pam.passion={moment:'badminton'};byKey.p_andy.passion={moment:'soir_holo'};byKey.p_gabe.passion={moment:'basket'};`);

test('un créneau par jour ouvré, dans la fenêtre, de la bonne durée, le même à chaque calcul ; rien le week-end', () => {
  const s = J(`passionSlot(byKey.p_pam,${at('01', '12:00')})`);
  const m = new Date(s.s).getHours() * 60 + new Date(s.s).getMinutes();
  assert.ok(m >= 10 * 60 + 30 && m <= 17 * 60, 'entre 10h30 et 17h');
  assert.equal(s.e - s.s, 2 * 60e3);
  assert.deepEqual(J(`passionSlot(byKey.p_pam,${at('01', '18:00')})`), s);
  assert.equal(J(`passionSlot(byKey.p_gabe,${at('01', '12:00')})`).e - J(`passionSlot(byKey.p_gabe,${at('01', '12:00')})`).s, 60e3); // basket : 1 min
  assert.equal(J(`passionSlot(byKey.p_pam,${at('03', '12:00')})`), null); // samedi
  assert.equal(J(`passionSlot(byKey.p_jan,${at('01', '12:00')})`), null); // pas de passion
});

test('pendant son créneau : debout dans l\'allée à côté de sa place, puis retour au travail', () => {
  const s = J(`passionSlot(byKey.p_pam,${at('01', '12:00')})`);
  const st = J(`(s=>({st:s.st,passion:s.passion,zone:s.zone,visit:s.visit}))(stateAt(byKey.p_pam,${s.s + 30e3}))`);
  assert.deepEqual(st, {st: 'passion', passion: 'badminton', zone: 'visit', visit: J('besideSeat(byKey.p_pam.seat)')});
  assert.notEqual(J(`stateAt(byKey.p_pam,${s.e + 60e3}).st`), 'passion');
});

test('le soir en semi-hologramme (soirées des jours ouvrés, de la fin des heures de bureau à 3 h du matin)', () => {
  const st = J(`stateAt(byKey.p_andy,${at('01', '21:00')})`);
  assert.deepEqual([st.st, st.zone, st.holo], ['work', 'desk', true]);
  assert.equal(J(`stateAt(byKey.p_andy,${at('01', '23:30')}).holo`), true);
  assert.equal(J(`stateAt(byKey.p_andy,${at('02', '02:30')}).holo`), true); // nuit de jeudi à vendredi
  assert.equal(J(`stateAt(byKey.p_andy,${at('02', '03:30')}).st`), 'off');
  assert.equal(J(`stateAt(byKey.p_andy,${at('03', '01:00')}).holo`), true); // vendredi soir, jusqu'au samedi 3 h
  assert.equal(J(`stateAt(byKey.p_andy,${at('04', '01:00')}).st`), 'off'); // samedi soir : libre
  assert.equal(J(`stateAt(byKey.p_andy,${at('03', '21:00')}).st`), 'off'); // samedi
  assert.equal(J(`!!stateAt(byKey.p_andy,${at('01', '11:00')}).holo`), false); // en journée : normal
});

test('dataset gitfut : objet ou texte JSON ; absent ou cassé = null', () => {
  const ds = v => `readGitfut({datasets:{gitfut:{current:${JSON.stringify(v)}}}})`;
  assert.deepEqual(J(ds({cards: {p_pam: {login: 'pam', img: 'x'}}})), {p_pam: {login: 'pam', img: 'x'}});
  assert.deepEqual(Object.keys(J(ds(JSON.stringify({cards: {p_pam: {}}})))), ['p_pam']);
  assert.equal(J(ds('{cassé')), null);
  assert.equal(J('readGitfut({datasets:{}})'), null);
});
