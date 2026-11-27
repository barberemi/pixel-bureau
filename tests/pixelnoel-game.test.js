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
  bosses: [{who: 'p_jim', t: 'yeti', n: 'LE YÉTI DU LEGACY', s: 'DM-3, 400 JOURS', pv: '400 J'}],
  santa: {hp: 120, l: 'TICKETS'},
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
  assert.match(g.checkYear('pas du json').err, /accolades/);
});
