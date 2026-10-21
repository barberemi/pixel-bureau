// Galerie des scènes (46-gallery.js) : la liste se tire de l'installation, « ▶ voir » joue la scène maintenant et la
// journée revient telle qu'elle était.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = h => J(`DAY0 + ${h} * 3600e3`);

test('liste tirée de l\'installation : hérauts, invités, passions, petits moments ; jamais un état qui dure', () => {
  run(`T = ${at(11)}; for (const c of chars) c._st = stateAt(c, T);`);
  const L = J('galleryScenes().map(x => [x.fam, x.n])');
  const fams = [...new Set(L.map(x => x[0]))];
  assert.deepEqual(fams.filter(f => f !== 'Passions'), ['Équipe et cérémonies', 'Invités', 'Petits moments']);
  assert.ok(L.some(([f, n]) => f === 'Équipe et cérémonies' && n === J(`chars.find(c => c.guest && c.on === 'reopen').name`)), 'le héraut des réouvertures');
  assert.ok(!L.some(([, n]) => /hologramme/i.test(n)));
  const guests = J(`chars.filter(c => c.guest && !['reopen', 'prod', 'mep'].includes(c.on)).length`);
  assert.ok(L.filter(([f]) => f === 'Invités').length <= guests);
});

test('à toute heure : tout est jouable ; le soir, la démonstration se joue à 11 h, puis la page revient à son heure', () => {
  run(`T = ${at(22)}; setMode('pause');`);
  assert.ok(J('galleryScenes().every(x => x.ok)'));
  assert.equal(J(`demoTime(${at(22)})`), at(11));
  assert.equal(J(`demoTime(${at(15)})`), at(15)); // aux heures de bureau : l'heure affichée
  const r = J(`(() => { demoStart(galleryScenes().find(x => /^Daily/.test(x.n))); const d = T; demoEnd(); return {d, T}; })()`);
  assert.deepEqual(r, {d: at(11), T: at(22)});
});

test('▶ voir puis fin : faux événement dans une copie des données, lecture accélérée, puis la journée revient telle quelle', () => {
  run(`T = ${at(11)}; setMode('pause'); setSpeed(480); for (const c of chars) c._st = stateAt(c, T);`);
  const before = J('{team: TEAM === TEAM_BASE || !!TEAM, n: (TEAM.events || []).length, T}');
  const r = J(`(() => { const x = galleryScenes().find(x => x.c && x.c.on === 'reopen'); demoStart(x);
    const during = {demo: !!SCENE_DEMO, n: TEAM.events.length, mode, SPEED, reopened: teamMoves().some(m => m.kind === 'reopened' && m.t === SCENE_DEMO.s)};
    demoEnd(); return {during, after: {demo: !!SCENE_DEMO, n: (TEAM.events || []).length, T, mode, SPEED}}; })()`);
  assert.deepEqual(r.during, {demo: true, n: before.n + 1, mode: 'play', SPEED: 10, reopened: true});
  assert.deepEqual(r.after, {demo: false, n: before.n, T: before.T, mode: 'pause', SPEED: 480});
});

test('cérémonies et invités joués maintenant : le daily, la rétro, la visite d\'un invité suivent la démonstration', () => {
  run(`SCENE_DEMO = {s: ${at(11)}, e: ${at(11.05)}, flag: 'daily'};`);
  assert.equal(J(`inDaily(${at(11.01)})`), true);
  run(`SCENE_DEMO.flag = 'retro';`);
  assert.equal(J(`ceremonyAt(${at(11.01)}).k`), 'retro');
  assert.deepEqual(J(`(gg => { SCENE_DEMO.visit = {c: gg, v: {s: 1, e: 2, r: Math.random}}; const v = guestVisit(gg, ${at(11)}); return [v.s, v.e]; })(chars.find(c => c.guest && !c.on))`), [1, 2]);
  run('SCENE_DEMO = null;');
  assert.equal(J(`inDaily(${at(11.01)})`), false);
});
