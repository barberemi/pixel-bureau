// 1er étage, l'atelier d'implémentation (68-atelier.js, #76 #125) : dataset atelier, démo, quatre bureaux au plus, panneau
// des bureaux et fiche d'un ticket (verdict de chaque poste, gate), étage limité à l'implémentation, la PR et ses retours.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');
const fs = require('fs');
const path = require('path');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const room = (run_, extra = {}) => ({run: run_, ticket: 'DM-' + run_, title: 'Ticket ' + run_, repo: 'dm/site', poste: 'code', states: {cadrage: 'ok'}, tok: 1000, ...extra});

test('lecture du dataset : objet ou chaîne JSON, current des datasets Kronn ; sans rooms -> null', () => {
  const d = {generated_at: 'x', rooms: [], queue: []};
  assert.deepEqual(J(`readAtelier({datasets: {atelier: {current: ${JSON.stringify(JSON.stringify(d))}}}})`), d);
  assert.equal(J('readAtelier({datasets: {atelier: {current: {}}}})'), null);
  assert.equal(J('readAtelier({datasets: {}})'), null);
});

test("l'étage ne déploie rien : la chaîne s'arrête à la PR, sa revue et ses retours", () => {
  const keys = J('AT_POSTES.map(p => p.k)');
  assert.deepEqual(keys.slice(-3), ['pr', 'revue_pr', 'retours']);
  for (const k of ['ci', 'env', 'deploy', 'mep', 'livraison']) assert.ok(!keys.includes(k), k);
  assert.equal(J('AT_POSTES.filter(p => p.gate).map(p => p.k)').join(), 'gate');
});

test('quatre bureaux au plus, la démo les occupe tous et met deux tickets en file', () => {
  run(`ATELIER = {rooms: ${JSON.stringify([1, 2, 3, 4, 5].map(i => room(String(i))))}, queue: []};`);
  assert.equal(J('atRooms().length'), 4);
  const d = J('atelierDemo()');
  assert.equal(d.rooms.length, 4);
  assert.equal(d.queue.length, 2);
  assert.ok(d.rooms.some(r => r.gate === 'gate_plan') && d.rooms.some(r => r.back), 'un plan à valider, un retour au code');
  assert.ok(d.rooms.every(r => /^DM-/.test(r.ticket)), 'équipe fictive de la démo');
});

