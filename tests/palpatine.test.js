// Palpatine (49-palpatine.js) : l'agent du rejeu. Il attend toujours à la salle des serveurs, de face ; pendant un run
// impl_rejeu (CFG.rejeu_wf, lignes AT_RUNS), tourné vers la baie, sa bulle suit l'étape ; à la fin, la note 5 min (run.res),
// ou la panne ; sa fiche (notes, bouton), le bouton d'un ticket terminé, le fil, la scène de la galerie, la loupe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./helpers/page.js');

const ROOT = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'bureau.config.json'), 'utf8'));
const config = {...base, models: {...base.models, rejeu: 'rej0lanc-0000-4000-8000-000000000001', impl_rejeu: 'rej0impl-0000-4000-8000-000000000002'},
  agents: [...base.agents.filter(a => a.key !== 'palpatine'), {key: 'palpatine', name: 'Palpatine', role: 'Rejouer un ticket livré', wf: ['rej0lanc'], sprite: 'palpatine', icon: '⚡'}]};
const page = load({config});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => `2026-10-01T${hm}:00+02:00`;
const S = hm => J(`(s => ({st: s.st, zone: s.zone, visit: s.visit || null, bubble: s.bubble || null, label: s.label, mode: s.palp && s.palp.mode}))(stateAt(byKey.palpatine, Date.parse('${at(hm)}')))`);
const row = (status, end, extra = '') => `{wf: 'rej0impl-0000', wf_name: 'Le Bureau · rejouer (chaîne)', run: 'rj1', status: '${status}', start: '${at('10:00')}',
  end: ${end ? `'${at(end)}'` : 'null'}, vars: {ticket: 'DM-2041'}, steps: [{n: 'ticket', k: 'Exec', s: 'Success', at: '${at('10:00')}'},
  {n: 'code', k: 'Agent', s: '${status === 'Failed' ? 'Failed' : 'Success'}', at: '${at('10:05')}'}, {n: 'note', k: 'Exec', s: 'Success', at: '${at('10:40')}'}]${extra}}`;

test('Palpatine : l\'agent du rejeu, en couleurs pleines, ses images de lancer embarquées', () => {
  assert.equal(J('palpIs(byKey.palpatine)'), true);
  assert.equal(J('palpChar().key'), 'palpatine');
  assert.equal(J('palpIs(byKey.dwight)'), false);
  assert.ok(J('!!SPR.palpatine && !!SPR.palpatine_cast'), 'sprites/common.json : planche et images de lancer');
  assert.equal(J('CFG.rejeu_wf'), 'rej0impl');
});

test('les mains : celles de palpatine-cast.json (decoupe.py eclairs)', () => {
  const hands = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'common', 'palpatine', 'palpatine-cast.json'), 'utf8'));
  assert.deepEqual(J('PALP_HANDS'), hands);
});

test('sa place : la salle des serveurs, la case la plus à droite ; la baie de gauche en face, la pièce éclairée autour', () => {
  const pl = J('palpPlace()');
  assert.deepEqual(pl.tile, [15, 3]);
  assert.equal(pl.face, 'left');
  assert.deepEqual(pl.room, {x: 13 * 32, y: 2 * 32, w: 3 * 32, h: 3 * 32});
  assert.equal(pl.rack.x, 13 * 32 + 2);
});

test('sans rejeu : il attend à sa place, de face, sans bulle', () => {
  run('AT_RUNS = [];');
  const s = S('11:00');
  assert.equal(s.st, 'idle');
  assert.equal(s.zone, 'visit');
  assert.deepEqual(s.visit, [15, 3, 'down']);
  assert.equal(s.bubble, null);
  assert.equal(s.mode, 'attend');
  assert.equal(s.label, 'Attend un ticket à rejouer');
});

test('pendant un run impl_rejeu : tourné vers la baie, sa bulle suit l\'étape (nom du poste)', () => {
  run(`AT_RUNS = [${row('Running', null)}];`);
  const s = S('10:20');
  assert.equal(s.st, 'work');
  assert.deepEqual(s.visit, [15, 3, 'left']);
  assert.equal(s.mode, 'cast');
  assert.equal(s.bubble, '⚡ DM-2041 · ⌨ Code');
  assert.equal(S('10:45').bubble, '⚡ DM-2041 · note');
  run(`byKey.palpatine._st = stateAt(byKey.palpatine, Date.parse('${at('10:20')}'));`);
  assert.equal(J('loupeKind(byKey.palpatine)'), 'palp', 'la loupe montre le rejeu qui commence');
  run(`byKey.palpatine._st = stateAt(byKey.palpatine, Date.parse('${at('09:00')}'));`);
  assert.equal(J('loupeKind(byKey.palpatine)'), null, 'au repos : rien à montrer');
});

test('fini : sa note 5 min (run.res), cible ou pas, puis il attend ; une ligne au fil', () => {
  run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 82, cible: 80, atteint: true, parts: {tests: 100, fichiers: 67, lignes: 40, juge: 70}}")}];`);
  const s = S('10:52');
  assert.equal(s.mode, 'note');
  assert.deepEqual(s.visit, [15, 3, 'down']);
  assert.equal(s.bubble, '⚡ DM-2041 · 82/100 · cible atteinte');
  assert.equal(S('10:56').mode, 'attend', 'après 5 min');
  const ev = J(`palpFeedEvents(Date.parse('${at('12:00')}')).map(e => e.txt)`);
  assert.equal(ev.length, 1);
  assert.match(ev[0], /a rejoué DM-2041 : 82\/100 · cible atteinte/);
  run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 64, cible: 80, atteint: false, parts: {}}")}];`);
  assert.equal(S('10:52').bubble, '⚡ DM-2041 · 64/100 · sous la cible 80');
});

