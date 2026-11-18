// 3e étage, les retours de PR (68-retours.js) : un bureau par PR en correction (trois au plus, sur une rangée), stable ; le rejeu à l'heure
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
  assert.match(J('floorTabsHtml()'), /title="3e · retours de PR · 3 en cours · ✋ 1 t&#39;attend"[^>]*><span class="fi" aria-hidden="true">🛠<\/span>3e<b>3<\/b><b class="h">✋1<\/b>/, 'la démo : trois PR, une validation ; en court, le nom entier au survol');
  p.run('setFloor(3);');
  assert.equal(J('FLOOR'), 3);
  assert.deepEqual(J('[cv.width, cv.height]'), J('[AT_W, AT_H]'));
  assert.deepEqual(J('[cv.width, cv.height]'), [40 * 32, 17 * 32], 'une rangée de bureaux et le couloir : 40 × 17 cases, comme le RDC en largeur');
});

test('une PR garde son bureau ; la suivante prend le premier bureau libre ; trois bureaux au plus, les autres sur les palettes', () => {
  const {p, J, set} = page();
  set([room('r1', 9), room('r2', 9.5)]);
  assert.deepEqual(J('rtSlots().map(r => r && r.run)'), ['r1', 'r2', null]);
  p.run(`RETOURS.rooms.shift(); RETOURS.rooms.push(${room('r3', 10)});`);
  assert.deepEqual(J('rtSlots().map(r => r && r.run)'), ['r3', 'r2', null], 'r2 reste au bureau 2');
  set([...Array(5)].map((_, k) => room('r' + k, 8 + k / 10)));
  assert.deepEqual(J('rtSlots().map(r => r && r.run).sort()'), ['r0', 'r1', 'r2'], 'les trois plus anciennes');
  p.run(`RETOURS.queue = [{run: 'q1', repo: 'dm/api', pr: '7', since: ${at(10.5)}}];`);
  assert.deepEqual(J('rtWaiting().map(x => x.run)'), ['r3', 'r4', 'q1'], 'au-delà de trois bureaux, la PR attend sur une palette, avant la file');
  assert.equal(J('rtKpi(T).queue'), 3);
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
  set([room('r1', 9), room('r2', 8, ", gate: true, poste: 'gate', states: {gate: 'gate'}"), room('r3', 7, ", gate: true, poste: 'gate', states: {gate: 'gate'}")]);
  assert.equal(J('rtGateTarget(rtSlots())'), 2, 'le bureau 3 attend depuis 7 h');
  p.run('setFloor(3); renderRetours(1000); renderRetours(1100);');
  assert.equal(J('RT_MEM.boss.target'), 2);
  assert.equal(J('chars.filter(c => c.boss).length'), 1);
  // par le couloir jusqu'à la porte, puis sous le rail jusqu'à la barrière (jamais à travers le rail)
  const path = J('rtBossPath(rtHome(), 2, null)'), g = J('RT_G[2]');
  assert.deepEqual(path.slice(-3), [{x: g.door.x, y: J('RT_LANE')}, {x: g.door.x, y: g.gate.y}, g.gate]);
  assert.ok(g.gate.y > g.ry + 32, 'sous le rail');
  assert.deepEqual(J('rtBossPath(RT_G[2].gate, null, 2)').slice(1, 3), [{x: g.door.x, y: g.gate.y}, {x: g.door.x, y: J('RT_LANE')}], 'il ressort par le même chemin');
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
  assert.equal(J('RT_HITS.filter(h => h.kind === "board").length'), 3, 'un Kanban par bureau');
  p.run('T = DAY0 + 22.5 * 36e5; renderRetours(1200);');
  assert.ok(J('RT_LIT.length') > 0, 'le soir, les agents au travail et le boss gardent leur lumière');
  const list = J('retoursListHtml(rtSlots())');
  assert.match(list, /Retours de PR <span class="cnt">3\/3/);
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
  assert.equal(d.length, 5, 'une par bureau du 3e, deux au 2e');
  for (const [x, y, w, h, n, vert] of d.slice(0, 3)) { assert.deepEqual([w, n, vert], [2 * T, 2, false]); assert.ok(h >= 8); }
  for (const [, , w, h, n, vert] of d.slice(3)) assert.deepEqual([w, h, n, vert], [12, 2.5 * T, 2, true]);
});