test('panneau : un bouton par bureau, la file, et la fiche du ticket choisi avec le verdict de chaque poste', () => {
  run(`GATES = []; ATELIER = {rooms: [${JSON.stringify(room('a', {states: {cadrage: 'ok', securite: 'bloq'}, back: true, note: '🔒 bloquant', tour: '2/3'}))}],
       queue: [{run: 'q', ticket: 'DM-9', since: '2026-10-01T09:00:00Z'}]}; ATSEL = null;`);
  const html = J('atelierListHtml(atRooms(), ATELIER.queue)');
  assert.match(html, /Bureau 1/);
  assert.match(html, /DM-9/);
  assert.match(html, /retour au code/);
  assert.match(html, /CI, l'env de branche et les mises en prod restent au RDC/);
  const fiche = J('atelierFicheHtml(atRooms()[0], 0)');
  assert.match(fiche, /DM-a/);
  assert.match(fiche, /bloquant/);
  assert.match(fiche, /tour <b>2\/3<\/b>/);
  assert.equal((fiche.match(/<tr/g) || []).length, J('AT_POSTES.length'));
});

test("la fiche d'un bureau qui attend ta gate reçoit la carte de décision du Bureau", () => {
  run(`ACTIONS.gate = true; GATES = [{run: 'g', gate: 'gate_plan', wf: 'abcd', wf_name: 'Le Bureau · implémenter un ticket (chaîne)', message: 'Plan', since: '2026-10-01T09:00:00Z'}];
       ATELIER = {rooms: [${JSON.stringify(room('g', {poste: 'gate', gate: 'gate_plan', states: {gate: 'wait'}}))}], queue: []}; ATSEL = 'g';`);
  const g = J('atGate(atRooms()[0])');
  assert.deepEqual([g.run, g.wf_name], ['g', 'Le Bureau · implémenter un ticket (chaîne)']);
  run(`ATELIER.rooms[0].gate = null;`);
  assert.equal(J('atGate(atRooms()[0])'), null);
});

test("onglets d'étage : seulement quand la chaîne est installée (ou en démo)", () => {
  assert.equal(J('typeof atelierOn()'), 'boolean');
});

test("workflows de l'étage (CFG.atelier_wf) : ni au RDC (eux et leurs sous-runs), ni chez le boss, ni dans « Nouvel agent »", () => {
  const p = load(), J2 = code => JSON.parse(p.run('JSON.stringify(' + code + ')'));
  p.run(`(() => {
    CFG.atelier_wf = ['1a1a1a1a', '2b2b2b2b'];
    const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
    const r = (wf, run, extra) => ({wf, wf_name: 'wf ' + run, run, status: 'Running', start: at, end: null, steps: [], ...extra});
    d.runs.push(r('1a1a1a1a-0000', 'chaine'), r('2b2b2b2b-0000', 'poste', {parent: 'chaine'}), r('3c3c3c3c-0000', 'revue', {parent: 'poste'}),
      r('4d4d4d4d-0000', 'ailleurs'));
    setData(d, true);
    GATES = [{run: 'chaine', wf: '1a1a1a1a-0000', wf_name: 'Chaîne', gate: 'gate_plan', since: at}];
    ASKABLE = [{wf: '1a1a1a1a-0000', name: 'Chaîne'}, {wf: '5e5e5e5e-0000', name: 'Autre'}];
  })()`);
  assert.deepEqual(J2("DATA.runs.filter(r=>['chaine','poste','revue','ailleurs'].includes(r.run)).map(r=>r.run)"), ['ailleurs']);
  assert.equal(J2("chars.some(c=>c.temp&&c.wf.some(w=>['1a1a1a1a','2b2b2b2b','3c3c3c3c'].includes(w)))"), false);
  assert.equal(J2("chars.some(c=>c.temp&&c.wf.includes('4d4d4d4d'))"), true);
  assert.deepEqual(J2('loneGates()'), []);
  assert.deepEqual(J2('workflowsWithoutAgent().map(w=>w.name)'), ['Autre']);
});

test("agents de l'étage : le nom de leur poste, l'hologramme bleu des agents du quotidien, jamais un intérimaire", () => {
  const w = J("(a=>({n:a.name,t:a.temp,f:famKind(a),h:holoStyleOf(a)}))(atWorker(0,10,10,'down',false,'Cadrage'))");
  assert.deepEqual(w, {n: 'Cadrage', t: false, f: 'jour', h: null}); // null : le cyan des agents du quotidien
});

test("retour au RDC : le décor cuit une fois (bg) n'est pas effacé, la toile reprend la taille de l'open space", () => {
  // redimensionner une toile l'efface : setFloor(0) appelait sizeCanvas(), qui redimensionnait aussi bg
  run(`globalThis.__bgSets = 0; const __w = bg.width, __h = bg.height;
    Object.defineProperty(bg, 'width', {configurable: true, get: () => __w, set: () => { globalThis.__bgSets++; }});
    Object.defineProperty(bg, 'height', {configurable: true, get: () => __h, set: () => { globalThis.__bgSets++; }});
    setFloor(1); setFloor(0);`);
  assert.equal(J('globalThis.__bgSets'), 0);
  assert.deepEqual(J('[cv.width, cv.height]'), J('[W, H]'));
});

// ---------- le plan à tapis roulant (4 bureaux, couloirs, scènes) ----------
const fresh = p => p.run(`AT_MEM.slot = {}; AT_MEM.rooms = {}; AT_MEM.cart = {}; AT_MEM.scenes = []; AT_MEM.leaving = [null, null, null, null];
  AT_MEM.wander = []; AT_MEM.okAt = {}; AT_MEM.backAt = {}; AT_MEM.fresh = true; AT_MEM.lit = [0, 0, 0, 0];`);

test('bureaux : titres 1 en haut à gauche, 2 en haut à droite, 3 en bas à gauche, 4 en bas à droite ; 1 et 3 en miroir, sortie côté couloir central', () => {
  const g = J('AT_G.map(g => ({L: g.L, top: g.top, head: g.head, b1: g.b1, b2: g.b2, ex: g.ex, bx0: g.bx0, bx1: g.bx1, wall: g.wallX}))');
  assert.deepEqual(g.map(x => [x.L, x.top]), [[true, true], [false, true], [true, false], [false, false]]);
  assert.ok(g[0].head < g[0].b1 && g[1].head < g[1].b1, 'titres des bureaux du haut en haut');
  assert.ok(g[2].head > g[2].b2 && g[3].head > g[3].b2, 'titres des bureaux du bas en bas');
  for (const x of g) assert.ok(x.L ? x.ex > x.bx1 : x.ex < x.bx0, 'le tapis entre et sort côté couloir central');
});

test('tapis : chaque poste plus loin que le précédent, du cadrage aux retours, de la trappe d\'entrée à la trappe de sortie', () => {
  for (let i = 0; i < 4; i++) {
    const s = J(`AT_DESKS.map(p => atBeltS(AT_G[${i}], p.k))`);
    for (let k = 1; k < s.length; k++) assert.ok(s[k] > s[k - 1], `bureau ${i + 1}, poste ${k}`);
    const [a, z, len] = J(`[atBeltAt(AT_G[${i}], 0), atBeltAt(AT_G[${i}], atBeltLen(AT_G[${i}])), atBeltLen(AT_G[${i}])]`);
    assert.ok(Math.abs(a.x - z.x) < 1 && z.y > a.y && s[s.length - 1] < len, 'entrée et sortie l\'une au-dessus de l\'autre');
  }
});

test('📚 Doc : pas de bureau sur le tapis (7 par rangée), sa place est celle du poste d\'avant', () => {
  assert.deepEqual(J(`[AT_R1.length, AT_R2.length, AT_DESKS.some(p => p.k === 'doc'), AT_POSTES.some(p => p.k === 'doc')]`), [7, 7, false, true]);
  assert.deepEqual(J(`atSpot(AT_G[0], 'doc')`), J(`atSpot(AT_G[0], 'besoin')`));
});

test("un ticket garde son bureau ; le suivant prend le premier bureau libre", () => {
  const p = load();fresh(p);
  p.run(`ATELIER = {rooms: ${JSON.stringify(['a', 'b', 'c'].map(x => room(x)))}, queue: []};`);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(atSlots().map(r => r && r.run))')), ['a', 'b', 'c', null]);
  p.run(`ATELIER = {rooms: ${JSON.stringify(['b', 'c'].map(x => room(x)))}, queue: []};`);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(atSlots().map(r => r && r.run))')), [null, 'b', 'c', null]);
  p.run(`ATELIER = {rooms: ${JSON.stringify(['b', 'c', 'd'].map(x => room(x)))}, queue: []};`);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(atSlots().map(r => r && r.run))')), ['d', 'b', 'c', null]);
});

test('scènes : rien à rejouer en montant ; puis arrivée, sortie (pas pour une panne), ✓ qui apparaît, retour au code', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`ATELIER = {rooms: ${JSON.stringify([room('a', {poste: 'code', states: {cadrage: 'ok'}}), room('b'), room('c')])}, queue: [], pannes: []}; atDiff(1000);`);
  assert.equal(J2('AT_MEM.scenes.length'), 0);
  p.run(`ATELIER = {rooms: ${JSON.stringify([room('a', {poste: 'code', back: true, states: {cadrage: 'ok', schema: 'ok', securite: 'bloq'}}), room('d')])},
    queue: [], pannes: [{run: 'c', ticket: 'DM-c'}]}; atDiff(2000);`);
  assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind + ":" + s.ticket).sort()'), ['arrive:DM-d', 'exit:DM-b']);
  assert.equal(J2('AT_MEM.leaving[1].ticket'), 'DM-b');
  assert.equal(J2("AT_MEM.cart.d.hidden"), true, 'le carton arrive avec le livreur');
  assert.equal(J2("AT_MEM.okAt['a|schema']"), 2000);
  assert.equal(J2("AT_MEM.okAt['a|cadrage'] || null"), null, 'déjà validé : pas de nouveau ✓');
  assert.equal(J2('AT_MEM.backAt.a'), 2000);
  assert.equal(J2("atSlots().findIndex(r => r && r.run === 'd')"), 2, 'pas dans le bureau que le transporteur vide');
});

