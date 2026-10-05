// Ticket réouvert (team.events, passage au statut jira.flow.reopened) : le testeur va le dire au développeur pendant
// 2 min, puis le développeur pleure aux toilettes 5 min et revient. Démo : Karen réouvre DM-7089 de Pam à 10h50.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);
const st = (key, hm) => J(`(s=>({st:s.st,zone:s.zone,visit:s.visit||null,label:s.label,bubble:s.bubble||null}))(stateAt(byKey.${key},${at(hm)}))`);

test('le reopen du jour : testeuse Karen, développeuse Pam', () => {
  run('TEAM=mergedTeam();');
  assert.deepEqual(J(`reopens().map(r=>[r.key,r.tester.key,r.dev.key])`), [['DM-7089', 'p_karen', 'p_pam']]);
});

test('10h50 : Karen se lève et va voir Pam à sa place, bulle « 🔁 7089 réouvert »', () => {
  const k = st('p_karen', '10:51');
  assert.equal(k.st, 'reopen');
  assert.equal(k.zone, 'visit');
  assert.deepEqual(k.visit, J(`besideSeat(byKey.p_pam.seat)`));
  assert.equal(k.bubble, '🔁 7089 réouvert');
  assert.match(k.label, /Vient dire à Pam que DM-7089 est réouvert/);
  assert.notEqual(st('p_pam', '10:51').st, 'cry'); // Pam l'apprend d'abord
});

test('10h52 : Karen retourne à son bureau, Pam part pleurer aux toilettes, puis revient à 10h57', () => {
  assert.notEqual(st('p_karen', '10:53').st, 'reopen');
  const p = st('p_pam', '10:53');
  assert.deepEqual([p.st, p.zone, p.bubble], ['cry', 'wc', '😭']);
  assert.match(p.label, /Pleure aux toilettes : DM-7089 réouvert par Karen/);
  assert.notEqual(st('p_pam', '10:58').st, 'cry');
  assert.equal(J(`shortSt({st:'cry'})`), 'pleure');
});

test('mode TV : les bulles du reopen restent (ce ne sont pas des bulles de travail)', () => {
  run('TV=true;');
  try {
    assert.ok(J(`bubbleFor(byKey.p_pam,stateAt(byKey.p_pam,${at('10:53')}),${at('10:53')},0)`));
  } finally { run('TV=false;'); }
});
