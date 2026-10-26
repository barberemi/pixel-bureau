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

test('squelette : 24 blocs kronn-action et les marqueurs CSS / JS', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8');
  const ids = [...html.matchAll(/<script type="application\/kronn-action" data-action-id="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(ids, ['bureau-ask', 'bureau-relaunch', 'bureau-gate', 'bureau-answer', 'bureau-impl', 'bureau-mep', 'bureau-review', 'bureau-fix', 'bureau-comment', 'bureau-estimate', 'bureau-move', 'bureau-duck', 'bureau-mailrules', 'bureau-avatar', 'bureau-agent', 'bureau-launch', 'bureau-pages', 'bureau-todo', 'bureau-rebase', 'bureau-fixpr', 'bureau-env', 'bureau-deploy', 'bureau-meppr', 'bureau-support']);
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

// pack d'équipe fictif (tests/fixtures/pack-exemple) : sprite de boss fourni, places de son plan
const PACK = {...require('./fixtures/bureau.config.json'), team: './tests/fixtures/pack-exemple', people: []};

test('pack d\'équipe : Bob au bureau du boss avec son sprite fourni', () => {
  const {load: ld} = require('./helpers/page.js');
  const R = JSON.parse(ld({config: PACK, owner: 'p_bob'}).run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,sprite:c.sprite||null,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_bob'), {k: 'p_bob', boss: true, seat: null, sprite: 'sorcier', role: 'Le boss'});
});

test('pack d\'équipe : Lynn installe, Bob redevient un collègue à sa place I2.R2', () => {
  const {load: ld} = require('./helpers/page.js');
  const run = ld({config: PACK, owner: 'p_lynn'}).run;
  const R = JSON.parse(run(`JSON.stringify(CAST.filter(c=>c.person).map(c=>({k:c.key,boss:!!c.boss,seat:c.seat,sprite:c.sprite||null,role:c.role})))`));
  assert.deepEqual(R.find(c => c.k === 'p_lynn'), {k: 'p_lynn', boss: true, seat: null, sprite: null, role: 'Le boss'});
  assert.deepEqual(R.find(c => c.k === 'p_bob'), {k: 'p_bob', boss: false, seat: [12, 15], sprite: null, role: 'Directeur'});
  assert.equal(JSON.parse(run(`JSON.stringify(RECIPES.p_bob.hair)`)), 'plain');
  assert.ok(JSON.parse(run(`JSON.stringify(FREE_SEATS)`)).some(s => s[0] === 7 && s[1] === 15), 'la place de Lynn (I1.R2) se libère');
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

test('panneau : pas de redessin automatique pendant un clic, le bouton cliqué reste le même', () => {
  const {run} = load();
  run('var NDRAW=0; drawSide=()=>{NDRAW++}; document.querySelector=()=>null; EDIT=null; KM_OPEN=null; SIDE_FOLDED=false; performance.now=()=>1000;');
  const draws = code => run(`(()=>{const n=NDRAW;${code};return NDRAW-n;})()`);
  assert.equal(draws('renderSide()'), 1);
  run('pressHold(true,1000)');
  assert.equal(draws('renderSide()'), 0, 'appui en cours');
  assert.equal(draws('renderSide(true)'), 1, 'un redessin demandé (choix d\'une fiche) passe toujours');
  run('performance.now=()=>1200; pressHold(false,1200)');
  assert.equal(draws('renderSide()'), 0, 'le clic arrive juste après le relâchement');
  run('performance.now=()=>1700');
  assert.equal(draws('renderSide()'), 1);
  run('pressHold(true,1700); performance.now=()=>11800'); // relâchement perdu : le panneau repart au bout de 10 s
  assert.equal(draws('renderSide()'), 1);
  run('pressHold(false,11800)'); // relâchement sans appui dans le panneau : rien à retenir
  assert.equal(draws('renderSide()'), 1);
});

test('panneau Fraîcheur : « ↻ Relancer » si en retard, « ↻ » discret sinon, lié au cron de la source ; rien pour Direct, sans ligne relançable ni en mode TV', () => {
  const {run} = load();
  run(`document.createElement = t => ({tag: t, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(x) { this.kids.push(x); },
    addEventListener() {}}); var cell = () => ({kids: [], appendChild(x) { this.kids.push(x); }});
    RELAUNCH = [{wf: 'wf-agent', name: 'Revue de PR'}, {wf: 'wf-team', name: 'Le Bureau · équipe', bureau: 'team'}, {wf: 'wf-live', name: 'Le Bureau · live', bureau: 'live'}];
    ACTIONS.relaunch = true; TV = false;`);
  const btn = code => JSON.parse(run(`JSON.stringify((() => { const td = cell(); ${code}; const h = td.kids[0], b = h && h.kids.find(k => k.tag === 'button');
    return b ? {text: b.textContent, cls: b.className || '', action: b.attrs['data-kronn-action'], bind: b.attrs['data-kronn-bindings']} : null; })())`));
  const bind = '{"wf_id":"wf-team","params":"wf-team"}';
  assert.deepEqual(btn(`freshRelaunch(td, 'team', 'Équipe', true)`), {text: '↻ Relancer', cls: '', action: 'bureau-relaunch', bind});
  assert.deepEqual(btn(`freshRelaunch(td, 'team', 'Équipe', false)`), {text: '↻', cls: 'rl-mini', action: 'bureau-relaunch', bind});
  assert.equal(btn(`freshRelaunch(td, 'live', 'Direct', true)`), null, 'Direct : le cron live passe chaque minute');
  assert.equal(btn(`freshRelaunch(td, 'office', 'Bureau', true)`), null, 'cron absent de la liste relançable');
  assert.equal(btn(`TV = true; freshRelaunch(td, 'team', 'Équipe', true); TV = false`), null, 'mode TV');
  assert.equal(btn(`ACTIONS.relaunch = false; freshRelaunch(td, 'team', 'Équipe', true); ACTIONS.relaunch = true`), null, 'sans le workflow de relance');
});

test('fiche d\'un agent : « ▶ Lancer… » avec un champ par variable (liste launchable), lié au bloc bureau-launch ; la ligne copiée déjà remplie (#64, #67)', () => {
  const {run} = load();
  const a = run('AGENTS[0].key'), wf = run('AGENTS[0].wf[0]') + '-1111-2222-3333-444444444444';
  run(`document.createElement = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); }, prepend() {}, addEventListener() {}, querySelector() { return {}; }});
    MutationObserver = function () { return {observe() {}}; }; var COPIED = null; copyText = t => { COPIED = t; return true; };
    var box = null; foldSection = () => (box = {kids: [], appendChild(x) { this.kids.push(x); }});
    LAUNCHABLE = [{wf: '${wf}', name: 'Issue GitHub', vars: [{name: 'intention', label: 'Ce que tu veux faire', required: true, multiline: true},
      {name: 'repo', label: 'Dépôt', required: false, placeholder: 'owner/dépôt', pattern: '[\\\\w.-]+/[\\\\w.-]+'},
      {name: 'type', label: 'Type', required: false, options: [{value: 'bug', label: 'Bug'}, {value: 'idee', label: 'Idée'}], default: 'idee'}]}];`);
  run(`var LH = null, LB = null, F = {}; var grab = key => { box = null; runBlock({}, byKey[key]); LH = box && box.kids[0]; if (!LH) return;
    LB = LH.kids.find(k => k.tag === 'button'); F = {}; for (const l of LH.kids[0].kids) { const f = l.kids[0]; F[f.tag] = f; } };
    var type = (f, v) => { f.value = v; f.oninput(); };`);
  run(`grab(${JSON.stringify(a)})`);
  assert.deepEqual(JSON.parse(run('JSON.stringify([LB.textContent, LB.attrs["data-kronn-action"], LB.attrs["data-kronn-bindings"], Object.keys(F)])')),
    ['▶ Lancer…', 'bureau-launch', JSON.stringify({wf_id: wf}), ['textarea', 'input', 'select']]);
  assert.match(run('LH.kids[0].kids.map(l => l.innerHTML).join("|")'), /^Ce que tu veux faire <b class="req">\*<\/b>\|Dépôt\|Type$/);
  assert.equal(run('F.input.placeholder'), 'owner/dépôt');
  assert.equal(run('F.select.value'), 'idee', 'valeur par défaut de la liste');
  assert.equal(run('LB.disabled'), true, 'obligatoire vide : bouton grisé');
  assert.equal(run('LH.kids.find(k => k.className === "note rl-why").textContent'), 'À remplir : Ce que tu veux faire');
  run('type(F.textarea, "Pouvoir éditer une étape ; vite")');
  assert.equal(run('LB.disabled'), true, 'le « ; » est refusé');
  assert.match(run('LH.kids[0].kids[0].kids[1].textContent'), /remplace-le par une virgule/);
  run('type(F.textarea, "Pouvoir éditer une étape\\n  en arrivant dessus"); type(F.input, "pas un dépôt")');
  assert.match(run('LH.kids[0].kids[1].kids[1].textContent'), /Format attendu : owner\/dépôt/);
  run('type(F.input, "barberemi/pixel-bureau"); LB.onclick()');
  assert.equal(run('LB.disabled'), false);
  assert.equal(run('COPIED'), 'intention=Pouvoir éditer une étape en arrivant dessus ; repo=barberemi/pixel-bureau ; type=idee');
  run(`box = null; runBlock({}, byKey[${JSON.stringify(run('AGENTS[1].key'))}])`);
  assert.equal(run('box'), null, 'aucun de ses workflows ne demande de saisie : pas de bouton');
});

test('launchLine : obligatoires, « … » vide, « ; » refusé, motif, retours à la ligne en espaces', () => {
  const {run} = load();
  const ll = (vars, vals) => JSON.parse(run(`JSON.stringify(launchLine(${JSON.stringify(vars)}, ${JSON.stringify(vals)}))`));
  const V = [{name: 'ticket', label: 'Ticket', required: true, pattern: '[A-Z]+-\\d+'}, {name: 'note', required: false}];
  assert.deepEqual(ll(V, {ticket: '…'}), {line: '', errs: {}, missing: ['Ticket']});
  assert.deepEqual(ll(V, {ticket: 'EW-12', note: ' a\nb '}), {line: 'ticket=EW-12 ; note=a b', errs: {}, missing: []});
  assert.equal(Object.keys(ll(V, {ticket: '12'}).errs)[0], 'ticket');
  assert.deepEqual(ll([{name: 'x', pattern: '('}], {x: 'ok'}).errs, {}, 'motif invalide : ignoré, comme Kronn');
  assert.deepEqual(ll(V, {ticket: 'EW-1', note: 'a=b'}).line, 'ticket=EW-1 ; note=a=b', 'le « = » reste permis (relaunch.py coupe au premier)');
});

test('panneau redessiné : les saisies des champs data-fid passent au rendu suivant, leur oninput rejoué (#67)', () => {
  const {run} = load();
  run(`var F1 = {dataset: {fid: 'run:w:intention'}, value: 'Mon idée'}, F2 = {dataset: {fid: 'ren:n:a'}, value: 'Clark'};
    var KEPT = keepFields({querySelectorAll: () => [F1, F2]}), SYNCED = 0;
    var N1 = {dataset: {fid: 'run:w:intention'}, value: '', oninput() { SYNCED++; }}, N2 = {dataset: {fid: 'ren:n:a'}, value: 'Clark', oninput() { SYNCED++; }},
      N3 = {dataset: {fid: 'grp:x'}}; restoreFields({querySelectorAll: () => [N1, N2, N3]}, KEPT);`);
  assert.deepEqual(JSON.parse(run('JSON.stringify([N1.value, N2.value, SYNCED, "value" in N3])')), ['Mon idée', 'Clark', 1, false]);
});

test('validation : trois boutons directs, chacun lié à sa ligne de gates.grows (run_id et decision relus par Kronn)', () => {
  const {run} = load();
  run(`document.createElement = t => ({tag: t, attrs: {}, kids: [], className: '', style: {}, setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }, appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); }, addEventListener() {}});
    MutationObserver = function () { return {observe() {}}; }; DECIDED = {}; ACTIONS.gate = true;
    GATES = [{run: 'r1', wf: 'w1', wf_name: 'Le Bureau · plan', gate: 'boss', since: new Date(T - 12 * 60e3).toISOString(), message: 'Nouveau plan'}];
    var P = {kids: [], appendChild(x) { this.kids.push(x); }}; gateCard(P, {run: 'r1', wf_name: 'Le Bureau · plan', _s: T}, null);`);
  const btns = JSON.parse(run(`JSON.stringify((() => { const out = [], walk = e => { if (e.tag === 'button') out.push([e.textContent, e.attrs]);
    (e.kids || []).forEach(walk); }; walk(P.kids[0]); return out; })())`));
  assert.deepEqual(btns.map(([t]) => t), ['✅ Approuver', '⛔ Rejeter', '✏️ Changements…']);
  for (const [, a] of btns) assert.equal(a['data-kronn-action'], 'bureau-gate');
  assert.deepEqual(btns.map(([, a]) => JSON.parse(a['data-kronn-bindings'])), ['approve', 'reject', 'request_changes'].map(d => ({run_id: 'r1|' + d, decision: 'r1|' + d})));
  assert.match(run('P.kids[0].innerHTML'), /En attente depuis .* \(12 min\)/, 'durée à l\'heure de la page');
});
