// Les Combles, l'étage secret (68-combles.js) : caché tant que le digicode n'a pas été trouvé, puis le dernier
// onglet, gardé dans le navigateur ; la nuit hors des heures de bureau ; la trappe et « Refermer la trappe » redescendent.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  return {p, J};
}

test('caché tant que le code n\'est pas trouvé : pas d\'onglet, setFloor(4) reste au RDC', () => {
  const {p, J} = page();
  assert.equal(J('comblesOn()'), false);
  assert.doesNotMatch(J('floorTabsHtml()'), /data-floor="4"/);
  p.run('setFloor(4)');
  assert.equal(J('FLOOR'), 0);
  assert.ok(!J('floorsOn()').includes(4), 'jamais dans L\'immeuble ni le mode TV');
});

test('débloqué : le dernier onglet, sous le toit, gardé dans le navigateur, et l\'étage s\'ouvre', () => {
  const {p, J} = page();
  p.run('comblesUnlock()');
  assert.equal(J("localStorage.getItem('bureau:combles')"), '1');
  assert.match(J('floorTabsHtml()'), /<button role="tab" data-floor="4"[^>]*>.*🕹.*Combles<\/button>$/);
  p.run('setFloor(4)');
  assert.equal(J('FLOOR'), 4);
  assert.deepEqual(J('[cv.width, cv.height]'), J('[AT_W, AT_H]'));
  assert.ok(!J('floorsOn()').includes(4));
});

test('le dessin pose ses zones (borne, trappe…) dans la toile de l\'étage', () => {
  const {p, J} = page();
  p.run('comblesUnlock(); setFloor(4); renderCombles(0);');
  const hits = J('CB_HITS');
  for (const k of ['borne', 'table', 'lit', 'anneau', 'trappe', 'alphabet']) assert.ok(hits.some(h => h.kind === k), k);
  for (const h of hits) assert.ok(h.x >= 0 && h.y >= 0 && h.x + h.w <= J('AT_W') && h.y + h.h <= J('AT_H'), h.kind);
});

test('la nuit : hors des heures de bureau', () => {
  const {J} = page();
  const [h0, h1] = J('RHYTHM.office_hours');
  const night = h => J(`cbNight(parisMidnight(DAY0) + ${h} * 36e5)`);
  assert.equal(night(h0 + 1), false);
  assert.equal(night(h1 - 1), false);
  assert.equal(night(h1), true);
  assert.equal(night(h0 - 1), true);
});

test('la légende des Combles : Qui, Où, Moments, sans postes ni scènes', () => {
  const {J} = page();
  assert.deepEqual(J('floorHelp(4).tabs.map(t => t[0])'), ['qui', 'ou', 'moments']);
});

test('refermer la trappe cache de nouveau l\'étage et redescend au RDC', () => {
  const {p, J} = page();
  p.run('comblesUnlock(); setFloor(4); comblesForget();');
  assert.equal(J('FLOOR'), 0);
  assert.equal(J('comblesOn()'), false);
  assert.doesNotMatch(J('floorTabsHtml()'), /data-floor="4"/);
});

test('le SHA-256 maison donne les empreintes connues', () => {
  const {J} = page();
  assert.equal(J("sha256('')"), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(J("sha256('abc')"), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(J("sha256('a'.repeat(64))"), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
});

test('le code n\'est jamais écrit en clair dans la page, seulement son empreinte', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'page', 'src', '68-combles.js'), 'utf8');
  assert.doesNotMatch(src, /UUDDLRLRBA/);
  assert.match(src, /DIGI_SHA='[0-9a-f]{64}'/);
});

test('le boîtier : sur le mur au-dessus de l\'entrée principale, côté intérieur', () => {
  const {J} = page();
  const r = J('digiRect()'), [ex, ey] = J('EXIT'), ts = J('TS');
  assert.deepEqual([Math.floor(r.x / ts), Math.floor(r.y / ts)], [ex - 1, ey - 1]);
  assert.equal(J(`grid[${ey - 1}][${ex - 1}]`), 1);
});

