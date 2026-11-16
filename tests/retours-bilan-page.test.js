// Page « Retours · bilan » (page/retours-bilan.html) : son script chargé seul (vm, sans DOM) ; lecture du dataset
// retours_bilan, agrégats (PR poussées, coût par PR et par fil, colonnes des fils, attente à ta validation, argent par
// résultat, fils perdus en route), filtres de période et de dépôt, rendu complet, fiche en onglets, textes échappés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'retours-bilan.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.RETOURS_BILAN;

const r = (run, o) => ({run, debut: '2026-11-08T10:00:00Z', ms: 1800000, repo: 'dm/site', pr: '16', titre: 'feat: <export>', auteur: 'andy',
  url: 'https://github.com/dm/site/pull/16', fils: 3, cols: {corrige: 1, test: 1, laisse: 1, reponse: 0}, controles: 'verts ✅ (rien de nouveau)',
  attente_ms: 600000, resultat: 'poussee', poste: null, tok: 20000, cout: 1.2, modele: 'claude-opus-5-5 · reasoning', agent_ms: 300000, ...o});
const DATA = {generated_at: '2026-11-09T16:00:00+00:00', periode_jours: 90, error: null,
  corrections: [
    r('run', {debut: '2026-11-09T15:00:00Z', resultat: 'en_cours', attente_ms: null, ms: null, cout: 0.9}),
    r('ok'),
    r('cut', {repo: 'dm/api', pr: '4', fils: 2, cols: {corrige: 2, test: 0, laisse: 0, reponse: 0}, resultat: 'coupee', poste: 'gate', attente_ms: 7000000, cout: 3.3}),
    r('ko', {repo: 'dm/cms', pr: '7', fils: 0, cols: {corrige: 0, test: 0, laisse: 0, reponse: 0}, resultat: 'panne', poste: 'check', attente_ms: null, cout: 0.4}),
    r('old', {debut: '2026-09-01T10:00:00Z'}),
  ],
  fiches: {ok: {fils: [{path: 'src/Domain/a.php', line: 3, who: 'pam', text: 'Renomme <x>', url: 'u1', col: 'corrige', reponse: '✅ **Corrigé** : renommé'},
    {path: 'src/b.php', line: 9, who: 'jim', text: 'Un test ?', url: 'u2', col: 'test', reponse: null}],
    controles: {verdict: 'verts ✅', cmd: 'phpunit'}, ecartes: 1,
    deroule: [{n: 'prepare', at: '2026-11-08T10:00:00Z', ms: 2000, s: 'Success'}, {n: 'fix', at: '2026-11-08T10:00:02Z', ms: 300000, s: 'Success'},
      {n: 'gate', at: '2026-11-08T10:06:00Z', ms: 600000, s: 'Success'}, {n: 'push', at: '2026-11-08T10:29:00Z', ms: 6000, s: 'Success'}]},
    cut: {fils: [], controles: null, ecartes: 0, deroule: []}},
  kpi: {value: '1 / 3', label: 'PR poussées sur les corrections lancées', short: '1 poussées'}};

test('lit le dataset retours_bilan (objet, chaîne JSON, current)', () => {
  assert.equal(B.readRetoursBilan({datasets: {retours_bilan: {current: JSON.stringify(DATA)}}}).corrections.length, 5);
  assert.equal(B.readRetoursBilan({datasets: {retours_bilan: DATA}}).corrections.length, 5);
  assert.equal(B.readRetoursBilan({datasets: {}}), null);
  assert.equal(B.readRetoursBilan({datasets: {retours_bilan: '{pas du json'}}), null);
});

test('agrégats : PR poussées, coût par PR et par fil, colonnes, attente, argent par résultat, fils perdus', () => {
  const a = B.aggregate(DATA, {jours: 30, depot: ''});
  assert.equal(a.n, 4, 'hors des 30 jours');
  assert.equal(a.fini, 3, 'en cours : hors du compte');
  assert.equal(a.poussees, 1);
  assert.equal(Math.round(a.cout * 100), 580);
  assert.equal(a.coutPoussee, 1.2);
  assert.equal(Math.round(a.coutFil * 100), 40);
  assert.deepEqual({...a.cols}, {corrige: 4, test: 2, laisse: 2, reponse: 0});
  assert.equal(a.attente, 3800000, 'médiane des attentes mesurées : 600 000 et 7 000 000');
  assert.deepEqual(Object.keys(a.argent).sort(), ['coupee', 'en_cours', 'panne', 'poussee']);
  assert.deepEqual({...a.funnel, pertes: undefined}, {recus: 8, traites: 8, valides: 3, pousses: 3, pertes: undefined});
  assert.deepEqual(a.funnel.pertes.map(p => p.r.run), ['cut', 'ko']);
  assert.equal(B.aggregate(DATA, {jours: 30, depot: 'dm/api'}).n, 1);
  assert.equal(B.aggregate(DATA, {jours: 90, depot: ''}).n, 5);
});

