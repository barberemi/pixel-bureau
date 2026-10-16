// « Nouvel agent » depuis une baie de la salle Serveurs (#64) : zone cliquable, workflows proposés, code AGENT1.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

test('le « + » de la dernière baie : actif hors mode TV et seulement si le workflow agents est installé', () => {
  const {run} = load();
  assert.equal(run('newAgentOn()'), true);
  const r = JSON.parse(run('JSON.stringify(newAgentRack())'));
  assert.deepEqual(Object.keys(r), ['x', 'y', 'w', 'h']);
  assert.ok(run('RACK_PLUS.y') > r.y, 'dessiné devant la baie');
  assert.equal(run('TV = true; const v = newAgentOn(); TV = false; v'), false, 'pas en mode TV');
  assert.equal(run('ACTIONS.agent = false; const w = newAgentOn(); ACTIONS.agent = true; w'), false, 'workflow agents absent');
  assert.equal(run('ACTIONS.agent = false; const z = newAgentOn(); ACTIONS.agent = true; z'), false);
});

test('workflows proposés : actifs hors Bureau, sans agent (les intérimaires du jour comptent comme sans agent)', () => {
  const {run} = load();
  const agentWf = run('AGENTS[0].wf[0]');
  run(`ASKABLE = [{wf: '${agentWf}-aaaa', name: 'Déjà incarné'}, {wf: 'e5ce6732-bbbb', name: 'Issue GitHub'}, {wf: '0000aaaa-cccc', name: 'Autre'}];
    chars.push({key: 'temp_0000aaaa', temp: true, wf: ['0000aaaa'], runs: []});`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(workflowsWithoutAgent().map(w => w.name))')), ['Autre', 'Issue GitHub']);
});

test('code AGENT1 : clé a_<prénom>_<workflow>, préfixe de 8, siège choisi ou null, apparence tirée', () => {
  const {run} = load({globals: {btoa, atob}});
  assert.equal(run(`agentKey('Mosé Schrute', '33e26965-xxxx')`), 'a_mose_schrute_33e2');
  assert.equal(run(`agentKey('', 'E5CE6732')`), 'a_agent_e5ce');
  run(`NA = {wf: '33e26965-4d5f', name: 'Mose', role: "Revue d'une PR", seat: '', look: randomLook()};`);
  const req = JSON.parse(run(`decodeURIComponent(escape(atob(agentCode().slice(7))))`));
  assert.equal(req.op, 'add');
  assert.equal(req.k, 'a_mose_33e2');
  assert.deepEqual(req.wf, ['33e26965']);
  assert.equal(req.seat, null);
  assert.equal(req.r, "Revue d'une PR");
  assert.ok(req.l.sex && req.l.hair && req.l.shirt, 'apparence complète');
  assert.match(run('agentCode()'), /^AGENT1:[A-Za-z0-9+/=]+$/);
});

test('apparence au hasard : uniquement des calques et couleurs que la validation accepte', () => {
  const {run} = load();
  const ok = run(`(() => { for (let i = 0; i < 200; i++) { const l = randomLook();
    for (const [k, v] of Object.entries(l)) { if (/color|shirt/.test(k) ? !/^#[0-9a-fA-F]{6}$/.test(v) : !/^[a-z0-9_/]{1,40}$/.test(v)) return k + '=' + v; } } return true; })()`);
  assert.equal(ok, true);
});
