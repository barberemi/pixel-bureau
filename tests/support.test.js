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

test('réponse au format du fil : libellés en gras, texte échappé, ligne vide entre les sections, mention sans italique', () => {
  assert.equal(J(`spReply('🔎 Cause : le cron <RSS> a échoué\\nsuite\\n\\n🛠️ Action : relancé')`),
    '🔎 <b>Cause</b> : le cron &lt;RSS&gt; a échoué<br>suite<br><br>🛠️ <b>Action</b> : relancé<br><br>Généré de manière automatique 🤖');
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
  assert.deepEqual(J('SUPPORT.threads.map(t => t.state)'), ['new', 'run', 'gate', 'done', 'answered', 'resolved', 'skipped']);
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

test('fiche de l\'agent Support : la console au lieu d\'un « Lancer » à remplir (message et projet)', () => {
  set([th('1', 'new', {subject: 'Flux RSS vide'})]);
  const html = J(`(() => { const s = {kids: [], appendChild(x) { this.kids.push(x); }}; ACTIONS.relaunch = false; spFiche(s); return s.kids[0].innerHTML; })()`);
  assert.match(html, /1 à traiter/);
  assert.match(html, /<div class="rl-s sp-t" title="Flux RSS vide">Pam, .* : Flux RSS vide<\/div>/); // une ligne, sujet entier au survol
  assert.match(J(`(() => { const s = {kids: [], appendChild(x) { this.kids.push(x); }}; spFiche(s); return s.kids[0].className; })()`), /\bsp-fiche\b/);
});

test('fil ignoré (réponse refusée à la gate) : « Investiguer » pour réessayer, comme un fil nouveau', () => {
  run(`var SP_CALLS = []; var spInvestigateOrig = spInvestigate; spInvestigate = (el, t) => SP_CALLS.push(t.id);`);
  try {
    for (const st of ['ignored', 'new', 'done']) { set([th(st, st)]); run(`spCard(SUPPORT.threads[0])`); }
    assert.deepEqual(J('SP_CALLS'), ['ignored', 'new'], 'répondu en fil : pas de nouvelle investigation');
  } finally { run('spInvestigate = spInvestigateOrig;'); }
});

test('🔕 ignoré : hors du compte, même avec un vieux run en échec ; la gate en attente passe avant', () => {
  set([th('1', 'skipped', {run: {run: 'r1', status: 'Failed', at: '2026-10-01T08:10:00Z'}}), th('2', 'new')]);
  run(`DATA = {runs: [{run: 'r1', status: 'Failed', vars: {message_id: '1'}, start: '2026-10-01T08:10:00Z', steps: []}]};`);
  assert.deepEqual(J('spTodo().map(t => t.id)'), ['2']);
  assert.equal(J('spState(SUPPORT.threads[0]).k'), 'skipped');
  run(`GATES = [{run: 'r1', gate: 'gate', message: 'x'}];`);
  assert.equal(J('spState(SUPPORT.threads[0]).k'), 'gate');
  run('GATES = []; DATA = null;');
});

test('🔕 bouton « Ignorer » sur les fils à traiter (pas sur une réponse à valider) ; « ↺ Réactiver » dans les ignorés', () => {
  run(`var SK_CALLS = []; var spSkipOrig = spSkip, spInvOrig = spInvestigate; spSkip = (el, t, label) => SK_CALLS.push([t.id, label]); spInvestigate = () => {};`);
  try {
    for (const st of ['new', 'failed', 'relaunched', 'gate', 'run', 'done', 'answered', 'resolved', 'ignored']) {
      set([th(st, st, {by: 'Schrute, Dwight', run: ['failed', 'run'].includes(st) ? {run: 'r9', status: 'Failed', at: '2026-10-01T08:10:00Z'} : null})]); run(`spCard(SUPPORT.threads[0])`);
    }
    assert.deepEqual(J('SK_CALLS'), [['new', '🔕 Ignorer'], ['failed', '🔕 Ignorer'], ['relaunched', '🔕 Ignorer']]);
    run('SK_CALLS = [];');
    set([th('1', 'skipped', {subject: 'Pot de départ'}), th('2', 'new')]);
    run(`SP_FOLD = true; spSkipped({appendChild() {}}, SUPPORT.threads.slice(0, 1)); SP_FOLD = false;`);
    assert.deepEqual(J('SK_CALLS'), [['1', '↺ Réactiver']]);
  } finally { run('spSkip = spSkipOrig; spInvestigate = spInvOrig;'); }
  assert.deepEqual(J(`bindsFor('bureau-spskip', {id: '9'})`), {message_id: '9', action: '9'}, 'Kronn relit le fil et son action (threads[].skip)');
});

test('🔕 Ignorés : une section repliée sous l\'en-tête avec le nombre ; dépliée, une ligne par fil ; sans le workflow, pas de bouton', () => {
  set([th('1', 'skipped', {subject: 'Pot de départ', skipped_at: '2026-10-01T09:00:00Z'})]);
  const kids = fold => J(`(() => { const out = [], box = {appendChild(x) { out.push(x.innerHTML); }}; SP_FOLD = ${fold};
    try { spSkipped(box, SUPPORT.threads); } finally { SP_FOLD = false; } return out; })()`);
  const shut = kids(false);
  assert.equal(shut.length, 1);
  assert.match(shut[0], /▸ 🔕 Ignorés · 1/);
  const open = kids(true);
  assert.equal(open.length, 2);
  assert.match(open[0], /▾ 🔕 Ignorés · 1/);
  assert.match(open[1], /<b>Pam<\/b> · Pot de départ/);
  assert.match(open[1], /ignoré/);
  assert.equal(J('(spSkipped({appendChild() { throw 0; }}, []), true)'), true, 'aucun ignoré : rien d\'ajouté');
  set([th('1', 'skipped'), th('2', 'new')]);
  assert.match(J('spHead()'), /1 à traiter/);
});