test('le pavé : dix touches, le bon code débloque les Combles ; un mauvais s\'affiche refusé puis repart de zéro', () => {
  const {p, J} = page();
  p.run('digiOpen();');
  for (const k of 'UUDDLRLRAB') p.run(`digiPress('${k}')`);
  assert.ok(J('DIGI.no') > 0, 'refusé');
  assert.equal(J('comblesOn()'), false);
  p.run("digiPress('U')");
  assert.equal(J('DIGI.typed'), 'U', 'après un refus, la touche suivante recommence la saisie');
  p.run('digiOpen();');
  for (const k of 'UUDDLRLRBA') p.run(`digiPress('${k}')`);
  assert.equal(J('comblesOn()'), true);
  assert.match(J('floorTabsHtml()'), /data-floor="4"/);
});

test('les indices : le canard parle une minute par jour, en heures de bureau, à la même heure pour une date ; plus rien une fois trouvé', () => {
  const {p, J} = page();
  const [h0, h1] = J('RHYTHM.office_hours'), d0 = J('parisMidnight(DAY0)');
  const w = J('duckHintWindow(DAY0)');
  assert.deepEqual(J('duckHintWindow(DAY0 + 36e5)'), w, 'la même fenêtre toute la journée');
  assert.equal(w.e - w.s, 60e3);
  assert.ok(w.s >= d0 + (h0 + 1) * 36e5 && w.e <= d0 + (h1 - 1) * 36e5 + 60e3);
  assert.equal(J(`duckHintOn(${w.s + 1000})`), true);
  assert.equal(J(`duckHintOn(${w.e + 1000})`), false);
  assert.ok(J('bossPostitRect()'), 'le post-it du boss');
  p.run('comblesUnlock()');
  assert.equal(J(`duckHintOn(${w.s + 1000})`), false);
  assert.equal(J('bossPostitRect()'), null);
});

test('le soir : l\'équipe présente monte, chacun à sa place ; personne le jour ni après 23 h', () => {
  const {J} = page();
  const d0 = J('parisMidnight(DAY0)'), [, h1] = J('RHYTHM.office_hours'), eve = d0 + (h1 + 1.5) * 36e5;
  assert.equal(J(`cbCrew(${d0 + 15 * 36e5}).length`), 0);
  assert.equal(J(`cbCrew(${d0 + 23.5 * 36e5}).length`), 0);
  const crew = J(`cbCrew(${eve}).map(x => [x.c.key, x.p])`);
  assert.ok(crew.length >= 2);
  assert.equal(new Set(crew.map(([, p]) => p.x + ',' + p.y)).size, crew.length, 'une place chacun');
  assert.ok(J(`cbCrew(${eve}).every(x => x.c.person && x.c.sprite !== 'temp')`), 'seulement l\'équipe, pas les agents ni les intérimaires');
  assert.deepEqual(J(`cbCrew(${eve}).map(x => [x.c.key, x.p])`), crew, 'rejouable');
});

test('de temps en temps, quelqu\'un change de place en marchant, sans traverser la table', () => {
  const {J} = page();
  const d0 = J('parisMidnight(DAY0)'), [, h1] = J('RHYTHM.office_hours'), t = d0 + h1 * 36e5 + 5 * J('CB_MOVE');
  const m = J(`cbSeats(${t}).move`);
  assert.ok(m && m.from !== m.to);
  assert.ok(J(`cbCrew(${m.at + 1500}).some(x => x.p.moving)`), 'en route');
  assert.ok(!J(`cbCrew(${m.at + J('CB_MOVE') - 1000}).some(x => x.p.moving)`), 'arrivé avant le déplacement suivant');
  // aucun trajet ne coupe la table (388-592 × 270-390)
  const n = J('CB_SPOTS.length');
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) {
    const pts = J(`cbPath(CB_SPOTS[${a}], CB_SPOTS[${b}])`);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const cross = Math.max(x0, x1) > 388 && Math.min(x0, x1) < 592 && Math.max(y0, y1) > 270 && Math.min(y0, y1) < 390;
      assert.ok(!cross, `${a} -> ${b} : ${JSON.stringify(pts)}`);
    }
  }
});

test('la borne : son lien vers Sprint Quest dans le panneau quand combles.url est réglé, sinon comment la brancher', () => {
  const {p, J} = page();
  p.run("comblesUnlock(); setFloor(4); CB_PICK = 'borne';");
  p.run("CFG.combles_url = 'https://claude.ai/artifact/abc';");
  assert.equal(J('cbUrl()'), 'https://claude.ai/artifact/abc');
  p.run("CFG.combles_url = 'javascript:alert(1)';");
  assert.equal(J('cbUrl()'), null, 'une adresse https seulement');
  p.run('CFG.combles_url = null;');
  assert.equal(J('cbUrl()'), null);
});
