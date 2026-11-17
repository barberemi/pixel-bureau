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

test('panne : sa cause en une ligne, son type et le conseil qui va avec, le lien vers l\'étape en échec', () => {
  const p = {run: 'p1', ticket: 'DM-p1', repo: 'dm/site', poste: 'code', since: '2026-10-01T09:00:00Z', url: 'http://k/workflows/c/runs/k1',
    cause: 'garde-fou docs de Kronn : docs/a.md refusé', cause_type: 'garde_fou_docs', docs_ok: true};
  run(`GATES = []; ATELIER = {rooms: [], queue: [], pannes: [${JSON.stringify(p)}]}; ATSEL = null; AT_PICK = null;`);
  const html = J('atelierListHtml([], [], ATELIER.pannes)');
  assert.match(html, /🛡 garde-fou docs de Kronn : docs\/a\.md refusé/);
  assert.match(html, /href="http:\/\/k\/workflows\/c\/runs\/k1"/);
  assert.match(J('atConseil(ATELIER.pannes[0])'), /travail est commité/);
  assert.doesNotMatch(J(`atConseil({cause_type: 'garde_fou_docs', docs_ok: false})`), /commité/);
  for (const t of ['delai', 'agent', 'script', 'autre', undefined]) assert.ok(J(`atConseil(${JSON.stringify({cause_type: t})})`).length > 20, t);
  // la fiche de la palette : la cause, son type, le conseil, le lien
  const side = J('atPanneHtml(ATELIER.pannes[0])');
  assert.match(side, /Arrêté à <b>⌨ Code<\/b> : garde-fou docs/);
  assert.match(side, /Cause : 🛡 garde-fou docs de Kronn/);
  assert.match(side, /L'étape en échec dans Kronn/);
});

test('reprise : les postes faits avant elle sont « repris » (pas « attend son tour »), la fiche dit après quelle panne', () => {
  const r = room('r', {poste: 'tests', states: {cadrage: 'rep', gate: 'rep', code: 'rep', tests: 'run'},
    reprise: {poste: 'controles', de: 'o1', panne: 'code', cause: 'délai dépassé', cause_type: 'delai', url: 'http://k/workflows/code/runs/o1'}});
  run(`GATES = []; ATELIER = {rooms: [${JSON.stringify(r)}], queue: []}; ATSEL = 'r';`);
  assert.equal(J(`atState(atRooms()[0], {k: 'code'})`), 'rep');
  assert.match(J(`atStateText(atRooms()[0], 'code')`), /run d'avant la reprise/);
  const fiche = J('atelierFicheHtml(atRooms()[0], 0)');
  assert.match(fiche, /↻ Repris aux contrôles après : <b>⌨ Code<\/b> en panne \(⏱ délai dépassé\)/);
  assert.match(fiche, /fait avant la reprise/);
  assert.match(fiche, /↗ le run d'avant/);
  assert.match(J('atBar(atRooms()[0])'), /class="rep"/);
  assert.doesNotThrow(() => run('atDiff(1000); atRoom(atRooms()[0], 0, 1000, .016);'));
});

test('tableau « Runs du jour » : au mur à droite du grand tableau, à la place de deux fenêtres, hors de tout chemin et au-dessus de l\'en-tête du bureau 2 ; rien au clic', () => {
  const b = J('AT_JOUR'), T = J('AT_TS');
  assert.ok(b.x > (12.2 + 21.6) * T + 6, 'à droite du grand tableau');
  for (const x of J('AT_WINDOWS')) assert.ok(x * T + 4 + 1.5 * T < b.x - 4 || x * T + 4 > b.x + b.w + 4, 'pas sur une fenêtre ' + x);
  const g = J('AT_G[1]');
  assert.ok(b.y + b.h + 3 < g.head - 10, 'au-dessus de l\'en-tête du bureau 2');
  assert.ok(b.y + b.h + 3 < J('AT_HY0') * T, 'loin du couloir');
  // aucun chemin de marche ne passe sous le tableau
  const paths = J(`(() => { const P = []; for (let i = 0; i < 4; i++) { for (const p of AT_DESKS) if (!p.gate) P.push(atRouteOut(i, p.k)); P.push(atBossPath(AT_CHAIR, i));
    P.push(atToHatch(AT_G[i], 1, AT_DOCK), atToHatch(AT_G[i], 2, AT_DOCK)); } for (const s of atCleanStops()) if (s.sweep) P.push(s.sweep); return P; })()`);
  for (const pts of paths) for (const p of pts) assert.ok(p.y > b.y + b.h + 3 + 30, 'chemin sous le tableau : ' + JSON.stringify(p));
  run(`ATELIER = {rooms: [], queue: [], jour: {tickets: 15, cours: 4, sortis: 12, pannes: 11, reprises: 23, tok: 1806000}};`);
  assert.doesNotThrow(() => run('atJourBoard();'));
  run(`ATELIER = {rooms: [], queue: []};`);
  assert.doesNotThrow(() => run('atJourBoard();'), 'sans chiffres : des zéros');
  assert.ok(!J('AT_HITS.some(h => h.kind === "jour")'), 'rien au clic');
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

test("une revue lancée par la chaîne ne se voit qu'au 1er : ni bureau ni comptage au 2e (F2, pas de doublon)", () => {
  // impl_revue_pr (atelier) lance la revue du Bureau (review_child, CFG.revue_wf) et ses postes review_<poste> : leurs
  // runs suivent la chaîne dans AT_RUNS ; la même revue lancée par le cron (parent hors de l'étage) reste au 2e
  const p = load(), J2 = code => JSON.parse(p.run('JSON.stringify(' + code + ')'));
  p.run(`(() => {
    CFG.atelier_wf = ['1a1a1a1a', '2b2b2b2b']; CFG.revue_wf = ['3c3c3c3c']; CFG.revue_postes_wf = ['5e5e5e5e'];
    const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
    const r = (wf, run, extra) => ({wf, wf_name: 'wf ' + run, run, status: 'Running', start: at, end: null, steps: [], ...extra});
    REDACTION = null; // les tables de la rédaction (démo) ne comptent pas ici
    // une revue du cron finie : la salle de revue a de vrais runs, elle ne joue pas sa démo
    d.runs.push(r('3c3c3c3c-0000', 'revue_finie', {parent: 'cron', status: 'Success', end: at}), r('1a1a1a1a-0000', 'chaine'), r('2b2b2b2b-0000', 'livraison', {parent: 'chaine'}),
      r('2b2b2b2b-0001', 'revue_pr', {parent: 'livraison'}), r('3c3c3c3c-0000', 'revue', {parent: 'revue_pr'}),
      r('5e5e5e5e-0000', 'lecture', {parent: 'revue'}));
    setData(d, true);
  })()`);
  assert.deepEqual(J2("AT_RUNS.map(r=>r.run).sort()"), ['chaine', 'lecture', 'livraison', 'revue', 'revue_pr']);
  assert.equal(J2("DATA.runs.filter(r=>['revue','lecture'].includes(r.run)).length"), 0);
  assert.deepEqual(J2('rvActive().map(r=>r.run)'), [], 'pas de bureau de revue au 2e');
  assert.equal(J2('floorLoad(2).cnt'), 0, 'pas de comptage dans l\'onglet du 2e');
  // témoin : la revue du cron (parent hors de l'étage) a bien son bureau au 2e
  p.run(`(() => {
    const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
    d.runs.push({wf: '3c3c3c3c-0000', wf_name: 'Revue', run: 'revue_cron', parent: 'cron', status: 'Running', start: at, end: null, steps: []});
    setData(d, true);
  })()`);
  assert.deepEqual(J2('rvActive().map(r=>r.run)'), ['revue_cron']);
  assert.equal(J2('floorLoad(2).cnt'), 1);
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

test('📚 Doc : pas de bureau sur le tapis (6 + 5 bureaux), sa place est celle du poste d\'avant', () => {
  assert.deepEqual(J(`[AT_R1.length, AT_R2.length, AT_DESKS.some(p => p.k === 'doc'), AT_POSTES.some(p => p.k === 'doc')]`), [6, 5, false, true]);
  assert.deepEqual(J(`atSpot(AT_G[0], 'doc')`), J(`atSpot(AT_G[0], 'besoin')`));
});

test('6 emplacements par rangée sur le tapis de toujours : la rangée du haut les remplit, celle du bas part du virage', () => {
  for (let i = 0; i < 4; i++) {
    const [sw, w, xs1, xs2, turn] = J(`(g => [g.sw, g.bx1 - g.bx0, AT_R1.map(p => atSpot(g, p.k).x), AT_R2.map(p => atSpot(g, p.k).x), g.tm])(AT_G[${i}])`);
    assert.ok(Math.abs(sw * 6 - w) < 1e-6, 'six emplacements sur toute la longueur');
    const near = a => Math.abs(a - turn);
    assert.ok(near(xs2[0]) < near(xs2[xs2.length - 1]), 'le premier bureau du bas est au virage');
    assert.ok(Math.abs(Math.abs(xs1[5] - xs1[0]) - 5 * sw) < 1e-6 && Math.abs(Math.abs(xs2[4] - xs2[0]) - 4 * sw) < 1e-6);
    assert.ok(Math.abs(xs1[5] - xs2[0]) < 1e-6, 'le dernier du haut au-dessus du premier du bas');
  }
});

test('un run d\'avant le poste Plan (schéma, patterns, revue croisée) : ramené au poste voisin, ses états ignorés', () => {
  const d = J(`readAtelier({datasets: {atelier: {current: ${JSON.stringify(JSON.stringify({rooms: [
    room('o1', {poste: 'schema', states: {cadrage: 'ok', schema: 'run', patterns: 'ok'}}), room('o2', {poste: 'revue', states: {revue: 'avis'}})],
    pannes: [{run: 'o3', ticket: 'DM-o3', poste: 'patterns'}], events: [{run: 'o1', t: 'S', k: 'poste', poste: 'schema'}]}))}}}})`);
  assert.deepEqual([d.rooms[0].poste, d.rooms[1].poste, d.pannes[0].poste, d.events[0].poste], ['cadrage', 'besoin', 'cadrage', 'cadrage']);
  run(`GATES = []; ATELIER = readAtelier({datasets: {atelier: {current: ${JSON.stringify({rooms: [room('o1', {poste: 'schema', states: {schema: 'run', revue: 'avis'}})], queue: [], pannes: []})}}}});`);
  assert.doesNotThrow(() => run('atDiff(1000); atRoom(atRooms()[0], 0, 1000, .03); atelierFicheHtml(atRooms()[0], 0); atelierListHtml(atRooms(), [])'));
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
  p.run(`ATELIER = {rooms: ${JSON.stringify([room('a', {poste: 'code', back: true, states: {cadrage: 'ok', gate: 'ok', securite: 'bloq'}}), room('d')])},
    queue: [], pannes: [{run: 'c', ticket: 'DM-c'}]}; atDiff(2000);`);
  assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind + ":" + s.ticket).sort()'), ['arrive:DM-d', 'exit:DM-b']);
  assert.equal(J2('AT_MEM.leaving[1].ticket'), 'DM-b');
  assert.equal(J2("AT_MEM.cart.d.hidden"), true, 'le carton arrive avec le livreur');
  assert.equal(J2("AT_MEM.okAt['a|gate']"), 2000);
  assert.equal(J2("AT_MEM.okAt['a|cadrage'] || null"), null, 'déjà validé : pas de nouveau ✓');
  assert.equal(J2('AT_MEM.backAt.a'), 2000);
  assert.equal(J2("atSlots().findIndex(r => r && r.run === 'd')"), 2, 'pas dans le bureau que le transporteur vide');
});

test('promeneurs : seulement l\'équipe du bureau 1, quand il est libre (2 au plus) ; ils rentrent quand un ticket arrive', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`T = DAY0 + 11 * 36e5; ATELIER = {rooms: [${JSON.stringify(room('a'))}], queue: []}; AT_MEM.slot.a = 1; AT_MEM.lit = [0, 1, 0, 0];
    for (let n = 0; n < 50; n++) atWanderTick(atSlots(), n * 100, .1, () => 0);`);
  const w = J2('AT_MEM.wander.map(w => w.i)');
  assert.deepEqual(w, [0, 0], 'les bureaux 2 à 4 n\'ont pas d\'équipe sans ticket : seul le bureau 1 se promène');
  p.run(`ATELIER.rooms.push(${JSON.stringify(room('z'))}); AT_MEM.slot.z = 0; atWanderTick(atSlots(), 6000, .1, () => 1);`);
  assert.ok(J2('AT_MEM.wander.every(w => w.phase === "back")'));
});

test('équipes du 1er : le bureau 1 garde la sienne ; ailleurs, elle monte avec le ticket et redescend avec le carton', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`ATELIER = {rooms: [], queue: []}; atCrewTick(atSlots(), 0, true);`);
  assert.deepEqual(J2('AT_MEM.crew.occ'), [true, false, false, false]);
  assert.equal(J2('atAtDesk(1, "tests")'), false, 'bureau 2 libre : personne à son poste');
  p.run(`ATELIER.rooms.push(${JSON.stringify(room('m'))}); AT_MEM.slot.m = 2; atCrewTick(atSlots(), .1, false);`);
  const n = J2('AT_DESKS.filter(p => !p.gate).length');
  assert.equal(J2('AT_MEM.crew.walk.filter(w => w.i === 2 && w.in).length'), n, 'toute l\'équipe monte');
  assert.ok(J2('AT_MEM.crew.walk.filter(w => w.i === 2).every((w, k) => k === 0 || w.delay > 0)'), 'l\'un après l\'autre');
  assert.equal(J2('atAtDesk(2, "tests")'), false, 'encore en chemin : sa place est vide');
  p.run('for (let k = 0; k < 400; k++) atCrewTick(atSlots(), .1, false);');
  assert.equal(J2('AT_MEM.crew.walk.length'), 0);
  assert.equal(J2('atAtDesk(2, "tests")'), true, 'arrivé');
  p.run('ATELIER.rooms = []; atCrewTick(atSlots(), .1, false);');
  assert.equal(J2('AT_MEM.crew.walk.filter(w => w.i === 2 && !w.in).length'), n, 'le ticket parti, l\'équipe redescend');
  p.run('atCrewTick(atSlots(), .1, true);');
  assert.equal(J2('AT_MEM.crew.walk.length'), 0, 'en arrivant à l\'étage, tout est posé');
});

test("fiche d'un agent : son poste, son bureau et sa place, même quand il se promène", () => {
  const p = load();fresh(p);
  p.run(`ATELIER = {rooms: [], queue: []}; AT_MEM.wander = [{i: 1, k: 'perf', spot: AT_SPOTS[0], phase: 'stay', walk: atWalker([AT_SPOTS[0]])}];`);
  const html = p.run(`atAgentHtml({kind: 'agent', i: 1, k: 'perf'}, atSlots())`);
  assert.match(html, /Perf·a11y/);
  assert.match(html, /Se promène sur le canapé/);
  assert.match(html, /Sa place : bureau 2, rangée du bas/);
  assert.match(p.run(`atAgentHtml({kind: 'agent', i: 1, k: 'tests'}, atSlots())`), /rangée du haut/, '🧪 Tests : 6e bureau, en haut');
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

test('le soir, comme au RDC : le boss et ceux qui se promènent ont leur lumière, qui les suit', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`CFG.atelier = true; FLOOR = 1; ATELIER = {rooms: [${JSON.stringify(room('n', {gate: 'gate_plan', poste: 'gate'}))}], queue: [], pannes: []}; AT_MEM.slot.n = 1;`);
  saturdayNight(p);
  p.run(`AT_MEM.wander = []; for (let n = 0; n < 40; n++) atWanderTick(atSlots(), n * 100, .1, () => 0);
    var __sp = [], __so = softSpot; softSpot = (g, x, y, r, a, c) => { __sp.push([Math.round(x), Math.round(y)]); __so(g, x, y, r, a, c); };
    AT_NIGHT.at = 0; renderAtelier(1000); AT_NIGHT.at = 0; __sp = []; renderAtelier(1300); softSpot = __so;`);
  assert.ok(J2('AT_MEM.wander.length') > 0, 'des agents se promènent');
  const lit = (x, y) => J2(`__sp.some(([a, b]) => a === ${Math.round(x)} && b === ${Math.round(y)})`);
  const b = J2('AT_MEM.boss.walk.pos');
  assert.ok(lit(b.x, b.y - 26), 'le boss, en route vers la porte du bureau qui l\'attend');
  for (const w of J2('AT_MEM.wander.map(w => w.walk.pos)')) assert.ok(lit(w.x, w.y - 26), 'un promeneur');
  assert.ok(J2('AT_HITS.some(h => h.kind === "boss" || h.kind === "gate")'), 'le boss se clique (à la porte : la décision)');
});

test('une gate du 1er : le boss à la porte et son étiquette mènent à la décision, comptée chez le boss', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`CFG.atelier = true; FLOOR = 1; ATELIER = {rooms: [${JSON.stringify(room('n', {gate: 'gate_plan', poste: 'gate'}))}], queue: [], pannes: []};
    AT_MEM.boss = null; renderAtelier(1000); renderAtelier(1100);`);
  const g = J2('AT_HITS.filter(h => h.kind === "gate").map(h => h.i)');
  assert.ok(g.length >= 2 && g.every(i => i === 0), 'le boss et son étiquette « décider »');
  assert.equal(J2('AT_HITS.some(h => h.kind === "boss")'), false, 'à la porte, le boss mène à la décision, pas à sa fiche');
  assert.deepEqual(J2('atGateRooms().map(x => [x.i, x.r.run])'), [[0, 'n']]);
  p.run('GATES = []; var __n0 = gateTotal(); ATELIER = {rooms: [], queue: [], pannes: []}; var __n1 = gateTotal();');
  assert.equal(J2('__n0 - __n1'), 1, 'la gate du 1er compte dans le ✋ du boss');
  p.run(`ATELIER = {rooms: [${JSON.stringify(room('n', {gate: 'gate_plan', poste: 'gate'}))}], queue: [], pannes: []};
    var __ds = renderSide; renderSide = () => {}; var __hit = atHitAt; atHitAt = () => ({kind: 'gate', i: 0}); atelierClick({}); atHitAt = __hit; renderSide = __ds;`);
  assert.equal(J2('ATSEL'), 'n', 'le clic ouvre la fiche du bureau');
  assert.equal(J2('sel'), null);
  assert.ok(J2(`atelierFicheHtml(atSlots()[0], 0)`).indexOf('class="at-gate"') < J2(`atelierFicheHtml(atSlots()[0], 0)`).indexOf('class="at-t"'),
    'la décision avant la liste des postes');
});

