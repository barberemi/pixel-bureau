// Le canard d'équipe (39-duckgame.js) : stade selon les points déployés du sprint avant l'instant affiché (rejeu), rapportés
// à la cible du cron ; accessoires des succès (un seul couvre-chef, rien sur l'œuf ni le caneton) ; canetons ; loupe sur un
// changement de stade et sur un caneton né ; sans données, le canard de bain d'avant. Rien par personne.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`2026-10-${d}T${hm}:00+02:00`);

// sprint du 5 au 16 : 4 tickets déployés (5, 5, 8, 2 points) à des heures connues, un ticket en cours ; cible 20 points
function setup(trophies = {}, extra = '') {
  run(`TEAM = {sprint: {name: 'S2', start: '${new Date(at('05', '09:00')).toISOString()}', end: '${new Date(at('16', '17:00')).toISOString()}'},
    people: [{name: 'Pam', tickets: [
      {key: 'DM-1', cat: 'done', points: 5, since: '${new Date(at('06', '10:00')).toISOString()}'},
      {key: 'DM-2', cat: 'done', points: 5, since: '${new Date(at('07', '10:00')).toISOString()}'},
      {key: 'DM-3', cat: 'done', points: 8, since: '${new Date(at('08', '10:00')).toISOString()}'},
      {key: 'DM-4', cat: 'doing', points: 3}]}],
    unassigned: [{key: 'DM-5', cat: 'done', points: 2, since: '${new Date(at('09', '15:00')).toISOString()}'}]};
    DUCKGAME = {generated_at: 'x', sprint: {name: 'S2'}, target: 20, canetons: 3, streak: 1,
      sprints: [{name: 'S1', done: 30, target: 25, held: true}], trophies: ${JSON.stringify(trophies)}}; ${extra}`);
}

test('sans données, le canard de bain d\'avant, sans canetons ni accessoires', () => {
  run('DUCKGAME = null');
  assert.deepEqual(J(`duckLook(${at('07', '12:00')})`), {stage: 'bain', acc: [], kids: 0});
});

test('le stade suit les points déployés avant l\'instant affiché (rejeu), en % de la cible', () => {
  setup();
  const stage = t => J(`duckLook(${t}).stage`);
  assert.equal(stage(at('05', '12:00')), 'oeuf');       // 0 / 20
  assert.equal(stage(at('06', '12:00')), 'caneton');    // 5 / 20 = 25 %
  assert.equal(stage(at('07', '12:00')), 'bain');       // 10 / 20 = 50 %
  assert.equal(stage(at('08', '12:00')), 'detective');  // 18 / 20 = 90 %
  assert.equal(stage(at('09', '16:00')), 'sage');       // 20 / 20 = 100 %
  run(`DUCKGAME.target = 16`);
  assert.equal(stage(at('09', '16:00')), 'dore');       // 20 / 16 = 125 %
});

test('accessoires des succès : un seul couvre-chef (le plus rare), le caneton aussi, rien sur l\'œuf', () => {
  setup({zero_panne: {ok: true}, leve_tot: {ok: true}, triple: {ok: true}, bavard: {ok: false}});
  assert.deepEqual(J(`duckLook(${at('08', '12:00')}).acc`).sort(), ['couronne', 'lunettes']); // couronne plutôt que casquette
  assert.deepEqual(J(`duckLook(${at('06', '12:00')}).acc`).sort(), ['couronne', 'lunettes']); // caneton
  assert.deepEqual(J(`duckLook(${at('05', '12:00')}).acc`), []); // œuf
  assert.equal(J(`duckLook(${at('08', '12:00')}).kids`), 3);
});

test('dessins : chaque stade et chaque accessoire, sur ses 3 vues', () => {
  const n = J(`(() => { let n = 0; for (const v of ['front', 'side', 'back']) { for (const s of DUCK_STAGES) { duckGameImg(v, s.id); n++; }
    for (const x of DUCK_TROPHIES) { duckGameImg(v, 'detective', [x.acc]); n++; } } return n; })()`);
  assert.equal(n, 3 * (6 + 6));
});

test('loupe : un événement par stade du sprint, et un caneton né dans les 2 h qui suivent le début d\'un sprint après un sprint tenu', () => {
  setup({}, `DUCK_POS = {x: 100, y: 100, moving: false};`);
  const ev = t => J(`duckLoupeEvents(${t}).map(e => e.id + ' | ' + e.cs[0]._st.label)`);
  assert.deepEqual(ev(at('07', '12:00')), ['duck:S2:bain | Devient canard de bain · 50 % de la cible']);
  const first = ev(at('05', '10:00'));
  assert.equal(first.length, 2);
  assert.match(first[0], /^duck:S2:oeuf \| Nouveau sprint/);
  assert.equal(first[1], 'hatch:S2 | Un caneton est né : le sprint S1 est tenu (3 en tout)');
  run(`DUCKGAME.sprints[0].held = false`);
  assert.equal(ev(at('05', '10:00')).length, 1);
});

