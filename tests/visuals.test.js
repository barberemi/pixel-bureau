// Enveloppes, double bulle et écrans des postes (idées reprises de Munder Difflin).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const Z = s => Date.parse(s);
const T11 = Z('2026-10-01T09:00:00Z');
const MIN = 60e3;

// trois agents et le boss ; un parent lance un sous-run chez B, B a une validation, C est déclenché par A
function world() {
  run(`{
    const mk=(key,extra)=>({key,name:key,wf:[],seat:[11,14],runs:[],present:false,pos:null,...extra});
    const A=mk('A'),B=mk('B'),C=mk('C'),V=mk('V',{visitor:true,seat:null}),BOSS=mk('BOSS',{boss:true,seat:null});
    const rA={run:'ra',status:'Running',_s:${T11 - 20 * MIN},_e:null,_ve:Infinity,steps:[]};
    const rB={run:'rb',parent:'ra',status:'Success',_s:${T11 - 10 * MIN},_e:${T11 - 8 * MIN},_ve:${T11 - 6 * MIN},
      steps:[{n:'ok_prod',k:'Gate',at:'${new Date(T11 - 9 * MIN).toISOString()}'}]};
    const rC={run:'rc',tby:'ra',status:'Running',_s:${T11 - 5 * MIN},_e:null,_ve:Infinity,steps:[]};
    A.runs=[rA];B.runs=[rB];C.runs=[rC];V.runs=[{visitor:true,run:'d1',_s:${T11 - 4 * MIN}}];
    chars=[A,B,C,V,BOSS]; byKey=Object.fromEntries(chars.map(c=>[c.key,c]));
    DATA={runs:[rA,rB,rC]}; DISC_BY_RUN={rc:[V]};
    ENV.src=null; ENV.seen=new Set(); ENV.lastT=null; ENV.fly=[];
  }`);
}

test('enveloppes : sous-run, retour, validation, déclenchement et discussion', () => {
  world();
  const ev = J('envEvents().map(e=>[e.kind,e.from,e.to])');
  assert.deepEqual(ev, [
    ['sub', 'A', 'B'],
    ['gate', 'B', 'BOSS'],
    ['ok', 'B', 'A'],
    ['trig', 'A', 'C'],
    ['disc', 'C', 'V'],
  ]);
  // la validation est placée sur l'instant affiché (run fini étiré sur VIS_MIN) : entre le début et la fin affichée
  const g = J('envEvents().find(e=>e.kind==="gate").t');
  assert.ok(g > T11 - 10 * MIN && g < T11 - 6 * MIN);
});

test('enveloppes : rien ne part au chargement, puis seulement ce qui vient d\'être franchi', () => {
  world();
  run(`T=${T11 - 7 * MIN}; envTick(0);`);
  assert.equal(J('ENV.fly.length'), 0, 'premier passage : tout le passé est marqué vu');
  run(`T=${T11 - 5 * MIN}; envTick(1000);`); // ok (−6 min) et trig (−5 min) franchis
  assert.deepEqual(J('ENV.fly.map(f=>f.kind)'), ['ok', 'trig']);
  run(`T=${T11 - 5 * MIN}; envTick(1100);`);
  assert.equal(J('ENV.fly.length'), 2, 'déjà vus : pas de doublon');
});

test('enveloppes : un saut en arrière puis la lecture les rejoue ; un grand saut en avant n\'en fait partir aucune', () => {
  world();
  run(`T=${T11}; envTick(0); T=${T11 - 30 * MIN}; envTick(10);`);
  assert.equal(J('ENV.fly.length'), 0);
  run(`T=${T11 - 9.5 * MIN}; envTick(20);`); // > 3 min d'un coup : saut
  assert.equal(J('ENV.fly.length'), 0);
  run(`T=${T11 - 7.5 * MIN}; envTick(30);`); // validation affichée à −8 min (run étiré)
  assert.deepEqual(J('ENV.fly.map(f=>f.kind)'), ['gate']);
});

test('enveloppes : arrivée tardive avec les données live (moins de 3 min) : part quand même', () => {
  world();
  run(`T=${T11 - 11 * MIN}; envTick(0); DATA={runs:DATA.runs.slice()}; T=${T11 - 9.5 * MIN}; envTick(10);`);
  assert.deepEqual(J('ENV.fly.map(f=>f.kind)'), ['sub']);
});

test('écrans : travail assis, veille, absent, panne', () => {
  const S = o => J(`screenState(${o})`);
  assert.equal(S(`{present:true,moving:false,_st:{st:'work',zone:'desk'}}`), 'work');
  assert.equal(S(`{present:true,moving:false,_st:{st:'idle',zone:'desk'}}`), 'idle');
  assert.equal(S(`{present:true,moving:true,_st:{st:'work',zone:'desk'}}`), 'sleep');
  assert.equal(S(`{present:true,moving:false,_st:{st:'coffee',zone:'coffee'}}`), 'sleep');
  assert.equal(S(`{present:true,moving:false,_st:{st:'error',zone:'wc'}}`), 'crash');
  assert.equal(S(`{present:false}`), 'off');
  assert.equal(S(`{boss:true,atBoss:true,present:true,moving:false,_st:{st:'boss',zone:'boss'}}`), 'work');
  assert.equal(S(`{boss:true,atBoss:false,present:true,moving:false,_st:{st:'coffee',zone:'coffee'}}`), 'sleep');
});

test('double bulle : le nuage garde l\'étape, l\'outil part dans sa bulle', () => {
  run('chars=[]; TEAM={people:[],meps:[]};');
  const act = `{ico:'⌨️',bubble:'⌨️ npm test',label:'⌨️ lance npm test'}`;
  const bb = J(`bubbleFor({key:'ag'},{st:'work',bubble:'⌨️ npm test',stepBubble:'review_diff',act:${act}},${T11},0)`);
  assert.equal(bb.head, 'review_diff');
  assert.equal(bb.cloud, true);
  assert.equal(bb.tool.bubble, '⌨️ npm test');
  // humain : bulle classique, pas de nuage
  const h = J(`bubbleFor({key:'p',person:'x'},{st:'idle',bubble:'Disponible'},${T11},0)`);
  assert.equal(h.cloud, false);
  assert.equal(h.tool, null);
  // agent sur un ticket : nuage « 🤖 1234 », outil à part
  const r = J(`bubbleFor({key:'ag'},{st:'work',ref:{key:'EW-1234',pr:null},act:${act}},${T11},0)`);
  assert.equal(r.head, '🤖 1234');
  assert.equal(r.tool.ico, '⌨️');
});

test('bulle d\'outil : en entier 6 s après un changement d\'outil, puis réduite à l\'icône', () => {
  run('var TC={key:"t"};');
  const a = n => `{ico:'📖',bubble:'📖 ${n}',label:'📖 lit ${n}'}`;
  assert.equal(J(`toolPhase(TC,${a('a.ts')},1000).full`), true);
  assert.equal(J(`toolPhase(TC,${a('a.ts')},7500).full`), false);
  assert.equal(J(`toolPhase(TC,${a('b.ts')},8000).full`), true, 'nouvel outil : de nouveau en entier');
  assert.equal(J(`toolPhase(TC,null,9000)`), null);
});