test("comme au 1er : les fenêtres au ciel de l'heure aux 2e et 3e ; le titre de chaque étage, RDC compris, au même endroit", () => {
  const {p, J} = page();
  const T = J('AT_TS'), name = 7 * T; // le nom de l'étage, en haut à gauche
  for (const w of ['RD_WINDOWS', 'RT_WINDOWS']) { assert.ok(J(w + '.length') >= 8); assert.ok(J(w).every(x => x * T > name - 20 && x * T + 1.5 * T < 46 * T), w); }
  // audit UX 4.2 : une plaque au début du bandeau du haut, son nom tiré de ETAGES, à tous les étages
  p.run(`RETOURS = retoursDemo(); SUPPORT = supportDemo(); var __pq = plaque, __pl = []; plaque = (c, x, y, t, a) => { __pl.push([x, y, t, a]); return 100; };
    setMode('pause'); setFloor(2); renderRedaction(1000); setFloor(3); renderRetours(1000); setFloor(-1); renderCaserne(1000); setFloor(1); renderAtelier(1000);
    setFloor(0); render(1000); plaque = __pq;`);
  assert.deepEqual(J('__pl.map(x => x[2])'), ['2E · RÉDACTION ET REVUE', '3E · RETOURS DE PR', '-1 · CASERNE SUPPORT', '1ER · ATELIER', 'RDC · OPEN SPACE']);
  assert.ok(J('__pl.every(x => x[0] === 10 && x[1] === 6 && /^#[0-9a-f]{6}$/.test(x[3]))'), 'même place, un liseré par étage');
});

test("rejeu : hors du dessin, un liseré autour du plan et « ⏪ Rejeu hh:mm » au bout des onglets, à chaque étage", () => {
  const {p, J} = page();
  const r = J(`(() => {
    const cls = new Set(), wrap = {classList: {toggle: (k, on) => on ? cls.add(k) : cls.delete(k)}}, kids = [];
    const bar = {appendChild: e => kids.push(e)}, qs = document.querySelector, ge = document.getElementById, ce = document.createElement;
    document.querySelector = s => s === '.stage .cv-wrap' ? wrap : s === '.floorbar' ? bar : qs.call(document, s);
    document.getElementById = id => id === 'rejeu' ? kids[0] || null : ge.call(document, id);
    document.createElement = t => ({tagName: t, hidden: false, textContent: ''});
    const out = [];
    try {
      setMode('pause'); T = DAY0 + 11 * 3600e3; FLOOR = 2; replayMark(); out.push([cls.has('rejeu'), kids[0].hidden, kids[0].textContent]);
      FLOOR = 0; replayMark(); out.push([cls.has('rejeu'), kids[0].hidden, kids[0].textContent]);
      setMode('live'); replayMark(); out.push([cls.has('rejeu'), kids[0].hidden, kids.length]);
    } finally { document.querySelector = qs; document.getElementById = ge; document.createElement = ce; }
    return out;
  })()`);
  assert.deepEqual(r, [[true, false, '⏪ Rejeu 11:00 · 2e'], [true, false, '⏪ Rejeu 11:00 · RDC'], [false, true, 1]], 'à l\'heure du relevé (11:00) : pas de légende des ⏱');
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'page', 'src', 'styles.css'), 'utf8'), /\.cv-wrap\.rejeu\{outline:4px solid var\(--warn\)/);
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

