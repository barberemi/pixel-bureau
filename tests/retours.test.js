// 3e étage, les retours de PR (68-retours.js) : un bureau par PR en correction (six au plus), stable ; le rejeu à l'heure
// du curseur ; un seul boss, à la gate ouverte depuis le plus longtemps ; Bernard monte et redescend les PR ; le Kanban des
// fils ; l'onglet, le panneau, la TV, la loupe, le fil et ⌘K du RDC ; la galerie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const at = h => `new Date(DAY0 + ${h} * 36e5).toISOString()`;
const room = (run, h, extra = '') => `{run: '${run}', repo: 'dm/site', pr: '${run.slice(-2)}', title: 'PR ${run}', author: 'pambeesly', poste: 'fix', states: {prepare: 'ok', fix: 'run'}, since: ${at(h)}, fils: []${extra}}`;
function page(opts) {
  const p = load(opts), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; T = DAY0 + 11 * 36e5; setMode('live'); rtReset();`);
  return {p, J, set: (rooms, more = '') => p.run(`RETOURS = {rooms: [${rooms.join(',')}], queue: [], pannes: [], events: []${more}}; rtReset();`)};
}

test("l'étage existe en démo ; ses onglets dans l'ordre des étages, le 3e en dernier", () => {
  const {p, J} = page();
  assert.equal(J('retoursOn()'), true);
  assert.deepEqual(J('floorsOn()'), [3, 2, 1, 0, -1], 'de haut en bas');
  assert.deepEqual(J("[...floorTabsHtml().matchAll(/data-floor=\"(-?\\d)\"/g)].map(m => +m[1])"), [-1, 0, 1, 2, 3]);
  assert.match(J('floorTabsHtml()'), /title="3e · retours de PR · 5 en cours · ✋ 2 t&#39;attend"[^>]*><span class="fi" aria-hidden="true">🛠<\/span>3e<b>5<\/b><b class="h">✋2<\/b>/, 'la démo : cinq PR, deux validations ; en court, le nom entier au survol');
  p.run('setFloor(3);');
  assert.equal(J('FLOOR'), 3);
  assert.deepEqual(J('[cv.width, cv.height]'), J('[AT_W, AT_H]'));
});

test('une PR garde son bureau ; la suivante prend le premier bureau libre ; six bureaux au plus', () => {
  const {p, J, set} = page();
  set([room('r1', 9), room('r2', 9.5)]);
  assert.deepEqual(J('rtSlots().map(r => r && r.run)'), ['r1', 'r2', null, null, null, null]);
  p.run(`RETOURS.rooms.shift(); RETOURS.rooms.push(${room('r3', 10)});`);
  assert.deepEqual(J('rtSlots().map(r => r && r.run)'), ['r3', 'r2', null, null, null, null], 'r2 reste au bureau 2');
  set([...Array(8)].map((_, k) => room('r' + k, 8 + k / 10)));
  assert.equal(J('rtSlots().filter(Boolean).length'), 6);
});

test("rejeu : une PR occupe un bureau de son arrivée à son push, sa panne ou sa fin ; à sa gate depuis l'ouverture de la gate", () => {
  const {p, J} = page();
  const ev = (run, k, h) => `{run: '${run}', repo: 'dm/site', pr: '${run.slice(-1)}', k: '${k}', t: ${at(h)}}`;
  p.run(`RETOURS = {rooms: [], queue: [], pannes: [], events: [${[ev('a', 'arrive', 9), ev('a', 'gate', 9.5), ev('a', 'push', 10),
    ev('b', 'arrive', 9.2), ev('b', 'fin', 9.4), ev('c', 'arrive', 9.6)].join(',')}]}; setMode('pause');`);
  const at_ = h => J(`rtRoomsAt(DAY0 + ${h} * 36e5).map(r => r.run + ':' + r.poste)`);
  assert.deepEqual(at_(9.3), ['a:fix', 'b:fix']);
  assert.deepEqual(at_(9.7), ['a:gate', 'c:fix'], 'b est fini sans push : son bureau est libre');
  assert.deepEqual(at_(10.5), ['c:fix'], 'a est poussée');
});

test("un seul boss : il va à la gate ouverte depuis le plus longtemps, les autres attendent leur tour ; il ressort par où il est entré", () => {
  const {p, J, set} = page();
  set([room('r1', 9), room('r2', 8, ", gate: true, poste: 'gate', states: {gate: 'gate'}"), room('r3', 8.5), room('r4', 7, ", gate: true, poste: 'gate', states: {gate: 'gate'}")]);
  assert.equal(J('rtGateTarget(rtSlots())'), 3, 'le bureau 4 attend depuis 7 h');
  p.run('setFloor(3); renderRetours(1000); renderRetours(1100);');
  assert.equal(J('RT_MEM.boss.target'), 3);
  assert.equal(J('chars.filter(c => c.boss).length'), 1);
  // bureau du bas : par la porte du haut, sous le Kanban, jusqu'à la place de la barrière (jamais à travers le rail)
  const path = J('rtBossPath(rtHome(), 3, null)'), g = J('RT_G[3]');
  assert.ok(path.some(q => Math.abs(q.y - (g.y0 + 4.9 * 32)) < 1));
  assert.deepEqual(path[path.length - 1], g.gate);
  assert.deepEqual(J('rtBossPath(RT_G[3].gate, null, 3)').slice(1, 3), [{x: g.gate.x, y: g.y0 + 4.9 * 32}, {x: g.door.x, y: g.y0 + 4.9 * 32}], 'il ressort par le même chemin');
});

test("Bernard monte une PR qui arrive et redescend une PR poussée ; en arrivant à l'étage, rien ne se rejoue", () => {
  const {p, J, set} = page();
  set([room('r1', 9)]);
  p.run('setFloor(3); renderRetours(1000);');
  assert.equal(J('RT_MEM.scenes.length'), 0, "en arrivant : la PR est déjà là");
  assert.equal(J("RT_MEM.seen.r1.fade"), 1);
  p.run(`RETOURS = {...RETOURS, rooms: [...RETOURS.rooms, ${room('r2', 10)}]}; renderRetours(1100);`);
  assert.deepEqual(J('RT_MEM.scenes.map(s => s.kind + s.i)'), ['arrive1']);
  assert.equal(J("RT_MEM.seen.r2.fade"), 0, 'son carton apparaît quand Bernard le pose');
  for (let t = 1200; t < 40000; t += 100) p.run(`renderRetours(${t});`);
  assert.equal(J("RT_MEM.seen.r2.fade"), 1);
  assert.equal(J('RT_MEM.scenes.length'), 0, 'Bernard est redescendu');
  p.run(`RETOURS = {...RETOURS, rooms: RETOURS.rooms.filter(r => r.run !== 'r1')}; renderRetours(41000);`);
  assert.deepEqual(J('RT_MEM.scenes.map(s => s.kind + s.i)'), ['exit0']);
  assert.ok(J('RT_MEM.leaving[0]'), 'le bureau 1 se vide quand Bernard emporte la PR');
});

test('REDUCED_MOTION : tout est posé, sans scène', () => {
  const {p, J, set} = page({globals: {matchMedia: () => ({matches: true})}});
  set([room('r1', 9)]);
  p.run(`setFloor(3); renderRetours(1000); RETOURS = {...RETOURS, rooms: [...RETOURS.rooms, ${room('r2', 10)}]}; renderRetours(1100);`);
  assert.equal(J('RT_MEM.scenes.length'), 0);
  assert.equal(J("RT_MEM.seen.r2.fade"), 1);
});

test("le dessin, de jour comme de nuit ; le panneau, la fiche d'un bureau et son Kanban", () => {
  const {p, J} = page();
  p.run('RETOURS = retoursDemo(); setFloor(3); renderRetours(1000); renderRetours(1100);');
  assert.ok(J('RT_HITS.some(h => h.kind === "boss")'));
  assert.equal(J('RT_HITS.filter(h => h.kind === "board").length'), 6, 'un Kanban par bureau');
  p.run('T = DAY0 + 22.5 * 36e5; renderRetours(1200);');
  assert.ok(J('RT_LIT.length') > 0, 'le soir, les agents au travail et le boss gardent leur lumière');
  const list = J('retoursListHtml(rtSlots())');
  assert.match(list, /Retours de PR <span class="cnt">5\/6/);
  assert.match(list, /En attente <span class="cnt">2/);
  assert.match(list, /En panne <span class="cnt">1/);
  const i = J("rtSlots().findIndex(r => r && r.run === 'demo-f1')");
  assert.match(J(`retoursFicheHtml(rtSlots()[${i}], ${i})`), /Ouvrir le Kanban des fils/);
  p.run("rtKbOpen('demo-f1');");
  assert.equal(J('RT_KB.fid'), 't3', 'la fenêtre s\'ouvre sur le fil en cours (le fil rouge)');
  p.run("rtKbOpen('demo-f1', 't5');");
  assert.equal(J('RT_KB.fid'), 't5');
  p.run('rtKbClose();');
  assert.equal(J('RT_KB'), null);
  assert.match(J('tvRetoursHtml()'), /Retours de PR[\s\S]*Bureau 1/);
});

test("depuis le RDC : les moments de l'étage dans le fil, ses PR dans ⌘K ; la loupe de l'étage", () => {
  const {p, J} = page();
  p.run('RETOURS = retoursDemo();');
  const feed = J('rtFeedEvents(DAY0 + 23 * 36e5).map(e => e.txt)').join('\n');
  assert.match(feed, /monte au 3e/);
  assert.match(feed, /t'attendent au 3e/);
  assert.match(feed, /corrections poussées/);
  assert.match(feed, /en panne au 3e/);
  assert.ok(J("rtFeedEvents(DAY0 + 23 * 36e5).every(e => e.rt && e.fl === 3)"), 'un clic mène au 3e');
  assert.deepEqual(J("rtSearchRows('2042').map(r => r.k)"), ['site#2042']);
  p.run("rtGoto('demo-f1');");
  assert.equal(J('FLOOR'), 3);
  assert.equal(J('RTSEL'), 'demo-f1');
  p.run('renderRetours(1000);');
  assert.ok(J("rtLoupeEvents().some(e => e.kind === 'rt_gate')"));
});

test("galerie : au 3e, ses scènes ; la démonstration rend le relevé tel quel", () => {
  const {p, J} = page();
  p.run('RETOURS = retoursDemo(); setFloor(3); renderRetours(1000);');
  assert.deepEqual(J('[...new Set(galleryScenes().map(x => x.fam))]'), ['3e étage']);
  assert.ok(J('galleryScenes().every(x => x.ok)'));
  p.run(`var __R = RETOURS; demoStart(galleryScenes().find(x => x.n === 'Une PR monte au 3e'));`);
  assert.ok(J("RETOURS.rooms.some(r => r.run === 'demo-fn')"));
  p.run('demoEnd();');
  assert.equal(p.run('RETOURS === __R'), true);
});

test("le boss du couloir : assis au bureau du RDC quand rien ne l'attend, debout pour aller à la barrière", () => {
  const {p, J} = page();
  p.run(`RETOURS = retoursDemo(); var __dc = drawChar, __b = []; drawChar = (c, n) => { if (c.boss) __b.push({tile: c.tile, pose: c.pose}); return __dc(c, n); };
    RETOURS.rooms.forEach(r => { r.gate = null; }); RT_MEM = rtMem0(); setFloor(3); renderRetours(1000);`);
  assert.deepEqual(J('__b.pop()'), {tile: J('BOSS_SEAT'), pose: 'stand'}, 'assis, sans danser');
  p.run(`RETOURS = retoursDemo(); RT_MEM = rtMem0(); renderRetours(1100); drawChar = __dc;`);
  assert.equal(J('__b.pop().tile'), null, 'une PR attend : il est debout à la barrière');
});

test("les portes des bureaux : la porte en bois de l'entrée du RDC, sur le couloir (comme au 2e)", () => {
  const {p, J} = page();
  p.run(`var __d = []; var __ad = woodDoor; woodDoor = (...a) => { __d.push(a.slice(1)); return __ad(...a); }; rtBackground(); rdBackground(); woodDoor = __ad;`);
  const d = J('__d'), T = J('AT_TS');
  assert.equal(d.length, 8, 'une par bureau du 3e, deux au 2e');
  for (const [x, y, w, h, n, vert] of d.slice(0, 6)) { assert.deepEqual([w, n, vert], [2 * T, 2, false]); assert.ok(h >= 8); }
  for (const [, , w, h, n, vert] of d.slice(6)) assert.deepEqual([w, h, n, vert], [12, 2.5 * T, 2, true]);
});

test("comme au 1er : les fenêtres au ciel de l'heure aux 2e et 3e, et la pastille du rejeu aux 2e, 3e et -1", () => {
  const {p, J} = page();
  const T = J('AT_TS'), name = 7 * T; // le nom de l'étage, en haut à gauche
  for (const w of ['RD_WINDOWS', 'RT_WINDOWS']) { assert.ok(J(w + '.length') >= 8); assert.ok(J(w).every(x => x * T > name - 20 && x * T + 1.5 * T < 46 * T), w); }
  p.run(`RETOURS = retoursDemo(); SUPPORT = supportDemo(); var __ap = atPill, __pl = []; atPill = (s, ...a) => { __pl.push(s); return __ap(s, ...a); };
    setMode('pause'); setFloor(2); renderRedaction(1000); setFloor(3); renderRetours(1000); setFloor(-1); renderCaserne(1000);`);
  assert.equal(J("__pl.filter(s => /^⏪ Rejeu/.test(s)).length"), 3, 'une par étage');
  p.run(`__pl = []; setMode('live'); setFloor(3); renderRetours(1100); atPill = __ap;`);
  assert.equal(J("__pl.some(s => /^⏪ Rejeu/.test(s))"), false, 'en direct, pas de pastille');
});

test("galerie : Bernard monte la PR et la redescend dès le premier clic (l'étage d'avant la scène est posé, pas rejoué)", () => {
  const {p, J} = page();
  p.run(`RETOURS = retoursDemo(); setFloor(3); setMode('pause'); renderRetours(500); renderRetours(600);`);
  p.run(`demoStart(galleryScenes().find(x => x.n === 'Une PR monte au 3e')); renderRetours(700); renderRetours(800);`);
  assert.deepEqual(J('RT_MEM.scenes.map(s => s.kind)'), ['arrive']);
  p.run(`demoEnd(); demoStart(galleryScenes().find(x => x.n === 'La PR est poussée')); renderRetours(900); renderRetours(1000);`);
  assert.deepEqual(J('RT_MEM.scenes.map(s => s.kind)'), ['exit']);
  p.run('demoEnd();');
});

test("la porte de l'escalier : au bout du couloir, dans le mur de droite ; Bernard part de derrière elle, qui s'ouvre à son passage", () => {
  const {p, J} = page();
  assert.ok(J('RT_STAIRS.x > AT_W'), 'il part hors du plan');
  assert.equal(J('RT_STAIR.x + RT_STAIR.w'), J('AT_W'), 'collée au bord');
  assert.ok(J('RT_STAIR.y <= RT_LANE && RT_STAIR.y + RT_STAIR.h >= RT_LANE'), 'dans l\'axe du couloir');
  assert.equal(J('stairOpen(RT_STAIR, [{x: AT_W - 20, y: RT_LANE}])'), true);
  assert.equal(J('stairOpen(RT_STAIR, [{x: AT_W - 300, y: RT_LANE}])'), false);
  p.run(`RETOURS = retoursDemo(); setFloor(3); RT_MEM.scenes = [{kind: 'arrive', i: 0, run: 'x', t0: 0}]; renderRetours(1000);`);
  assert.equal(J('stairOpen(RT_STAIR, RT_MEM.scenes.map(s => s.w.pos))'), true, 'Bernard sur le seuil : la porte est ouverte');
});