test('promeneurs : seulement des bureaux libres, 4 au plus sur l\'étage et 2 par bureau ; ils rentrent quand un ticket arrive', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`T = DAY0 + 11 * 36e5; ATELIER = {rooms: [${JSON.stringify(room('a'))}], queue: []}; AT_MEM.lit = [1, 0, 0, 0];
    for (let n = 0; n < 50; n++) atWanderTick(atSlots(), n * 100, .1, () => 0);`);
  const w = J2('AT_MEM.wander.map(w => w.i)');
  assert.equal(w.length, 4);
  assert.ok(!w.includes(0), 'pas le bureau occupé');
  for (const i of [1, 2, 3]) assert.ok(w.filter(x => x === i).length <= 2);
  const i = w[0];
  p.run(`ATELIER.rooms.push(${JSON.stringify(room('z'))}); AT_MEM.slot.z = ${i}; atWanderTick(atSlots(), 6000, .1, () => 1);`);
  assert.ok(J2(`AT_MEM.wander.filter(w => w.i === ${i}).every(w => w.phase === 'back')`));
});

test("fiche d'un agent : son poste, son bureau et sa place, même quand il se promène", () => {
  const p = load();fresh(p);
  p.run(`ATELIER = {rooms: [], queue: []}; AT_MEM.wander = [{i: 1, k: 'tests', spot: AT_SPOTS[0], phase: 'stay', walk: atWalker([AT_SPOTS[0]])}];`);
  const html = p.run(`atAgentHtml({kind: 'agent', i: 1, k: 'tests'}, atSlots())`);
  assert.match(html, /Tests/);
  assert.match(html, /Se promène sur le canapé/);
  assert.match(html, /Sa place : bureau 2, rangée du bas/);
});

