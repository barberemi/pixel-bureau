// Familles d'agents (32-familles.js) : au quotidien (agents nommés), pages (un workflow qui publie dans une page Kronn,
// son intérimaire au nom de la page), autres (intérimaires de passage) ; salle de réunion, hologrammes, écran mural, ⌘K.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

// une page de l'écran (un cron et un workflow à la demande y publient), une page hors écran, un workflow sans page
run(`(() => {
  BOSS_PAGES = [{id: 'pg111111-aaaa', title: 'Ventes du trimestre — siège', img: null,
    feeds: [{wf: 'deadbeef-0000-0000', trigger: 'cron'}, {wf: 'cafebabe-0000-0000', trigger: 'manual'}]}];
  BOSS_CHOICES = [{id: 'pg222222-bbbb', title: 'Stock de papier', feeds: [{wf: 'f00dcafe', trigger: 'cron'}]}];
  const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
  const r = (wf, name, steps) => ({wf, wf_name: name, run: 'r-' + wf, status: 'Running', start: at, end: null, steps: steps || []});
  d.runs.push(r('deadbeef-0000-0000', 'Ventes · refresh (page)', [{n: 'collecter', k: 'ApiCall', s: 'Running', at}]),
    r('cafebabe-0000-0000', 'Ventes · à la main'), r('f00dcafe-0000-0000', 'Stock · refresh'), r('0badf00d-0000-0000', 'Un workflow sans page'));
  setData(d, true);
})()`);

test("une page : un seul intérimaire, au nom de la page, pour tous les workflows qui y publient", () => {
  const p = J("chars.filter(c=>c.temp&&c.wf.some(w=>w==='deadbeef'||w==='cafebabe')).map(c=>({k:c.key,n:c.name,wf:c.wf,f:famKind(c)}))");
  assert.deepEqual(p, [{k: 'page_pg111111', n: 'Ventes du trimestre', wf: ['deadbeef', 'cafebabe'], f: 'page'}]);
  assert.deepEqual(J("(c=>[c.name,famKind(c),agentPage(c).wall])(chars.find(c=>c.wf.includes('f00dcafe')))"), ['Stock de papier', 'page', false]);
});

test("un workflow sans page : un intérimaire numéroté, dans les autres", () => {
  assert.deepEqual(J("(c=>[c.key,/^Intérimaire \\d+$/.test(c.name),famKind(c)])(chars.find(c=>c.wf.includes('0badf00d')))"), ['temp_0badf00d', true, 'autre']);
});

test("agent nommé : au quotidien ; dans les pages seulement par un cron qui y publie ; agents[].family le force", () => {
  const a = J("chars.find(c=>!c.person&&!c.visitor&&!c.temp&&c.wf.length).key");
  assert.equal(J(`famKind(byKey['${a}'])`), 'jour');
  run(`BOSS_PAGES[0].feeds.push({wf: byKey['${a}'].wf[0], trigger: 'manual'})`);
  assert.equal(J(`famKind(byKey['${a}'])`), 'jour'); // à la demande : il publie dans la page sans en être
  run(`BOSS_PAGES[0].feeds[2].trigger = 'cron'`);
  assert.equal(J(`famKind(byKey['${a}'])`), 'page'); // son cron remplit la page (le reviewer de PR)
  run(`byKey['${a}'].family = 'autre'`);
  assert.equal(J(`famKind(byKey['${a}'])`), 'autre');
  run(`delete byKey['${a}'].family; BOSS_PAGES[0].feeds.pop()`);
  const solo = J("(c=>c&&c.key)(chars.find(c=>!c.person&&!c.visitor&&!c.temp&&!agentButtons(c).length&&cronsOf(c).length&&!agentPage(c)))");
  if (solo) assert.equal(J(`famKind(byKey['${solo}'])`), 'autre'); // seul en cron, sans page ni bouton
  assert.equal(J("famKind(chars.find(c=>c.person))"), null);
});

test("un agent de page travaille en salle de réunion, devant l'écran ; un intérimaire de passage reste à sa place", () => {
  const s = J("(c=>stateAt(c,T))(byKey.page_pg111111)");
  assert.equal(s.st, 'work');
  assert.equal(s.zone, 'meet');
  assert.match(s.label, /^Met sa page à jour devant l'écran/);
  assert.notEqual(J("stateAt(byKey.temp_0badf00d,T).zone"), 'meet');
});

test("hologrammes : violet pour les pages, ambre pour les autres, cyan au quotidien ; plus de vert à Halloween", () => {
  assert.equal(J("holoStyleOf(byKey.page_pg111111).glow"), '#c9a8ff');
  assert.equal(J("holoStyleOf(byKey.temp_0badf00d).glow"), '#ffc266');
  assert.equal(J("holoStyleOf(chars.find(c=>famKind(c)==='jour'&&!c.holo))"), null);
  assert.doesNotMatch(J('holoFrame.toString()'), /halloween/);
});

test("écran mural : la page qu'un agent met à jour reste à l'écran", () => {
  run("for(const c of chars)c._st=stateAt(c,T);byKey.page_pg111111.present=true;");
  assert.equal(J('wallPin()'), 'pg111111-aaaa');
  assert.equal(J("wallAgent('pg111111-aaaa').key"), 'page_pg111111');
});

test("⌘K : un groupe par famille ; le titre d'une page trouve son agent", () => {
  const rows = J("srFind('ventes').filter(r=>r.fam).map(r=>[r.g,r.k.replace(/^\\S+ /,''),r.txt])");
  assert.deepEqual(rows, [['Agents · pages', 'Ventes du trimestre', "📺 remplit sa page, sur l'écran"]]);
  const g = J("srFind('a').filter(r=>r.fam).map(r=>r.fam)");
  assert.deepEqual(g, [...g].sort((x, y) => ['jour', 'page', 'autre'].indexOf(x) - ['jour', 'page', 'autre'].indexOf(y)));
});

test("Qui fait quoi : l'intérimaire de page ne répète pas le nom de son workflow, sa famille en pastille sur le portrait", () => {
  const c = J("(c=>whoLine(c,stateAt(c,T),T))(byKey.page_pg111111)");
  assert.equal(c.what, "↻ Met sa page à jour, sur l'écran");
  assert.doesNotMatch(c.sub, /refresh|Ventes/); // l'étape ou ce qu'il fait, jamais le nom du workflow
  assert.match(J('famBadge(byKey.page_pg111111)'), /title="Pages">📺</);
  assert.equal(J('famBadge(chars.find(c=>c.person))'), '');
});
