// Palpatine (49-palpatine.js) : l'agent du rejeu. Il attend toujours à la salle des serveurs, de face ; pendant un run
// impl_rejeu (CFG.rejeu_wf, lignes AT_RUNS), tourné vers la baie, sa bulle suit l'étape ; à la fin, la note 5 min (run.res),
// ou la panne ; sa fiche (maintenant, dernière note, leçons à valider, bouton, bloc TÉMOIN), le bouton d'un ticket terminé, le fil, la scène de la galerie, la loupe.
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

test('sa fiche allégée : maintenant, la dernière note et son tag, le bouton (grisé pendant un rejeu), sans liste des rejeux', () => {
  const {withDom} = require('./helpers/fakedom.js');
  withDom(page, dom => {
    const side = () => { const d = dom.doc.createElement('div'); dom.doc.body.appendChild(d); page.ctx.__side = d; return d; };
    run('REJEU_SUM = null;');
    run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 82, cible: 80, atteint: true, parts: {tests: 100, fichiers: 67, lignes: 40, juge: 70}}")}];`);
    let d = side();
    run(`T = Date.parse('${at('12:00')}'); palpBlock(__side, byKey.palpatine);`);
    assert.match(d.textContent, /Maintenant Attend un ticket à rejouer/);
    assert.match(d.textContent, /Dernière note DM-2041 82\/100 cible/);
    assert.doesNotMatch(d.textContent, /fichiers 67 %/, 'les parts sont dans le bilan, plus sur la fiche');
    assert.doesNotMatch(d.textContent, /à valider/);
    assert.equal(d.querySelector('.palp-tem'), null, 'sans dataset rejeu_resume : pas de bloc témoin');
    assert.doesNotMatch(d.innerHTML, /rejeu-bilan|href=/, 'pas de lien vers la page bilan');
    const b = d.querySelector('button[data-kronn-action="bureau-rejeu"]');
    assert.ok(b, 'le bouton de lancement');
    assert.equal(b.disabled, false);
    run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 64, cible: 80, atteint: false, parts: {}}")}];`);
    d = side();
    run('palpBlock(__side, byKey.palpatine);');
    assert.match(d.textContent, /64\/100 sous 80/);
    run(`AT_RUNS = [${row('Running', null)}]; T = Date.parse('${at('10:20')}');`);
    d = side();
    run('palpBlock(__side, byKey.palpatine);');
    assert.match(d.textContent, /Maintenant Rejoue DM-2041 depuis .* : ⌨ Code/);
    assert.equal(d.querySelector('button[data-kronn-action="bureau-rejeu"]').disabled, true);
    d = side();
    run('palpBlock(__side, byKey.dwight);');
    assert.equal(d.textContent, '', 'les autres agents : rien');
  });
});

test('la dernière note : le run du jour s\'il est plus récent, sinon celle du bilan (REJEU_SUM.dernier)', () => {
  const sum = d => `REJEU_SUM = {date: '${at('09:00')}', temoin: null, dernier: ${d}, lecons: {a_valider: 0, validees: 0}};`;
  run(`AT_RUNS = []; T = Date.parse('${at('12:00')}');` + sum(`{ticket: 'DM-1990', pr: 1990, note: 71, cible: false, fini_le: '${at('09:00')}'}`));
  assert.deepEqual(J('(l => [l.ticket, l.note, l.atteint])(palpLast(T))'), ['DM-1990', 71, false]);
  run(`AT_RUNS = [${row('Success', '10:50', ", res: {ticket: 'DM-2041', pr: 2041, note: 82, cible: 80, atteint: true}")}];`);
  assert.deepEqual(J('(l => [l.ticket, l.note, l.atteint])(palpLast(T))'), ['DM-2041', 82, true], 'le run du jour est plus récent');
  run(sum(`{ticket: 'DM-2100', pr: 2100, note: 90, cible: true, fini_le: '${at('11:30')}'}`));
  assert.deepEqual(J('(l => [l.ticket, l.note, l.atteint])(palpLast(T))'), ['DM-2100', 90, true], 'le bilan est plus récent');
  run(`AT_RUNS = [${row('Failed', '11:45')}];`);
  assert.equal(J('palpLast(T).ticket'), 'DM-2100', 'un rejeu en panne n\'a pas de note');
  run('REJEU_SUM = null; AT_RUNS = [];');
  assert.equal(J('palpLast(T)'), null);
});

