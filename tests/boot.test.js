// Démarrage de la page sur l'instantané de démo (data/) et blocs kronn-action du squelette.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

test('la page démarre sur l\'instantané de démo', () => {
  const {run} = load();
  assert.equal(run('DATA===SNAP'), true);
  assert.equal(run('LIVE_DATA'), false);
  assert.ok(run('chars.length') >= 20);
  assert.ok(run('RSTART<REND'));
  // chaque personnage a un état à toute heure de la journée rejouée
  const bad = run(`(()=>{const out=[];for(let t=RSTART;t<=REND;t+=7*60e3)for(const c of chars){
    try{const s=stateAt(c,t);if(!s||!s.st)out.push(c.key+'@'+t);}catch(e){out.push(c.key+': '+e.message);}}return out;})()`);
  assert.deepEqual(Array.from(bad), []);
});

test('les données Kronn (window.KronnPageData) remplacent la démo', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'office_snapshot.json'), 'utf8'));
  const {run} = load({kronnPageData: {datasets: {office: {current: {...snap, generated_at: new Date().toISOString()}}}}});
  assert.equal(run('DATA===SNAP'), false);
  assert.equal(run('LIVE_DATA'), true);
});

test('squelette : 9 blocs kronn-action et les marqueurs CSS / JS', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8');
  const ids = [...html.matchAll(/<script type="application\/kronn-action" data-action-id="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(ids, ['bureau-ask', 'bureau-relaunch', 'bureau-gate', 'bureau-impl', 'bureau-mep', 'bureau-review', 'bureau-fix', 'bureau-comment', 'bureau-avatar']);
  assert.equal(html.split('/*__STYLES__*/\n').length, 2);
  assert.equal(html.split('/*__SCRIPTS__*/\n').length, 2);
});

test('casting : le propriétaire de la config devient le boss (démo : Michael)', () => {
  const {load: ld} = require('./helpers/page.js');
  const R = JSON.parse(ld().run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_michael'), {k: 'p_michael', boss: true, seat: null, role: 'Le boss'});
  assert.equal(R.filter(c => c.boss).length, 1);
});

test('casting : Pam installe, Michael redevient un collègue et la place de Pam revient aux intérimaires', () => {
  const {load: ld} = require('./helpers/page.js');
  const before = JSON.parse(ld().run(`JSON.stringify(CAST.find(c=>c.key==='p_pam').seat)`));
  const run = ld({owner: 'p_pam'}).run;
  const R = JSON.parse(run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_pam'), {k: 'p_pam', boss: true, seat: null, role: 'Le boss'});
  const michael = R.find(c => c.k === 'p_michael');
  assert.equal(michael.boss, false);
  assert.equal(michael.role, 'Directeur régional');
  assert.ok(Array.isArray(michael.seat));
  assert.ok(JSON.parse(run(`JSON.stringify(FREE_SEATS)`)).some(s => s[0] === before[0] && s[1] === before[1]), 'la place de Pam se libère');
});

// profil d'équipe equipe (teams/equipe/) : sprite de boss fourni, places du plan equipe
const EURO = {...require('./fixtures/bureau.config.json'), team: 'equipe', people: []};

test('profil equipe : Rémi au bureau du boss avec son sprite de saxophoniste', () => {
  const {load: ld} = require('./helpers/page.js');
  const R = JSON.parse(ld({config: EURO, owner: 'p_remi'}).run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,sprite:c.sprite||null,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_remi'), {k: 'p_remi', boss: true, seat: null, sprite: 'boss_sax', role: 'Le boss'});
});

test('profil equipe : Darryl installe, Rémi redevient un collègue à sa place I2.R2', () => {
  const {load: ld} = require('./helpers/page.js');
  const run = ld({config: EURO, owner: 'p_coll2'}).run;
  const R = JSON.parse(run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,sprite:c.sprite||null,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_coll2'), {k: 'p_coll2', boss: true, seat: null, sprite: null, role: 'Le boss'});
  assert.deepEqual(R.find(c => c.k === 'p_remi'), {k: 'p_remi', boss: false, seat: [12, 15], sprite: null, role: 'Développeur'});
  assert.equal(JSON.parse(run(`JSON.stringify(RECIPES.p_remi.hair)`)), 'curly_short2');
  assert.ok(JSON.parse(run(`JSON.stringify(FREE_SEATS)`)).some(s => s[0] === 12 && s[1] === 14), 'la place de Darryl se libère');
});

test('casting : sans propriétaire, personne au bureau du boss et la page démarre', () => {
  const {load: ld} = require('./helpers/page.js');
  const run = ld({owner: null}).run;
  assert.equal(run(`CAST.filter(c=>c.boss).length`), 0);
  assert.ok(run(`chars.length`) > 0);
});

test('installation neuve : sans démo ni données, bureau vide et équipe présente', () => {
  const {load: ld} = require('./helpers/page.js');
  const run = ld({demo: false, owner: null, actions: false}).run;
  assert.equal(run(`DATA&&DATA.empty`), true);
  assert.equal(run(`DATA.runs.length`), 0);
  assert.equal(run(`TEAM`), null);
  assert.ok(run(`chars.filter(c=>c.person).length`) >= 10);
  assert.equal(run(`stateAt(byKey.p_michael,Date.parse('2026-10-01T09:00:00Z')).label`), 'À son bureau · pas encore de données Jira');
  assert.equal(run(`dashData(T).sprint`), null);
  assert.doesNotThrow(() => run(`renderKpis();renderWho();renderFeed();renderSide(true);true`));
});

test('installation avec Jira seul : le dataset team suffit, sans office ni live', () => {
  const {load: ld} = require('./helpers/page.js');
  const fs = require('fs'), path = require('path');
  const team = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'team_snapshot.json'), 'utf8'));
  const run = ld({demo: false, owner: 'p_michael', actions: false,
    kronnPageData: {version: 1, datasets: {team: {kind: 'snapshot', current: team, points: []}}}}).run;
  assert.equal(run(`DATA.empty`), true);
  assert.ok(run(`TEAM.people.length`) > 0);
  assert.ok(run(`dashData(T).sprint.ptsAll`) > 0);
  assert.doesNotThrow(() => run(`renderKpis();renderWho();renderFeed();true`));
});
