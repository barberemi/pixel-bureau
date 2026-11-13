// -1, la caserne Support (68-caserne.js) : une baie par intervention (trois au plus), l'état des postes tiré du relevé ou
// des étapes du run, le camion qui part quand la réponse est postée, l'étage dans les onglets, le mode TV et la galerie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const at = h => `new Date(DAY0 + ${h} * 36e5).toISOString()`;
const th = (id, state, extra = '') => `{id: '${id}', from: 'Halpert, Jim', at: ${at(9)}, text: 'Message ${id}', subject: 'Sujet ${id}', state: '${state}', run: null, mine: null${extra}}`;
function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; DATA.runs = []; T = DAY0 + 11 * 36e5; csReset();`);
  return {p, J, set: l => p.run(`SUPPORT = {threads: [${l.join(',')}]}; csReset();`)};
}

test("les postes de la caserne : du tri à Teams, la seule validation humaine au poste ✋", () => {
  const {J} = page();
  assert.deepEqual(J('CS_POSTES.map(p => p.k)'), ['tri', 'logs', 'cause', 'reponse', 'relecture', 'gate', 'post']);
  assert.deepEqual(J('CS_POSTES.filter(p => p.gate).map(p => p.k)'), ['gate']);
});

test('trois baies au plus : investigations et réponses à valider d\'abord (la plus ancienne en premier), puis les pannes', () => {
  const {J, set} = page();
  const run = h => `, run: {run: 'r${h}', status: 'Running', at: ${at(h)}}`;
  set([th('a', 'failed', run(8)), th('b', 'run', run(10)), th('c', 'gate', run(9)), th('d', 'run', run(10.5)), th('e', 'new'), th('f', 'done')]);
  assert.deepEqual(J('csActive().map(x => x.t.id)'), ['c', 'b', 'd', 'a']);
  assert.deepEqual(J('csSlots(0).map(x => x && x.t.id)'), ['c', 'b', 'd']);
  assert.equal(J('csWaiting()'), 1, 'la panne attend une baie libre');
  assert.deepEqual(J('csCalls().map(t => t.id)'), ['e']);
});

test("une intervention garde sa baie ; la suivante prend la première baie libre", () => {
  const {p, J, set} = page();
  const run = h => `, run: {run: 'r${h}', status: 'Running', at: ${at(h)}}`;
  set([th('a', 'run', run(8)), th('b', 'run', run(9))]);
  J('csSlots(0)');
  p.run(`SUPPORT.threads[0].state = 'skipped';`);
  assert.deepEqual(J('csSlots(100).map(x => x && x.dep && x.dep.posted)'), [false, null, null], 'un fil ignoré : le camion rentre, sans réponse postée');
  p.run(`SUPPORT.threads.push(${th('c', 'run', run(10))});`);
  assert.deepEqual(J('csSlots(200).map(x => x && x.t.id)'), ['a', 'b', 'c'], 'la baie 1 se ferme encore : la suivante prend la baie 3');
  assert.deepEqual(J('csSlots(100 + CS_DEP_MS + 1).map(x => x && x.t.id)'), [null, 'b', 'c'], 'puis la baie 1 est libre');
});

test("réponse postée : le camion part (sauf en arrivant à l'étage), puis la baie se libère", () => {
  const {p, J, set} = page();
  set([th('a', 'gate', `, run: {run: 'ra', status: 'WaitingApproval', at: ${at(9)}}`)]);
  J('csSlots(0)');
  p.run(`SUPPORT.threads[0].state = 'done'; SUPPORT.threads[0].mine = {at: ${at(10.9)}, text: '🔎 Cause : …'};`);
  assert.equal(J('!!csSlots(100)[0].dep'), true, 'le camion part');
  assert.equal(J('csSlots(100 + CS_DEP_MS + 1)[0]'), null, 'puis la baie est libre');
  set([th('b', 'done', `, mine: {at: ${at(10.9)}, text: 'x'}`)]);
  assert.deepEqual(J('csSlots(0)'), [null, null, null], 'en arrivant : rien ne se rejoue');
});

test("en revenant à l'étage : une arrivée déjà vue ne se rejoue pas ; partie pendant l'absence, elle se joue une fois", () => {
  const {p, J, set} = page();
  set([th('a', 'run', `, run: {run: 'ra', status: 'Running', at: ${at(11 - 1 / 60)}}`)]);
  assert.equal(J('!!csSlots(0)[0] && !!CS_MEM.arr[0]'), true, 'partie il y a une minute, vue pour la première fois : l\'arrivée se joue');
  p.run('setFloor(0); setFloor(-1);');
  assert.equal(J('!!csSlots(0)[0] && !!CS_MEM.arr[0]'), false, 'on change d\'étage et on revient : la baie est posée, personne ne redescend la barre');
  p.run(`SUPPORT.threads.push(${th('b', 'run', `, run: {run: 'rb', status: 'Running', at: ${at(11 - 1 / 60)}}`)}); setFloor(0); setFloor(-1);`);
  assert.deepEqual(J('csSlots(0).map((x, b) => x && [x.t.id, !!CS_MEM.arr[b]])'), [['a', false], ['b', true], null], 'partie pendant qu\'on était ailleurs : son arrivée se joue, une fois');
  p.run('setFloor(0); setFloor(-1);');
  assert.deepEqual(J('csSlots(0).map((x, b) => x && !!CS_MEM.arr[b])'), [false, false, null]);
});

test("loupe : juste après un changement d'étage, ce qui est en cours n'est pas présenté comme nouveau", () => {
  const {p, J, set} = page();
  set([th('a', 'gate', `, run: {run: 'ra', status: 'WaitingApproval', at: ${at(9)}}`)]);
  p.run('setFloor(-1); performance.now = () => 0;');
  assert.deepEqual(J('loupeScan()'), [], 'premier relevé : l\'étage n\'est pas encore dessiné');
  J('csSlots(0)');
  assert.deepEqual(J('loupeScan()'), [], 'l\'étage dessiné : la validation déjà en cours n\'est pas nouvelle');
  p.run('performance.now = () => 1000;');
  p.run(`SUPPORT.threads.push(${th('b', 'failed', `, run: {run: 'rb', status: 'Failed', at: ${at(10)}}`)});`);
  J('csSlots(1000)');
  assert.deepEqual(J('loupeScan().map(e => e.kind)'), ['cs_err', 'cs_arrive'], 'ce qui commence ensuite, si : le camion qui part, la panne');
});

test("état des postes : les étapes du run (cron live) d'abord, sinon le relevé (run.postes)", () => {
  const {p, J, set} = page();
  set([th('a', 'run', `, run: {run: 'ra', status: 'Running', at: ${at(9)}, postes: {tri: 'ok', logs: 'run'}}`)]);
  assert.deepEqual(J("csStates(SUPPORT.threads[0])"), {tri: 'ok', logs: 'run'});
  // la chaîne découpée : une étape par poste
  set([th('b', 'run', `, run: {run: 'rb', status: 'Running', at: ${at(9)}}`)]);
  p.run(`DATA.runs = [{run: 'rb', status: 'Running', start: ${at(9)}, vars: {message_id: 'b'}, steps: [
    {n: 'open', s: 'Success'}, {n: 'tri', s: 'Success'}, {n: 'logs', s: 'Success'}, {n: 'cause', s: 'Running'}]}];`);
  assert.deepEqual(J("csStates(SUPPORT.threads[0])"), {tri: 'ok', logs: 'ok', cause: 'run'});
  assert.equal(J("csCur(csStates(SUPPORT.threads[0])).k"), 'cause');
  // le modèle d'avant : une seule investigation tient Logs, Cause et Réponse
  p.run(`DATA.runs[0].steps = [{n: 'open', s: 'Success'}, {n: 'mark', s: 'Success'}, {n: 'publish_run', s: 'Success'}, {n: 'investigate', s: 'Running'}];`);
  assert.deepEqual(J("csStates(SUPPORT.threads[0])"), {tri: 'ok', logs: 'run', cause: 'run', reponse: 'run'});
  // panne : le poste en échec
  p.run(`DATA.runs[0].status = 'Failed'; DATA.runs[0].steps = [{n: 'tri', s: 'Success'}, {n: 'logs', s: 'Failed'}];`);
  assert.deepEqual(J("[spState(SUPPORT.threads[0]).k, csStates(SUPPORT.threads[0])]"), ['failed', {tri: 'ok', logs: 'err'}]);  // le relevé est plus espacé que le cron live : ses postes ne l'emportent pas sur les étapes
  p.run(`SUPPORT.threads[0].run.postes = {tri: 'run'};`);
  assert.deepEqual(J("csStates(SUPPORT.threads[0])"), {tri: 'ok', logs: 'err'});
  // un poste (sous-run, parent = le run de l'investigation) n'est jamais pris pour l'investigation
  p.run(`DATA.runs.push({run: 'rb-tri', parent: 'rb', status: 'Success', start: ${at(9.5)}, vars: {message_id: 'b'}, steps: [{n: 'agent', s: 'Success'}]});`);
  assert.equal(J("csRunOf(SUPPORT.threads[0]).run"), 'rb');
  assert.equal(J("spState(SUPPORT.threads[0]).r.run"), 'rb');
});

test("les postes de l'investigation (CFG.support.postes_wf) travaillent à la caserne : ni au RDC, ni dans « Nouvel agent »", () => {
  const {p, J} = page();
  p.run(`(() => {
    CFG.support = {name: 'Support', wf: 'aaaaaaaa', postes_wf: ['bbbbbbbb']};
    const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
    d.runs.push({wf: 'aaaaaaaa-0000', wf_name: 'Support', run: 'inv', status: 'Running', start: at, end: null, steps: [], vars: {message_id: '1'}},
      {wf: 'bbbbbbbb-0000', wf_name: 'Support · 🔎 logs', run: 'logs', parent: 'inv', status: 'Running', start: at, end: null, steps: [], vars: {message_id: '1'}});
    setData(d, true);
    ASKABLE = [{wf: 'bbbbbbbb-0000', name: 'Support · 🔎 logs'}, {wf: 'cccccccc-0000', name: 'Autre'}];
  })()`);
  assert.deepEqual(J("DATA.runs.filter(r => ['inv', 'logs'].includes(r.run)).map(r => r.run)"), ['inv']);
  assert.equal(J("chars.some(c => c.temp && (c.wf || []).includes('bbbbbbbb'))"), false);
  assert.deepEqual(J('workflowsWithoutAgent().map(w => w.name)').filter(n => n.startsWith('Support')), []);
});

test("réponse à valider : tous les postes d'avant ont travaillé, ✋ t'attend", () => {
  const {J, set} = page();
  set([th('a', 'gate', `, run: {run: 'ra', status: 'WaitingApproval', at: ${at(9)}}`)]);
  const st = J('csStates(SUPPORT.threads[0])');
  assert.deepEqual(st, {tri: 'ok', logs: 'ok', cause: 'ok', reponse: 'ok', relecture: 'ok', gate: 'gate'});
});

test("onglets : le RDC par défaut, la caserne au -1 quand la console Support existe ; la toile prend la taille de l'étage", () => {
  const {p, J} = page();
  assert.deepEqual(J("[...floorTabsHtml().matchAll(/data-floor=\"(-?\\d)\"/g)].map(m => +m[1])"), [-1, 0, 1, 2, 3], "dans l'ordre des étages, comme un ascenseur (le 3e : 68-retours.js)");
  assert.equal(J('caserneOn()'), true, 'la démo a sa console Support');
  assert.deepEqual(J('floorsOn()'), [3, 2, 1, 0, -1]);
  p.run('setFloor(-1);');
  assert.equal(J('FLOOR'), -1);
  assert.deepEqual(J('[cv.width, cv.height]'), J('[AT_W, AT_H]'));
  p.run('SUPPORT = null; CFG.support = null; setFloor(-1);');
  assert.equal(J('FLOOR'), 0, 'sans console Support, pas de caserne');
});

test("l'étage dessine sans erreur, de jour comme de nuit, et le panneau liste les baies puis les appels", () => {
  const {p, J} = page();
  p.run('SUPPORT = supportDemo(); setFloor(-1); renderCaserne(1000); renderCaserne(1100);');
  assert.ok(J('CS_HITS.some(h => h.kind === "pole")'), 'la barre de pompier');
  assert.ok(J('CS_HITS.some(h => h.kind === "captain")'), 'le capitaine à son poste');
  p.run('T = DAY0 + 22.5 * 36e5; renderCaserne(1200);');
  assert.equal(J('CS_HITS.some(h => h.kind === "captain")'), true, 'le soir, le capitaine reste, comme le boss au 1er');
  assert.equal(J('CS_HITS.some(h => h.kind === "guard")'), false, 'la garde dort sur les lits de camp');
  const html = J('caserneListHtml(csSlots(1300))');
  assert.match(html, /Caserne Support <span class="cnt">2\/3/);
  assert.match(html, /Baie 1/);
  assert.match(html, /Appels à prendre <span class="cnt">1/);
});

test("mode TV : E fait le tour des étages ; en alternance, seulement les étages occupés", () => {
  const {p, J} = page();
  p.run('FLOOR = 0;');
  assert.deepEqual(J('[nextFloor(false)]'), [1]);
  p.run('setFloor(1);');
  assert.equal(J('nextFloor(false)'), 2);
  p.run('setFloor(2);');
  assert.equal(J('nextFloor(false)'), 3);
  p.run('setFloor(3);');
  assert.equal(J('nextFloor(false)'), -1);
  p.run('setFloor(-1);');
  assert.equal(J('nextFloor(false)'), 0);
  p.run('ATELIER = {rooms: [], queue: []}; RETOURS = {rooms: [], queue: []}; REDACTION = {tables: []}; rvDemo = () => []; setFloor(0);');
  assert.equal(J('nextFloor(true)'), -1, "l'atelier, le 2e et le 3e vides sont sautés");
  assert.match(J('tvCaserneHtml()'), /Caserne Support[\s\S]*Baie 1[\s\S]*Appels à prendre/);
});

test("galerie : au -1, les scènes de la caserne ; « Le camion part » rend le Support tel quel à la fin", () => {
  const {p, J} = page();
  p.run('SUPPORT = supportDemo(); setFloor(-1); renderCaserne(1000);');
  assert.deepEqual(J('[...new Set(galleryScenes().map(x => x.fam))]'), ['Sous-sol']);
  p.run(`var __S = SUPPORT; demoStart(galleryScenes().find(x => x.n === 'Le camion part'));`);
  assert.equal(J("SUPPORT.threads.find(t => t.id === 'd3').state"), 'done');
  p.run('demoEnd();');
  assert.equal(p.run('SUPPORT === __S'), true);
  // à toute heure, même sans intervention : la scène part des fils de la démo
  p.run(`SUPPORT = {threads: []}; csReset();`);
  assert.ok(J('galleryScenes().every(x => x.ok)'));
  p.run(`demoStart(galleryScenes().find(x => x.n === 'Le camion part'));`);
  assert.equal(J("SUPPORT.threads.find(t => t.id === 'd3').state"), 'done');
  p.run('demoEnd();');
});

test('le soir, comme au 1er : le capitaine a sa lumière, qui le suit jusqu\'à la vanne', () => {
  const {p, J} = page();
  p.run(`SUPPORT = supportDemo(); setFloor(-1); T = DAY0 + 22.5 * 36e5; renderCaserne(1000);
    var __sp = [], __so = softSpot; softSpot = (g, x, y, r, a, c) => { __sp.push([Math.round(x), Math.round(y)]); __so(g, x, y, r, a, c); };
    CS_NIGHT.at = 0; renderCaserne(1100); softSpot = __so;`);
  const lit = q => J(`__sp.some(([a, b]) => a === ${Math.round(q.x)} && b === ${Math.round(q.y - 26)})`);
  assert.ok(lit(J('CS_MEM.boss.walk.pos')), 'le capitaine, là où il est');
  p.run(`__sp = []; softSpot = (g, x, y, r, a, c) => { __sp.push([Math.round(x), Math.round(y)]); __so(g, x, y, r, a, c); };
    for (let n = 0; n < 8; n++) renderCaserne(1100 + 50 * (n + 1)); softSpot = __so;`);
  assert.ok(lit(J('CS_MEM.boss.walk.pos')), 'il a marché : le masque s\'est refait sur sa nouvelle place');
});

test('le capitaine a la même fiche que le boss au RDC ; un lien vers le RDC y redescend, le retour revient à la caserne', () => {
  const {p, J} = page();
  p.run(`SUPPORT = supportDemo(); setFloor(-1); renderCaserne(1000); var __b = chars.find(c => c.boss), __o = chars.find(c => c.person && !c.boss);
    var __ds = drawSide, __drawn = []; drawSide = side => __drawn.push(sel);
    var __hit = csHitAt; csHitAt = () => ({kind: 'captain'}); caserneClick({}); csHitAt = __hit;`);
  assert.equal(J('FLOOR'), -1);
  assert.equal(J('sel === __b.key'), true, 'clic sur le capitaine : la fiche du boss');
  assert.equal(J('__drawn[__drawn.length - 1] === __b.key'), true, 'la fiche du RDC, dans le panneau de la caserne');
  assert.equal(J('backLabel(null)'), 'La caserne', '« ← La caserne »');
  p.run('select(__o.key);');
  assert.equal(J('FLOOR'), 0, 'un collègue (lien de la fiche) : on redescend au RDC');
  assert.equal(J('sel === __o.key && __drawn[__drawn.length - 1] === __o.key'), true, 'et sa fiche s\'ouvre au RDC');
  p.run('setFloor(-1);');
  assert.equal(J('sel'), null, 'en descendant, la fiche d\'un collègue se ferme');
  p.run('select(__b.key); setFloor(0); setFloor(-1);');
  assert.equal(J('sel === __b.key'), true, 'celle du boss reste ouverte, à tous les étages');
  p.run('goBack();');
  assert.equal(J('sel === null && FLOOR === -1'), true, 'retour : la caserne');
  p.run('drawSide = __ds;');
});

test('au clic sur un pompier ou le capitaine, comme au RDC : le plan s\'assombrit autour de lui ; un clic ailleurs l\'enlève', () => {
  const {p, J} = page();
  p.run(`SUPPORT = supportDemo(); setFloor(-1); sel = null; for (let n = 0; n < 40; n++) renderCaserne(1000 + n * 100);
    var __h = [], __sh = selHalo; selHalo = (x, y) => __h.push([x, y]); renderCaserne(5000);`);
  assert.equal(J('__h.length'), 0, 'personne de choisi : pas de halo');
  const b = J('CS_MEM.slots.findIndex(s => s && !s.dep)');
  p.run(`var __hit = csHitAt; csHitAt = () => ({kind: 'agent', b: ${b}, k: 'logs'}); caserneClick({}); csHitAt = __hit; renderCaserne(5100);`);
  const pt = J(`CS_G[${b}].pts[CS_POSTES.findIndex(p => p.k === 'logs')]`);
  assert.deepEqual(J('__h[0]'), [pt.x, pt.y - 26], 'le pompier choisi, à son poste');
  assert.ok(J('CS_SEL !== null'), 'et la fiche de sa baie');
  p.run(`csHitAt = () => null; caserneClick({}); csHitAt = __hit; __h = []; renderCaserne(5200);`);
  assert.equal(J('CS_SEL === null && CS_PICK === null && __h.length === 0'), true, 'clic ailleurs : plus de choix, plus de halo');
  p.run(`csHitAt = () => ({kind: 'captain'}); caserneClick({}); csHitAt = __hit; __h = []; renderCaserne(5300);`);
  const c = J('CS_MEM.boss.walk.pos');
  assert.deepEqual(J('__h[0]'), [c.x, c.y - 26], 'le capitaine, là où il est');
  p.run('selHalo = __sh; select(null);');
});

test('captain_sprite : le capitaine est dessiné avec ce sprite à la caserne, sinon avec le sien et le casque du chef', () => {
  const {p, J} = page();
  p.run(`SUPPORT = supportDemo(); setFloor(-1); var __b = chars.find(c => c.boss), __d = drawChar, __seen = [];
    drawChar = (c, now) => { if (c.key === __b.key) __seen.push(c.sprite); __d(c, now); };`);
  const drawn = () => { p.run('__seen = []; renderCaserne(2000);'); return J('__seen[0]'); };
  assert.equal(drawn(), J('__b.sprite'), 'sans réglage : son sprite de boss');
  p.run(`__b.captain_sprite = 'cs_pomp0';`);
  assert.equal(drawn(), 'cs_pomp0', 'réglé : le capitaine prend ce sprite');
  assert.equal(J('__b.sprite !== "cs_pomp0"'), true, 'le boss garde son sprite (RDC, fiche)');
  p.run(`__b.captain_sprite = 'absent_du_pack';`);
  assert.equal(drawn(), J('__b.sprite'), 'sprite introuvable : repli sur le sien');
  p.run('delete __b.captain_sprite; drawChar = __d;');
});

test('captain_sprite du roster : seul le boss le porte', () => {
  const {J} = page();
  assert.equal(J('CAST.filter(c => "captain_sprite" in c).length'), 0, 'le pack de démo ne le règle pas');
});

test('le bureau du chef de centre : le capitaine de face derrière son bureau, le tableau de garde à côté ; il part, le bureau reste', () => {
  const {p, J} = page();
  p.run(`SUPPORT = supportDemo(); setFloor(-1); var __b = chars.find(c => c.boss), __o = csSlots, __d = drawChar, __dk = csDesk, __txt = [], __order = [];
    csSlots = n => __o(n).map(s => s && s.s && s.s.k === 'gate' ? {...s, s: {...s.s, k: 'run'}} : s); CS_MEM.boss = null;
    drawChar = (c, now) => { if (c.key === __b.key) __order.push(['capitaine', c.dir]); __d(c, now); };
    csDesk = (...a) => { __order.push(['bureau']); __dk(...a); };
    var __ft = ctx.fillText; ctx.fillText = function (t, ...r) { __txt.push(t); return __ft.call(this, t, ...r); };
    for (let n = 0; n < 20; n++) renderCaserne(1000 + n * 100); __order = []; __txt = []; renderCaserne(3100);`);
  assert.deepEqual(J('CS_MEM.boss.walk.pos'), J('({x: CS_DESK.x, y: CS_DESK.y - CS_BACK})'), 'chez lui : derrière son bureau');
  assert.deepEqual(J('__order'), [['capitaine', 'down'], ['bureau']], 'de face, et le bureau dessiné devant lui');
  assert.ok(J('__txt.includes("CHEF DE CENTRE") && __txt.includes("GARDE")'), 'la plaque et le tableau de garde');
  assert.ok(J('CS_HITS.some(h => h.kind === "calls") && CS_HITS.some(h => h.kind === "garde") && CS_HITS.some(h => h.kind === "captain")'), 'corbeille d\'appels, tableau et capitaine cliquables');
  p.run(`csSlots = __o; CS_MEM.boss = null; for (let n = 0; n < 60; n++) renderCaserne(4000 + n * 100); __order = []; renderCaserne(10100);`);
  assert.ok(J('CS_MEM.boss.walk.pos.y < CS_DESK.y - CS_BACK'), 'une réponse attend : il est parti vers la vanne, par le haut');
  assert.ok(J('__order.some(o => o[0] === "bureau")'), 'le bureau reste, vide');
  p.run('csSlots = __o; drawChar = __d; csDesk = __dk; ctx.fillText = __ft;');
});

// ---------- rien n'apparaît ni ne disparaît d'un coup ----------
const runTh = (id, h) => th(id, 'run', `, run: {run: 'r${id}', status: 'Running', at: ${at(h)}}`);
// joue la caserne image par image (dt de 100 ms) jusqu'à t ms
function play(p, from, to) {p.run(`for (let t = ${from}; t <= ${to}; t += 100) renderCaserne(t);`);}

test("nouvelle intervention : le rideau se lève, le camion sort, les pompiers descendent la barre un par un et vont à leur place", () => {
  const {p, J, set} = page();
  set([runTh('a', 9)]);
  p.run('setFloor(-1); renderCaserne(1000);');
  assert.equal(J('CS_MEM.arr[0]'), null, "en arrivant à l'étage, l'équipe est déjà là");
  p.run(`SUPPORT.threads.push(${runTh('b', 10)});`);
  play(p, 1100, 1100);
  assert.equal(J('!!CS_MEM.arr[1]'), true, "l'arrivée de la baie 2 commence");
  assert.ok(J('CS_MEM.door[1]') < 0.1, 'le rideau commence à se lever');
  assert.deepEqual(J('CS_MEM.arr[1].w.map(x => x[0])'), [0, 1, 2, 3, 6, 4], 'premier rang de gauche à droite, puis le second');
  // chacun part du trou de la barre, après le précédent, et passe par l'allée sous les baies
  assert.ok(J('CS_MEM.arr[1].w.every(([j, w]) => w.pos.x === CS_PX && w.pos.y === CS_POLE.y0)'));
  const holds = J('CS_MEM.arr[1].w.map(([j, w]) => w.pts[0].hold)');
  assert.ok(holds.every((h, i) => !i || h > holds[i - 1]), 'un par un');
  assert.ok(J('CS_MEM.arr[1].w.every(([j, w]) => w.pts.some(q => q.y === CS_LANE))'));
  // personne ne passe dans une autre baie : au-dessus de l'allée, chacun reste dans la colonne de sa place
  assert.ok(J(`CS_MEM.arr[1].w.every(([j, w]) => w.pts.filter(q => q.y < CS_LANE && q.x !== CS_PX).every(q => q.x === CS_G[1].pts[j].x))`));
  play(p, 1200, 2800);
  assert.ok(J('CS_MEM.door[1]') > 0.99, 'rideau levé en 1,6 s');
  play(p, 2700, 40000);
  assert.equal(J('CS_MEM.arr[1]'), null, 'tous à leur place, le tuyau déroulé');
});

test("réponse postée : le tuyau s'enroule, le camion rentre, le rideau se ferme ; l'équipe prend un café et remonte la barre", () => {
  const {p, J, set} = page();
  set([th('a', 'gate', `, run: {run: 'ra', status: 'WaitingApproval', at: ${at(9)}}`)]);
  p.run('setFloor(-1); renderCaserne(1000);');
  p.run(`SUPPORT.threads[0].state = 'done'; SUPPORT.threads[0].mine = {at: ${at(10.9)}, text: '…'};`);
  play(p, 1100, 1100);
  assert.equal(J('CS_MEM.dep[0].posted'), true);
  assert.equal(J('CS_MEM.walk.length'), 6, 'les six pompiers qui ont travaillé');
  assert.ok(J("CS_MEM.walk.every(w => w.pts.some(q => q.act === 'coffee') && w.pts.at(-1).act === 'climb')"), 'café, puis la barre');
  assert.deepEqual(J('CS_MEM.walk.map(w => w.k)'), [4, 6, 3, 2, 1, 0], 'le second rang part le premier');
  play(p, 1200, 1100 + 2500);
  assert.ok(J('CS_MEM.door[0]') > 0.9, 'le camion rentre, le rideau est encore levé');
  play(p, 3700, 1100 + 6500 + 100);
  assert.equal(J('CS_MEM.dep[0]'), null, 'le rideau fermé, la baie est libre');
  assert.equal(J('CS_MEM.door[0]'), 0);
  assert.ok(J('CS_MEM.walk.length') > 0, "l'équipe est encore en route vers le café");
  play(p, 7800, 60000);
  assert.equal(J('CS_MEM.walk.length'), 0, 'tous remontés par la barre');
});

test("un fil traité autrement : le camion rentre aussi, l'équipe remonte sans café", () => {
  const {p, J, set} = page();
  set([runTh('a', 9)]);
  p.run('setFloor(-1); renderCaserne(1000);');
  p.run(`SUPPORT.threads[0].state = 'skipped';`);
  play(p, 1100, 1100);
  assert.equal(J('CS_MEM.dep[0].posted'), false);
  assert.ok(J("CS_MEM.walk.length && CS_MEM.walk.every(w => !w.pts.some(q => q.act === 'coffee'))"));
});

test("REDUCED_MOTION : tout est posé directement, sans arrivée ni départ", () => {
  const p = load({globals: {matchMedia: () => ({matches: true})}}), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; DATA.runs = []; T = DAY0 + 11 * 36e5; SUPPORT = {threads: [${runTh('a', 9)}]}; setFloor(-1); renderCaserne(1000);`);
  assert.equal(J('REDUCED_MOTION'), true);
  p.run(`SUPPORT.threads.push(${runTh('b', 10)}); renderCaserne(1100);`);
  assert.deepEqual(J('[CS_MEM.arr[1], CS_MEM.door[1]]'), [null, 1], "l'équipe et le camion sont là");
  p.run(`SUPPORT.threads[0].state = 'done'; SUPPORT.threads[0].mine = {at: ${at(10.9)}, text: '…'}; renderCaserne(1200);`);
  assert.deepEqual(J('[CS_MEM.slots[0], CS_MEM.dep[0], CS_MEM.walk.length, CS_MEM.door[0]]'), [null, null, 0, 0], 'la baie se ferme, sans sortie');
});

