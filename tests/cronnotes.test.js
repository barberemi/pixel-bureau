// Prochains crons en post-it au fond de la salle Serveurs (#60) : entre les deux baies, un par cron (3 au plus, hors
// crons horaires), couleur de l'agent ; il tombe quand le cron a tourné ; liste en clair au survol.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

test('post-it : entre les deux baies du plan type, au fond de la salle Serveurs', () => {
  const {run} = load({layout: 'open-space'});
  const r = JSON.parse(run('JSON.stringify(cronNoteRect())'));
  const racks = JSON.parse(run('JSON.stringify(FURN_AT.server_rack.map(o=>13*TS+2+o.dx))'));
  assert.ok(r.x >= racks[0] + 28 && r.x + r.w <= racks[1], JSON.stringify({r, racks}));
  assert.ok(r.w >= 35, 'trois post-it de 11 px tiennent');
  assert.equal(run('LAYOUT.objects.planning'), undefined, 'le tableau des crons a quitté le bureau du boss');
});

test('post-it : les 3 prochains crons hors horaires, couleur de la chemise de l\'agent, liste en clair', () => {
  const {run} = load();
  const n = JSON.parse(run('JSON.stringify(nextCrons().map(p=>({t:p.t,h:p.hourly})))'));
  assert.ok(n.length <= 3);
  assert.ok(n.every(p => p.t >= run('T') && !p.h));
  assert.equal(run('noteColor({key:"x",sprite:"p_clark"})'), run('RECIPES.p_clark.shirt'));
  assert.match(run('noteColor({key:"sans_recette"})'), /^#[0-9a-f]{6}$/);
  const tip = run('cronNotesTip()');
  assert.ok(n.length ? /^Prochains crons : \d\d:\d\d /.test(tip) : /Plus de cron/.test(tip), tip);
  run('T=DAY0+864e5-60e3');
  assert.match(run('cronNotesTip()'), /Plus de cron prévu aujourd'hui/);
});

test('post-it : celui d\'un cron qui vient de tourner tombe, puis disparaît', () => {
  const {run} = load();
  run('T=DAY0+11*3600e3; CRON_NOTES.draw(1000); var FIRST=NOTES_UP[0];');
  if (run('FIRST') === undefined) return; // pas de cron à venir dans la démo à cette heure
  run('T=FIRST.t+60e3; CRON_NOTES.draw(2000);');
  assert.equal(run('NOTES_FALL.some(f=>f.p===FIRST)'), true);
  assert.equal(run('NOTES_UP.includes(FIRST)'), false);
  run('CRON_NOTES.draw(3300);');
  assert.equal(run('NOTES_FALL.length'), 0, 'chute finie en 1,2 s');
});