test('le boss a la même fiche qu\'au RDC à l\'étage ; un lien vers le RDC y redescend, le retour revient à l\'atelier', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CFG.atelier = true; ATELIER = atelierDemo(); setFloor(1); var __b = chars.find(c => c.boss), __o = chars.find(c => c.person && !c.boss);
    var __ds = drawSide, __drawn = []; drawSide = side => __drawn.push(sel);
    var __hit = atHitAt; atHitAt = () => ({kind: 'boss'}); atelierClick({}); atHitAt = __hit;`);
  assert.equal(J2('FLOOR'), 1);
  assert.equal(J2('sel === __b.key'), true, 'clic sur le boss : sa fiche');
  assert.equal(J2('__drawn[__drawn.length - 1] === __b.key'), true, 'la fiche du RDC, dans le panneau de l\'étage');
  assert.equal(J2('backLabel(null)'), "L'atelier", '« ← L\'atelier »');
  p.run('select(__o.key);');
  assert.equal(J2('FLOOR'), 0, 'un collègue (lien de la fiche) : on redescend au RDC');
  assert.equal(J2('sel === __o.key && __drawn[__drawn.length - 1] === __o.key'), true, 'et sa fiche s\'ouvre au RDC');
  p.run('setFloor(1);');
  assert.equal(J2('sel'), null, 'en montant, la fiche d\'un collègue se ferme');
  p.run('select(__b.key); setFloor(0); setFloor(1);');
  assert.equal(J2('sel === __b.key'), true, 'celle du boss reste ouverte, à tous les étages');
  p.run('goBack();');
  assert.equal(J2('sel === null && FLOOR === 1'), true, 'retour : l\'atelier');
  p.run('drawSide = __ds;');
});

test('au clic sur un agent ou le boss, comme au RDC : le plan s\'assombrit autour de lui, et le halo le suit', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`CFG.atelier = true; ATELIER = atelierDemo(); FLOOR = 1; sel = null; var __h = [], __sh = selHalo; selHalo = (x, y) => __h.push([x, y]);`);
  p.run('renderAtelier(1000);');
  assert.equal(J2('__h.length'), 0, 'personne de choisi : pas de halo');
  p.run(`AT_PICK = {kind: 'agent', i: 0, k: 'code'}; renderAtelier(1100);`);
  const home = J2('atHome(0, "code")');
  assert.deepEqual(J2('__h[0]'), [home.x, home.y - 26], 'l\'agent choisi, à sa place');
  p.run(`AT_PICK = null; __h = []; select(chars.find(c => c.boss).key); renderAtelier(1200);`);
  const b = J2('AT_MEM.boss.walk.pos');
  assert.deepEqual(J2('__h[0]'), [b.x, b.y - 26], 'le boss, là où il est');
  p.run('selHalo = __sh; select(null);');
});

test('rejeu : l\'étage reconstruit à l\'heure du curseur, scènes au fil du curseur, rattrapage des moments récents', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  const at = h => `'2026-10-01T${h}:00Z'`;
  p.run(`CFG.atelier = true; FLOOR = 1; mode = 'pause';
    ATELIER = {rooms: [${JSON.stringify(room('a', {poste: 'code', states: {cadrage: 'ok', code: 'bloq'}}))}], queue: [], pannes: [], events: [
      {run: 'a', ticket: 'DM-a', t: ${at('09:00')}, k: 'arrive'}, {run: 'a', t: ${at('09:01')}, k: 'poste', poste: 'cadrage'},
      {run: 'a', t: ${at('09:30')}, k: 'gate', gate: 'gate_plan'}, {run: 'a', t: ${at('09:40')}, k: 'poste', poste: 'code'},
      {run: 'b', ticket: 'DM-b', title: 'Sorti', repo: 'dm/api', t: ${at('08:00')}, k: 'arrive'}, {run: 'b', t: ${at('09:20')}, k: 'sort'}]};`);
  const rooms = h => J2(`(T = Date.parse(${at(h)}), atRooms().map(r => [r.run, r.poste, r.gate, r.states.cadrage || null]))`);
  assert.deepEqual(rooms('07:59'), [], 'avant toute arrivée : l\'étage est vide');
  assert.deepEqual(rooms('09:10'), [['b', 'cadrage', null, 'run'], ['a', 'cadrage', null, 'run']], 'b encore là (sans poste relevé : au cadrage), a au cadrage');
  assert.deepEqual(rooms('09:35'), [['a', 'gate', 'gate_plan', 'ok']], 'b est sorti, a t\'attend');
  assert.deepEqual(J2(`(T = Date.parse(${at('10:00')}), atRooms()[0].states)`), {cadrage: 'ok', code: 'bloq'}, 'plus rien après : l\'état du relevé, tel quel');
  p.run('mode = "live";');
  assert.deepEqual(J2('atRooms().map(r => r.run)'), ['a'], 'en direct : le relevé');
  // scènes : le curseur qui avance joue la sortie ; un saut pose l'étage ; une arrivée de moins de 2 min se joue quand même
  p.run(`mode = 'pause'; T = Date.parse(${at('09:19')}); AT_MEM.lastT = null; renderAtelier(1000); renderAtelier(1016);
    T = Date.parse(${at('09:21')}); renderAtelier(1032);`);
  assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind)'), ['exit'], 'b sort pendant la lecture : Bernard l\'emporte');
  p.run(`T = Date.parse(${at('09:00')}) + 30e3; renderAtelier(1048);`);
  assert.deepEqual(J2('AT_MEM.scenes.map(s => [s.kind, s.ticket])'), [['arrive', 'DM-a']], 'saut juste après une arrivée : elle se joue');
  p.run(`T = Date.parse(${at('09:10')}); renderAtelier(1064);`);
  assert.deepEqual(J2('AT_MEM.scenes'), [], 'saut loin d\'un moment : l\'étage se pose');
  // Bernard va d'abord chercher le colis qui apparaît dans l'entrepôt
  p.run(`AT_MEM.scenes = [{kind: 'arrive', i: 0, run: 'a', ticket: 'DM-a', t0: 0}]; atScenes(2000, .016, []);`);
  assert.equal(J2('AT_MEM.scenes[0].phase'), -1);
  assert.deepEqual(J2('AT_MEM.scenes[0].walk.path.pop()'), J2('AT_POP'), 'il va au colis');
});

test('le ménage du 1er : il balaie en parcourant chaque bureau et l\'entrepôt, jamais planté, et repart à la porte', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CFG.atelier = true; var __c = atCleaner(), __v = {s: 0, e: AT_CLEAN_DUR}; var __cv = atCleanVisit; atCleanVisit = () => __v;`);
  const pts = J2(`Array.from({length: 81}, (_, k) => atCleanerAt(__c, __v.s + (__v.e - __v.s) * k / 81)).map(m => m && [m.stop.room, Math.round(m.x), Math.round(m.y), !!m.sweeping])`);
  for (const room of ['le bureau 2', 'le bureau 4', 'le bureau 3', 'le bureau 1', 'l\'entrepôt']) {
    const sw = pts.filter(x => x && x[0] === room && x[3]);
    assert.ok(sw.length >= 3, room);
    assert.ok(new Set(sw.map(x => x[1] + ',' + x[2])).size >= 3, room + ' : il avance en balayant');
  }
  assert.equal(pts[80], null, 'arrivé à la sortie, il est reparti');
  p.run('atCleanVisit = __cv;');
});

