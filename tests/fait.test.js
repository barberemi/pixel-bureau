// « 👁 Ce qu'il fait » (66-fait.js) : la section de la fiche d'un agent au 1er, 2e, 3e et -1, ses trois niveaux de source,
// la bulle du plan selon les niveaux, les contrôles avec et sans lecteur, le Support sans phrases, rien en rejeu, et la
// fiche sans aucune donnée inchangée. Contenus fictifs (démo Dunder Mifflin).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const ABS = /\/(Users|home|private|tmp|var)\//;
function page() {
  const p = load();
  p.J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('T = DAY0 + 11 * 36e5; ATELIER = atelierDemo(); RETOURS = retoursDemo(); REDACTION = redactionDemo();');
  return p;
}
const agent = (p, i, k) => p.run(`atAgentHtml({kind: 'agent', i: ${i}, k: '${k}'}, atSlots())`);
const fiche = (p, i) => p.run(`atelierFicheHtml(atSlots()[${i}], ${i})`);

test('1er : la fiche de l\'agent au travail montre les trois niveaux (fichiers, compteur, détail lu)', () => {
  const p = page(), h = agent(p, 2, 'code');
  assert.match(h, /👁 Ce qu&#39;il fait/);
  assert.match(h, /agent : Claude Code/);
  assert.match(h, /📂 Fichiers touchés <span class="fa-n">7 fichiers/);
  assert.match(h, /\+ 2 autres, plus anciens/);
  assert.match(h, /🧮 Compteur de Kronn/);
  assert.match(h, /🔍 Détail <span class="fa-src">lu dans le journal de Claude Code/);
  assert.match(h, /Je relance les tests du bloc média/);
  assert.equal((h.match(/<li><time>/g) || []).length, 10);
  assert.match(h, /lance <code>git log<\/code>/, 'git avec sa sous-commande');
  assert.doesNotMatch(h, ABS);
});

test('1er : un agent sans lecteur garde le niveau 1 et le dit sobrement', () => {
  const p = page(), h = agent(p, 1, 'code');
  assert.match(h, /agent : Codex/);
  assert.match(h, /📂 Fichiers touchés/);
  assert.match(h, /Détail des actions pas encore lu pour Codex\./);
  assert.doesNotMatch(h, /🔍 Détail </);
});

test('1er : le poste fini montre son rapport, puis ses dernières actions repliées', () => {
  const p = page(), h = agent(p, 2, 'securite');
  assert.match(h, /📝 Son rapport/);
  assert.match(h, /🔒 Bloquant : renvoie au code/);
  assert.match(h, /<code>media.html.twig:14<\/code>/);
  assert.match(h, /<details class="fa-det"><summary>▸ Ses dernières actions/);
  assert.doesNotMatch(h, /👁 Ce qu/);
});

test('fiche sans aucune donnée : rendu actuel inchangé (bureau, agent), et rien en rejeu', () => {
  const p = page();
  const sans = p.run(`(() => { const r = atSlots()[2]; const f = r.fait; delete r.fait; const a = atAgentHtml({kind: 'agent', i: 2, k: 'code'}, atSlots()), b = atelierFicheHtml(r, 2); r.fait = f; return a + '§' + b; })()`);
  assert.doesNotMatch(sans, /fa-do/);
  assert.equal(fiche(p, 2), sans.split('§')[1], 'la fiche du bureau ne change qu\'aux contrôles');
  p.run('T += 3600e3;');
  assert.doesNotMatch(p.run(`atAgentHtml({kind: 'agent', i: 2, k: 'code'}, ATELIER.rooms.slice(0, 4))`), /fa-do/, 'en rejeu : rien');
});

test('bulle du plan selon les niveaux : carnet, sinon phrase lue, sinon fichiers modifiés, sinon le compteur', () => {
  const p = page();
  assert.equal(p.J(`faBulle({carnet: ['Je relance les tests du bloc média.'], d: {phrases: ['Autre chose.']}})`), '« je relance les tests du bloc… »');
  assert.equal(p.J(`faBulle({d: {phrases: ['phpstan passe.']}, diff: {n: 3}})`), '« phpstan passe »');
  assert.equal(p.J(`faBulle({d: {phrases: []}, diff: {n: 3}})`), '✏ 3 fichiers modifiés');
  assert.equal(p.J(`faBulle({k: {cat: 'Read', n: 4, at: 'x'}})`), null);
  p.run(`var __bb = [], __ab = atBubble; atBubble = (x, y, s, col, dot) => { __bb.push(s); return __ab(x, y, s, col, dot); };
    AT_MEM.fresh = true; setFloor(1); renderAtelier(1000);`);
  const bb = p.J('__bb');
  assert.ok(bb.includes('« je relance les tests du bloc… »'), 'bureau 3 : sa phrase');
  assert.ok(bb.includes('✏ 3 fichiers modifiés'), 'bureau 2 (sans lecteur) : ses fichiers');
});

test('1er, contrôles : une carte et une bulle par sous-agent lu ; sans lecteur, une ligne par rapport rendu', () => {
  const p = page();
  p.run(`const a2 = ATELIER.rooms.find(r => r.run === 'demo-a2'); Object.assign(a2, {poste: 'regles', etape: 'controles', lot: null, reprise: null,
    act: {cat: 'Agent', n: 8, at: new Date(T - 9e3).toISOString()}, fait: atDemoFait(at => new Date(DAY0 + at * 36e5).toISOString(), 'ctrl'),
    states: {cadrage: 'ok', gate: 'ok', code: 'ok', regles: 'run', securite: 'ok', tests: 'run', perf: 'skip', besoin: 'run', doc: 'ok'}});`);
  const f = fiche(p, 1);
  assert.match(f, /En ce moment : <b>👥 Contrôles<\/b> · 6 postes lancés en parallèle, 3 rapports rendus/);
  assert.match(f, /👥 Ce qu(&#39;|')ils font/);
  assert.equal((f.match(/class="fa-card /g) || []).length, 6);
  assert.match(f, /Un sous-agent par poste/);
  assert.match(agent(p, 1, 'besoin'), /fa-card run cur/);
  p.run(`var __bb = [], __ab = atBubble; atBubble = (x, y, s, col, dot) => { __bb.push(s); return __ab(x, y, s, col, dot); };
    AT_MEM.fresh = true; setFloor(1); renderAtelier(1000);`);
  const bb = p.J('__bb');
  assert.ok(bb.some(s => /^« Deux appels à l'ancien/.test(s)), 'règles : ' + bb.join(' | '));
  assert.ok(bb.some(s => /^« 5 exigences sur 6/.test(s)), 'besoin');
  p.run(`const a2b = ATELIER.rooms.find(r => r.run === 'demo-a2'); a2b.fait = {ag: 'Codex', lu: false, k: a2b.fait.k}; __bb = []; renderAtelier(1100); atBubble = __ab;`);
  assert.ok(p.J('__bb').includes('👥 3/6 rapports rendus'));
  const g = fiche(p, 1);
  assert.match(g, /Le détail par sous-agent demande un lecteur pour Codex/);
  assert.doesNotMatch(g, /Un sous-agent par poste/);
});

test('3e : la correction au travail, puis finie (actions repliées) ; sa bulle dit sa dernière phrase', () => {
  const p = page();
  const fix = p.run(`rtPosteHtml(RETOURS.rooms[0], 0, RT_POSTES.find(x => x.k === 'fix'))`);
  assert.match(fix, /👁 Ce qu&#39;il fait/);
  assert.match(fix, /Dossier de travail de la PR et Kronn/);
  assert.match(fix, /je renomme la prop autoplay/);
  assert.equal(p.J(`rtBubble(RETOURS.rooms[0], RT_POSTES.find(x => x.k === 'fix'))`), '« Fil 3 : je renomme la prop… »');
  const fini = p.run(`rtPosteHtml(RETOURS.rooms[3], 3, RT_POSTES.find(x => x.k === 'fix'))`);
  assert.match(fini, /🛠 Sa correction <span class="fa-n">finie/);
  assert.match(fini, /<details class="fa-det">/);
  p.run('delete RETOURS.rooms[0].fait;');
  assert.doesNotMatch(p.run(`rtPosteHtml(RETOURS.rooms[0], 0, RT_POSTES.find(x => x.k === 'fix'))`), /fa-do/);
});

test('2e : la revue lit les fichiers de la PR (sans diff) ; un poste de rédaction lit ses sources', () => {
  const p = page();
  const rv = p.run(`rvFicheHtml('demo-r1')`);
  assert.match(rv, /Ce qu&#39;il fait · 🔍 lecture/);
  assert.match(rv, /📖 Ce qu(&#39;|')il lit/);
  assert.doesNotMatch(rv, /Fichiers touchés/);
  assert.match(p.run(`rvFicheHtml('demo-r3')`), /pas encore lu pour Codex/);
  assert.match(p.J(`rvBubble(rvRuns().find(r => r.run === 'demo-r1'))`), /^« je cherche qui appelle/);
  const cr = p.run(`rdPosteHtml(REDACTION.tables[0], 'critique')`);
  assert.match(cr, /ses sources/);
  assert.doesNotMatch(p.run(`rdPosteHtml(REDACTION.tables[0], 'recherche')`), /fa-do/, 'un poste qui ne travaille pas : rien');
});

test('-1 : le Support montre ses actions, jamais une phrase de l\'agent', () => {
  const p = page();
  p.run('SUPPORT = supportDemo();');
  const h = p.run(`(() => { const t = SUPPORT.threads.find(x => x.id === 'd2'); return csFicheHtml({t, s: {k: 'run'}, st: {tri: 'ok', logs: 'ok', cause: 'run'}}, 0); })()`);
  assert.match(h, /👁 Ce qu&#39;il fait · 🧩 Cause/);
  assert.match(h, /Actions seulement/);
  assert.match(h, /lit <code>PromoVideo.php<\/code>/);
  assert.doesNotMatch(h, /fa-say|fa-said/);
  const avec = p.run(`(() => { const t = JSON.parse(JSON.stringify(SUPPORT.threads.find(x => x.id === 'd2'))); t.run.fait.d.phrases = ['Le client Dupont a payé.'];
    return csFicheHtml({t, s: {k: 'run'}, st: {cause: 'run'}}, 0); })()`);
  assert.doesNotMatch(avec, /Dupont/, 'même si le relevé en portait une');
});

test('tout ce qui vient du relevé est échappé', () => {
  const p = page();
  const h = p.run(`faitHtml({ag: '<b>x</b>', lu: true, d: {actions: [['2026-10-01T09:00:00Z', 'lecture', '<img src=x onerror=alert(1)>.php']], phrases: ['<script>'], compte: {lecture: 1}}})`);
  assert.doesNotMatch(h, /<img|<script>|<b>x/);
});
