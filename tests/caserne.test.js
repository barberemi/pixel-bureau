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

test("état des postes : le relevé (run.postes) d'abord, sinon les étapes du run", () => {
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
  assert.deepEqual(J("[spState(SUPPORT.threads[0]).k, csStates(SUPPORT.threads[0])]"), ['failed', {tri: 'ok', logs: 'err'}]);
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
  assert.equal(J('CS_HITS.some(h => h.kind === "captain")'), false, 'le soir, le capitaine est rentré');
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
});