test("plus de porte des étages : la barre de pompier seule ; le gyrophare tourne tant qu'il y a un appel ou une intervention", () => {
  const {p, J, set} = page();
  set([runTh('a', 9)]);
  p.run('setFloor(-1); renderCaserne(1000);');
  assert.ok(J('CS_HITS.some(h => h.kind === "pole")'));
  assert.equal(J('csAlarm()'), true, 'une intervention en cours');
  assert.match(J('floorTabsHtml()'), /data-floor="-1"[^>]*><span class="gyro"/, "le gyrophare de l'onglet du -1");
  set([th('n', 'new')]);
  assert.equal(J('csAlarm()'), true, 'un appel à prendre');
  set([th('f', 'done')]);
  assert.equal(J('csAlarm()'), false);
  assert.doesNotMatch(J('floorTabsHtml()'), /gyro/);
});

test('alignés sur le 1er : la loupe du -1 (gate, arrivée, départ), le ménage par la barre, la marche accélérée en rejeu', () => {
  const p = load(), J2 = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`CS_MEM = csMem0(); CS_MEM.slots = ['m1', 'm2', null]; CS_MEM.st = [{tri: 'ok', gate: 'gate'}, {tri: 'err'}, null]; CS_MEM.arr = [null, {}, null];
    SUPPORT = {threads: [{id: 'm1', from: 'Beesly, Pam', subject: 'Flux vide'}, {id: 'm2', from: 'Halpert, Jim', text: 'Erreur 500'}]};`);
  assert.deepEqual(J2('csLoupeEvents().map(e => e.kind)'), ['cs_gate', 'cs_arrive', 'cs_err']);
  assert.match(J2('csLoupeEvents()[0].cs[0]._st.label'), /attend ta validation · Pam · Flux vide/);
  p.run(`var __c = {key: 'menage'}, __v = {s: 0, e: 1e6}; var __av = atCleanVisit; atCleanVisit = () => __v;`);
  const m = J2(`Array.from({length: 40}, (_, k) => csCleanerAt(__c, 1e6 + CS_CLEAN_DUR * k / 40)).filter(Boolean).map(m => [m.stop.room, !!m.sweeping])`);
  for (const r of ['la baie 1', 'la baie 2', 'la baie 3', 'la salle de garde']) assert.ok(m.some(([x, s]) => x === r && s), r);
  assert.equal(J2(`csCleanerAt(__c, 1e6 + CS_CLEAN_DUR - 1)`), null, 'remonté par la barre');
  p.run('atCleanVisit = __av; mode = "play"; setSpeed(480);');
  assert.equal(J2('walkBoost()'), 8, 'rejeu ×480 : on marche 8 fois plus vite, aux étages aussi');
});

test('« Qui fait quoi » du RDC : un bloc du -1, une carte par baie occupée (audit UX 4.1)', () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('T = DAY0 + 11 * 36e5; setMode("live");');
  const rows = J('csWhoRows(T)');
  assert.ok(rows.length > 0, 'des baies occupées dans la démo');
  assert.ok(rows.every(x => typeof x.b === 'number' && x.what), 'baie et sujet');
  assert.match(J('csWhoHtml(T)'), /🚒 -1 caserne <span class="cnt">\d+<\/span>[\s\S]*data-cs-thread=/);
});
