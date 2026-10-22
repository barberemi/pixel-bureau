// Mes todos (47-todos.js) : le tableau en liège du bureau du boss lit le dataset todos (todos.py) ; les changements
// faits dans la fenêtre restent en attente dans ce navigateur, fondus par todo, jusqu'à « Enregistrer » (code TODO1:).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const DS = {generated_at: 'x', todos: [
  {id: 't1', title: 'Relire la spec', col: 'todo', priority: 'high'},
  {id: 't2', title: 'Répondre à Jan', col: 'todo', priority: 'normal'},
  {id: 't3', title: 'Fastly', col: 'duck', priority: 'normal', disc: 'd9'},
  {id: 't4', title: 'Commander du papier', col: 'done', priority: 'low'},
  {id: 't5', title: 'Colonne inconnue', col: 'later'}]};
const reset = () => run(`TODOS=readTodos({datasets:{todos:{current:${JSON.stringify(JSON.stringify(DS))}}}});TD_PEND=[];DUCKS=[];TV=false;`);

test('lecture du dataset : texte JSON ou objet, colonnes inconnues écartées, absent ou cassé', () => {
  reset();
  assert.deepEqual(J('TODOS.todos.map(t=>t.id)'), ['t1', 't2', 't3', 't4']);
  assert.equal(J('readTodos({datasets:{todos:{current:{todos:[]}}}}).todos.length'), 0);
  assert.equal(J('readTodos({datasets:{}})'), null);
  assert.equal(J('readTodos({datasets:{todos:{current:"{cassé"}}})'), null);
});

test('le tableau : au mur du plan type, rien en mode TV ni sans todo ni workflow ; pastille = à faire + le canard qui t\'attend', () => {
  reset();
  assert.deepEqual(J('todoRect()'), {x: 628, y: 216, w: 100, h: 38});
  assert.equal(J('todosOn()'), true);
  run('TV=true;');
  try { assert.equal(J('todosOn()'), false); } finally { run('TV=false;'); }
  run('TODOS={todos:[]};');
  assert.equal(J('todosOn()'), false, 'ni todo ni workflow installé : pas de tableau');
  run('ACTIONS.todo=true;');
  try { assert.equal(J('todosOn()'), true); } finally { run('ACTIONS.todo=false;'); }
  reset();
  assert.equal(J('tdWaiting()'), 0);
  run("DUCKS=[{id:'d9',awaiting:true}];");
  assert.equal(J('tdWaiting()'), 1);
  assert.match(J('todoTip()'), /2 à faire · 1 avec le canard \(1 t'attend\)/);
});

test('changements en attente : affichés tout de suite, fondus par todo, retour à l\'état enregistré = rien', () => {
  reset();
  run("tdChange({op:'move',id:'t1',to:'done'});tdChange({op:'duck',id:'t2'});tdAdd('  Appeler Jan  ','high');");
  assert.deepEqual(J("tdIn('todo').map(t=>t.title)"), ['Appeler Jan']);
  assert.deepEqual(J("tdIn('duck').map(t=>t.id)"), ['t2', 't3']);
  assert.deepEqual(J("tdIn('done').map(t=>t.id)"), ['t1', 't4']);
  assert.equal(J('TD_PEND.length'), 3);
  run("tdChange({op:'move',id:'t1',to:'todo'});"); // retour à la colonne enregistrée
  assert.equal(J("TD_PEND.filter(o=>o.id==='t1').length"), 0);
  const key = J("TD_PEND.find(o=>o.op==='add').key");
  run(`tdChange({op:'duck',id:'${key}'});`); // un ajout pas encore enregistré qu'on confie au canard : l'ajout part dans sa colonne
  assert.deepEqual(J("TD_PEND.filter(o=>o.op==='add').map(o=>o.to)"), ['duck']);
  run(`tdChange({op:'delete',id:'${key}'});`); // ajouté puis supprimé : plus rien à envoyer
  assert.deepEqual(J('TD_PEND.map(o=>o.op)'), ['duck']);
  run("tdAdd('   ');");
  assert.equal(J('TD_PEND.length'), 1, 'titre vide : ignoré');
});

test('le code copié : TODO1 + base64 des changements, lisible par todos.py', () => {
  reset();
  run("tdAdd('Écrire à Holly','normal');tdChange({op:'delete',id:'t4'});");
  const code = J('todoCode(TD_PEND)');
  assert.match(code, /^TODO1:[A-Za-z0-9+/=]+$/);
  const req = JSON.parse(Buffer.from(code.slice(6), 'base64').toString('utf8'));
  assert.deepEqual(req.ops.map(o => [o.op, o.title || o.id]), [['add', 'Écrire à Holly'], ['delete', 't4']]);
});

test('nouvelles données : un changement déjà fait dans Kronn sort de la liste en attente', () => {
  reset();
  run("tdChange({op:'move',id:'t1',to:'done'});tdChange({op:'duck',id:'t2'});tdAdd('Appeler Jan','normal');");
  const done = {...DS, todos: DS.todos.slice(0, 4).map(t => t.id === 't1' ? {...t, col: 'done'} : t)
    .concat([{id: 't9', title: 'Appeler Jan', col: 'todo', created: new Date().toISOString()}])};
  run(`todosArrived(${JSON.stringify(done)});`);
  assert.deepEqual(J('TD_PEND.map(o=>o.op+":"+(o.id||o.title))'), ['duck:t2'], 't1 fait et l\'ajout créé : seuls restent ceux pas encore vus');
});
