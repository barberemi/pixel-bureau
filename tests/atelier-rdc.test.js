// Le 1er étage vu du RDC (69-atelier-rdc.js) : ses moments dans le fil, ses tickets dans ⌘K, ses postes au travail dans
// « Qui fait quoi » (page et mode TV), une tuile en haut de page ; tout mène à l'étage.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const H = h => `new Date(DAY0+${h}*36e5).toISOString()`;
const room = (r, extra = {}) => ({run: r, ticket: 'DM-' + r, title: 'Ticket ' + r, repo: 'dm/site', poste: 'code', states: {cadrage: 'ok'}, tok: 1000, since: 'S', ...extra});
// un atelier : deux bureaux (le 2e attend ton plan, le 1er est revenu au code après un bloquant de Sécurité), un ticket en
// file, une panne ; les moments du jour (et un d'hier, qui ne compte pas)
function setAtelier(events = true) {
  run(`AT_MEM.slot = {}; ATELIER = {rooms: [
      ${JSON.stringify(room('1', {back: true, states: {cadrage: 'ok', securite: 'bloq', code: 'run'}}))},
      ${JSON.stringify(room('2', {poste: 'gate', gate: 'gate_plan', states: {cadrage: 'ok', gate: 'wait'}}))}].map(r => ({...r, since: ${H(9)}})),
    queue: [{run: 'q', ticket: 'DM-q', since: ${H(10)}}],
    pannes: [{run: 'p', ticket: 'DM-p', title: 'Bandeau', repo: 'dm/api', poste: 'tests', since: ${H(8)}}],
    ${events ? `events: [
      {t: ${H(-3)}, k: 'sort', run: 'v', ticket: 'DM-v'},
      {t: ${H(8)}, k: 'panne', run: 'p', ticket: 'DM-p', poste: 'tests'},
      {t: ${H(9)}, k: 'arrive', run: '1', ticket: 'DM-1', title: 'Ticket 1'},
      {t: ${H(9.5)}, k: 'gate', run: '2', ticket: 'DM-2', gate: 'gate_plan'},
      {t: ${H(10)}, k: 'back', run: '1', ticket: 'DM-1'},
      {t: ${H(10.5)}, k: 'sort', run: 'x', ticket: 'DM-x', title: 'Fini'},
      {t: ${H(13)}, k: 'sort', run: 'y', ticket: 'DM-y'}],` : ''}
    livres: 7};`);
}

