// Mode TV : on n'y fait que changer d'étage. Un bouton par étage ouvert (l'étage affiché en couleur), plus de boutons ni de
// touches Daily, Planning, Rétro.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test('un bouton par étage ouvert, du RDC au 3e, l\'étage affiché marqué', () => {
  run('setFloor(0)');
  const h = J('tvFloorButtons()');
  const fl = [...h.matchAll(/data-fl="(-?\d)"/g)].map(m => +m[1]);
  assert.deepEqual(fl, [0, -1, 1, 2, 3].filter(f => J('floorsOn()').includes(f)));
  assert.ok(fl.length > 1, 'la démo a plusieurs étages');
  assert.match(h, /class="tvfl on" data-fl="0" aria-current="true"/);
  run('setFloor(2)');
  assert.match(J('tvFloorButtons()'), /class="tvfl on" data-fl="2" aria-current="true"/);
  assert.doesNotMatch(J('tvFloorButtons()'), /class="tvfl on" data-fl="0"/);
  run('setFloor(0)');
});

test('un seul étage : pas de bouton d\'étage', () => {
  assert.equal(J('tvFloorButtons([0])'), '');
  assert.equal((J('tvFloorButtons([0,1])').match(/data-fl=/g) || []).length, 2);
});

test('plus de Daily, Planning ni Rétro dans le mode TV (bandeau, touches, gabarit)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'page', 'src', '75-tv.js'), 'utf8');
  assert.doesNotMatch(src, /tvstand|tvplan|tvretro|toggleScenes|S daily/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8'), /id="tvscene"/);
  assert.equal(J('typeof SCENE_KEYS'), 'undefined');
});
