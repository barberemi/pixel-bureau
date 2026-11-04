// La vie des étages (67-vie.js) : les agents qui marchent d'une place à l'autre au 2e et au 3e ; les reporters toujours
// là, les trajets du boss au liège et à la boîte Jira (68-redaction.js) ; les équipes des bureaux du 3e (68-retours.js) ;
// les tenues (plus de chantier aux 2e et 3e, le gilet du 1er à la hauteur du RDC).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const at = h => `new Date(DAY0 + ${h} * 36e5).toISOString()`;
function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; T = DAY0 + 11 * 36e5; setMode('live');`);
  return {p, J};
}
const spot = (id, pts, extra = '') => `{id: '${id}', path: [${pts.map(([x, y]) => `{x: ${x}, y: ${y}}`).join(',')}], dir: 'down'${extra}}`;

test('les marcheurs : une arrivée monte par la porte, une place qui change passe par les chemins, un départ redescend', () => {
  const {p, J} = page();
  p.run(`var __M = lvMem(), __E = [{x: 0, y: 500}, {x: 0, y: 100}], __A = ${spot('a', [[0, 100], [100, 100], [100, 50]], ', seat: true')},
    __B = ${spot('b', [[0, 100], [100, 100], [200, 100]])}, __C = ${spot('c', [[0, 100], [-100, 100]])};
    lvUpdate(__M, {x: __A}, __E, .1);`);
  assert.deepEqual(J('[__M.who.x.pos, __M.who.x.w]'), [{x: 100, y: 50}, null], 'en arrivant à l\'étage : posé à sa place');
  assert.equal(J('lvSeated(__M, "x")'), true, 'à son poste : l\'étage le dessine');
  p.run('lvUpdate(__M, {x: __A, y: __A}, __E, 0);');
  assert.deepEqual(J('__M.who.y.pos'), {x: 0, y: 500}, 'un nouveau part de derrière la porte');
  assert.deepEqual(J('lvRoute(__A, __B)'), [{x: 100, y: 100}, {x: 100, y: 100}, {x: 200, y: 100}], 'même couloir : il redescend au point commun, puis repart');
  assert.deepEqual(J('lvRoute(__B, __C)'), [{x: 100, y: 100}, {x: -100, y: 100}], 'le palier seul en commun : d\'une porte à l\'autre, sans repasser par le palier');
  p.run('lvUpdate(__M, {y: __A}, __E, .1);');
  assert.equal(J('__M.who.x.leaving'), true, 'plus voulu : il redescend');
  p.run('for (let k = 0; k < 200; k++) lvUpdate(__M, {y: __A}, __E, .1);');
  assert.deepEqual(J('Object.keys(__M.who)'), ['y'], 'arrivé derrière la porte, il n\'est plus là');
  p.run(`lvUpdate(__M, {y: __A, z: Object.assign({}, __B, {delay: 2})}, __E, .1);`);
  assert.deepEqual(J('__M.who.z.pos'), {x: 0, y: 500}, 'il attend son tour dans l\'escalier');
});

test('le ✓ apparaît en grossissant, sauf en arrivant à l\'étage', () => {
  const {p, J} = page();
  p.run('var M = lvMem(); M.fresh = false;');
  assert.equal(J('lvPop(M, "a", true, 1000)'), 0, 'il vient d\'apparaître');
  assert.ok(J('lvPop(M, "a", true, 1300)') > 1, 'il grossit un peu');
  assert.equal(J('lvPop(M, "a", true, 5000)'), 1);
  p.run('M.fresh = true;');
  assert.equal(J('lvPop(M, "b", true, 1000)'), 1, 'déjà fini en arrivant : posé');
  assert.equal(J('lvPop(M, "a", false, 6000)'), 0);
});

test('2e : les trois reporters sont toujours là ; à leur poste pendant une intention, en promenade le jour, endormis le soir', () => {
  const {p, J} = page();
  p.run(`REDACTION = redactionDemo(); rdReset(); RD_LV = rdLv0(); var G = rdGeo(rdTable());`);
  assert.deepEqual(J('Object.entries(rdWant(rdTable(), G, 0)).map(([k, s]) => k + ":" + s.id)'), ['recherche:p:rech', 'redaction:p:red', 'critique:p:cri'], 'une intention : chacun à son poste');
  p.run('RD_LV = rdLv0(); var __w = rdWant(null, G, 0, () => .9);');
  const ids = J('Object.values(__w).map(s => s.id)');
  assert.equal(new Set(ids).size, 3, 'jamais deux à la même place');
  assert.ok(ids.every(id => !id.startsWith('p:')), 'tirage haut : en promenade');
  p.run(`T = DAY0 + 22.5 * 36e5; RD_LV = rdLv0();`);
  assert.deepEqual(J('Object.values(rdWant(null, G, 0)).map(s => s.id)'), ['p:rech', 'p:red', 'p:cri'], 'le soir : à leur poste');
  assert.equal(J('RD_LV.sleep'), true, 'ils somnolent (z Z)');
});

test('2e : le boss épingle la nouvelle intention avant qu\'elle démarre, et porte chaque ticket tamponné à Jira', () => {
  const {p, J} = page();
  p.run(`REDACTION = {tables: []}; rdReset(); RD_LV = rdLv0(); RD_LV.fresh = false;
    REDACTION.tables = [{run: 'n1', poste: 'recherche', intention: 'Une intention', composants: [], tickets: [{i: 0, summary: 'T', etat: 'gate'}]}];
    rdJobs(rdTable(), 0, .1);`);
  assert.equal(J('RD_LV.gate.has("n1")'), true, 'pas encore épinglée : rien ne démarre');
  assert.equal(J('RD_LV.job.kind'), 'intro');
  p.run('for (let k = 0; k < 400 && RD_LV.job && RD_LV.job.ph === "go"; k++) rdJobs(rdTable(), k * 100, .1);');
  assert.equal(J('RD_LV.job.ph'), 'act', 'au liège');
  assert.deepEqual(J('RD_LV.job.w.pos'), J('RDP(1.4, 10.6)'));
  p.run('rdJobs(rdTable(), 1e6, .1);');
  assert.equal(J('RD_LV.gate.has("n1")'), false, 'épinglée : la recherche démarre');
  p.run('for (let k = 0; k < 400 && RD_LV.job; k++) rdJobs(rdTable(), 2e6 + k * 100, .1); REDACTION.tables[0].tickets[0].etat = "ok"; rdJobs(rdTable(), 3e6, .1);');
  assert.equal(J('RD_LV.job.kind'), 'jira', 'tamponné : il le porte à la boîte Jira');
  assert.equal(J('RD_LV.pend["n1:0"]'), true, 'pas encore dans la boîte : la carte n\'est pas encore créée');
  p.run('for (let k = 0; k < 400 && RD_LV.job && RD_LV.job.ph === "go"; k++) rdJobs(rdTable(), 3e6 + k * 100, .1); rdJobs(rdTable(), 4e6, .1);');
  assert.equal(J('!!RD_LV.pend["n1:0"]'), false, 'dans la boîte');
  p.run(`RD_LV = rdLv0(); REDACTION.tables = [{run: 'n2', poste: 'recherche', intention: 'x', composants: [], tickets: []}]; rdJobs(rdTable(), 0, .1);`);
  assert.equal(J('RD_LV.job'), null, 'en arrivant à l\'étage, rien ne se rejoue');
});

test('3e : dès qu\'une PR a un bureau, son équipe monte et reste ; le bureau 1 garde la sienne ; chirurgiens, sans chantier', () => {
  const {p, J} = page();
  p.run(`RETOURS = {rooms: [], queue: [], pannes: [], events: []}; rtReset();`);
  const want = () => J('Object.keys(rtCrewWant(rtSlots())).map(id => id.split(":")[0])');
  assert.deepEqual([...new Set(want())], ['b0'], 'aucune PR : seule l\'équipe du bureau 1, qui somnole');
  p.run(`RETOURS.rooms = [{run: 'a', repo: 'dm/site', pr: '1', poste: 'fix', states: {prepare: 'ok', fix: 'run'}, since: ${at(10)}, fils: []},
    {run: 'b', repo: 'dm/site', pr: '2', poste: 'prepare', states: {prepare: 'run'}, since: ${at(10.5)}, fils: []}];`);
  assert.deepEqual([...new Set(want())], ['b0', 'b1'], 'une PR par bureau : toute son équipe');
  assert.equal(J('Object.keys(rtCrewWant(rtSlots())).filter(id => id.startsWith("b1:")).length'), J('RT_POSTES.filter(p => !p.gate).length'), 'tous ses postes, même pas encore lancés (gris)');
  assert.deepEqual(J('Object.values(rtCrewWant(rtSlots())).filter(s => s.id.startsWith("d1:")).map(s => Math.round(s.delay * 10) / 10)'), [0, .8, 1.6, 2.4, 3.2], 'l\'un après l\'autre');
  assert.equal(J('atWorker(0, 0, 0, "down", false, "x", null).gear'), null);
  assert.equal(J('RT_HELP.qui.includes("chirurgien")'), true);
});

test('tenues : sans tenue, rien par-dessus l\'agent ; debout, le gilet du chantier est à la hauteur de celui du RDC', () => {
  const {p, J} = page();
  p.run(`var __g = []; var __dg = drawGear; drawGear = (c, g) => __g.push(g);
    var __a = atWorker(0, 50, 50, 'down', false, 'x', null), __b = atWorker(1, 50, 50, 'down', false, 'x');
    drawChar(__a, 0); drawChar(__b, 0); drawGear = __dg;`);
  assert.deepEqual(J('__g'), ['chantier'], 'sans tenue (2e, 3e) : ni casque ni gilet ; au 1er : le chantier');
  p.run(`var __r = [], __x = ctx; ctx = {fillRect(x, y) { if (this.fillStyle === '#ff7a1a') __r.push(y); }, beginPath() {}, arc() {}, fill() {}};
    var __c = Object.assign(atWorker(2, 50, 100, 'down', false, 'x'), {pose: 'stand'}); drawGear(__c, 'chantier'); ctx = __x;`);
  assert.deepEqual(J('__r'), [100 - 26], 'debout : 26 px au-dessus des pieds, comme au RDC (mtKit)');
});
