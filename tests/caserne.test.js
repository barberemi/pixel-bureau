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
  assert.deepEqual(J('csSlots(100).map(x => x && x.t.id)'), [null, 'b', null], 'un fil ignoré libère sa baie sans faire partir de camion');
  p.run(`SUPPORT.threads.push(${th('c', 'run', run(10))});`);
  assert.deepEqual(J('csSlots(200).map(x => x && x.t.id)'), ['c', 'b', null]);
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
  assert.equal(J('caserneOn()'), true, 'la démo a sa console Support');
  assert.deepEqual(J('floorsOn()'), [1, 0, -1]);
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
  assert.equal(J('nextFloor(false)'), -1);
  p.run('setFloor(-1);');
  assert.equal(J('nextFloor(false)'), 0);
  p.run('ATELIER = {rooms: [], queue: []}; setFloor(0);');
  assert.equal(J('nextFloor(true)'), -1, "l'atelier vide est sauté");
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
    CS_NIGHT_AT = 0; renderCaserne(1100); softSpot = __so;`);
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