test("seul l'étage affiché vit : en montant l'atelier se pose sans rejouer, en descendant le RDC replace chacun", () => {
  const p = load();
  p.run('AT_MEM.fresh = false; setFloor(1);');
  assert.equal(p.run('AT_MEM.fresh'), true);
  p.run('needTeleport = false; setFloor(0);');
  assert.equal(p.run('needTeleport'), true);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'page', 'src', '90-boot.js'), 'utf8'), /if\(!FLOOR\)for\(const c of chars\)step\(c,dt\)/);
});

test("tickets sortis aujourd'hui : runs réussis de la chaîne depuis minuit, sinon le chiffre de la démo", () => {
  const p = load();
  p.run(`CFG.atelier_chain = 'cccc1111'; ATELIER = {rooms: [], livres: 0};
    AT_RUNS = [{wf: 'cccc1111-x', status: 'Success', end: new Date(DAY0 + 3600e3).toISOString()}, {wf: 'cccc1111-x', status: 'Failed', end: new Date(DAY0 + 3600e3).toISOString()},
      {wf: 'cccc1111-x', status: 'Success', end: new Date(DAY0 - 3600e3).toISOString()}, {wf: 'dddd2222-x', status: 'Success', end: new Date(DAY0 + 3600e3).toISOString()}];`);
  assert.equal(p.run('atDelivered()'), 1);
});

