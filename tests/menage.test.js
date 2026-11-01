// Ménage du soir (49-menage.js) : l'invité on « cleaning » arrive après les heures de bureau (au plus tard 20h), reste
// une heure, s'arrête au bout de chaque îlot puis dans les pièces, pousse son chariot ; deux lignes dans le fil.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const HANK = "chars.find(c=>c.on==='cleaning')";

test('Hank est un invité commun, avec sa recette (aucune planche)', () => {
  assert.equal(J(`${HANK}.key`), 'g_menage');
  assert.ok(J('!!RECIPES.g_menage'));
});

test('arrivée entre la fin des heures de bureau et 20h, une heure, la même à chaque calcul ; rien le week-end', () => {
  const v = J(`(()=>{const c=${HANK},a=cleaningVisit(c,DAY0+12*36e5),b=cleaningVisit(c,DAY0+3*36e5);
    return {m:(a.s-parisMidnight(a.s))/6e4,dur:(a.e-a.s)/6e4,same:a.s===b.s,end:RHYTHM.office_hours[1]*60};})()`);
  assert.ok(v.m >= v.end && v.m <= Math.max(v.end, 20 * 60), JSON.stringify(v));
  assert.equal(v.dur, 60);
  assert.ok(v.same);
  const sat = J(`(()=>{let t=DAY0;while(!RHYTHM.weekend.includes(parisHM(t).wd))t+=864e5;return cleaningVisit(${HANK},t+12*36e5);})()`);
  assert.equal(sat, null);
});

test('la tournée : chaque îlot, puis la cafétéria, les toilettes et la salle de réunion ; son chariot le suit', () => {
  const rooms = J('cleaningStops().map(s=>s.room)');
  assert.equal(rooms.filter(r => r.startsWith('îlot')).length, J('ISLANDS.length'));
  assert.deepEqual(rooms.slice(-3), ['la cafétéria', 'les toilettes', 'la salle de réunion']);
  const s = J(`(()=>{const c=${HANK},v=cleaningVisit(c,DAY0+12*36e5);return [cleaningState(c,v.s-6e4).st,cleaningState(c,v.s+6e4),cleaningState(c,v.e+6e4).st];})()`);
  assert.equal(s[0], 'off');
  assert.match(s[1].label, /^Fait le ménage : îlot 1/);
  assert.equal(s[1].bubble, '🧹');
  assert.equal(s[2], 'gone');
  const carts = J(`(()=>{const c=${HANK};c._st={st:'idle'};c.pos={x:100,y:200};c.dir='left';const a=cleaningCarts();c._st={st:'gone'};return [a,cleaningCarts()];})()`);
  assert.deepEqual(carts[0], [{x: 80, y: 200, z: 200.5}]);
  assert.deepEqual(carts[1], []);
});

test('le fil : son arrivée et son départ', () => {
  const lines = J(`(()=>{const v=cleaningVisit(${HANK},DAY0+12*36e5);return feedLifeEvents(v.e+6e4).filter(e=>e.c&&e.c.on==='cleaning').map(e=>[e.t===v.s||e.t===v.e,e.txt.replace(/<[^>]+>/g,'')]);})()`);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l[0]));
  assert.match(lines[0][1], /commence le ménage du soir/);
  assert.match(lines[1][1], /a fini le RDC, il monte au 1er étage/); // la démo a le 1er étage (68-atelier.js)
  const up = J(`(()=>{const v=cleaningVisit(${HANK},DAY0+12*36e5);return feedLifeEvents(v.e+AT_CLEAN_DUR+6e4).filter(e=>e.c&&e.c.on==='cleaning').map(e=>e.txt.replace(/<[^>]+>/g,''));})()`);
  assert.equal(up.length, 3);
  assert.match(up[2], /a fini le ménage, tout est propre/);
});