test("atelier_sprite : le boss du 1er est dessiné avec son dessin de l'étage, sinon avec le sien ; ailleurs, le sien", () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`CFG.atelier = true; FLOOR = 1; ATELIER = {rooms: [], queue: [], pannes: []}; var __b = chars.find(c => c.boss), __d = drawChar, __seen = [];
    drawChar = (c, now) => { if (c.key === __b.key) __seen.push(c.sprite); __d(c, now); };`);
  const drawn = () => { p.run('__seen = []; renderAtelier(2000);'); return J2('__seen[0]'); };
  assert.equal(drawn(), J2('__b.sprite'), 'sans réglage : son sprite de boss');
  p.run(`__b.atelier_sprite = 'cs_pomp0';`);
  assert.equal(drawn(), 'cs_pomp0', 'réglé : il prend ce sprite au 1er');
  assert.equal(J2('__b.sprite !== "cs_pomp0"'), true, 'le boss garde son sprite (RDC, 3e, fiche)');
  p.run(`__b.atelier_sprite = 'absent_du_pack';`);
  assert.equal(drawn(), J2('__b.sprite'), 'sprite introuvable : repli sur le sien');
  p.run('delete __b.atelier_sprite; drawChar = __d;');
});

test("galerie : la scène se joue au premier clic, depuis la pause comme le soir (passer en démonstration n'est pas un saut du curseur)", () => {
  for (const h of [11, 22.5]) {
    const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
    p.run(`CFG.atelier = true; ATELIER = atelierDemo(); setFloor(1); setMode('pause'); T = DAY0 + ${h} * 36e5; renderAtelier(500); renderAtelier(600);`);
    assert.deepEqual(J2('AT_MEM.scenes'), [], 'rien ne se joue en arrivant');
    p.run('demoStart(atGalleryScenes().find(x => x.n === "Un ticket arrive")); renderAtelier(700); renderAtelier(800);');
    assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind)'), ['arrive'], h + ' h : Bernard apporte le carton');
    p.run('demoEnd(); demoStart(atGalleryScenes().find(x => x.n === "Un ticket sort")); renderAtelier(900); renderAtelier(1000);');
    assert.deepEqual(J2('AT_MEM.scenes.map(s => s.kind)'), ['exit'], h + ' h : Bernard emporte le carton');
    p.run('demoEnd();');
  }
});