test('la fiche : son sprint, ses canetons et ses trophées, sans un chiffre par personne', () => {
  setup({zero_panne: {ok: true, period: 'sem. du 5 oct.'}, relu_24h: {ok: false, progress: '6 / 8'}});
  const html = J(`(() => { const out = [], fs = foldSection, ce = document.createElement, t0 = T; T = ${at('08', '12:00')};
    const el = () => ({children: [], style: {}, innerHTML: '', textContent: '', appendChild(c) { this.children.push(c); return c; },
      getContext: () => ({drawImage() {}, fillRect() {}})});
    document.createElement = el;
    foldSection = (side, id, title, count) => { const b = el(); out.push({title, count, b}); return b; };
    try { renderDuckGame(el()); } finally { foldSection = fs; document.createElement = ce; T = t0; }
    const txt = e => [e.innerHTML || '', e.textContent || '', ...(e.children || []).map(txt)].join(' ');
    return out.map(o => [o.title, o.count, txt(o.b)]); })()`);
  assert.deepEqual(html.map(h => h[0]), ['Son sprint', 'Ses trophées']);
  assert.equal(html[1][1], '1 / 6');
  assert.match(html[0][2], /Canard détective/);
  assert.match(html[0][2], /18 \/ 20 pts/);
  assert.match(html[0][2], /1 caneton/);
  assert.match(html[1][2], /gagné · sem\. du 5 oct\./);
  assert.match(html[1][2], /6 \/ 8/);
  assert.doesNotMatch(html.map(h => h[2]).join(' '), /Pam/);
  // gagné mais pas encore porté (succès de la semaine passée, daté du lundi à l'ouverture)
  setup({zero_panne: {ok: true, at: new Date(at('12', '08:00')).toISOString()}});
  const soon = J(`(() => { const out = [], fs = foldSection, ce = document.createElement, t0 = T; T = ${at('10', '12:00')};
    const el = () => ({children: [], style: {}, innerHTML: '', textContent: '', className: '', appendChild(c) { this.children.push(c); return c; },
      getContext: () => ({drawImage() {}, fillRect() {}})});
    document.createElement = el; foldSection = () => { const b = el(); out.push(b); return b; };
    try { renderDuckGame(el()); } finally { foldSection = fs; document.createElement = ce; T = t0; }
    const txt = e => [e.innerHTML || '', ...(e.children || []).map(txt)].join(' '); return txt(out[1]); })()`);
  assert.match(soon, /gagné · le porte lundi à 08:00/);
});

// ---------- petites scènes de 3 s (43-fx.js) ----------
test('un succès daté ne se porte qu\'à partir de sa date (rejeu)', () => {
  setup({zero_panne: {ok: true, at: new Date(at('07', '08:00')).toISOString()}});
  assert.deepEqual(J(`duckLook(${at('06', '12:00')}).acc`), []);
  assert.deepEqual(J(`duckLook(${at('07', '12:00')}).acc`), ['lunettes']);
});

test('scènes datées : succès débloqué, éclosion (œuf vers caneton), changement de stade, mue, caneton né', () => {
  setup({leve_tot: {ok: true, at: new Date(at('08', '10:42')).toISOString()}});
  const ev = t => J(`fxEvents(${t}).map(e => e.kind + (e.to ? ':' + e.to : '') + (e.tr ? ':' + e.tr.id : ''))`);
  assert.deepEqual(ev(at('05', '09:03')), ['stage:oeuf', 'kid']);               // début du sprint : mue, et un caneton né (S1 tenu)
  assert.deepEqual(ev(at('06', '10:05')), ['hatch:caneton']);                    // 5 / 20 : l'œuf éclot
  assert.deepEqual(ev(at('07', '10:05')), ['stage:bain']);
  assert.deepEqual(ev(at('08', '10:05')), ['stage:detective']);
  assert.deepEqual(ev(at('08', '10:45')), ['trophy:leve_tot']);
  assert.deepEqual(ev(at('08', '11:00')), []);                                   // plus de 10 min après : fini
});

test('pendant la scène : la casquette n\'est pas encore sur lui, l\'ancien stade reste jusqu\'au « pouf »', () => {
  setup({leve_tot: {ok: true}});
  const look = J(`(() => { FX.cur = new Map([['a', {kind: 'trophy', t0: 1000, tr: DUCK_TROPHIES[1]}], ['b', {kind: 'stage', t0: 1000, from: 'bain', to: 'detective'}]]);
    const l0 = fxDuckLook({stage: 'detective', acc: ['casquette'], kids: 3}, 1500), l1 = fxDuckLook({stage: 'detective', acc: ['casquette'], kids: 3}, 4500);
    FX.cur = new Map(); return [l0, l1]; })()`);
  assert.deepEqual(look[0], {stage: 'bain', acc: [], kids: 3});
  assert.deepEqual(look[1], {stage: 'detective', acc: ['casquette'], kids: 3});
});

test('agent rétabli : un run réussi juste après un échec qui l\'avait envoyé aux toilettes', () => {
  const r = J(`agentRecoveries({runs: [
    {run: 'a', status: 'Failed', _s: 0, _ve: 60e3}, {run: 'b', status: 'Success', _s: 20 * 60e3, _ve: 21 * 60e3},
    {run: 'c', status: 'Success', _s: 30 * 60e3, _ve: 31 * 60e3},
    {run: 'd', status: 'Failed', _s: 40 * 60e3, _ve: 41 * 60e3}, {run: 'e', status: 'Success', _s: 3 * 3600e3, _ve: 3 * 3600e3 + 60e3}]})`);
  assert.deepEqual(r.map(x => x.run), ['b']); // e : l'échec d'avant date de plus de 40 min, il n'était plus aux toilettes
});
