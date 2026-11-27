// Page « Rejeu · bilan » (page/rejeu-bilan.html) : son script chargé seul (vm, sans DOM) ; lecture du dataset rejeu_bilan,
// chiffres sur 30 jours (cible atteinte, tests verts, parts, coût), écarts par cause et par semaine hors jeu témoin, rendu
// complet (six chiffres, courbe du jeu témoin et ⚡, carte de chaleur, tableau, détail), textes échappés, page vide.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'rejeu-bilan.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.REJEU_BILAN;

const r = (run, o) => ({run, ticket: 'DM-2041', pr: 2041, url: 'https://github.com/dm/site/pull/2041', titre: 'feat: <export>', jeu: 'rotation',
  genre: 'feat', zone: 'src/Ventes', fini_le: '2026-11-25T10:00:00+00:00', note: 82, atteint: true, escalade: false,
  parts: {tests: 1, fichiers: 0.5, lignes: 0.4, juge: 0.7}, version: 'b2c3d4e', resume: 'Même approche, <b>nommage</b> différent.',
  echecs_tests: 'aucun', ecarts: [{cause: 'choix_agent', lecon: 'Lire le service voisin.'}, {cause: 'acceptable', lecon: 'Ordre des imports.'}],
  ms: 5400000, cout: 4, ...o});
const DATA = {generated_at: '2026-11-27T16:00:00+00:00', error: null, periode_jours: 90, cible: 80, depot: 'dm/site', temoin: [101, 102],
  version: {hash: 'b2c3d4e', commit: '2222222', sujet: 'chaîne d\'après'},
  rejeux: [r('r1'),
    r('t5', {ticket: 'DM-102', pr: 102, jeu: 'temoin', note: 77, atteint: false, fini_le: '2026-11-21T12:00:00+00:00', parts: {tests: null, fichiers: 1, lignes: 0.6, juge: 0.8}, cout: 2}),
    r('esc', {ticket: 'DM-3', pr: 3, note: 40, atteint: false, escalade: true, fini_le: '2026-11-17T10:00:00+00:00', ecarts: [{cause: 'ticket_vague', lecon: 'x'}], cout: null, ms: null}),
    r('vieux', {fini_le: '2026-09-01T10:00:00+00:00'})],
  versions: [{hash: 'a1b2c3d', sujet: 'avant', debut: '2026-11-10T10:00:00+00:00', moyenne: 70, n: 2, lecons: 0},
    {hash: 'b2c3d4e', sujet: 'après', debut: '2026-11-21T10:00:00+00:00', moyenne: 78.5, n: 2, lecons: 1}],
  temoins: [{pr: 101, ticket: 'DM-101', passages: [{note: 60, version: 'a1b2c3d', fini_le: '2026-11-10T10:00:00+00:00'}, {note: 80, version: 'b2c3d4e', fini_le: '2026-11-21T10:00:00+00:00'}]},
    {pr: 102, ticket: 'DM-102', passages: [{note: 77, version: 'b2c3d4e', fini_le: '2026-11-21T12:00:00+00:00'}]}],
  lecons: {a_valider: 2, validees: 5},
  resume: {date: '2026-11-25T10:00:00+00:00', temoin: {moyenne: 79, ecart: 9, version: 'b2c3d4e', version_prec: 'a1b2c3d', n: 2},
    dernier: {ticket: 'DM-2041', pr: 2041, note: 82, cible: true, fini_le: '2026-11-25T10:00:00+00:00'}, lecons: {a_valider: 2, validees: 5}}};

test('lit le dataset rejeu_bilan (objet, chaîne JSON, current)', () => {
  assert.equal(B.readRejeuBilan({datasets: {rejeu_bilan: {current: JSON.stringify(DATA)}}}).rejeux.length, 4);
  assert.equal(B.readRejeuBilan({datasets: {rejeu_bilan: DATA}}).rejeux.length, 4);
  assert.equal(B.readRejeuBilan({datasets: {}}), null);
  assert.equal(B.readRejeuBilan({datasets: {rejeu_bilan: '{pas du json'}}), null);
});

test('chiffres sur 30 jours, écarts par semaine hors jeu témoin', () => {
  const a = B.aggregate(DATA);
  assert.equal(a.n, 3, 'hors des 30 jours');
  assert.equal(a.atteints, 1);
  assert.equal(a.tests, 1, 'moyenne des rejeux mesurés');
  assert.equal(a.nonMesures, 1);
  assert.equal(a.cout, 3, 'les rejeux sans coût relevé ne comptent pas');
  assert.equal(Math.round(a.parts.fichiers * 100), 67);
  assert.deepEqual(JSON.parse(JSON.stringify(a.semaines)),
    [{k: '2026-08-31', choix_agent: 1, acceptable: 1}, {k: '2026-11-16', ticket_vague: 1}, {k: '2026-11-23', choix_agent: 1, acceptable: 1}],
    'semaines du lundi ; le témoin (t5, 21/11) est écarté');
});

test('rendu complet : six chiffres, courbe et ⚡, PR témoins, causes, parts, tableau, détail, textes échappés', () => {
  const h = B.render(DATA, {});
  for (const s of ['⚡ Rejeu · bilan', 'dm/site', 'chaîne en service b2c3d4e', 'jeu témoin #101 #102', 'dernier rejeu · DM-2041 · cible atteinte',
    '79 <span class="up">▲ 9</span>', '1 / 3', 'cible 80 atteinte, sur 30 jours', '100 %', '5 · ⚡ 2', '3,00 $', 'Jeu témoin par version', 'cible 80',
    '>⚡<', 'Les PR témoins', 'Écarts par cause', 'Les parts de la note', '1 rejeu sans tests mesurés', 'escaladé · 40', 'feat: &lt;export&gt;',
    'Même approche, &lt;b&gt;nommage&lt;/b&gt; différent.', 'Lire le service voisin.', 'la vraie PR ↗', 'https://github.com/dm/site/pull/2041'])
    assert.ok(h.includes(s), s);
  assert.ok(!/undefined|NaN/.test(h));
  assert.ok(B.render(DATA, {sel: 't5'}).includes('jeu témoin (mesure, jamais source de leçon)'));
  assert.ok(B.render({...DATA, resume: {...DATA.resume, temoin: {...DATA.resume.temoin, ecart: -3}}}, {}).includes('▼ 3'));
  assert.ok(B.render({...DATA, resume: {...DATA.resume, temoin: {...DATA.resume.temoin, ecart: 0}}}, {}).includes('= 0'));
});

test('sans rejeu : la page le dit, avec l\'erreur du relevé s\'il y en a une', () => {
  assert.ok(B.render({rejeux: [], versions: []}, {}).includes('Aucun rejeu dans l\'historique'));
  assert.ok(B.render({rejeux: [], versions: [], error: 'API <Kronn>'}, {}).includes('API &lt;Kronn&gt;'));
  const h = B.render({...DATA, versions: [], temoins: [], resume: {lecons: {}}}, {});
  assert.ok(h.includes('pas encore été joué') && h.includes('Aucun jeu témoin réglé'));
  assert.ok(!/undefined|NaN/.test(h));
});