test('rendu complet : chiffres, sections, fiche en onglets, liens, textes échappés', () => {
  const st = {jours: 30, depot: '', sel: 'ok'};
  const h = B.render(DATA, st);
  for (const s of ['1 / 3', 'PR poussées, sur les corrections lancées', '1 coupée par un garde-fou', '1 en panne', 'Où part l\'argent',
    'Des fils aux réponses', 'Les corrections', 'site#16', 'feat: &lt;export&gt;', '2 fils dans api#4 (coupée pendant ta validation)',
    'opus-5-5', 'https://github.com/dm/site/pull/16', 'Renomme &lt;x&gt;', '✅ Corrigé : renommé', 'Analyse des retours'])
    assert.ok(h.includes(s), s);
  assert.ok(!/<details class="analyse" open/.test(h), 'l\'analyse repliée');
  const tab = t => B.render(DATA, {...st, tab: t});
  assert.ok(tab('cout').includes('🛠 Correction') && tab('cout').includes('0,40 $ par fil'));
  assert.ok(tab('deroule').includes('✋ Ta validation') && tab('deroule').includes('📤 Push'));
  assert.ok(tab('controles').includes('phpunit') && tab('controles').includes('1 fichier non suivi écarté'));
  for (const t of ['fils', 'cout', 'deroule', 'controles']) assert.ok(!/undefined|NaN/.test(tab(t)), t);
  assert.ok(B.render(DATA, {...st, sel: 'cut', tab: 'deroule'}).includes('Coupée par un garde-fou de Kronn'));
  assert.ok(B.render(DATA, {...st, sel: 'ko'}).includes('Fiche non gardée'));
  assert.ok(B.render({corrections: []}, st).includes('Aucune correction'));
});

test('les vues du récap des revues : corrections par jour, qui écrit les fils, fils corrigés, prix par jour', () => {
  const a = B.aggregate(DATA, {jours: 30, depot: ''});
  assert.deepEqual(JSON.parse(JSON.stringify(a.jours.map(j => [j.k, j.res, Math.round(j.cout * 10), j.fils, j.corr]))),
    [['08/11', {ok: 1, err: 2}, 49, 5, 4], ['09/11', {info: 1}, 9, 3, 2]], 'du plus ancien au plus récent, heure de Paris');
  assert.deepEqual(JSON.parse(JSON.stringify(a.auteurs)), {pam: {n: 1, corrige: 1}, jim: {n: 1, test: 1}});
  const h = B.render(DATA, {jours: 30, depot: '', sel: 'ok', vue: 'run', open: new Set()});
  for (const s of ['Corrections par jour', 'Qui a écrit les fils', 'Fils corrigés', 'Prix par jour', '08/11', '67 %', '4,90 $'])
    assert.ok(h.includes(s), s);
  assert.ok(!h.includes('Qui commente le plus'), 'remonté dans « Qui a écrit les fils »');
});

test('le tableau par PR : une ligne par PR, sa trajectoire, ses runs dépliés au clic', () => {
  const st = {jours: 30, depot: '', sel: 'ok', vue: 'pr', open: new Set()};
  const h = B.render(DATA, st);
  assert.ok(h.includes('3 PR · 4 runs'), 'site#16 a deux runs');
  assert.equal((h.match(/<tr class="grp"/g) || []).length, 3);
  assert.equal((h.match(/<tr class="row sub/g) || []).length, 0, 'replié');
  assert.match(h, /data-pr="dm\/site#16"[^>]*aria-expanded="false"/);
  assert.ok(h.includes('2 runs'), 'la trajectoire compte les runs');
  assert.ok(h.includes('<b>2,10 $</b>'), 'coût total de la PR : 1,20 + 0,90');
  const o = B.render(DATA, {...st, open: new Set(['dm/site#16'])});
  assert.equal((o.match(/<tr class="row sub/g) || []).length, 2, 'ses deux runs');
  assert.match(o, /aria-expanded="true"/);
  assert.ok(B.render(DATA, {...st, vue: 'run'}).includes('le plus récent d\'abord'), 'par run : le tableau d\'avant');
});