test('les leçons du rejeu à valider : la gate ouverte d\'abord, sinon le bilan ; le tag « ⚡ N leçons à valider ce soir »', () => {
  const {withDom} = require('./helpers/fakedom.js');
  run(`AT_RUNS = []; T = Date.parse('${at('12:00')}'); REJEU_SUM = {date: null, temoin: null, dernier: null, lecons: {a_valider: 2, validees: 5}};`);
  run('globalThis.__sand = sandRejeuLessons;');
  try {
    run('sandRejeuLessons = () => 0;');
    assert.equal(J('palpLessons()'), 2, 'pas de gate ouverte : le relevé du bilan');
    run('sandRejeuLessons = () => 3;');
    assert.equal(J('palpLessons()'), 3, 'la gate boss_rejeu ouverte, en priorité');
    withDom(page, dom => {
      const d = dom.doc.createElement('div'); page.ctx.__d = d;
      run('palpBlock(__d, byKey.palpatine);');
      assert.match(d.textContent, /⚡ 3 leçons à valider ce soir/);
    });
    run('sandRejeuLessons = () => 1;');
    withDom(page, dom => {
      const d = dom.doc.createElement('div'); page.ctx.__d = d;
      run('palpBlock(__d, byKey.palpatine);');
      assert.match(d.textContent, /⚡ 1 leçon à valider ce soir/);
    });
    run('sandRejeuLessons = () => 0; REJEU_SUM = null;');
    assert.equal(J('palpLessons()'), 0);
  } finally { run('sandRejeuLessons = globalThis.__sand; REJEU_SUM = null;'); }
});

test('le bloc TÉMOIN à côté du nom : la moyenne en gros, ▲ vert, ▼ rouge, = 0 gris, le title au survol', () => {
  const {withDom} = require('./helpers/fakedom.js');
  const tem = (moy, ec) => `REJEU_SUM = {date: null, dernier: null, lecons: {a_valider: 0, validees: 0}, temoin: {moyenne: ${moy}, ecart: ${ec}, version: 'b2c3d4e', version_prec: ${ec == null ? 'null' : "'a1b2c3d'"}, n: 5}};`;
  run(`AT_RUNS = []; T = Date.parse('${at('12:00')}');`);
  withDom(page, dom => {
    const fiche = () => { const s = dom.doc.createElement('div'), f = dom.doc.createElement('div'); f.className = 'face'; s.appendChild(f); page.ctx.__s = s; run('palpBlock(__s, byKey.palpatine);'); return {s, f}; };
    run(tem(74, 6));
    let {s, f} = fiche();
    let t = f.querySelector('.palp-tem');
    assert.ok(t, 'dans l\'en-tête de la fiche, à côté du nom');
    assert.equal(s.querySelectorAll('.palp-tem').length, 1);
    assert.match(f.className, /has-tem/);
    assert.equal(t.querySelector('.pt-l').textContent, 'TÉMOIN');
    assert.equal(t.querySelector('.pt-v').textContent, '74');
    assert.match(t.querySelector('.pt-v').getAttribute('style'), /var\(--ok\)/, 'le chiffre vert aussi');
    assert.equal(t.querySelector('.tag').textContent, '▲ 6');
    assert.match(t.querySelector('.tag').getAttribute('style'), /--c:var\(--ok\)/);
    assert.equal(t.title, 'Moyenne du jeu témoin : 74, +6 depuis la version a1b2c3d');
    run(tem(68, -3));
    t = fiche().f.querySelector('.palp-tem');
    assert.equal(t.querySelector('.tag').textContent, '▼ 3');
    assert.match(t.querySelector('.tag').getAttribute('style'), /--c:var\(--err\)/);
    assert.equal(t.title, 'Moyenne du jeu témoin : 68, -3 depuis la version a1b2c3d');
    run(tem(70, 0));
    t = fiche().f.querySelector('.palp-tem');
    assert.equal(t.querySelector('.tag').textContent, '= 0');
    assert.match(t.querySelector('.tag').getAttribute('style'), /--c:var\(--idle\)/);
    assert.equal(t.querySelector('.pt-v').getAttribute('style'), null);
    run(tem(70, null));
    t = fiche().f.querySelector('.palp-tem');
    assert.equal(t.querySelector('.tag'), null, 'pas de version précédente : pas de pastille');
    assert.equal(t.title, 'Moyenne du jeu témoin : 70 (version b2c3d4e)');
    run('REJEU_SUM = {date: null, temoin: null, dernier: null, lecons: {a_valider: 0, validees: 0}};');
    assert.equal(fiche().s.querySelector('.palp-tem'), null, 'pas encore de jeu témoin');
  });
  run('REJEU_SUM = null;');
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