test('en panne : la salle en alarme, sa bulle dit l\'étape ; au fil en important', () => {
  run(`AT_RUNS = [${row('Failed', '10:30')}];`);
  const s = S('10:31');
  assert.equal(s.st, 'error');
  assert.equal(s.mode, 'panne');
  assert.equal(s.bubble, '🧯 Rejeu DM-2041 · en panne : ⌨ Code');
  const ev = J(`palpFeedEvents(Date.parse('${at('12:00')}'))[0]`);
  assert.equal(ev.imp, true);
  assert.match(ev.txt, /est en panne/);
});

test('sa fiche : le rejeu en cours, ses dernières notes, le bouton Rejouer (grisé pendant un rejeu)', () => {
  const {withDom} = require('./helpers/fakedom.js');
  withDom(page, dom => {
    const side = () => { const d = dom.doc.createElement('div'); dom.doc.body.appendChild(d); page.ctx.__side = d; return d; };
    run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 82, cible: 80, atteint: true, parts: {tests: 100, fichiers: 67, lignes: 40, juge: 70}}")}];`);
    let d = side();
    run(`T = Date.parse('${at('12:00')}'); palpBlock(__side, byKey.palpatine);`);
    assert.match(d.textContent, /DM-2041 82\/100 · cible atteinte/);
    assert.match(d.textContent, /tests 100 %, fichiers 67 %, lignes 40 %, juge 70 %/);
    const b = d.querySelector('button[data-kronn-action="bureau-rejeu"]');
    assert.ok(b, 'le bouton de lancement');
    assert.equal(b.disabled, false);
    run(`AT_RUNS = [${row('Running', null)}]; T = Date.parse('${at('10:20')}');`);
    d = side();
    run('palpBlock(__side, byKey.palpatine);');
    assert.match(d.textContent, /Rejoue DM-2041 depuis/);
    assert.equal(d.querySelector('button[data-kronn-action="bureau-rejeu"]').disabled, true);
    d = side();
    run('palpBlock(__side, byKey.dwight);');
    assert.equal(d.textContent, '', 'les autres agents : rien');
  });
});

test('la fiche d\'un ticket terminé : « ⚡ Rejouer avec Palpatine », le ticket lié, Palpatine sur le bouton', () => {
  const {withDom} = require('./helpers/fakedom.js');
  withDom(page, dom => {
    const d = dom.doc.createElement('div'); dom.doc.body.appendChild(d); page.ctx.__box = d;
    run(`AT_RUNS = []; T = Date.parse('${at('12:00')}'); palpTicketButton(__box, 'DM-2041');`);
    const b = d.querySelector('button[data-kronn-action="bureau-rejeu-ticket"]');
    assert.ok(b);
    assert.match(b.textContent, /Rejouer avec Palpatine/);
    assert.deepEqual(JSON.parse(b.getAttribute('data-kronn-bindings')), {cas: 'DM-2041'});
    assert.match(d.textContent, /Palpatine rejoue le ticket/);
  });
  assert.equal(J("actAgent('bureau-rejeu-ticket').key"), 'palpatine');
  assert.equal(J("actAgent('bureau-rejeu').key"), 'palpatine');
});

test('la galerie : sa scène, il lance puis rejoue', () => {
  const g = J("galleryScenes().filter(s => s.ico === '⚡').map(s => ({n: s.n, ok: s.ok}))");
  assert.deepEqual(g, [{n: 'Palpatine rejoue un ticket', ok: true}]);
  run(`AT_RUNS = []; SCENE_DEMO = {flag: 'palp', s: Date.parse('${at('11:00')}')};`);
  assert.equal(J(`palpMoment(Date.parse('${at('11:00')}') + 1000).mode`), 'lance');
  assert.equal(S('11:01').mode, 'cast');
  assert.equal(S('11:01').bubble, '⚡ DM-7457 · 🧪 Tests'.replace('🧪 Tests', J("atStepName('controles')")));
  const {withDom} = require('./helpers/fakedom.js');
  withDom(page, dom => { const d = dom.doc.createElement('div'); page.ctx.__d = d; run(`T = Date.parse('${at('11:01')}'); palpBlock(__d, byKey.palpatine);`);
    assert.match(d.textContent, /Rejoue DM-7457 : /, 'sa fiche pendant la démonstration'); });
  run('SCENE_DEMO = null;');
});

test('sans le rejeu installé : personne n\'est Palpatine, rien ne change', () => {
  const {rejeu, impl_rejeu, ...models} = base.models;
  const p = load({config: {...base, models, agents: base.agents.filter(a => a.key !== 'palpatine')}});
  assert.equal(JSON.parse(p.run('JSON.stringify(chars.some(palpIs))')), false);
  assert.equal(JSON.parse(p.run('JSON.stringify(palpFeedEvents(Date.now()))')).length, 0);
});