test('« Le soir au 1er » : comme aux autres étages, la scène passe à 22 h 30 et rend la journée telle quelle', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CFG.atelier = true; ATELIER = atelierDemo(); setFloor(1); T = DAY0 + 11 * 36e5; var __T = T;`);
  const x = J2("atGalleryScenes().filter(x => x.n === 'Le soir au 1er').map(x => x.ok)");
  assert.deepEqual(x, [true]);
  p.run(`demoStart(atGalleryScenes().find(x => x.n === 'Le soir au 1er')); renderAtelier(1000);`);
  assert.equal(J2('parisHM(T).h'), 22);
  assert.equal(J2('officeOpen(T)'), false);
  p.run('demoEnd();');
  assert.equal(J2('T === __T'), true);
});

test("ce que fait l'agent : sa bulle dit sa dernière action et le compteur, jaune sans action depuis 5 min ; l'orchestrateur vient au bureau", () => {
  const p = load(), Jp = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`T = DAY0 + 11 * 36e5; ATELIER = {generated_at: new Date(T).toISOString(), queue: [], pannes: [], rooms: [
      {run: 'a', ticket: 'AB-1', repo: 'dm/site', poste: null, states: {cadrage: 'ok'}, tok: 1, etape: 'orchestrateur_plan', act: {cat: 'Execute', n: 18, at: new Date(T - 12e3).toISOString()}},
      {run: 'b', ticket: 'AB-2', repo: 'dm/site', poste: 'code', states: {code: 'run'}, tok: 1, etape: 'code', act: {cat: 'Read', n: 96, at: new Date(T - 7 * 60e3).toISOString()}}]};
    var __bb = [], __ab = atBubble; atBubble = (x, y, s, col, dot) => { __bb.push([s, dot || null]); return __ab(x, y, s, col, dot); };
    AT_MEM.fresh = true; setFloor(1); renderAtelier(1000);`);
  const bb = Jp('__bb');
  assert.ok(bb.some(([s, d]) => s === '⌨ 18 actions' && d === 'live'), 'l\'orchestrateur : sa dernière action a 12 s');
  assert.ok(bb.some(([s, d]) => s === '⏳ rien depuis 7 min' && d === 'stale'));
  assert.match(p.run('atelierFicheHtml(ATELIER.rooms[0], 0)'), /En ce moment : <b>🧠 Plan de l&#39;orchestrateur<\/b> · ⌨ lance une commande · 18 actions, la dernière il y a 12 s/);
  // en rejeu (le relevé est d'une autre heure), la bulle redevient « au travail »
  p.run('T += 3600e3; __bb = []; renderAtelier(1100); atBubble = __ab;');
  assert.ok(!Jp('__bb').some(([s]) => /actions|rien depuis/.test(s)));
});

// ---------- tableaux noirs rejouables (audit produit F8) ----------
// les textes écrits par une fonction de dessin : [texte, couleur]
const inks = (p, code) => JSON.parse(p.run(`(() => { const out = [], ft = ctx.fillText; ctx.fillText = function (t, ...r) { out.push([String(t), ctx.fillStyle]); return ft.call(this, t, ...r); };
  try { ${code} } finally { ctx.fillText = ft; } return JSON.stringify(out); })()`));
const REL = '#8e9a90';
// un relevé de midi : b est arrivé à 8 h et sorti à 9 h 20 ; a, arrivé à 9 h, est au code (lot 2/3, tour 1/3) ; ses jetons
// par ses étapes : 10 k pour la première (9 h - 9 h 30), 20 k pour celle qui tourne depuis 9 h 30
function f8(p, more = '') {
  const H = h => `new Date(DAY0 + ${h} * 36e5).toISOString()`;
  p.run(`CFG.atelier = true; CFG.atelier_chain = 'cccc1111'; FLOOR = 1;
    ATELIER = {generated_at: ${H(12)}, rooms: [${JSON.stringify(room('a', {poste: 'code', states: {cadrage: 'ok', code: 'run'}, tour: '1/3', lot: 'lot 2/3', tok: 30000}))}],
      queue: [], pannes: [], livres: 1, jour: {tickets: 2, cours: 1, sortis: 1, pannes: 0, reprises: 0, tok: 80000}, events: [
      {run: 'b', ticket: 'DM-b', repo: 'dm/api', t: ${H(8)}, k: 'arrive'}, {run: 'b', ticket: 'DM-b', repo: 'dm/api', t: ${H(9 + 20 / 60)}, k: 'sort'},
      {run: 'a', ticket: 'DM-a', repo: 'dm/site', t: ${H(9)}, k: 'arrive'}, {run: 'a', ticket: 'DM-a', repo: 'dm/site', t: ${H(9.1)}, k: 'poste', poste: 'code'}]};
    AT_RUNS = [{wf: 'cccc1111-x', run: 'b', status: 'Success', start: ${H(8)}, end: ${H(9 + 20 / 60)}, tok: 50000, steps: [{n: 's', s: 'Success', at: ${H(8)}, ms: 80 * 60e3, tok: 48000}]},
      {wf: 'cccc1111-x', run: 'a', status: 'Running', start: ${H(9)}, end: null, tok: 30000, steps: [{n: 's1', s: 'Success', at: ${H(9)}, ms: 30 * 60e3, tok: 10000},
        {n: 's2', s: 'Running', at: ${H(9.5)}, ms: 0, tok: 20000}]}]; ${more}`);
}

test('F8, 1er : en rejeu, « Runs du jour », le grand tableau et la pastille SORTIE à l\'heure du curseur (deux heures)', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);f8(p);
  p.run(`mode = 'pause'; T = DAY0 + 9.25 * 36e5;`);
  // 9 h 15 : a et b au travail, rien de sorti ; b à 80 % de son étape (48 k × 75/80), a à la moitié de sa première
  assert.deepEqual(J2('atJourAt(T)'), {cours: 2, tickets: 2, reprises: 0, sortis: 0, pannes: 0, tok: 45000 + 5000, part: true});
  let txt = inks(p, 'atJourBoard();').map(x => x[0]);
  assert.ok(txt.includes('2 en cours') && txt.includes('0/2 sortis') && txt.includes('~50 k jet.'), txt.join(' | '));
  assert.ok(!txt.some(t => /⏱/.test(t)), 'tout est daté : rien du relevé');
  // 10 h : b est sorti (son total, 50 k), a a fini sa première étape et fait 1/5 de la seconde (30 min sur 2 h 30 jusqu'au relevé)
  p.run('T = DAY0 + 10 * 36e5;');
  assert.deepEqual(J2('atJourAt(T)'), {cours: 1, tickets: 2, reprises: 0, sortis: 1, pannes: 0, tok: 50000 + 10000 + 4000, part: true});
  txt = inks(p, 'atJourBoard();').map(x => x[0]);
  assert.ok(txt.includes('1 en cours') && txt.includes('1/2 sortis') && txt.includes('~64 k jet.'), txt.join(' | '));
  assert.deepEqual(J2('atDeliveredAt()'), {n: 1});
  // le grand tableau : les jetons de a à 10 h, approchés ; son lot et son tour, ceux du relevé, en ⏱ grisés
  const b = inks(p, 'atBoard(atSlots());');
  assert.deepEqual(b.find(x => /jetons/.test(x[0])), ['~14 k jetons', '#b8c0d0']);
  assert.deepEqual(b.find(x => /tour/.test(x[0])), ['⏱tour 1/3', REL]);
  assert.deepEqual(b.find(x => /lot/.test(x[0])), [' · ⏱lot 2/3', REL]);
  // la bulle de l'agent retombe sur « au travail » : le lot du relevé n'est pas celui de 10 h
  assert.equal(J2('atRooms()[0].lot'), null);
  // la pastille SORTIE suit le curseur
  const s = h => (p.run(`T = DAY0 + ${h} * 36e5;`), inks(p, 'atCorridor(1000);').map(x => x[0]).find(t => /^SORTIE/.test(t)));
  assert.equal(s(9), 'SORTIE');
  assert.equal(s(10), 'SORTIE · 📦 1 aujourd\'hui');
  p.run('mode = "live";');
});

test('F8, 1er : l\'entrepôt à l\'heure du curseur (la file par les runs, les pannes datées que rien n\'a reprises)', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  const H = h => `new Date(DAY0 + ${h} * 36e5).toISOString()`;
  f8(p, `AT_RUNS.push({wf: 'cccc1111-x', run: 'q', status: 'Running', start: ${H(9.5)}, end: null, tok: 0, steps: [{n: 's', s: 'Running', at: ${H(10.5)}, ms: 0, tok: 0}]});
    ATELIER.events.push({run: 'q', ticket: 'DM-q', t: ${H(10.5)}, k: 'arrive'}, {run: 'p', ticket: 'DM-p', t: ${H(8)}, k: 'arrive'}, {run: 'p', ticket: 'DM-p', t: ${H(8.5)}, k: 'panne', poste: 'tests'},
      {run: 'p2', ticket: 'DM-p', t: ${H(10.2)}, k: 'arrive'});`);
  p.run('mode = "pause";');
  assert.deepEqual(J2(`(T = DAY0 + 10 * 36e5, [atQueueAt(T).map(x => x.ticket), atPannesAt(T).map(x => [x.ticket, x.poste])])`), [['DM-q'], [['DM-p', 'tests']]], '10 h : q attend, p est en panne');
  assert.deepEqual(J2(`(T = DAY0 + 10.6 * 36e5, [atQueueAt(T).map(x => x.ticket), atPannesAt(T)])`), [[], []], '10 h 36 : q est entré, p a été relancé');
  p.run('mode = "live";');
});

test('F8, 1er : en direct, rien ne change (les chiffres du relevé, sans ⏱)', () => {
  const p = load();fresh(p);f8(p);
  p.run(`mode = 'live'; T = DAY0 + 12 * 36e5;`);
  const all = [...inks(p, 'atJourBoard();'), ...inks(p, 'atBoard(atSlots());'), ...inks(p, 'atCorridor(1000);')];
  const txt = all.map(x => x[0]);
  for (const t of ['1 en cours', '1/2 sortis', '0 panne', '~80 k jet.', '⌨ Code · lot 2/3', 'tour 1/3 · 30 k jetons', 'SORTIE · 📦 1 aujourd\'hui']) assert.ok(txt.includes(t), t + ' : ' + txt.join(' | '));
  assert.ok(!all.some(([t, c]) => /⏱/.test(t) || c === REL), 'aucune valeur du relevé marquée en direct');
  assert.equal(p.run('atRooms()[0].lot'), 'lot 2/3', 'le lot reste dans la bulle');
});

test('F8, 1er : limite des 12 runs, les moments ne couvrent pas tous les runs du jour : le relevé, en ⏱', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  // le relevé compte 14 runs depuis minuit (12 tickets, 2 reprises) ; les moments n'en ont que 2
  f8(p, 'ATELIER.jour = {tickets: 12, cours: 1, sortis: 9, pannes: 2, reprises: 2, tok: 900000};');
  p.run(`mode = 'pause'; T = DAY0 + 10 * 36e5;`);
  assert.equal(J2('atDayCovered()'), false);
  const j = J2('atJourAt(T)');
  assert.deepEqual([j.tickets, j.sortis, j.pannes, j.reprises, j.rel], [12, 9, 2, 2, true], 'les chiffres du relevé, pas un faux compte');
  assert.equal(j.cours, 1, 'en cours : les bureaux à l\'heure du curseur');
  assert.equal(j.tok, 64000, 'les jetons, eux, viennent des runs : rejoués');
  const b = inks(p, 'atJourBoard();');
  assert.deepEqual(b.find(x => /sortis/.test(x[0])), ['⏱9/12 sortis', REL]);
  assert.deepEqual(b.find(x => /panne/.test(x[0])), ['⏱2 pannes', REL]);
  assert.deepEqual(b.find(x => /repr/.test(x[0])), ['⏱↻ 2 reprises', REL]);
  assert.deepEqual(J2('atDeliveredAt()'), {n: 1, rel: true});
  assert.ok(inks(p, 'atCorridor(1000);').some(x => x[0] === 'SORTIE · 📦 ⏱1 aujourd\'hui'));
  // sans chiffres du jour : 12 runs dans les moments, c'est la limite ; 11, les moments couvrent la journée
  const ev = n => `ATELIER.jour = null; ATELIER.events = Array.from({length: ${n}}, (_, k) => ({run: 'r' + k, ticket: 'DM-' + k, t: new Date(DAY0 + (8 + k / 10) * 36e5).toISOString(), k: 'arrive'}));`;
  p.run(ev(12));
  assert.equal(J2('atDayCovered()'), false);
  p.run(ev(11));
  assert.equal(J2('atDayCovered()'), true);
  // sans runs datés : les jetons aussi sont ceux du relevé
  f8(p, 'AT_RUNS = [];');
  const j2 = J2('atJourAt(T)');
  assert.deepEqual([j2.tok, j2.tokRel], [80000, true]);
  assert.deepEqual(inks(p, 'atJourBoard();').find(x => /jet\./.test(x[0])), ['⏱80 k jet.', REL]);
  assert.deepEqual(inks(p, 'atBoard(atSlots());').find(x => /jetons/.test(x[0])), ['⏱30 k jetons', REL]);
  p.run('mode = "live";');
});

test('F8, démo : ses runs datés font les jetons du jour ; rejouée à l\'heure du relevé, elle retombe sur ses chiffres', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);
  p.run(`CFG.atelier_chain = ''; AT_RUNS = []; ATELIER = atelierDemo(); mode = 'pause'; T = Date.parse(ATELIER.generated_at);`);
  const d = J2('ATELIER'), j = J2('atJourAt(T)');
  assert.equal(J2('atChainRuns().length'), d.runs.length);
  assert.ok(d.runs.every(r => r.steps.every(s => s.at && 'tok' in s)), 'des étapes datées, avec leurs jetons');
  assert.equal(J2('atDayCovered()'), true, 'les moments de la démo couvrent sa journée');
  for (const k of ['tickets', 'cours', 'sortis', 'pannes', 'reprises']) assert.equal(j[k], d.jour[k], k);
  assert.equal(Math.round(j.tok), d.jour.tok);
  assert.ok(J2('atRoomsAt(T).every(r => r.tok === ATELIER.rooms.find(x => x.run === r.run).tok)'), 'les jetons de chaque bureau');
  p.run('mode = "live";');
});

test('F8 : à l\'heure du relevé (3 min près), une pause juste après le direct ne grise rien : les tableaux du direct, sans légende', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));fresh(p);f8(p);
  const at = h => (p.run(`mode = 'pause'; T = DAY0 + ${h} * 36e5;`), [...inks(p, 'atJourBoard();'), ...inks(p, 'atBoard(atSlots());')]);
  for (const h of [12, 12 + 2 / 60, 12 - 2 / 60]) {
    const b = at(h);
    assert.ok(!b.some(([t, c]) => /⏱/.test(t) || c === REL), 'à ' + h);
    assert.ok(b.some(x => x[0] === 'tour 1/3 · 30 k jetons') && b.some(x => x[0] === '⌨ Code · lot 2/3'), 'le lot et le tour, comme en direct');
    assert.equal(J2('floorReleve()'), '');
  }
  assert.ok(at(12 - 4 / 60).some(x => x[0] === '⏱tour 1/3'), '4 min avant : le rejeu');
  assert.equal(J2('floorReleve()'), '12:00');
  p.run('mode = "live";');
});
