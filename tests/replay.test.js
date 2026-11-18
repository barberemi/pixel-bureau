// Barre du replay (80-input.js) : heure tapée, vitesse en un bouton, « ⏵ revoir » du fil, marche accélérée en lecture.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  assert.match(J(`rvBtn(${t})`), new RegExp(`^<button class="rv" data-rv="${t}"[^>]*aria-label="Revoir [^"]+ sur le plan">⏪</button>$`));
  assert.equal(J(`rvBtn(RSTART - 60e3)`), ''); // avant la journée rejouable
  assert.equal(J(`(() => { TV = true; const b = rvBtn(${t}); TV = false; return b; })()`), ''); // écran partagé : pas de bouton
});

test('« En ce moment » encadré quand une décision t\'attend, pas pour le seul repère du jour', () => {
  run("FEED_SIG = ''; FEED_PIN = [{t: null, txt: 'repère'}]; renderFeedList([], []);");
  assert.match(J('FEED_SIG'), /class="feedpin"/);
  run("FEED_SIG = ''; FEED_PIN = [{t: T, txt: '✋ décision'}, {t: null, txt: 'repère'}]; renderFeedList([], []);");
  assert.match(J('FEED_SIG'), /class="feedpin attn"/);
  run("FEED_SIG = ''; FEED_PIN = [];");
});

test('aux étages, quelle que soit la largeur, le panneau se replie ; au RDC il revient comme avant', () => {
  run('innerWidth = 1440; SIDE_FOLDED = false; SIDE_BEFORE = null; setFloor(1);');
  assert.equal(J('SIDE_FOLDED'), true, 'au 1er : replié');
  run('setFloor(0);');
  assert.equal(J('SIDE_FOLDED'), false, 'au RDC : rouvert');
  run('innerWidth = 1920; setFloor(1);');
  assert.equal(J('SIDE_FOLDED'), true, 'écran large aussi : un étage prend la place pour être au moins aussi grand que le RDC');
  run('setFloor(0);');
  assert.equal(J('SIDE_FOLDED'), false, 'au RDC : rouvert');
  run('setFloor(0); innerWidth = 1440; SIDE_FOLDED = true; setFloor(1); setFloor(0);');
  assert.equal(J('SIDE_FOLDED'), true, 'replié par toi au RDC : il le reste');
  run('SIDE_FOLDED = false;');
});

test('aux étages, un clic sur ce qui se clique rouvre le panneau replié ; ailleurs il reste replié', () => {
  run("innerWidth = 1920; setFloor(1); cv.style.cursor = 'default'; floorClick({clientX: 0, clientY: 0});");
  assert.equal(J('SIDE_FOLDED'), true, 'clic dans le vide : replié');
  run("cv.style.cursor = 'pointer'; floorClick({clientX: 0, clientY: 0});");
  assert.equal(J('SIDE_FOLDED'), false, 'clic sur un bureau, un agent, une palette : rouvert');
  run("setFloor(0); SIDE_FOLDED = false; SIDE_BEFORE = null; cv.style.cursor = 'default';");
});

test('mode TV hors du direct : le bandeau dit « REJEU hh:mm », plus « EN DIRECT »', () => {
  run("setMode('pause'); T = DAY0 + 11 * 36e5;");
  assert.equal(J('tvRejeu()'), '11:00');
  run("setMode('live');");
  assert.equal(J('tvRejeu()'), '');
  const css = fs.readFileSync(path.join(__dirname, '..', 'page', 'src', 'pixel.css'), 'utf8');
  assert.match(css, /#tvticker\[data-rejeu\]::before\{content:'⏪ REJEU ' attr\(data-rejeu\)/);
});

test('F8 : la légende « ⏱ = relevé de hh:mm » au bout de la pastille du rejeu, à chaque étage qui a des tableaux ; en TV, dans le bandeau', () => {
  const r = J(`(() => {
    const kids = [], bar = {appendChild: e => kids.push(e)}, qs = document.querySelector, ge = document.getElementById, ce = document.createElement;
    document.querySelector = s => s === '.floorbar' ? bar : s === '.stage .cv-wrap' ? null : qs.call(document, s);
    document.getElementById = id => id === 'rejeu' ? kids[0] || null : ge.call(document, id);
    document.createElement = t => ({tagName: t, hidden: false, textContent: ''});
    const out = {}, f0 = FLOOR;
    try {
      ATELIER = atelierDemo(); REDACTION = redactionDemo(); RETOURS = retoursDemo(); RETOURS.generated_at = new Date(DAY0 + 10.5 * 36e5).toISOString();
      setMode('pause'); T = DAY0 + 9.25 * 36e5;
      for (const f of [1, 2, 3, 0, -1]) { FLOOR = f; replayMark(); out[f] = [kids[0].textContent, tvRejeu()]; }
      FLOOR = 1; setMode('live'); replayMark(); out.live = [kids[0].hidden, tvRejeu()];
    } finally { document.querySelector = qs; document.getElementById = ge; document.createElement = ce; FLOOR = f0; }
    return out;
  })()`);
  assert.deepEqual(r[1], ['⏪ Rejeu 09:15 · 1er · ⏱ = relevé de 11:00', '09:15 · ⏱ = relevé de 11:00']);
  assert.deepEqual(r[2], ['⏪ Rejeu 09:15 · 2e · ⏱ = relevé de 11:00', '09:15 · ⏱ = relevé de 11:00']);
  assert.deepEqual(r[3], ['⏪ Rejeu 09:15 · 3e · ⏱ = relevé de 10:30', '09:15 · ⏱ = relevé de 10:30'], 'l\'heure du relevé de l\'étage');
  assert.deepEqual(r[0], ['⏪ Rejeu 09:15 · RDC', '09:15'], 'au RDC, pas de tableau rejoué : pas de légende');
  assert.deepEqual(r[-1], ['⏪ Rejeu 09:15 · -1', '09:15']);
  assert.deepEqual(r.live, [true, ''], 'en direct : ni pastille ni bandeau de rejeu');
  // en TV, la barre des onglets (et sa pastille) est cachée : l'heure du relevé passe par le bandeau « ⏪ REJEU … »
  const css = fs.readFileSync(path.join(__dirname, '..', 'page', 'src', 'styles.css'), 'utf8');
  assert.match(css, /body\.tv \.floorbar\{display:none\}/);
});
