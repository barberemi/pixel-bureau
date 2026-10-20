// Console Support (48-support.js, #62) : dataset support, état de chaque fil (gate en attente et runs du jour d'abord),
// nombre à traiter sur l'écran du boss, infobulle au survol, réponse au format du fil, démo.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const th = (id, state, extra = {}) => ({id, from: 'Beesly, Pam', at: '2026-10-01T08:00:00Z', text: 'Le flux est vide', url: 'https://teams.example/' + id,
  state, by: null, mine: null, run: null, replies: 0, ...extra});
const set = threads => run(`SUPPORT = ${JSON.stringify({name: 'Support Scranton', threads})}; GATES = []; T = Date.parse('2026-10-01T12:00:00+02:00');`);

test('lecture du dataset : objet ou chaîne JSON, current des datasets Kronn ; sans threads -> null', () => {
  const d = {generated_at: 'x', threads: []};
  assert.deepEqual(J(`readSupport({datasets: {support: {current: ${JSON.stringify(JSON.stringify(d))}}}})`), d);
  assert.equal(J('readSupport({datasets: {support: {current: {}}}})'), null);
  assert.equal(J('readSupport({datasets: {}})'), null);
});

test('à traiter : nouveaux, à relancer et réponses à valider ; pas ceux en cours, répondus, ignorés', () => {
  set([th('1', 'new'), th('2', 'run'), th('3', 'gate'), th('4', 'done'), th('5', 'answered', {by: 'Schrute, Dwight'}), th('6', 'ignored'), th('7', 'failed'),
       th('8', 'resolved'), th('9', 'relaunched', {by: 'Schrute, Dwight'})]);
  assert.deepEqual(J('spTodo().map(t => t.id)'), ['1', '3', '7', '9'], 'relancé : de nouveau à traiter ; ✅ traité : hors du compte');
  assert.equal(J('supportOn()'), true);
  run('TV = true;');
  assert.equal(J('supportOn()'), true, 'en mode TV : l\'écran du boss et l\'agent restent en alerte');
  assert.equal(J('supportOpenable()'), false, 'mais la fenêtre ne s\'ouvre pas');
  run('TV = false;');
});

test('la gate en attente et les runs du jour (message_id) passent avant le relevé', () => {
  set([th('1', 'new', {run: {run: 'r1', status: 'Running', at: '2026-10-01T08:10:00Z'}})]);
  run(`GATES = [{run: 'r1', gate: 'gate', message: 'x'}];`);
  assert.equal(J("spState(SUPPORT.threads[0]).k"), 'gate');
  run(`GATES = []; DATA = {...DATA, runs: [{run: 'r2', status: 'Running', start: '2026-10-01T09:00:00Z', vars: {message_id: '1'}, steps: []}]};`);
  assert.equal(J("spState(SUPPORT.threads[0]).k"), 'run');
  run(`DATA.runs[0].status = 'Failed'; DATA.runs[0].steps = [{n: 'investigate'}, {n: 'gate'}];`);
  assert.equal(J("spState(SUPPORT.threads[0]).k"), 'ignored', 'refusée à la gate : rien de posté');
  run(`DATA.runs[0].steps = [{n: 'investigate'}];`);
  assert.equal(J("spState(SUPPORT.threads[0]).k"), 'failed');
  run(`DATA.runs = [];`);
});

test('infobulle : canal, nombre à traiter, auteur (prénom) et heure du dernier', () => {
  set([th('1', 'new', {at: '2026-10-01T14:42:00Z', from: 'Bernard, Andy'}), th('2', 'gate', {at: '2026-10-01T08:00:00Z'})]);
  run(`T = Date.parse('2026-10-01T18:00:00+02:00');`);
  assert.equal(J('supportTip()'), '💬 Support Scranton : 2 à traiter · dernier : Andy, 16:42 · clic : ouvrir');
  set([th('1', 'done')]);
  assert.equal(J('supportTip()'), '💬 Support Scranton : rien à traiter · clic : ouvrir');
});

test('réponse au format du fil : libellés en gras, texte échappé, mention en italique', () => {
  assert.equal(J(`spReply('🔎 Cause : le cron <RSS> a échoué\\n\\n🛠️ Action : relancé')`),
    '🔎 <b>Cause</b> : le cron &lt;RSS&gt; a échoué<br>🛠️ <b>Action</b> : relancé<br><br><i>Généré de manière automatique 🤖</i>');
});

test('texte d\'un message : échappé, retours à la ligne, adresses https en liens (jamais du HTML du message)', () => {
  assert.equal(J(`spText('<b>x</b> voir https://a.example/p?q=1\\nMerci')`),
    '&lt;b&gt;x&lt;/b&gt; voir <a href="https://a.example/p?q=1" target="_blank" rel="noopener">https://a.example/p?q=1</a><br>Merci');
  assert.equal(J(`spText('javascript:alert(1) http://x.example')`), 'javascript:alert(1) http://x.example', 'seulement https');
});

