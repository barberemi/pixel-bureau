// Pastilles de la PR d'un ticket sous sa carte du Mur Kanban (63-kanban.js) et dans sa fiche (62-ticket.js, 60-fiches.js) :
// CI, review, conflit, envs où tourne sa branche (dataset live) et lien de l'env de branche.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const J = code => JSON.parse(page.run('JSON.stringify(' + code + ')'));
const REPO = J('CFG.github_repo');
const pr = (o = {}) => ({n: 12, title: 'DM-1 x', keys: ['DM-1'], review: 'pending', head: 'feat/DM-1-x', ...o});
// pastilles du ticket DM-1, avec ces PR et ces occupants d'env ; le HTML sans balises, et les liens
function chips(prs, envs = {}) {
  return J(`(() => { const t0 = TEAM, l0 = LIVE; TEAM = {people: [{name: 'Pam', prs: ${JSON.stringify(prs)}, tickets: []}], other_prs: []};
    LIVE = {envs: ${JSON.stringify(envs)}};
    try { const h = kbPrChips('DM-1'); return {text: h.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(), links: [...h.matchAll(/href="([^"]+)"/g)].map(m => m[1])}; }
    finally { TEAM = t0; LIVE = l0; } })()`);
}
const run = (o = {}) => ({ref: 'feat/DM-1-x', tag: false, status: 'completed', conclusion: 'success', start: '2026-10-01T08:00:00Z', end: '2026-10-01T08:10:00Z', ...o});

test('n° de PR et CI, review ; brouillon à la place de la review ; conflit', () => {
  assert.equal(chips([pr({ci: 'ok'})]).text, '#12 ✓ CI 👀 à relire');
  assert.equal(chips([pr({ci: 'ko', review: 'changes', conflict: true})]).text, '#12 ✗ CI 💬 à corriger ⛔ conflit');
  assert.equal(chips([pr({draft: true, review: 'approved'})]).text, '#12 ✎ brouillon', 'CI inconnue : le numéro seul');
  assert.equal(chips([]).text, '', 'sans PR : rien');
});

test('la PR prête plutôt qu\'un brouillon, puis la plus récente', () => {
  assert.match(chips([pr({n: 30, draft: true}), pr({n: 20}), pr({n: 25})]).text, /^#25 /);
});

test('envs : la branche déployée (réussi ou en cours), jamais une version ni un échec ; casse du dépôt ignorée', () => {
  const R = REPO.toUpperCase();
  assert.match(chips([pr()], {[R + '|dev']: run(), [REPO + '|stg']: run({status: 'in_progress', conclusion: null, end: null})}).text, /🧪 DEV 🎭 STG ⏳$/);
  assert.doesNotMatch(chips([pr()], {[REPO + '|dev']: run({conclusion: 'failure'})}).text, /DEV/);
  assert.doesNotMatch(chips([pr()], {[REPO + '|dev']: run({ref: '17.2.0', tag: true})}).text, /DEV/);
  assert.doesNotMatch(chips([pr()], {[REPO + '|dev']: run({ref: 'feat/DM-2'})}).text, /DEV/);
});

test('« 🌿 env ↗ » : un lien https vers l\'env de branche, jamais une autre adresse', () => {
  const u = 'https://www.dm1.preview.example.com';
  assert.deepEqual(chips([pr({env_url: u})]).links, [u]);
  assert.deepEqual(chips([pr({env_url: 'javascript:alert(1)'})]).links, []);
});

test('fiche du ticket : l\'adresse complète de l\'env de branche, sous sa PR ; les envs dans les marques de la PR', () => {
  const h = J(`prEnvLine({env_url: 'https://www.dm1.preview.example.com', env_at: null})`);
  assert.match(h, /href="https:\/\/www\.dm1\.preview\.example\.com"/);
  assert.match(h, />www\.dm1\.preview\.example\.com</);
  assert.equal(J(`prEnvLine({env_url: null})`), '');
  const m = J(`(() => { const l0 = LIVE; LIVE = {envs: {'${REPO}|dev': ${JSON.stringify(run())}}}; try { return prMarks(${JSON.stringify(pr({ci: 'ko'}))}).join(' '); } finally { LIVE = l0; } })()`);
  assert.match(m, /✗ CI/);
  assert.match(m, /🧪 DEV · depuis/);
});

// avec le tableau des départs (LIVE.departs) : adresses des envs et noms des projets
function chipsHtml(prs, envs, departs) {
  return J(`(() => { const t0 = TEAM, l0 = LIVE; TEAM = {people: [{name: 'Pam', prs: ${JSON.stringify(prs)}, tickets: []}], other_prs: []};
    LIVE = {envs: ${JSON.stringify(envs)}, departs: ${JSON.stringify(departs)}};
    try { return kbPrChips('DM-1'); } finally { TEAM = t0; LIVE = l0; } })()`);
}
const API = 'acme/api';
const DEPS = [{repo: REPO, label: 'site', urls: {dev: 'https://dev.site.example', stg: 'https://stg.site.example'}},
  {repo: API, label: 'api', urls: {stg: 'http://api.stg.example.internal/api/'}}];

test('carte : une rangée par projet, seulement ce qui est déployé, un lien vers l\'env quand son adresse est connue', () => {
  const h = chipsHtml([pr({n: 12}), pr({n: 7, repo: API, head: 'feat/DM-1-api'})],
    {[REPO + '|dev']: run(), [API + '|stg']: run({ref: 'feat/DM-1-api'})}, DEPS);
  const rows = [...h.matchAll(/<span class="kbw-envs">(.*?)<\/span>(?=<span class="kbw-envs">|<\/span>$)/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.deepEqual(rows, ['site 🧪 DEV ↗', 'api 🎭 STG ↗']);
  assert.match(h, /href="https:\/\/dev\.site\.example"/);
  assert.match(h, /href="http:\/\/api\.stg\.example\.internal\/api\/"/, 'un env interne en http');
  assert.doesNotMatch(h, /stg\.site\.example/, 'STG du site : la branche n\'y est pas');
});

test('carte : rien de déployé, pas de rangée ; pendant le déploiement, ⏳ sans lien ; adresse inconnue, la pastille seule', () => {
  assert.doesNotMatch(chipsHtml([pr()], {}, DEPS), /kbw-envs/);
  const h = chipsHtml([pr()], {[REPO + '|dev']: run({status: 'in_progress', conclusion: null, end: null})}, DEPS);
  assert.match(h, /🧪 DEV ⏳/);
  assert.doesNotMatch(h, /href=/);
  assert.doesNotMatch(chipsHtml([pr()], {[REPO + '|dev']: run()}, [{repo: REPO, urls: {dev: 'javascript:alert(1)'}}]), /href=/);
});

test('carte : deux envs de branche dans un projet, chacun avec le n° de sa PR', () => {
  const h = chipsHtml([pr({n: 12, env_url: 'https://a.example'}), pr({n: 14, head: 'feat/DM-1-b', env_url: 'https://b.example'})], {}, DEPS);
  assert.match(h, /🌿 #14 ↗.*🌿 #12 ↗/);
});

test('fiche : la marque de l\'env devient un lien vers lui', () => {
  const m = J(`(() => { const l0 = LIVE; LIVE = {envs: {'${REPO}|dev': ${JSON.stringify(run())}}, departs: ${JSON.stringify(DEPS)}};
    try { return prMarks(${JSON.stringify(pr())}).join(' '); } finally { LIVE = l0; } })()`);
  assert.match(m, /<a class="prm" href="https:\/\/dev\.site\.example"[^>]*>🧪 DEV ↗ · depuis/);
});
