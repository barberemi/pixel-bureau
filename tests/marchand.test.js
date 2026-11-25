// Le marchand de sable (49-marchand.js) : l'invité de la mémoire du soir. Tant que la gate du cron « Le Bureau · mémoire du
// soir » attend, il fait le tour des îlots sur son nuage (une halte par îlot), sa bulle dit le nombre de leçons (lu dans la
// première ligne de la gate, en rouge) ; la gate est la sienne (sa fiche, jamais orpheline chez le boss) ; scène, fil, icône.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => `2026-10-01T${hm}:00+02:00`;
const gate = (n, extra = '') => `{run: 'r-mem', wf: 'mem0demo-0000', wf_name: 'Le Bureau · mémoire du soir', gate: 'boss', since: '${at('22:00')}',
  message: '🧠 **Mémoire du soir** · ${n} : la rédaction renomme ce qui est décidé.'${extra}}`;
const S = hm => J(`(s => ({st: s.st, zone: s.zone, bubble: s.bubble || null, hot: s.hot || null, visit: s.visit || null, cloud: !!s.cloud}))(sandmanState(byKey.g_marchand, Date.parse('${at(hm)}')))`);

test('invité commun : le marchand de sable, sa planche (cape verte, écharpe) embarquée', () => {
  assert.equal(J('byKey.g_marchand.name'), 'Le marchand de sable');
  assert.equal(J('byKey.g_marchand.on'), 'memoire');
  assert.ok(J("!!SPR.marchand"), 'sprites/common.json');
});

test('le nombre de leçons : lu dans la première ligne de la gate, au singulier comme au pluriel', () => {
  assert.equal(J(`sandLessons(${gate('3 leçons à valider, 1 retirée')})`), 3);
  assert.equal(J(`sandLessons(${gate('1 leçon à valider')})`), 1);
  assert.equal(J(`sandLessons({message: 'autre chose'})`), null);
  assert.equal(J('sandText(1)'), '1 leçon');
  assert.equal(J('sandText(null)'), 'leçons à valider');
});

test('sans gate : absent ; gate ouverte : sur son nuage, une halte par îlot, le nombre en rouge', () => {
  run('GATES = [];');
  assert.equal(S('22:05').st, 'off');
  run(`GATES = [${gate('3 leçons à valider, 1 retirée')}];`);
  assert.equal(S('21:59').st, 'off', 'avant la gate');
  const s = S('22:01');
  assert.equal(s.st, 'gate');
  assert.equal(s.cloud, true);
  assert.equal(s.bubble, '🧠 3 leçons à valider');
  assert.equal(s.hot, '3 leçons');
  const stops = J('sandStops()');
  assert.equal(stops.length, J('ISLANDS.length'), 'une halte par îlot');
  assert.deepEqual(s.visit, stops[0]);
  assert.deepEqual(S('22:02').visit, stops[1], '90 s par îlot, puis le suivant');
  assert.deepEqual(J(`sandmanState(byKey.g_marchand, Date.parse('${at('22:00')}') + ${stops.length} * SAND_STOP).visit`), stops[0], 'puis il recommence');
  assert.equal(J(`stateAt(byKey.g_marchand, Date.parse('${at('22:01')}')).st`), 'gate');
});

test('sur son nuage, il ne marche pas : de face au repos, sans le rebond des pas, même en route', () => {
  const c = "{guest: true, moving: true, dir: 'right', phase: 0, _st: {cloud: true}}";
  const [fx, fy] = J(`frameFor(${c}, 0)`);
  assert.equal(fy, 4, 'rangée du repos');
  assert.ok(fx === 2 || fx === 3, 'de face');
  assert.equal(J(`guestBob(${c}, 1)`), 0);
  assert.equal(J("frameFor({guest: true, moving: true, dir: 'right', phase: 0}, 0)[1]"), J("DIRROW.right"), 'un autre invité marche');
  assert.equal(J("guestBob({guest: true, moving: true}, 1)"), -1);
});

test('sa gate : dans sa fiche (run), jamais orpheline chez le boss', () => {
  run(`GATES = [${gate('2 leçons à valider')}]; byKey.g_marchand.wf = [];`);
  assert.equal(J(`sandmanState(byKey.g_marchand, Date.parse('${at('22:01')}')).run.wf_name`), 'Le Bureau · mémoire du soir');
  assert.deepEqual(J('byKey.g_marchand.wf'), ['mem0demo']);
  assert.equal(J('loneGates().length'), 0);
});

test('le fil : son arrivée et le nombre de leçons (la vie du bureau, « Tout »)', () => {
  run(`GATES = [${gate('3 leçons à valider')}]; T = Date.parse('${at('22:30')}'); DAY0 = Date.parse('${at('00:00')}');`);
  const ev = J(`feedLifeEvents(T).filter(e => e.c === byKey.g_marchand).map(e => ({imp: e.imp, txt: e.txt}))`);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].imp, false);
  assert.match(ev[0].txt, /arrive sur son nuage : 3 leçons à valider/);
});

test('la scène de la galerie : jouable, il prend son nuage sans gate', () => {
  const sc = J(`galleryScenes().filter(s => s.c === byKey.g_marchand).map(s => ({n: s.n, ico: s.ico, ok: s.ok, len: s.play.len}))`);
  assert.equal(sc.length, 1);
  assert.equal(sc[0].ico, '🧠');
  assert.equal(sc[0].ok, true);
  run(`GATES = []; SCENE_DEMO = {flag: 'memoire', s: Date.parse('${at('11:00')}')};`);
  assert.equal(S('11:01').st, 'gate');
  assert.equal(S('11:01').bubble, '🧠 3 leçons à valider');
  run('SCENE_DEMO = null;');
});

test('la loupe : son arrivée (la gate ouverte), avec le cerveau', () => {
  assert.equal(J("loupeKind({on: 'memoire', guest: true, _st: {st: 'gate'}})"), 'sand');
  assert.equal(J("loupeKind({on: 'memoire', guest: true, _st: {st: 'off'}})"), null);
  assert.equal(J("LOUPE_KINDS.sand[0]"), '🧠');
  assert.ok(J("LOUPE_ORDER.includes('sand')"));
});

test('le cerveau : une icône pixel de 12 × 12, ses couleurs dans la palette', () => {
  const rows = J("PIX_ICONS['🧠']"), pal = J('PIX_PAL');
  assert.equal(rows.length, 12);
  for (const r of rows) {
    assert.equal(r.length, 12);
    for (const ch of r) assert.ok(ch === '.' || ch in pal, ch);
  }
});

test('l\'ours et le nuage : des cartes de pixels régulières, chaque couleur dans leur palette', () => {
  const pal = J('SAND_PAL');
  for (const rows of [...J('SAND_BEAR'), J('SAND_CLOUD')]) {
    assert.ok(rows.every(r => r.length === rows[0].length));
    for (const r of rows) for (const ch of r) assert.ok(ch === '.' || ch in pal, ch);
  }
});
