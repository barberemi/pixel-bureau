// Pixel Noël (arcade/pixel-noel/) : la rétro de Noël sur toute l'année, variante de Sprint Quest. Les données de l'année
// (year/data) sont préparées par Claude et vérifiées par checkYear ; chaque type de boss a son dessin ; les capacités
// déclarées couvrent ce que le jeu lit et écrit.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'arcade', 'pixel-noel');
const HTML = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const CAPS = JSON.parse(fs.readFileSync(path.join(DIR, 'capabilities.json'), 'utf8'));
const SCRIPT = HTML.slice(HTML.lastIndexOf('<script>') + 8, HTML.lastIndexOf('</script>'));

function decl(name) {
  const c = new RegExp('^const ' + name + ' = .*$', 'm').exec(SCRIPT);
  if (c && /[[{]$/.test(c[0])) return SCRIPT.slice(c.index, SCRIPT.indexOf('\n];', c.index) + 3); // un tableau sur plusieurs lignes
  if (c) return c[0];
  const at = SCRIPT.search(new RegExp('^function ' + name + '\\(', 'm'));
  assert.ok(at >= 0, name + ' introuvable dans le jeu');
  let depth = 0, i = SCRIPT.indexOf('{', at);
  for (; i < SCRIPT.length; i++) {
    if (SCRIPT[i] === '{') depth++;
    else if (SCRIPT[i] === '}' && --depth === 0) break;
  }
  return SCRIPT.slice(at, i + 1);
}
function game() {
  const names = ['DEFAULT_LOOK', 'num', 'idx', 'hex', 'normLook', 'str', 'normRoster', 'BOSS_KINDS', 'checkYear'];
  const ctx = vm.createContext({});
  vm.runInContext(names.map(decl).join('\n') + '\nthis.checkYear = checkYear; this.BOSS_KINDS = BOSS_KINDS;', ctx);
  return ctx;
}
const YEAR = {
  name: '2026',
  advent: Array.from({length: 12}, (_, i) => ({l1: 'MOIS ' + (i + 1), l2: ''})),
  quiz: [{q1: 'QUI A VENDU LE PLUS', q2: 'DE PAPIER ?', a: ['JIM', 'PAM', 'DWIGHT', 'KEVIN'], ok: 2, fact: ''}],
  ai: {labels: ['01', '02'], pts: [30, 42], devs: [4, 4], at: 1, stats: [{v: '+40 %', l: 'de points'}]},
  gifts: [{n: 'LE SCRANTONICITY', s: 'DM-12'}],
  bosses: [{who: 'p_jim', t: 'yeti', n: 'LE YÉTI DU LEGACY', s: 'DM-3, 400 JOURS', hp: 4000, hits: 10}],
  weak: ['p_jim'],
  santa: {l: 'TICKETS', phases: [{hp: 120, hits: 120}, {hp: 3000, hits: 30}, {hp: 50000, hits: 500}]},
  sheets: {p_jim: {real: [{v: '42', l: 'tickets'}], fun: [], trophy: 'Le farceur'}},
};

test('le fichier est la page seule : la publication ajoute doctype, head et body', () => {
  assert.match(HTML, /^<title>Pixel Noël<\/title>/);
  assert.doesNotMatch(HTML, /<!doctype|<html|<body|<\/body>/i);
  assert.equal(HTML.split('@@ARTIFACT_URL@@').length, 2, "l'adresse de l'artefact, posée à la publication");
});

test('les capacités couvrent les documents du jeu', () => {
  const docs = new Set([...SCRIPT.matchAll(/(?:doc|collection|write)\(\s*'([^']+)'/g)].map(m => m[1].replace(/\/$/, '')));
  for (const d of ['team/roster', 'year/data', 'live/state', 'players', 'secret', 'revealed/all', 'quests/all']) assert.ok(docs.has(d), d);
  assert.ok(!docs.has('sprint/data'), "Pixel Noël a sa base à lui : pas de sprint/data");
  const rule = p => CAPS.db.rules.find(r => r.path === p);
  assert.deepEqual(rule(''), {path: '', read: 'view', write: 'admin'}, "le reste : l'hôte écrit, les joueurs lisent");
  assert.equal(rule('players/{self}').write, 'interact', 'chaque joueur écrit sa fiche (votes de la hotte compris)');
  assert.equal(rule('secret').read, 'admin');
  assert.ok(CAPS.room && CAPS.room.topics.hit, 'les coups sur les boss passent par la salle');
  assert.equal(CAPS.room.topics.clap, 'interact', 'chacun peut applaudir aux trophées');
});

test('un combat ne montre que les points de vie, jamais le nombre de coups', () => {
  for (const f of ['hpBar', 'hitFlash']) assert.doesNotMatch(decl(f), /hits/, f);
  assert.match(decl('mayHit'), /holderOf\(who\)/, "le boss d'un membre : lui seul tape");
  assert.match(decl('applyHits'), /isWeak\(by\) \? 1/, "un joueur « faible » ne fait qu'un point de dégât");
});

test('chaque type de boss a son dessin, et chaque étape sa scène', () => {
  const g = game();
  for (const k of g.BOSS_KINDS) assert.match(SCRIPT, new RegExp('^  ' + k + '\\(bx, by, t\\)\\{', 'm'), k);
  const steps = [...decl('STEPS').matchAll(/k: '(\w+)'/g)].map(m => m[1]);
  for (const k of steps) assert.match(SCRIPT, new RegExp('^SC\\.' + k + ' = ', 'm'), 'scène ' + k);
});

test("« Coller » charge l'année et l'équipe, à part", () => {
  const g = game();
  const team = {people: [{k: 'p_jim', name: 'Jim', role: 'Vendeur', look: {sh: '#3a5a8c'}, fun: [{l: 'FARCES', v: '12'}]}]};
  const r = g.checkYear(JSON.stringify({...YEAR, team}));
  assert.equal(r.err, undefined);
  assert.equal(r.data.team, undefined, "l'équipe va dans team/roster, pas dans year/data");
  assert.equal(r.team[0].k, 'p_jim');
  assert.equal(g.checkYear(JSON.stringify(YEAR)).team, null);
});

test("une année incomplète n'est pas chargée, et l'erreur dit quoi corriger", () => {
  const g = game();
  assert.match(g.checkYear(JSON.stringify({...YEAR, advent: YEAR.advent.slice(0, 11)})).err, /12 cases/);
  assert.match(g.checkYear(JSON.stringify({...YEAR, bosses: [{who: 'p_jim', t: 'dragon', n: 'X'}]})).err, /Boss 1/);
  assert.match(g.checkYear(JSON.stringify({...YEAR, ai: {pts: []}})).err, /traîneau/);
  assert.match(g.checkYear(JSON.stringify({...YEAR, santa: {phases: [{hp: 1, hits: 1}]}})).err, /3 phases/);
  assert.match(g.checkYear('pas du json').err, /accolades/);
});

function nav() {
  const names = ['STEPS', 'cur', 'POS_KEYS', 'fightId', 'withFight', 'goStep', 'enterPatch', 'next', 'prev'];
  const ctx = vm.createContext({
    isOwner: true, LIVE: {step: 0, q: 0, qr: false, d: 0, g: 0, b: 0, ph: 0, tr: 0},
    SP: () => ({quiz: [{}, {}], advent: new Array(12), gifts: [{}, {}, {}], bosses: [{}, {}, {}]}),
    trophyList: () => [1, 2], SFX: {chest() {}}, revealOrder: () => [], oldGame: () => false, resetGame() {},
    walkers: () => [], onTile: () => -1, renderAll() {}, write() {}, db: null, REV: [],
  });
  vm.runInContext('setLive = p => Object.assign(LIVE, p);\n' + names.map(decl).join('\n') + '\nthis.next = next; this.prev = prev; this.goStep = goStep; this.STEPS = STEPS;', ctx);
  ctx.at = k => ctx.STEPS.findIndex(s => s.k === k);
  return ctx;
}

test("◀ Retour recule d'un cran dans l'écran, et revenir dans un écran reprend où on l'avait laissé", () => {
  const g = nav(), L = g.LIVE;
  g.goStep(g.at('boss'));
  assert.equal(L.b, 0);
  const t0 = L.bAt;
  g.next(); g.next();
  assert.equal(L.b, 2, 'Suivant passe au boss suivant');
  g.prev();
  assert.equal(L.b, 1, 'Retour revient au boss précédent, sans quitter l\'écran');
  g.prev(); g.prev();
  assert.equal(g.STEPS[L.step].k, 'hotte', 'au premier boss, Retour change d\'écran');
  g.next(); g.next(); g.next();
  assert.equal(g.STEPS[L.step].k, 'boss');
  assert.equal(L.b, 0, 'en revenant, on retrouve le boss où on était');
  assert.equal(L.bAt, t0, 'même combat : mêmes points de vie, pas de nouvelle présentation');
});

test("le calendrier et le quiz gardent leur place quand on en sort", () => {
  const g = nav(), L = g.LIVE;
  g.goStep(g.at('advent'));
  for (let i = 0; i < 5; i++) g.next();
  assert.equal(L.d, 5);
  g.prev();
  assert.equal(L.d, 4, 'Retour referme la dernière case');
  g.goStep(g.at('quiz')); g.goStep(g.at('advent'));
  assert.equal(L.d, 4, 'les cases ouvertes restent ouvertes');
  assert.equal(L.dAt, 0, 'sans rejouer la grande case');
});