test('fil : les moments du jour à l\'heure affichée, chacun mène à l\'étage ; rien d\'hier ni d\'après', () => {
  setAtelier();
  const ev = J(`atFeedEvents(DAY0 + 12 * 36e5).map(e => ({at: e.at, ty: e.ty, team: e.team, txt: e.txt.replace(/<[^>]+>/g, '')}))`);
  assert.deepEqual(ev.map(e => e.at), ['p', '1', '2', '1', 'x']);
  assert.deepEqual(ev.map(e => e.ty), ['agents', 'tickets', 'toi', 'agents', 'pr']);
  assert.match(ev[0].txt, /DM-p : 🧪 Tests en panne/);
  assert.match(ev[1].txt, /DM-1 arrive au 1er étage bureau 1 · Ticket 1/);
  assert.match(ev[2].txt, /DM-2 t'attend au 1er « ton plan »/);
  assert.match(ev[3].txt, /Sécurité bloque DM-1 : retour au code/, 'le poste qui bloque, lu dans le bureau');
  assert.match(ev[4].txt, /DM-x sort en PR/);
  assert.deepEqual(ev.map(e => !!e.team), [false, true, false, false, true], 'arrivées et sorties dans le bandeau de la TV');
  run('T = DAY0 + 12 * 36e5; renderFeed()');
  assert.ok(J('FEED_EV.filter(e => e.at).length') >= 1, 'dans le fil de la page');
});

test('fil : « En ce moment », la gate du 1er qui t\'attend, depuis son ouverture', () => {
  setAtelier();
  const p = J('atFeedPins(DAY0 + 12 * 36e5)');
  assert.equal(p.length, 1);
  assert.equal(p[0].at, '2');
  assert.equal(p[0].t, J('DAY0 + 9.5 * 36e5'));
  assert.match(p[0].txt, /DM-2.*t'attend au 1er.*ton plan.*bureau 2/);
});

test('fil : la démo tire ses moments de ses bureaux, de sa panne et de ses tickets sortis', () => {
  run('ATELIER = atelierDemo(); AT_MEM.slot = {};');
  const ks = J('atEvents().map(e => e.k)');
  for (const k of ['arrive', 'gate', 'back', 'panne', 'sort']) assert.ok(ks.includes(k), k);
  assert.equal(ks.filter(k => k === 'sort').length, J('ATELIER.livres'));
});

test('⌘K : un ticket du 1er par sa clé, son titre ou son poste ; le choisir monte à l\'étage sur sa fiche', () => {
  setAtelier();
  const f = q => J(`srFind(${JSON.stringify(q)}).filter(r => r.g === '1er étage').map(r => r.k + ' | ' + r.txt)`);
  assert.deepEqual(f('DM-1'), ['DM-1 | bureau 1 · 🔒 retour au code · Ticket 1']);
  assert.deepEqual(f('ticket 2'), ['DM-2 | bureau 2 · ✋ t\'attend · Ticket 2']);
  assert.deepEqual(f('code'), ['DM-1 | bureau 1 · 🔒 retour au code · Ticket 1'], 'le poste en cours');
  assert.deepEqual(f('securite'), ['DM-1 | bureau 1 · 🔒 retour au code · Ticket 1'], 'le poste qui bloque');
  assert.deepEqual(f('DM-q'), ['DM-q | entrepôt · attend un bureau libre']);
  assert.deepEqual(f('tests panne'), ['DM-p | 🧯 en panne à 🧪 Tests · Bandeau']);
  run(`FLOOR = 0; srFind('DM-2').find(r => r.g === '1er étage').go();`);
  assert.deepEqual(J('[FLOOR, ATSEL, AT_PICK]'), [1, '2', null]);
  run(`srFind('DM-p').find(r => r.g === '1er étage').go();`);
  assert.deepEqual(J('[FLOOR, ATSEL, AT_PICK]'), [1, null, {kind: 'panne', run: 'p'}]);
  run('setFloor(0)');
});

test('Qui fait quoi : un poste par bureau occupé, la gate en premier pour toi ; en mode TV aussi', () => {
  setAtelier();
  const rows = J('atWhoRows(DAY0 + 12 * 36e5)');
  assert.deepEqual(rows.map(x => [x.i, x.name, x.st, x.attn]), [[0, 'Retour au code', 'error', false], [1, 'T\'attend', 'gate', true]]);
  assert.equal(rows[1].since, J('sinceTxt(2.5 * 36e5)'), 'depuis l\'ouverture de la gate');
  assert.equal(rows[1].sub, '« ton plan »');
  const html = J('atWhoHtml(DAY0 + 12 * 36e5)');
  assert.match(html, /1er étage/);
  assert.equal((html.match(/data-at-run=/g) || []).length, 2);
  assert.match(J('atTvWhoHtml(DAY0 + 12 * 36e5)'), /<h2>1er étage<\/h2>.*bureau 2/s);
  run('ATELIER = {rooms: [], queue: [], pannes: []}; AT_MEM.slot = {};');
  assert.equal(J('atWhoHtml(DAY0)'), '');
  assert.equal(J('atTvWhoHtml(DAY0)'), '');
});

test('chiffres du haut : bureaux, gates qui t\'attendent, sortis aujourd\'hui à l\'heure affichée, file, pannes ; la tuile monte à l\'étage', () => {
  setAtelier();
  assert.deepEqual(J('atKpi(DAY0 + 12 * 36e5)'), {rooms: 2, wait: 1, out: 1, queue: 1, pannes: 1});
  assert.equal(J('atKpi(DAY0 + 14 * 36e5).out'), 2);
  const h = J('atKpiHtml(atKpi(DAY0 + 12 * 36e5))');
  assert.match(h, /data-open="atelier"/);
  assert.match(h.replace(/<[^>]+>/g, ''), /2\/4.*✋ 1 t'attend · 🧯 1 panne · 📦 1 sorti aujourd'hui · ⏳ 1 en file/s);
  assert.equal((h.match(/class="cap/g) || []).length, 1, 'une ligne : le bandeau garde sa hauteur');
  assert.match(h, /title="Monter au 1er étage\n✋ 1 t&#39;attend · 🧯 1 panne/, 'le texte entier au survol');
  setAtelier(false);
  assert.equal(J('atKpi(DAY0 + 12 * 36e5).out'), 3, 'la démo invente ses sorties (3 au plus)');
});

test('sans atelier installé : rien au RDC', () => {
  const p = load({demo: false});
  const Jp = code => JSON.parse(p.run('JSON.stringify(' + code + ')'));
  assert.equal(Jp('atelierOn()'), false);
  assert.deepEqual(Jp('[atFeedEvents(1e15), atFeedPins(1e15), atWhoRows(1e15), atSearchRows("DM")]'), [[], [], [], []]);
  p.run('ATELIER = {rooms: [], queue: [], pannes: [], livres: 7};');
  assert.equal(Jp('atKpi(1e15).out'), 7, 'un dataset d\'avant les moments : le compte publié par le cron');
});
