// Barre du replay (80-input.js) : heure tapée, vitesse en un bouton, « ⏵ revoir » du fil, marche accélérée en lecture.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const M = 60e3;

test('heure tapée : « 14:36 », « 14h36 », « 9 » ; refusée si elle n\'existe pas', () => {
  assert.equal(J('parseHm("14:36")'), 14 * 60 + 36);
  assert.equal(J('parseHm("14h36")'), 14 * 60 + 36);
  assert.equal(J('parseHm(" 9 ")'), 9 * 60);
  assert.equal(J('parseHm("25:00")'), null);
  assert.equal(J('parseHm("12:75")'), null);
  assert.equal(J('parseHm("midi")'), null);
});

test('aller à une heure : en pause, à cette heure du jour rejoué ; hors de la journée rejouable, refusé', () => {
  const r = J(`(() => { setMode('live'); const ok = goToTime('10:30'); return {ok, mode, d: T - parisMidnight(RSTART)}; })()`);
  assert.deepEqual(r, {ok: true, mode: 'pause', d: 10.5 * 3600e3});
  const before = J('T');
  assert.equal(J(`goToTime('23:59')`), J('parisMidnight(RSTART) + (23 * 60 + 59) * 60e3 <= REND'));
  run(`T = ${before};`);
  assert.equal(J(`goToTime('abc')`), false);
});

test('vitesse : un bouton qui passe à la suivante (×1, ×2, ×10, ×60, ×480, puis ×1)', () => {
  run('setSpeed(480);');
  const seq = J(`(() => { const out = []; for (let i = 0; i < 6; i++) { speedBtn.onclick(); out.push(SPEED); } return out; })()`);
  assert.deepEqual(seq, [1, 2, 10, 60, 480, 1]);
});

test('lecture accélérée : on marche plus vite (Gandalf ne traîne plus vers la porte) ; en pause et en direct, vitesse normale', () => {
  const b = (m, s) => J(`(() => { mode = '${m}'; setSpeed(${s}); return walkBoost(); })()`);
  assert.equal(b('play', 1), 1);
  assert.equal(b('play', 10), 1);
  assert.equal(b('play', 60), 2);
  assert.equal(b('play', 480), 8);
  assert.equal(b('pause', 480), 1);
  assert.equal(b('live', 480), 1);
});

test('« ⏵ revoir » : 20 s avant le moment, en ×1, en lecture ; un bouton sur chaque ligne datée du fil', () => {
  const t = J('RSTART') + 120 * M;
  const r = J(`(() => { replayAt(${t}); return {d: ${t} - T, SPEED, mode}; })()`);
  assert.deepEqual(r, {d: 20e3, SPEED: 1, mode: 'play'});
  assert.match(J(`rvBtn(${t})`), new RegExp(`^<button class="rv" data-rv="${t}"[^>]*>⏵ revoir</button>$`));
  assert.equal(J(`rvBtn(RSTART - 60e3)`), ''); // avant la journée rejouable
  assert.equal(J(`(() => { TV = true; const b = rvBtn(${t}); TV = false; return b; })()`), ''); // écran partagé : pas de bouton
});