test('écran du boss : en alerte seulement s\'il y a quelque chose à traiter', () => {
  set([th('1', 'done')]);
  assert.equal(J('supportScreen(0, 0, 0)'), false);
  set([th('1', 'new')]);
  assert.equal(J('supportScreen(0, 0, 0)'), true);
});

test('démo : un fil par état, deux à traiter', () => {
  run(`SUPPORT = supportDemo(); GATES = []; T = DAY0 + 11 * 36e5;`);
  assert.deepEqual(J('SUPPORT.threads.map(t => t.state)'), ['new', 'run', 'gate', 'done', 'answered', 'resolved']);
  assert.equal(J('spTodo().length'), 2);
});

test('agent Support : en alerte (hologramme rouge, « 🚨 N à traiter »), à son poste même sans run ; « 🧯 Feu éteint » après une réponse', () => {
  set([th('1', 'new'), th('2', 'gate')]);
  run(`globalThis.__a = chars.find(c => c.key === 'nellie'); __a._st = {st: 'idle'};`);
  assert.equal(J('spAgent() === __a'), true, 'l\'agent dont le workflow est celui du modèle support');
  assert.deepEqual(J(`(s => [s.st, s.zone, s.bubble])(supportAgentState(__a, {st: 'off', label: 'Absent'}, T))`), ['idle', 'desk', '🚨 2 à traiter']);
  assert.equal(J('supportHot(__a)'), true);
  assert.equal(J('holoStyleOf(__a) === HOLO_STYLE.rouge'), true);
  assert.equal(J(`supportAgentState(__a, {st: 'work', bubble: 'x'}, T).bubble`), 'x', 'au travail : sa bulle de travail');
  set([th('1', 'done', {mine: {at: new Date(Date.parse('2026-10-01T12:00:00+02:00') - 60e3).toISOString(), text: 'x'}})]);
  run(`__a._st = {st: 'idle'};`);
  assert.equal(J(`supportAgentState(__a, {st: 'idle', label: 'Au repos'}, T).bubble`), '🧯 Feu éteint');
  assert.equal(J('holoStyleOf(__a) === HOLO_STYLE.leger'), true, 'feu éteint : cyan léger');
  run(`T += 5 * 60e3;`);
  assert.equal(J(`supportAgentState(__a, {st: 'idle', label: 'Au repos'}, T).bubble || null`), null);
  assert.equal(J(`holoStyleOf({holo: 'rouge'}) === HOLO_STYLE.rouge && holoStyleOf({}) === null`), true, 'holo fixe, ou l\'hologramme habituel');
});

test('bulle d\'un personnage assis au bord droit du plan : de l\'autre côté de lui, jamais hors du plan', () => {
  set([th('1', 'new')]);
  const r = J(`(() => {
    const c = chars.find(x => x.key === 'nellie'), s = SEATS.reduce((a, b) => b.x > a.x ? b : a);
    Object.assign(c, {present: true, moving: false, dir: 'down', tile: [s.x, s.y], pos: {x: W - 20, y: tileCenter(s.x, s.y).y},
      _st: {st: 'idle', bubble: '🚨 2 à traiter à traiter à traiter'}});
    BUBBLE_BOXES = []; drawOverlay(c, 0);
    const b = BUBBLE_BOXES[BUBBLE_BOXES.length - 1];
    return {bx: b.x, w: b.w, W, cx: c.pos.x};
  })()`);
  assert.ok(r.bx + r.w <= r.W - 2, `bulle dans le plan (${r.bx} + ${r.w} > ${r.W})`);
  assert.ok(r.bx + r.w <= r.cx, 'à gauche du personnage, qui est au bord droit');
});

test('mode TV, « EN DIRECT » : arrivée du jour et un rappel par heure d\'attente, seulement pour les fils que personne n\'a pris', () => {
  set([th('1', 'new', {at: '2026-10-01T07:40:00Z', subject: 'Flux RSS vide'}), th('2', 'answered', {at: '2026-10-01T07:00:00Z', by: 'Schrute, Dwight'})]);
  run(`T = Date.parse('2026-10-01T12:10:00+02:00');`);
  assert.deepEqual(J('spTicker().map(e => [new Date(e.t).toISOString(), e.tx])'), [
    ['2026-10-01T07:40:00.000Z', '🚒 Support : nouveau message de Pam, « Flux RSS vide »'],
    ['2026-10-01T09:40:00.000Z', '🚒 Support : le message de Pam attend depuis 2 h, « Flux RSS vide »']]);
  assert.equal(J(`spReacts(['✅', '👍', '👍', 'custom'])`), '<span class="sp-r">✅</span><span class="sp-r">👍 2</span><span class="sp-r">🙂+</span>');
});
