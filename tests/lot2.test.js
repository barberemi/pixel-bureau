// Lot 2 : « À traiter », fil regroupé et filtré, récap de la journée.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const T11 = Date.parse('2026-10-01T09:00:00Z');
const H = 3600e3, D = 864e5;

function world() {
  run(`{
    const mk=(key,extra)=>({key,name:key,wf:[],seat:[11,14],runs:[],...extra});
    chars=[
      mk('meredith',{wf:['aaaa1111'],_st:{st:'error',alarm:21,step:{n:'collect'},run:{_e:${T11 - H}}}}),
      mk('oscar',{wf:['bbbb2222'],_st:{st:'gate'}}),
      mk('v1',{visitor:true,disc:{id:'d-1',title:'Une question',end:'${new Date(T11 - 2 * H).toISOString()}'},_st:{st:'ask'}}),
      mk('p_remi',{person:'Remi',boss:true,team:{gh:['barberemi'],prs:[{n:7,title:'Ma PR',review:'changes',url:'u7',updated:'${new Date(T11 - H).toISOString()}'}]},_st:{st:'boss'}}),
      mk('ok',{wf:['cccc3333'],_st:{st:'work'}})
    ];
    GATES=[{run:'r',wf:'bbbb2222-x',gate:'ok_prod',since:'${new Date(T11 - 30 * 60e3).toISOString()}'}];
    TEAM={people:[
      {name:'Andy M',tickets:[{key:'EW-1',cat:'review',summary:'vieux',updated:'${new Date(T11 - 3 * D).toISOString()}'},{key:'EW-2',cat:'review',summary:'récent',updated:'${new Date(T11 - H).toISOString()}'}],
       prs:[{n:10,title:'À relire',review:'pending',req:['BarbeRemi'],url:'u10',updated:'${new Date(T11 - 2 * D).toISOString()}'},
            {n:11,title:'Vieille',review:'pending',req:[],url:'u11',updated:'${new Date(T11 - 2 * D).toISOString()}'},
            {n:12,title:'Brouillon',draft:true,review:'pending',req:['barberemi'],url:'u12'}]}],
      unassigned:[],other_prs:[],meps:[],events:[],merged_today:[]};
    CFG.github_login=null; CFG.github_repo='org/repo';
  }`);
}

test('À traiter : panne, validation, question, PR à relire et à corriger, ticket bloqué, PR sans review', () => {
  world();
  const items = J(`todoItems(${T11})`);
  assert.deepEqual(items.map(x => x.key), ['err:meredith', 'gate:oscar', 'ask:v1', 'rev:10', 'fix:7', 'tk:EW-1', 'stale']);
  assert.deepEqual(items.map(x => x.sev), ['err', 'warn', 'warn', 'warn', 'warn', 'info', 'info']);
  assert.match(items[0].txt, /21 échecs d'affilée/);
  assert.equal(items[1].age, 30 * 60e3);
  assert.equal(items[2].act.href, 'http://localhost:5173/#discussion-d-1');
  assert.match(items[6].txt, /#11/);
  assert.doesNotMatch(items[6].txt, /#10/, 'la PR qui t\'attend n\'est pas comptée deux fois');
});

test('À traiter : le login de la config passe avant celui des PR', () => {
  world();
  run(`CFG.github_login='quelquun';`);
  assert.equal(J(`todoItems(${T11}).some(x=>x.key==='rev:10')`), false);
  run(`CFG.github_login=null;`);
});

// un agent horaire (6 runs dont 2 échecs), un agent ponctuel (1 succès), un événement d'équipe
function feedEv() {
  return `(()=>{const A={key:'a',name:'Creed'},B={key:'b',name:'Dwight'},ev=[];
    for(let i=0;i<6;i++){ev.push({t:${T11}-i*${H},c:A,agent:true,grp:'a|w',kind:'start',done:true,txt:'lance'});
      ev.push({t:${T11}-i*${H}+60e3,c:A,agent:true,grp:'a|w',kind:i<2?'ko':'ok',wf:'Erreurs prod',txt:'fin'});}
    ev.push({t:${T11}-30e3,c:B,agent:true,grp:'b|x',kind:'ok',wf:'Review',txt:'✓ Dwight termine'});
    ev.push({t:${T11}-90e3,c:B,agent:true,grp:'b|x',kind:'start',done:true,txt:'Dwight lance'});
    ev.push({t:${T11}-45e3,c:null,team:true,txt:'merge #12'});
    return ev.sort((x,y)=>y.t-x.t);})()`;
}

test('fil : un workflow répété tient en une ligne, « Important » ne garde que l\'équipe et les échecs', () => {
  const imp = J(`feedView(${feedEv()},'important').map(e=>e.txt)`);
  assert.equal(imp.length, 2);
  assert.ok(imp.some(x => x === 'merge #12'));
  assert.ok(imp.some(x => /×6 aujourd'hui · 4 ✓ · 2 ✗/.test(x)));
  const all = J(`feedView(${feedEv()},'all').map(e=>e.txt)`);
  assert.equal(all.length, 3, 'tout : + la fin du run ponctuel, sans sa ligne de lancement');
  assert.ok(all.includes('✓ Dwight termine'));
  assert.ok(!all.includes('Dwight lance'));
});

test('récap : échecs par agent, MEP, merges, tickets déployés et créés depuis minuit', () => {
  world();
  const iso = d => new Date(d).toISOString();
  run(`DAY0=${T11 - 11 * H};
    chars[0].top=[{status:'Failed',_e:${T11 - H}},{status:'Failed',_e:${T11 - 2 * H}},{status:'Failed',_e:${T11 - 20 * H}}];
    TEAM.meps=[{tag:'17.1',ticket:'EW-9',prod:{end:'${iso(T11 - 3 * H)}',conclusion:'success'}}];
    TEAM.merged_today=[{n:5,mergedAt:'${iso(T11 - H)}'}];
    TEAM.events=[{kind:'new',key:'EW-20',t:'${iso(T11 - H)}'},{kind:'move',cat:'done',key:'EW-9',t:'${iso(T11 - 2 * H)}'},{kind:'new',key:'EW-0',t:'${iso(T11 - 30 * H)}'}];`);
  const d = J(`recapData(${T11})`);
  assert.deepEqual(d.fails, [['meredith', 2]], 'l\'échec d\'avant minuit ne compte pas');
  assert.deepEqual(d.alarms, ['meredith']);
  assert.equal(d.mepOk.length, 1);
  assert.equal(d.merged.length, 1);
  assert.deepEqual(d.created.map(e => e.key), ['EW-20']);
  assert.deepEqual(d.deployed.map(e => e.key), ['EW-9']);
  assert.equal(d.todo, 5);
});
