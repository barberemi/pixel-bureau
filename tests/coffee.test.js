// Tournée de café (#84, 49-coffee.js) : un invité on « coffee » (démo : Kevin) passe vers 16h à la machine à café, puis
// apporte un café à chaque présent au bureau, le boss compris ; chacun garde sa tasse côté écran jusqu'à 17h.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`${d}T${hm}:00+02:00`);
const THU = '2026-10-01';
const tour = `coffeeTour(byKey.g_kevin,${at(THU, '12:00')})`;

test('tous les jours ouvrés vers 16h (heure tirée pour la date, la même au rejeu), jamais le week-end', () => {
  const r = J(tour);
  assert.ok(r.s >= at(THU, '15:50') && r.s <= at(THU, '16:10'), new Date(r.s).toISOString());
  assert.equal(r.at - r.s, 3 * 60e3); // d'abord la machine à café
  assert.equal(r.e - r.at, r.list.length * 2 * 60e3); // 2 min par café
  assert.deepEqual(J(tour), r);
  assert.equal(J(`coffeeTour(byKey.g_kevin,${at('2026-10-03', '12:00')})`), null); // samedi
});

test('un café pour chaque présent au bureau, le boss compris ; pas en télétravail ni pas encore arrivé', () => {
  const names = J(`${tour}.list.map(p=>p.name)`);
  assert.ok(names.includes('Michael')); // le boss
  for (const n of ['Darryl', 'Holly']) assert.ok(!names.includes(n), n + ' est en télétravail');
  assert.ok(!names.includes('Clark')); // pas là à cette heure
  assert.equal(names[0], 'Jan'); // au plus court depuis la machine à café
});

test('la visite : la machine à café (bulle et loupe), un café à chacun, puis il repart', () => {
  const r = J(tour), st = t => J(`coffeeState(byKey.g_kevin,${t})`);
  assert.equal(st(r.s - 60e3).st, 'off');
  const b = st(r.s + 60e3);
  assert.deepEqual([b.st, b.zone, b.bubble], ['brew', 'coffee', "☕ Dunder Mifflin, c'est ma meilleure équipe aujourd'hui !"]);
  assert.equal(J(`loupeKind({_st:{st:'brew'}})`), 'brew');
  r.list.forEach((p, i) => {
    const s = st(r.at + i * 120e3 + 1e3);
    assert.deepEqual([s.st, s.zone, s.label], ['serve', 'visit', 'Apporte un café à ' + p.name]);
  });
  assert.match(st(r.e).label, /^A apporté 7 cafés à partir de \d\d:\d\d$/);
});

test('il se place derrière la personne, tourné vers elle ; le boss à son bureau : à gauche du bureau, tourné à droite', () => {
  run(`T=${at(THU, '16:30')};needTeleport=true;tick(0);`);
  const jan = J('[byKey.p_jan.seat,besideSeat(byKey.p_jan.seat)]');
  assert.deepEqual(J('coffeeSpot(byKey.p_jan)'), jan[1]); // assise : derrière son siège
  const d = J(`LAYOUT.furniture.find(f=>f.type==='boss_desk').at`), b = J('SPOTS.boss[0]');
  assert.deepEqual(J('(c=>{c.atBoss=true;return coffeeSpot(c);})(byKey.p_michael)'), [d[0] - 1, b[1], 'right']);
  // debout ailleurs, regard à gauche : dans son dos, à droite, tourné vers la gauche
  const [x, y] = J(`(()=>{for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)if(walkable(x,y)&&walkable(x+1,y)&&walkable(x,y+1))return [x,y];})()`);
  assert.deepEqual(J(`coffeeSpot({tile:[${x},${y}],dir:'left',_st:{zone:'coffee'}})`), [x + 1, y, 'left']);
  assert.deepEqual(J(`coffeeSpot({tile:[${x},${y}],dir:'up',_st:{zone:'kanban'}})`), [x, y + 1, 'up']);
});

test('les tasses : côté écran une fois servi, celle du boss à gauche sur son bureau, plus rien à 17h', () => {
  const r = J(tour), mugs = t => J(`(()=>{T=${t};return coffeeMugs().filter(m=>!m.hot);})()`);
  assert.equal(mugs(r.at).length, 0);
  const all = mugs(at(THU, '16:59'));
  assert.equal(all.length, r.list.length);
  const jan = J(`(()=>{const s=byKey.p_jan.seat,q=tileCenter(s[0],s[1]);return [seatDir(s[0],s[1]),q.x];})()`);
  const m = all.find(x => Math.abs(x.x - jan[1]) === 16);
  assert.ok(m, 'la tasse de Jan à 16 px de son siège');
  assert.equal(m.x < jan[1], jan[0] === 'left'); // du côté où elle regarde
  const bq = J('tileCenter(...SPOTS.boss[0])');
  assert.ok(all.some(x => x.x === bq.x - 22 && !x.flip)); // le boss : à gauche, l'anse à droite
  assert.equal(mugs(at(THU, '17:00')).length, 0);
});

test('il porte une tasse fumante à la machine et pendant la tournée', () => {
  const r = J(tour);
  run(`T=${r.at + 30e3};needTeleport=true;tick(0);`);
  assert.equal(J('coffeeMugs().filter(m=>m.hot).length'), 1);
});

test('fil : une ligne à son arrivée', () => {
  run(`TEAM = mergedTeam(); DAY0 = parisMidnight(${at(THU, '12:00')});`);
  const r = J(tour), e = J(`feedLifeEvents(${at(THU, '18:30')}).filter(e=>/g_kevin/.test(e.txt)).map(e=>({t:e.t,imp:e.imp,txt:e.txt}))`);
  assert.equal(e.length, 1);
  assert.equal(e[0].t, r.s);
  assert.equal(e[0].imp, false);
  assert.match(e[0].txt, /^☕ <a [^>]*data-who="g_kevin"[^>]*>Kevin<\/a> apporte le café à sa meilleure équipe de la journée$/);
});