test("ménage du soir : après le RDC, l'agent d'entretien fait le 1er étage, rejouable par l'heure du plan", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CFG.atelier = true; var __cl = atCleaner(), __v = cleaningVisit(__cl, DAY0 + 12 * 36e5), __u = atCleanVisit(__cl, DAY0 + 12 * 36e5);`);
  assert.ok(J2('!!__v && !!__u'), 'un jour ouvré de la démo');
  assert.equal(J2('__u.s === __v.e && __u.e - __u.s === AT_CLEAN_DUR'), true, 'juste après le RDC');
  assert.equal(J2('atCleanerAt(__cl, __u.s - 1)'), null);
  assert.equal(J2('atCleanerAt(__cl, __u.e)'), null);
  const a = J2('atCleanerAt(__cl, __u.s + 1000)');
  assert.equal(a.moving, true, 'il entre par la porte');
  const n = J2('atCleanStops().length - 1'), slot = J2('AT_CLEAN_DUR') / n;
  const m = J2(`atCleanerAt(__cl, __u.s + ${slot * 0.6})`);
  assert.deepEqual([m.moving, m.stop.i], [false, 1], 'il balaie le bureau 2');
  assert.deepEqual(J2(`atCleanerAt(__cl, __u.s + ${slot * 0.6})`), m, 'même heure, même place');
  assert.match(J2('atCleanLabel(' + JSON.stringify(m) + ')'), /bureau 2/);
});

// ---------- correctifs : allées, canapés, loupe, TV, scènes par étage ----------
test('trajets : de sa place à la porte par les allées, jamais à travers le tapis ; la rangée loin de la porte fait le tour par le mur extérieur', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  for (let i = 0; i < 4; i++) {
    const g = J2(`(g=>({x0:Math.min(g.turnX,g.ex),x1:Math.max(g.turnX,g.ex)+.7*AT_TS,y0:g.b1,y1:g.b2+g.H,ax:g.ax,L:g.L}))(AT_G[${i}])`);
    for (const k of J2('AT_DESKS.filter(p=>!p.gate).map(p=>p.k)')) {
      const r = J2(`atRouteOut(${i}, '${k}')`);
      for (let n = 1; n < r.length; n++) {
        const a = r[n - 1], b = r[n], sx = [Math.min(a.x, b.x), Math.max(a.x, b.x)], sy = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        assert.ok(sx[1] < g.x0 || sx[0] > g.x1 || sy[1] < g.y0 || sy[0] > g.y1, `bureau ${i + 1}, ${k}, segment ${n}`);
      }
    }
    assert.ok(g.L ? g.ax < g.x0 : g.ax > g.x1, 'allée entre le tapis et le mur extérieur');
  }
});

test('canapés : ni devant une porte ni dans le couloir central', () => {
  const doors = J('AT_G.map(g=>g.door.x)'), T = J('AT_TS'), seats = J('AT_SPOTS.filter(s=>s.sit).map(s=>s.x)');
  for (const x of seats) {
    for (const d of doors) assert.ok(Math.abs(x - d) > 2.4 * T, 'loin de la porte');
    assert.ok(x < 20 * T || x > 26 * T);
  }
});

test("loupe au 1er : un ticket qui sort, ta décision, un poste en panne ; rien du RDC", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`AT_MEM.slot={};AT_MEM.scenes=[{kind:'exit',i:1,ticket:'DM-9',t0:1}];
    ATELIER={rooms:[${JSON.stringify(room('g', {gate: 'gate_plan', poste: 'gate'}))},${JSON.stringify(room('e', {states: {tests: 'err'}}))}],queue:[]};`);
  const kinds = J2('atLoupeEvents(5).map(e=>e.kind)').sort();
  assert.deepEqual(kinds, ['at_err', 'at_exit', 'at_gate']);
  assert.ok(J2('atLoupeEvents(5).every(e=>LOUPE_KINDS[e.kind])'));
  p.run('FLOOR=1;LOUPE.seen=new Set();');
  assert.deepEqual(J2('loupeScan().map(e=>e.kind)'), ['at_exit', 'at_gate', 'at_err']);
});

test("mode TV au 1er : la TV reste sur l'étage, la colonne montre les bureaux et l'entrepôt", () => {
  const p = load();
  p.run('setFloor(1);setTv(true,false);');
  assert.equal(p.run('FLOOR'), 1);
  assert.match(p.run('tvAtelierHtml()'), /Atelier d'implémentation[\s\S]*Bureau 1[\s\S]*Entrepôt/);
  p.run('setTv(false,false);');
});

test("galerie : seulement les scènes de l'étage affiché ; une scène du 1er rend l'atelier tel quel à la fin", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('FLOOR=0;');
  assert.ok(!J2('galleryScenes().some(x=>x.fam==="1er étage")'));
  p.run('FLOOR=1;');
  const fams = J2('[...new Set(galleryScenes().map(x=>x.fam))]');
  assert.deepEqual(fams, ['1er étage']);
  assert.ok(J2('galleryScenes().map(x=>x.n)').includes('Un ticket sort'));
  p.run(`var __A=ATELIER;demoStart(galleryScenes().find(x=>x.n==='Un ticket sort'));`);
  assert.equal(J2('ATELIER.rooms.length'), J2('__A.rooms.length') - 1);
  p.run('demoEnd();');
  assert.equal(p.run('ATELIER===__A'), true);
  assert.equal(p.run('AT_MEM.fresh'), true, 'sans rejouer le retour');
});

test("le soir, comme au RDC : fenêtres au ciel de l'heure ; les promeneurs restent, la chaîne tourne à toute heure", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  assert.ok(J2('AT_WINDOWS.length') >= 6);
  const T = J2('AT_TS'), board = [12.2 * T, 33.8 * T];
  for (const x of J2('AT_WINDOWS')) assert.ok(x * T + 1.5 * T < board[0] || x * T > board[1], 'pas derrière le grand tableau');
  p.run(`ATELIER = {rooms: [], queue: []}; T = DAY0 + 22 * 36e5; for (let n = 0; n < 30; n++) atWanderTick(atSlots(), n * 100, .1, () => 0);`);
  assert.equal(J2('atOpen()'), false);
  assert.ok(J2('AT_MEM.wander.length') > 0, 'les agents se promènent aussi le soir');
});

// un samedi à 22 h : hors des heures de bureau et en week-end
const saturdayNight = p => p.run(`(() => {let d = DAY0; for (let k = 0; k < 7 && !(RHYTHM.weekend.includes(parisHM(d + 12 * 36e5).wd) && parisHM(d + 12 * 36e5).wd === RHYTHM.weekend[0]); k++) d += 864e5;
  T = d + 22 * 36e5;})()`);
test('un samedi à 22 h, comme au RDC : le boss à son fauteuil, écran allumé, et les agents des bureaux libres à leur poste ; Bernard est rentré', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run('CFG.atelier = true; ATELIER = {rooms: [], queue: [], pannes: []};');
  saturdayNight(p);
  assert.equal(J2('RHYTHM.weekend.includes(parisHM(T).wd) && !atOpen()'), true);
  p.run(`var __drawn = [], __dc = drawChar, __ds = drawScreen; var __scr = [];
    drawChar = (c, now) => __drawn.push(c.boss ? 'boss' : c.key === 'at_bernard' ? 'bernard' : 'agent');
    drawScreen = (x, y, w, h, st) => __scr.push(st);
    var __b = chars.find(c => c.boss); __b.present = true; __b._st = stateAt(__b, T);
    AT_MEM.boss = null; atBoss([null, null, null, null], 0, 1, []);
    atRoom(null, 0, 0, .1);
    var __people = []; atScenes(0, .1, __people);
    drawChar = __dc; drawScreen = __ds;`);
  assert.ok(J2('__drawn.includes("boss")'), 'le boss est assis');
  assert.equal(J2('__scr[0]'), 'work', 'son écran est allumé, comme au RDC');
  assert.ok(J2('__drawn.filter(x => x === "agent").length') >= 6, 'les agents du bureau libre somnolent à leur poste');
  assert.equal(J2('__people.length'), 0, 'Bernard est rentré');
});

test("toutes les scènes du 1er se jouent à toute heure : sans ticket, avec les quatre bureaux pris, un jour sans ménage", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('FLOOR = 1; CFG.atelier = true;');
  for (const setup of ['ATELIER = null;', 'ATELIER = {rooms: [], queue: [], pannes: []};', 'ATELIER = atelierDemo();']) {
    fresh(p);p.run(setup);saturdayNight(p);
    const sc = J2('atGalleryScenes().map(x => ({n: x.n, ok: x.ok}))');
    assert.ok(sc.length >= 7, setup);
    for (const x of sc) assert.equal(x.ok, true, setup + ' ' + x.n);
  }
  // sans ticket : la scène part des bureaux de la démo, sans arrivée parasite, et l'atelier revient vide
  fresh(p);p.run('ATELIER = {rooms: [], queue: [], pannes: []}; var __A = ATELIER;');
  p.run('demoStart(atGalleryScenes().find(x => x.n === "Un ticket sort"));');
  assert.equal(J2('ATELIER.rooms.length'), J2('atelierDemo().rooms.length') - 1);
  assert.deepEqual(J2('AT_MEM.scenes'), [], 'les bureaux de la démo se posent sans scène');
  p.run('atDiff(1000);');
  assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind)'), ['exit']);
  p.run('demoEnd();');
  assert.equal(p.run('ATELIER === __A'), true);
  // quatre bureaux pris : un se libère sans scène, le ticket arrive
  fresh(p);p.run('ATELIER = atelierDemo(); atDiff(500); var __B = ATELIER;');
  p.run('demoStart(atGalleryScenes().find(x => x.n === "Un ticket arrive")); atDiff(1000);');
  assert.equal(J2('ATELIER.rooms.length'), 4);
  assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind)'), ['arrive']);
  p.run('demoEnd();');
  // un jour sans ménage (le samedi) : sa tournée du 1er commence tout de suite
  fresh(p);p.run('ATELIER = atelierDemo(); var __cl = atCleaner();');saturdayNight(p);
  assert.equal(J2('cleaningVisit(__cl, T)'), null, 'pas de ménage le samedi');
  p.run('demoStart(atGalleryScenes().find(x => x.n.endsWith("ménage du 1er")));');
  assert.ok(J2('!!atCleanerAt(__cl, T + 60e3)'), 'il fait le 1er étage pendant la scène');
  p.run('demoEnd();');
  // jour sans aucune tournée (ni la veille ouvrée) : elle est inventée à l'heure de la scène
  p.run('var __cv = cleaningVisit; cleaningVisit = (c, t) => SCENE_DEMO && SCENE_DEMO.visit && SCENE_DEMO.visit.c === c ? SCENE_DEMO.visit.v : null;');
  p.run('demoStart(atGalleryScenes().find(x => x.n.endsWith("ménage du 1er"))); var __s = SCENE_DEMO.s;');
  assert.ok(J2('!!atCleanerAt(__cl, __s + 60e3) && SCENE_DEMO.e === __s + AT_CLEAN_DUR'), 'il monte tout de suite');
  p.run('demoEnd(); cleaningVisit = __cv;');
});