// ---------- tableau noir rejouable (audit produit F8) ----------
test('F8, 3e : RETOURS DU JOUR à l\'heure du curseur ; fils et jetons, non datés, ceux du relevé en ⏱', () => {
  const {p, J} = page();
  const txt = () => JSON.parse(p.run(`(() => { const out = [], ft = ctx.fillText; ctx.fillText = function (t, ...r) { out.push([String(t), ctx.fillStyle]); return ft.call(this, t, ...r); };
    try { rtDayBoard(); } finally { ctx.fillText = ft; } return JSON.stringify(out); })()`));
  // la démo : poussées à 8 h 24 et 9 h 42 (2 aujourd'hui, 7 sur 7 jours) ; une panne à 8 h 30, jamais reprise
  p.run(`RETOURS = retoursDemo(); setMode('pause'); T = DAY0 + 9.25 * 36e5;`);
  assert.deepEqual(J('rtJourAt(T)'), {pousses: 1, cours: 1, pannes: 1, semaine: 6, fils: 9, tok: 68000}, '9 h 15');
  let b = txt();
  assert.deepEqual(b.map(x => x[0]).slice(1), ['1 PR poussée · ', '⏱9 fils', '1 en cours · 1 en panne', '⏱68 k jet.', ' · 7 j : 6 PR']);
  assert.deepEqual(b.filter(x => /⏱/.test(x[0])).map(x => x[1]), ['#8e9a90', '#8e9a90'], 'grisés');
  p.run('T = DAY0 + 10 * 36e5;');
  assert.deepEqual(J('rtJourAt(T)'), {pousses: 2, cours: 2, pannes: 1, semaine: 7, fils: 9, tok: 68000}, '10 h');
  // en direct : le relevé, comme avant
  p.run(`setMode('live'); T = DAY0 + 11 * 36e5;`);
  b = txt();
  assert.deepEqual(b.map(x => x[0]).slice(1), ['2 PR poussées · 9 fils', '3 en cours · 1 en panne', '~68 k jetons · 7 j : 7 PR']);
  assert.ok(b.every(x => x[1] !== '#8e9a90'));
});

test("le Kanban d'un bureau : la fenêtre large commune, nommée ; un fil cliqué la redessine sur place ; Échap rend le focus", () => {
  const {withDom} = require('./helpers/fakedom.js');
  const {p, J} = page();
  p.run('RETOURS = retoursDemo(); setFloor(3); renderRetours(1000);');
  withDom(p, dom => {
    dom.btn.focus();
    p.run("rtKbOpen('demo-f1');");
    const box = dom.doc.querySelector('.bp-modal');
    assert.equal(box.getAttribute('role'), 'dialog');
    assert.equal(box.getAttribute('aria-modal'), 'true');
    assert.match(box.getAttribute('aria-label'), /^Kanban de \S/);
    assert.match(box.className, /\bbp-wide\b.*\brt-win\b/);
    assert.match(box.querySelector('.bp-head h2').textContent, /^🛠 Kanban de /);
    assert.match(box.querySelector('.bp-sub').textContent, /de \S+ · \d+ fils?$/, 'PR · auteur · fils, sous la barre');
    assert.equal(dom.wrap.inert, true);
    const cards = box.querySelectorAll('.rt-card');
    assert.ok(cards.length > 2);
    assert.equal(dom.doc.activeElement, cards[0], 'focus sur le premier fil');
    assert.equal(box.querySelector('.rt-card.on').dataset.fil, 't3', 'le fil en cours, sélectionné');
    box.querySelector('[data-fil="t5"]').click();
    assert.equal(dom.doc.querySelectorAll('.bp-modal').length, 1, 'redessinée sur place');
    assert.equal(J('RT_KB.fid'), 't5');
    const on = box.querySelector('.rt-card.on');
    assert.equal(on.dataset.fil, 't5');
    assert.equal(on.getAttribute('aria-pressed'), 'true');
    assert.equal(dom.doc.activeElement, on, 'le focus suit le fil choisi');
    p.run('dialogKey({key: "Escape", preventDefault() {}})');
    assert.equal(dom.doc.querySelector('.bp-modal'), null);
    assert.equal(J('RT_KB'), null);
    assert.equal(dom.wrap.inert, false);
    assert.equal(dom.doc.activeElement, dom.btn, 'focus rendu');
  });
});

