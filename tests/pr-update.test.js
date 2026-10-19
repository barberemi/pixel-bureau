// Remettre une PR à jour (#74) : pastilles d'état de la fiche d'une PR (conflit, retard sur sa base) et bouton
// « ⟳ Remettre à jour » (page action bureau-rebase), présent seulement si la PR est en retard, en conflit, ou d'état inconnu.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test('pastilles : conflit avec la base, commits de retard, à jour ; rien pour une PR mergée ou d\'état inconnu', () => {
  assert.match(J(`prChips({conflict:true,base:'main',behind:null})`), /⛔ conflit avec main/);
  assert.match(J(`prChips({behind:4,base:'master'})`), /⟳ 4 commits de retard sur master/);
  assert.match(J(`prChips({behind:1})`), /1 commit de retard sur main/);
  assert.match(J(`prChips({behind:0})`), /✓ à jour de main/);
  assert.equal(J(`prChips({behind:null})`), '');
  assert.equal(J(`prChips({merged:true,conflict:true})`), '');
  assert.equal(J(`prChips(null)`), '');
});

test('bouton « ⟳ Remettre à jour » : en retard, en conflit ou inconnu ; pas pour une PR à jour ni sans le workflow', () => {
  run(`document.createElement = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html || ''; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); },
      getContext() { return {drawImage() {}}; }});  // getContext : le portrait de l'agent de l'action (#86)
    MutationObserver = function () { this.observe = () => {}; }; kronnModal = () => {};
    ACTS = {tickets: [], prs: [{id: 'acme/web#16', n: '16', repo: 'acme/web'}]}; ACTIONS.rebase = true; ACTIONS.fix = false; ACTIONS.review = false; ACTIONS.mep_pr = false;`);
  const btns = pr => J(`(() => { const box = {kids: [], childElementCount: 0, appendChild(x) { this.kids.push(x); }};
    prLaunch(box, Object.assign({n: 16, repo: 'acme/web', review: 'pending'}, ${JSON.stringify(pr)}));
    return box.kids.filter(h => h.kids).map(h => ({sub: [h.html, ...h.kids.map(k => k.html)].filter(Boolean).join(' '), b: (h.kids.filter(k => k.tag === 'button').pop() || {}).attrs})); })()`);
  const behind = btns({behind: 3, base: 'main'});
  assert.equal(behind.length, 1);
  assert.equal(behind[0].b['data-kronn-action'], 'bureau-rebase');
  assert.match(behind[0].sub, /Rebase sur main, commits gardés/);
  assert.match(btns({conflict: true, base: 'develop'})[0].sub, /Conflit avec develop : l(&#39;|')IA propose/);
  assert.equal(btns({}).length, 1, 'état inconnu (cron pas encore passé) : le bouton reste');
  assert.equal(btns({behind: 0}).length, 0, 'à jour : rien à faire');
  run('ACTIONS.rebase = false');
  assert.equal(btns({behind: 3}).length, 0);
});

test('« 🛠 Corriger » (#75) : modèle du Bureau dès qu\'il reste des fils non résolus, tout dépôt ; sinon le workflow de launch.fix', () => {
  run(`ACTIONS.rebase = false; ACTIONS.fix_pr = true; ACTIONS.fix = true;
    ACTS = {tickets: [], prs: [{id: 'acme/web#16', n: '16', repo: 'acme/web'}, {id: 'acme/api#7', n: '7', repo: 'acme/api'}]};`);
  const btns = pr => J(`(() => { const box = {kids: [], childElementCount: 0, appendChild(x) { this.kids.push(x); }};
    prLaunch(box, Object.assign({n: 16, repo: 'acme/web', review: 'pending'}, ${JSON.stringify(pr)}));
    return box.kids.filter(h => h.kids).map(h => ({sub: [h.html, ...h.kids.map(k => k.html)].filter(Boolean).join(' '), b: (h.kids.filter(k => k.tag === 'button').pop() || {}).attrs})); })()`);
  const three = btns({threads: 3});
  assert.equal(three.length, 1);
  assert.equal(three[0].b['data-kronn-action'], 'bureau-fixpr');
  assert.match(three[0].sub, /corrige les 3 fils de review/); // #86 : l'agent et ce qu'il fait, son nom calculé, jamais écrit en dur
  assert.equal(btns({n: 7, repo: 'acme/api', threads: 1})[0].b['data-kronn-action'], 'bureau-fixpr', 'autre dépôt aussi');
  assert.equal(btns({threads: 0, review: 'changes'}).length, 0, 'aucun fil non résolu : rien à corriger');
  assert.equal(btns({review: 'changes'}).length, 1, 'fils inconnus mais changements demandés');
  run('ACTIONS.fix_pr = false; ACTS.prs.push({id: CFG.github_repo + "#16", n: "16", repo: CFG.github_repo})');
  const main = J('CFG.github_repo');
  assert.equal(btns({repo: main, review: 'changes'})[0].b['data-kronn-action'], 'bureau-fix', 'sans le modèle : launch.fix comme avant');
  assert.equal(btns({review: 'changes'}).length, 0, 'et seulement pour le dépôt principal, comme avant');
});
