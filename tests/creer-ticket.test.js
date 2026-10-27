// Créer un ticket (#77) : le « ▶ Lancer » de l'agent du modèle ticket montre son dernier ticket créé (run.res), reste
// grisé tant qu'un run tourne ou attend la validation, se vide après un lancement ; sa validation n'a pas de
// « Changements » ; le fil dit « X crée DM-… » à la place du créateur Jira.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function setup() {
  const page = load(), {run} = page;
  const a = run('AGENTS[0].key'), p8 = run('AGENTS[0].wf[0]'), wf = p8 + '-1111-2222-3333-444444444444';
  run(`CFG.ticket = {wf: '${p8}'};
    document.createElement = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); }, prepend() {}, addEventListener() {}, querySelector() { return {}; }});
    var QOBS = []; MutationObserver = function (f) { return {observe(b) { QOBS.push([b, f]); }}; }; copyText = () => true;
    var box = null; foldSection = () => (box = {kids: [], appendChild(x) { this.kids.push(x); }});
    LAUNCHABLE = [{wf: '${wf}', name: 'Le Bureau · créer un ticket', vars: [{name: 'intention', label: 'Intention', required: true, multiline: true},
      {name: 'type', label: 'Type', required: true, options: [{value: 'Story', label: 'Story'}, {value: 'Bug', label: 'Bug'}], default: 'Story'},
      {name: 'points', label: 'Story Points', required: true, pattern: '[0-9]+'}]}];
    var QC = byKey['${a}']; QC.runs = [];
    var qmk = (status, min, res) => ({wf: '${wf}', run: 'r' + min, status, _s: T - min * 60e3, _e: status === 'Success' || status === 'Failed' ? T - (min - 2) * 60e3 : null, res});
    var qgrab = () => { box = null; runBlock({}, QC); return box; };
    var qform = b => b.kids.find(k => k.className === 'relaunch rl-form');`);
  return {run, J: code => JSON.parse(run('JSON.stringify(' + code + ')'))};
}

test('dernier ticket créé : le plus récent run réussi qui a un résultat, avec son lien et son résumé', () => {
  const {run, J} = setup();
  run(`QC.runs = [qmk('Success', 90, {key: 'DM-1', url: 'https://j/browse/DM-1', title: 'Ancien', meta: 'Story · 2 pts'}),
                 qmk('Success', 30, {key: 'DM-2', url: 'https://j/browse/DM-2', title: 'Récent', meta: 'Bug · 3 pts · site-web'}),
                 qmk('Failed', 10)]; var QB = qgrab();`);
  const last = J('QB.kids[0]');
  assert.equal(last.className, 'tk-last');
  assert.match(last.innerHTML, /Dernier ticket créé/);
  assert.match(last.innerHTML, /href="https:\/\/j\/browse\/DM-2"[^>]*>DM-2 ↗</);
  assert.match(last.innerHTML, /Récent<\/div><small>Bug · 3 pts · site-web · créé à \d\d:\d\d<\/small>/);
  run(`QC.runs = [qmk('Success', 30)]; QB = qgrab();`);
  assert.equal(J('QB.kids[0].className'), 'relaunch rl-form', 'aucun résultat : pas de bloc');
});

test('un run en cours ou en attente de validation grise « Lancer… » : jamais deux tickets à la fois', () => {
  const {run, J} = setup();
  run(`QC.runs = [qmk('WaitingApproval', 4)]; var QB = qgrab(), QH = qform(QB), QLB = QH.kids.find(k => k.tag === 'button');
    for (const l of QH.kids[0].kids) { const f = l.kids[0]; f.value = f.tag === 'textarea' ? 'Dédoublonner le bloc' : f.tag === 'input' ? '3' : 'Bug'; f.oninput(); }`);
  assert.equal(J('QLB.disabled'), true);
  assert.match(J('QH.kids.find(k => k.className === "note rl-why").textContent'), /est dessus depuis \d\d:\d\d\.$/);
  run(`QC.runs = []; QB = qgrab(); QH = qform(QB); QLB = QH.kids.find(k => k.tag === 'button');
    var QF = QH.kids[0].kids.map(l => l.kids[0]); QF[0].value = 'Dédoublonner'; QF[0].oninput(); QF[1].value = 'Bug'; QF[1].oninput(); QF[2].value = '3'; QF[2].oninput();`);
  assert.equal(J('QLB.disabled'), false);
  run(`QLB.attrs['data-kronn-action-state'] = 'succeeded'; QOBS.filter(([b]) => b === QLB).forEach(([, f]) => f());`);
  assert.deepEqual(J('QF.map(f => f.value)'), ['', 'Story', ''], 'lancé : formulaire vidé, liste revenue à sa valeur par défaut');
});

test('validation du ticket : Approuver et Rejeter seulement ; les autres validations gardent « Changements »', () => {
  const {run, J} = setup();
  const p8 = J('CFG.ticket.wf');
  run(`ACTIONS.gate = true; GATES = [{run: 'g1', wf: '${p8}-x', wf_name: 'Le Bureau · créer un ticket', gate: 'relire', message: '🎫 Titre', since: new Date(T).toISOString()},
                                     {run: 'g2', wf: 'zzzzzzzz-x', wf_name: 'Autre', gate: 'gate', message: 'm', since: new Date(T).toISOString()}];
    kronnModal = () => {}; var QP = {kids: [], appendChild(x) { this.kids.push(x); }};
    gateCard(QP, {run: 'g1', wf_name: 'Le Bureau · créer un ticket', _s: T}, null); gateCard(QP, {run: 'g2', wf_name: 'Autre', _s: T}, null);
    var qlabels = c => c.kids.find(k => k.className === 'gq').kids.map(w => w.kids[0].textContent);`);
  assert.deepEqual(J('qlabels(QP.kids[0])'), ['✅ Approuver', '⛔ Rejeter']);
  assert.match(J('QP.kids[0].kids.find(k => k.className === "note").textContent'), /rien n'est créé dans Jira/);
  assert.deepEqual(J('qlabels(QP.kids[1])'), ['✅ Approuver', '⛔ Rejeter', '✏️ Changements…']);
});
