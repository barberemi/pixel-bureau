// Sprint Quest, le jeu de la borne des Combles (arcade/sprint-quest/) : la source de l'artefact claude.ai, gardée dans le
// dépôt pour le republier tel quel s'il se perd. L'écran « Coller » accepte ce que copie la borne, équipe comprise ; les
// capacités déclarées couvrent ce que le jeu lit et écrit.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'arcade', 'sprint-quest');
const HTML = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const CAPS = JSON.parse(fs.readFileSync(path.join(DIR, 'capabilities.json'), 'utf8'));
const SCRIPT = HTML.slice(HTML.lastIndexOf('<script>') + 8, HTML.lastIndexOf('</script>'));

// une déclaration de premier niveau du script : « const x = … ; » sur une ligne, ou « function x(…){…} » entière
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
  const names = ['DEFAULT_LOOK', 'num', 'idx', 'hex', 'normLook', 'str', 'normRoster', 'BOSS_KINDS', 'checkSprint'];
  const ctx = vm.createContext({});
  vm.runInContext(names.map(decl).join('\n') + '\nthis.checkSprint = checkSprint;', ctx);
  return ctx;
}
const SPRINT = {
  ex: false, name: 'SPRINT 26-45', dates: '3-14 NOV', life: [5, 4, 5, 4, 4],
  stops: Array.from({length: 5}, (_, i) => ({l1: 'ARRÊT ' + i, l2: ''})),
  vs: [{l: 'TICKETS LIVRÉS', v: '3 / 5'}],
  quiz: [{q1: 'QUI A LIVRÉ LE PLUS', q2: '', a: ['JIM', 'PAM', 'DWIGHT', 'KEVIN'], ok: 0, fact: ''}],
  boss: [{t: 'snail', n: 'DM-3', s: '12 JOURS EN COURS', pv: '12 J'}],
};

test('le fichier est la page seule : la publication ajoute doctype, head et body', () => {
  assert.match(HTML, /^<title>Sprint Quest Live<\/title>/);
  assert.doesNotMatch(HTML, /<!doctype|<html|<body|<\/body>/i);
  assert.equal(HTML.split('@@ARTIFACT_URL@@').length, 2, "l'adresse de l'artefact, posée à la publication");
});

test('les capacités couvrent les documents du jeu', () => {
  const docs = new Set([...SCRIPT.matchAll(/(?:doc|collection|write)\(\s*'([^']+)'/g)].map(m => m[1].replace(/\/$/, '')));
  for (const d of ['team/roster', 'sprint/data', 'live/state', 'players', 'secret', 'revealed/all', 'quests/all']) assert.ok(docs.has(d), d);
  const rule = p => CAPS.db.rules.find(r => r.path === p);
  assert.deepEqual(rule(''), {path: '', read: 'view', write: 'admin'}, "le reste : l'hôte écrit, les joueurs lisent");
  assert.equal(rule('players/{self}').write, 'interact', 'chaque joueur écrit sa fiche');
  assert.equal(rule('secret').read, 'admin', 'les cartes secrètes : lues par l\'hôte seul');
  assert.equal(rule('secret/{self}').write, 'interact');
  assert.ok(CAPS.room && CAPS.user, 'présence (room) et noms des joueurs (user)');
});

test("« Coller » charge l'équipe envoyée par la borne, à part du sprint", () => {
  const g = game();
  const team = {people: [{k: 'p_jim', name: 'Jim', role: 'Développeur', look: {sh: '#3a5a8c', st: 1}, fun: [{l: 'CAFÉS', v: '4'}]}, null]};
  const r = g.checkSprint(JSON.stringify({...SPRINT, team}));
  assert.equal(r.err, undefined);
  assert.equal(r.data.team, undefined, "l'équipe va dans team/roster, pas dans sprint/data");
  assert.equal(r.team.length, 1);
  assert.equal(r.team[0].k, 'p_jim');
  assert.equal(r.team[0].look.sh, '#3a5a8c');
  assert.equal(r.team[0].look.sk, '#efc39a', 'couleur manquante : celle par défaut');
});

test("sans équipe, l'artefact garde la sienne ; une équipe vide est refusée", () => {
  const g = game();
  assert.equal(g.checkSprint(JSON.stringify(SPRINT)).team, null);
  assert.match(g.checkSprint(JSON.stringify({...SPRINT, team: {people: [{name: 'sans clé'}]}})).err, /équipe/);
});