// ---------- une rangée de trois bureaux, l'entrepôt au début du couloir ----------
test("une rangée : trois bureaux côte à côte en haut, le couloir dessous ; la porte du bureau 1 juste après l'entrepôt", () => {
  const {J} = page();
  const T = J('AT_TS'), G = J('RT_G'), D = J('RT_DEPOT');
  assert.equal(J('RT_N'), 3);
  assert.equal(J('AT_ROWS[3]'), 17);
  assert.ok(G.every(g => g.y0 === G[0].y0), 'une seule rangée');
  assert.deepEqual(G.map(g => Math.round(g.x0 / T)), [0, 13, 27], 'trois bureaux de 13,3 cases');
  const hall0 = J('RT_HALL[0]') * T;
  assert.ok(G.every(g => Math.abs(g.y0 + g.h - hall0) < 1 && g.door.y === g.y0 + g.h), 'les portes sur le couloir');
  assert.ok(J('RT_LANE') > hall0 && J('RT_LANE') < 17 * T, 'on marche dans le couloir');
  assert.ok(D.x0 >= 0 && D.y0 > hall0 && D.y1 <= 17 * T, "l'entrepôt est dans le couloir");
  assert.ok(G[0].door.x - T >= D.x1 && G[0].door.x - T - D.x1 < 2 * T, 'la porte du bureau 1 : juste après les palettes');
  assert.deepEqual(G.slice(1).map(g => g.door.x), G.slice(1).map(g => g.x0 + g.w / 2), 'les autres au milieu de leur mur');
  // le couloir, de gauche à droite : entrepôt, porte 1, tableau, banc, café, bureau du boss, escalier
  assert.ok(D.x1 < G[0].door.x && G[0].door.x < 13.2 * T && 20.4 * T < 23.4 * T && 26.6 * T < J('RT_DESK.x') && J('RT_DESK.x') < J('RT_STAIR.x'));
});

test("l'entrepôt : une palette par PR qui attend un bureau, avec son étiquette, la panne en rouge ; le panneau centré au-dessus", () => {
  const {p, J} = page();
  const draw = () => JSON.parse(p.run(`(() => { const out = [], ap = atPill; atPill = (s, x, y, bg, ...r) => { out.push([String(s), x, y, bg]); return ap(s, x, y, bg, ...r); };
    try { RT_HITS = []; rtDepot(1000); } finally { atPill = ap; } return JSON.stringify(out); })()`));
  p.run('RETOURS = retoursDemo(); rtReset();');
  let l = draw();
  const D = J('RT_DEPOT'), pan = l.find(x => /ENTREPÔT/.test(x[0]));
  assert.equal(pan[0], '📦 ENTREPÔT · 2 en attente');
  assert.equal(pan[1], (D.x0 + D.x1) / 2, 'centré sur la zone');
  assert.ok(pan[2] < D.y0, 'au-dessus');
  assert.deepEqual(l.filter(x => x !== pan).map(x => [x[0], x[3]]), [['site#2048', '#0b2a4a'], ['api#24', '#0b2a4a'], ['🧯 site#2031', '#a8323a']]);
  assert.equal(J('RT_HITS.filter(h => h.kind === "queue" && h.run).length'), 3, 'chaque palette se survole');
  assert.match(J('rtQueueHtml()'), /L'entrepôt <span class="cnt">2<\/span>.*site#2048.*api#24.*En panne.*site#2031/s);
  // une PR au-delà des trois bureaux : sa palette, avant la file ; trop de palettes : la dernière place dit combien d'autres
  p.run(`RETOURS.rooms.push({run: 'x4', repo: 'dm/site', pr: '2050', poste: 'fix', states: {}, since: RETOURS.rooms[0].since, fils: []}); rtReset();`);
  l = draw();
  assert.equal(l.find(x => /ENTREPÔT/.test(x[0]))[0], '📦 ENTREPÔT · 3 en attente');
  assert.deepEqual(l.map(x => x[0]).filter(s => !/ENTREPÔT/.test(s)), ['site#2050', 'site#2048', 'api#24', '🧯 site#2031']);
  p.run(`RETOURS.queue.push({run: 'q3', repo: 'dm/api', pr: '25', since: RETOURS.queue[0].since});`);
  assert.deepEqual(draw().map(x => x[0]).filter(s => !/ENTREPÔT/.test(s)), ['site#2050', 'site#2048', 'api#24', '+2']);
  assert.equal(J('rtSlots().filter(Boolean).length'), 3);
});

test('sur le plan, les en-têtes du Kanban n\'ont pas de pictogramme, tous pareils ; la légende les garde', () => {
  const {J} = page();
  assert.deepEqual(J('RT_COLS.map(rtColTxt)'), ['À traiter', 'Corrigé', 'Test', 'Laissé', 'Réponse']);
  assert.ok(J('RT_COLS.filter(c => c.n !== rtColTxt(c)).length') >= 4, 'la légende garde les pictogrammes');
});
