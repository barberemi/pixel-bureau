// Loupe (44-loupe.js) : un médaillon sur l'événement fort qui commence (réouverture, mise en prod, visite, fête de MEP,
// pouce du testeur, lancement du sprint) ; rien au premier passage (ce qui était déjà en cours), une loupe par groupe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const mk = (key, st, extra = '') => `{key:'${key}',name:'${key}',pos:{x:320,y:160},_st:{st:'${st}',label:'${key} ${st}'}${extra}}`;

test('types : états de scène, et un invité hors scène de héraut = une visite', () => {
  assert.equal(run(`loupeKind(${mk('a', 'reopen')})`), 'reopen');
  assert.equal(run(`loupeKind(${mk('a', 'thumbs')})`), 'thumbs');
  assert.equal(run(`loupeKind(${mk('g', 'idle', ',guest:true')})`), 'guest');
  assert.equal(run(`loupeKind(${mk('g', 'proud', ',guest:true')})`), 'proud');
  assert.equal(run(`loupeKind(${mk('a', 'work')})`), null);
});

test('scan : le premier passage note ce qui est en cours ; ensuite, un événement par groupe qui commence', () => {
  run(`LOUPE.seen=null; chars=[${mk('dev', 'work')}];`);
  assert.deepEqual(J('loupeScan()'), []);
  run(`chars=[${mk('dev', 'reopen')},${mk('qa', 'reopen')},${mk('gandalf', 'reopen', ',guest:true')}];`);
  const ev = J('loupeScan().map(e=>({id:e.id,n:e.cs.length}))');
  assert.deepEqual(ev, [{id: 'reopen', n: 3}]);
  assert.deepEqual(J('loupeScan()'), [], 'déjà vu : pas de seconde loupe');
});

test('légende : l\'invité (le héraut) en premier, les autres ensuite, et le libellé de son état', () => {
  const c = J(`loupeCaption({kind:'reopen',cs:[${mk('Pam', 'reopen')},${mk('Gandalf', 'reopen', ',guest:true')}]})`);
  assert.equal(c.title, 'Gandalf · Pam');
  assert.equal(c.sub, 'Gandalf reopen');
  assert.equal(c.ico, '⛔');
});
