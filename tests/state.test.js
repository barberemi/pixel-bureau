// Machine à états stateAt : où est chaque personnage et que fait-il, à un instant donné.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');
const MEP = require('./fixtures/bureau.config.json').mep_workflow; // workflow de mise en prod de la démo

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const Z = s => Date.parse(s);
const T11 = Z('2026-10-01T09:00:00Z'); // jeudi 11h00 à Paris
const MIN = 60e3;

// personnages construits à la main, monde isolé : pas d'équipe, pas de MEP, pas d'autres runs
function reset() {
  run(`TEAM={people:[],meps:[]}; DATA={runs:[]}; REND=${T11}; chars=[];`);
}
const agentWith = r => `({key:'ag',name:'Agent',wf:['abcd1234'],seat:[11,14],runs:[${r}]})`;

test('agent sur une étape Agent : au bureau, bulle = nom de l\'étape', () => {
  reset();
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'fetch',k:'ApiCall',at:'2026-10-01T08:50:00Z'},{n:'review',k:'Agent',at:'2026-10-01T08:55:00Z'}],vars:{}}`)}, ${T11})`);
  assert.equal(st.st, 'work');
  assert.equal(st.zone, 'desk');
  assert.equal(st.bubble, 'review');
  assert.equal(st.label, 'Travaille sur review');
});

test('étape ApiCall : salle serveurs', () => {
  reset();
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'fetch',k:'ApiCall',at:'2026-10-01T08:50:00Z'}],vars:{}}`)}, ${T11})`);
  assert.equal(st.st, 'srv');
  assert.equal(st.zone, 'srv');
  assert.match(st.label, /^Salle serveurs : fetch/);
});

test('étape Agent sur le ticket d\'un collègue : va le voir à sa place (visit)', () => {
  reset();
  run(`chars=[{key:'p_a',name:'Alice',person:'Alice',seat:[5,14],team:{tickets:[{key:'DM-42',cat:'doing'}],gh:[]},runs:[]}]`);
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'implement',k:'Agent',at:'2026-10-01T08:55:00Z'}],vars:{jira_ticket_key:'DM-42'}}`)}, ${T11})`);
  assert.equal(st.zone, 'visit');
  assert.deepEqual(st.visit, [4, 14, 'right']);
  assert.equal(st.label, 'Travaille sur implement · avec Alice sur DM-42');
});

test('outil en cours récent : bulle et libellé de l\'outil', () => {
  reset();
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'review',k:'Agent',at:'2026-10-01T08:55:00Z',act:{t:'Read',x:'src/a.ts',at:'2026-10-01T08:59:00Z'}}],vars:{}}`)}, ${T11})`);
  assert.equal(st.bubble, '📖 a.ts');
  assert.equal(st.label, 'Travaille sur review · 📖 lit a.ts');
});

test('WaitingApproval : à la gate', () => {
  reset();
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'abcd1234-x',status:'WaitingApproval',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'gate',k:'Gate',at:'2026-10-01T08:55:00Z'}],vars:{}}`)}, ${T11})`);
  assert.equal(st.st, 'gate');
  assert.equal(st.zone, 'gate');
  assert.equal(st.bubble, '✋');
});

test('échec récent : aux toilettes (error / wc), puis disponible après 40 min', () => {
  reset();
  const failed = t0 => agentWith(`{run:'r1',wf:'abcd1234-x',status:'Failed',_s:${t0 - 5 * MIN},_e:${t0},_ve:${t0},
    steps:[{n:'ok',k:'Exec',s:'Success'},{n:'deploy',k:'Exec',s:'Failed'}],vars:{}}`);
  let st = J(`stateAt(${failed(T11 - 10 * MIN)}, ${T11})`);
  assert.equal(st.st, 'error');
  assert.equal(st.zone, 'wc');
  assert.equal(st.label, 'En panne sur deploy : enfermé aux toilettes');
  st = J(`stateAt(${failed(T11 - 50 * MIN)}, ${T11})`);
  assert.equal(st.st, 'idle');
  assert.equal(st.zone, 'wander');
});

test('succès récent : pause café ; avant le premier run : pas encore arrivé', () => {
  reset();
  const ok = agentWith(`{run:'r1',wf:'abcd1234-x',status:'Success',_s:${T11 - 10 * MIN},_e:${T11 - 5 * MIN},_ve:${T11 - 5 * MIN},steps:[],vars:{}}`);
  assert.equal(J(`stateAt(${ok}, ${T11})`).st, 'coffee');
  assert.equal(J(`stateAt(${ok}, ${T11 - 20 * MIN})`).st, 'absent');
  assert.equal(J(`stateAt({key:'x',wf:[],runs:[]}, ${T11})`).st, 'off');
});

test('humain hors des heures de bureau : rentré chez soi', () => {
  reset();
  const human = `({key:'p_a',name:'Alice',person:'Alice',seat:[5,14],team:{tickets:[{key:'DM-1',cat:'doing'}]},runs:[]})`;
  assert.deepEqual(J(`stateAt(${human}, ${Z('2026-10-01T19:30:00Z')})`), {st: 'off', label: 'Rentré chez soi'}); // 21h30
  assert.deepEqual(J(`stateAt(${human}, ${Z('2026-10-01T05:30:00Z')})`), {st: 'off', label: 'Rentré chez soi'}); // 7h30
  const day = J(`stateAt(${human}, ${T11})`);
  assert.equal(day.st, 'work');
  assert.equal(day.bubble, 'DM-1');
  assert.equal(J(`stateAt(${human}, ${Z('2026-10-01T07:45:00Z')})`).st, 'daily'); // 9h45
});

test('visiteur avec messages importants : bulle ❗', () => {
  reset();
  const vis = imp => `({key:'v_1',name:'Claude Code',visitor:true,seat:null,
    disc:{end:'2026-10-01T09:30:00Z',imp:${imp},pending:0,awaiting:false},runs:[{visitor:true,_s:${T11 - 10 * MIN}}]})`;
  const st = J(`stateAt(${vis(2)}, ${T11})`);
  assert.equal(st.st, 'meet');
  assert.equal(st.bubble, '❗');
  assert.equal(st.label, 'En discussion · 2 messages importants');
  assert.equal(J(`stateAt(${vis(1)}, ${T11})`).label, 'En discussion · 1 message important');
  assert.equal(J(`stateAt(${vis(0)}, ${T11})`).bubble, '...');
  assert.equal(J(`stateAt(${vis(2)}, ${T11 - 20 * MIN})`).st, 'absent'); // pas de ❗ avant l'arrivée
});

test('MEP un vendredi : plateau fermé (bulle 😱)', () => {
  reset();
  const fri = Z('2026-10-02T09:00:00Z');
  run(`REND=${fri}`);
  const st = J(`stateAt(${agentWith(`{run:'r1',wf:'${MEP}-x',status:'Running',_s:${fri - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'deploy',k:'Exec',at:'2026-10-02T08:55:00Z'}],vars:{jira_ticket_key:'DM-7'}}`)}, ${fri})`);
  assert.equal(st.st, 'mep');
  assert.equal(st.bubble, '😱');
  assert.match(st.label, /^MEP un vendredi ! Plateau fermé : Pilote la MEP DM-7/);
});

test('deux MEP de projets différents en même temps : la validation qui attend passe avant, les deux comptées et nommées', () => {
  reset();
  const mep = (id, project, key, status, at) => `{run:'${id}',wf:'${MEP}-x',wf_name:'Mise en prod',status:'${status}',_s:${T11 - at * MIN},_e:null,_ve:Infinity,
    steps:[{n:'${status === 'WaitingApproval' ? 'gate_prod' : 'citest'}',k:'${status === 'WaitingApproval' ? 'Gate' : 'Exec'}',at:'2026-10-01T08:5${at % 10}:00Z'}],vars:{project:'${project}',jira_ticket_key:'${key}'}}`;
  // la plus récente tourne, l'autre attend ta validation : il va à la porte du boss pour celle qui attend
  const two = `${agentWith(`${mep('r1', 'acme/front_api', 'DM-1', 'WaitingApproval', 30)},${mep('r2', 'acme/front_web', 'DM-2', 'Running', 5)}`)}`;
  const st = J(`stateAt(${two}, ${T11})`);
  assert.deepEqual([st.st, st.run.run], ['gate', 'r1']);
  assert.equal(st.label, 'Attend ta validation · pilote 2 MEP : front_api DM-1, front_web DM-2');
  // les deux tournent : sur le plateau, les deux projets dans son libellé
  const both = J(`stateAt(${agentWith(`${mep('r1', 'acme/front_api', 'DM-1', 'Running', 30)},${mep('r2', 'acme/front_web', 'DM-2', 'Running', 5)}`)}, ${T11})`);
  assert.equal(both.st, 'mep');
  assert.match(both.label, /^Pilote 2 MEP : front_api DM-1, front_web DM-2 · front_web DM-2 : citest$/);
  // deux validations en attente : toutes deux dans sa fiche et dans le compteur du boss
  run(`T=${T11};chars=[${agentWith(`${mep('r1', 'acme/front_api', 'DM-1', 'WaitingApproval', 30)},${mep('r2', 'acme/front_web', 'DM-2', 'WaitingApproval', 5)}`)}];GATES=[];chars[0]._st=stateAt(chars[0],T);`);
  assert.deepEqual(J('gateRunsOf(chars[0]).map(r=>r.run)'), ['r1', 'r2']);
  assert.equal(J('gateTotal()'), 2);
});

// ---------- bulles (bubbleFor) ----------
const dev = tickets => `({key:'p_b',name:'Bob',person:'Bob',seat:[5,14],team:{tickets:${tickets},gh:[]},runs:[]})`;
const TK = `[{key:'DM-1',cat:'doing',type:'Bug',summary:'Corriger le lecteur vidéo',updated:'2026-09-28T10:00:00.000+0200'},
  {key:'DM-2',cat:'review',type:'Story',summary:'Nouveau bloc'},{key:'DM-3',cat:'done'}]`;

test('dev avec un ticket en cours et un en review : tk liste les deux, en cours d\'abord', () => {
  reset();
  const st = J(`stateAt(${dev(TK)}, ${T11})`);
  assert.equal(st.bubble, 'DM-1');
  assert.deepEqual(st.tk.map(x => x.key), ['DM-1', 'DM-2']);
});

test('dev sans ticket en cours mais avec de la review : il garde une bulle', () => {
  reset();
  const st = J(`stateAt(${dev(`[{key:'DM-9',cat:'review'}]`)}, ${T11})`);
  assert.equal(st.st, 'idle');
  assert.equal(st.bubble, 'DM-9');
  assert.deepEqual(st.tk.map(x => x.key), ['DM-9']);
});

test('mode TV : pas de bulle de travail sur les collègues (déjà dans « Qui fait quoi »), la MEP et le daily gardent la leur', () => {
  reset();
  run(`_bc=${dev(TK)}; _bs=stateAt(_bc, ${T11});`);
  assert.ok(J(`bubbleFor(_bc,_bs,${T11},0)`));
  run('TV=true;');
  try {
    assert.equal(J(`bubbleFor(_bc,_bs,${T11},0)`), null);
    assert.equal(J(`bubbleFor(_bc,{st:'mep',human:true,bubble:'🚀'},${T11},0)`).head, '🚀');
    assert.equal(J(`bubbleFor(_bc,{st:'daily',human:true,bubble:'Daily'},${T11},0)`).head, 'Daily');
    assert.ok(J(`bubbleFor({key:'ag'},{st:'work',bubble:'⌨️ npm test'},${T11},0)`)); // les agents gardent leurs bulles
  } finally { run('TV=false;'); }
});

test('bubbleFor : rotation toutes les 4 s, couleur de l\'état, détail de tous les tickets', () => {
  reset();
  run(`_bc=${dev(TK)}; _bs=stateAt(_bc, ${T11});`);
  const seed = J(`keySeed('p_b')`);
  const at = k => J(`bubbleFor(_bc,_bs,${T11},${k * 4000})`);
  const first = at((2 - seed % 2) % 2); // tour où l'index tombe sur 0
  assert.equal(first.head, '🐛 1 1/2');
  assert.equal(first.tone, '#2e9e5b');
  const second = at((3 - seed % 2) % 2);
  assert.equal(second.head, '📗 2 2/2');
  assert.equal(second.tone, '#4a7fe0');
  assert.deepEqual(first.detail.map(l => l.txt), [
    '🐛 DM-1 · en cours · 3 j', 'Corriger le lecteur vidéo', '📗 DM-2 · en review', 'Nouveau bloc'
  ]);
});

test('runRef : une PR relue retrouve son ticket via les PR de l\'équipe', () => {
  reset();
  run(`TEAM={people:[{name:'Bob',tickets:[{key:'DM-7',cat:'review',summary:'Swiper v14'}],prs:[{n:2012,title:'refactor(DM-7): swiper',keys:['DM-7']}]}],meps:[]}`);
  const ref = J(`runRef({vars:{'current_task.number':'2012'}})`);
  assert.equal(ref.key, 'DM-7');
  assert.equal(ref.pr, '2012');
  assert.equal(ref.t.summary, 'Swiper v14');
  assert.equal(J(`runRef({vars:{}})`), null);
  const orphan = J(`runRef({vars:{pr:'99'}})`);
  assert.equal(orphan.key, null);
  assert.equal(orphan.pr, '99');
});

test('agent sur la PR d\'un collègue : bulle = 🤖 + ticket, détail avec la PR et l\'étape', () => {
  reset();
  run(`TEAM={people:[{name:'Bob',tickets:[{key:'DM-7',cat:'review',summary:'Swiper v14'}],prs:[{n:2012,keys:['DM-7']}]}],meps:[]}`);
  run(`_ac=${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'review',k:'Agent',at:'2026-10-01T08:55:00Z'}],vars:{'current_task.number':'2012'}}`)}; _as=stateAt(_ac, ${T11});`);
  const bb = J(`bubbleFor(_ac,_as,${T11},0)`);
  assert.equal(bb.head, '🤖 7');
  assert.equal(bb.tone, '#4a7fe0');
  assert.deepEqual(bb.detail.map(l => l.txt), ['🤖 DM-7 · PR #2012', 'Swiper v14', 'Étape review']);
});

test('agent sans ticket ni PR : bulle inchangée (nom de l\'étape)', () => {
  reset();
  run(`_ac=${agentWith(`{run:'r1',wf:'abcd1234-x',status:'Running',_s:${T11 - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'review',k:'Agent',at:'2026-10-01T08:55:00Z'}],vars:{}}`)}; _as=stateAt(_ac, ${T11});`);
  const bb = J(`bubbleFor(_ac,_as,${T11},0)`);
  assert.equal(bb.head, 'review');
  assert.equal(bb.detail, null);
});

test('whoCards : ce qui demande une action d\'abord, puis l\'équipe, puis les agents actifs ; agents inactifs exclus', () => {
  reset();
  run(`chars=[
    {key:'ag_idle',name:'Jim',runs:[],present:true,_st:{st:'idle',label:'Disponible'}},
    {key:'ag_work',name:'Dwight',runs:[],present:true,_st:{st:'work',label:'Travaille sur review',run:{wf_name:'Review PR',_s:${T11 - 12 * MIN}},step:{n:'review'}}},
    {key:'p_b',name:'Bob',person:'Bob',runs:[],present:true,_st:{st:'work',human:true,label:'En cours',tk:[{key:'DM-1',cat:'doing',type:'Bug',summary:'Lecteur'}]}},
    {key:'ag_ko',name:'Meredith',runs:[],present:true,_st:{st:'error',label:'En panne',run:{wf_name:'Statistiques',_s:${T11 - 40 * MIN}}}}
  ]`);
  const cards = J(`whoCards(${T11}).map(x=>({k:x.c.key,what:x.what,since:x.since,attn:x.attn}))`);
  assert.deepEqual(cards.map(x => x.k), ['ag_ko', 'p_b', 'ag_work']);
  assert.equal(cards[0].attn, true);
  assert.equal(cards[1].what, '🐛 DM-1 Lecteur');
  assert.equal(cards[2].what, '⚙ Review PR');
  assert.equal(cards[2].since, '12 min');
});

test('whoCards : le boss en tout premier, avec son ticket et ce qui l\'attend', () => {
  reset();
  run(`chars=[
    {key:'ag_ko',name:'Meredith',runs:[],present:true,_st:{st:'error',label:'En panne'}},
    {key:'ag_g',name:'Dwight',runs:[],present:true,_st:{st:'gate',label:'Attend ta validation'}},
    {key:'boss',name:'Michael',boss:true,person:'Michael',runs:[],present:true,_st:{st:'boss',label:'Au bureau du boss'},
      team:{tickets:[{key:'DM-5',cat:'done'},{key:'DM-6',cat:'review',type:'Story',summary:'Bloc'},{key:'DM-7',cat:'doing',type:'Bug',summary:'Fix'}]}}
  ]`);
  const cards = J(`whoCards(${T11}).map(x=>({k:x.c.key,what:x.what,sub:x.sub}))`);
  assert.deepEqual(cards.map(x => x.k), ['boss', 'ag_g', 'ag_ko']);
  assert.equal(cards[0].what, '🐛 DM-7 Fix');
  assert.equal(cards[0].sub, '✋ 1 validation à faire · en cours · +1 autre'); // la liste des clés : dans l'infobulle
  assert.equal(J(`whoCards(${T11})[0].tip`), 'DM-7 Fix\nDM-6 Bloc');
});

// ---------- la journée du boss ----------
const bossAt = (iso, extra = '') => {
  run(`TEAM={people:[],meps:[]}; DATA={runs:[]}; REND=${Z(iso)};
    chars=[{key:'boss',name:'Michael',boss:true,person:'Michael',runs:[],seat:null,sprite:'boss_sax'},
      {key:'p_a',name:'Alice',person:'Alice',seat:[12,14],present:true,_st:{st:'work',zone:'desk'},runs:[]}${extra}];`);
  return J(`stateAt(chars[0], ${Z(iso)})`);
};
const parisISO = (day, hhmm) => { // heure de Paris (UTC+2 en octobre) -> ISO UTC
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(day + 'T00:00:00Z') + ((h - 2) * 60 + m) * 60e3).toISOString();
};
const DAY = '2026-10-01'; // jeudi
const plan = () => J(`bossPlan(${Z(parisISO(DAY, '12:00'))})`);
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

test('boss : au daily en sax, à son bureau le soir', () => {
  const d = bossAt(parisISO(DAY, '09:45'));
  assert.equal(d.zone, 'daily');
  assert.equal(d.bubble, '♪');
  assert.equal(bossAt(parisISO(DAY, '22:30')).zone, 'boss');
});

test('boss : une validation en attente le ramène au bureau, même à l’heure du café', () => {
  const p = plan(), coffee = hhmm(p.coffee[0][0] + 2);
  assert.equal(bossAt(parisISO(DAY, coffee)).zone, 'coffee');
  const st = bossAt(parisISO(DAY, coffee), `,{key:'g',name:'Dwight',runs:[],present:true,_st:{st:'gate'}}`);
  assert.equal(st.zone, 'boss');
  assert.equal(st.bubble, '✋1');
});

test('boss : sax à son bureau de h45 à h50, jamais de tournée chez les collègues', () => {
  const sax = bossAt(parisISO(DAY, '11:46'));
  assert.equal(sax.st, 'sax');
  assert.equal(sax.zone, 'boss');
  for (let m = 9 * 60; m < 18 * 60; m += 3) {
    const s = bossAt(parisISO(DAY, hhmm(m)));
    if (s.st !== 'retro' && s.st !== 'planning') assert.notEqual(s.zone, 'visit', hhmm(m)); // animer une cérémonie : en bout de table
  }
});

test('boss : même planning pour une même date (replay et autres écrans), différent un autre jour', () => {
  const a = plan(), b = plan();
  assert.deepEqual(a, b);
  const other = J(`bossPlan(${Z(parisISO('2026-10-05', '12:00'))})`);
  assert.notDeepEqual(other, a);
});

test('boss sans sprite de saxophoniste : au daily sans sax, pas de sax à h45', () => {
  run(`TEAM={people:[],meps:[]}; DATA={runs:[]}; chars=[{key:'p_c',name:'Darryl',boss:true,person:'Darryl',runs:[],seat:null}];`);
  const d = J(`stateAt(chars[0], ${Z(parisISO(DAY, '09:45'))})`);
  assert.equal(d.st, 'daily');
  assert.equal(J(`stateAt(chars[0], ${Z(parisISO(DAY, '11:46'))})`).st, 'boss');
});

test('week-end : les collègues restent chez eux, le boss vient', () => {
  const sat = parisISO('2026-10-03', '11:00'); // samedi
  run(`TEAM={people:[],meps:[]}; DATA={runs:[]}; chars=[];`);
  const dev = J(`stateAt({key:'p_a',name:'Alice',person:'Alice',seat:[5,14],team:{tickets:[{key:'DM-1',cat:'doing'}]},runs:[]}, ${Z(sat)})`);
  assert.deepEqual(dev, {st: 'off', label: 'En week-end'});
  assert.equal(bossAt(sat).zone, 'boss');
  assert.equal(J(`stateAt({key:'p_a',name:'Alice',person:'Alice',seat:[5,14],team:{tickets:[{key:'DM-1',cat:'doing'}]},runs:[]}, ${Z(parisISO('2026-10-05', '11:00'))})`).st, 'work'); // lundi
});

// ---------- données figées, alarme, minuit de Paris (lot 1 du 4 octobre) ----------
const failRun = (id, startMin) => `{run:'${id}',wf:'abcd1234-x',status:'Failed',_s:${T11 - startMin * MIN},_e:${T11 - (startMin - 1) * MIN},_ve:${T11 - (startMin - 4) * MIN},
  steps:[{n:'collect',k:'ApiCall',s:'Failed',at:'2026-10-01T08:00:00Z'}],vars:{}}`;

test('alarme : 3 échecs d\'affilée restent en panne au-delà de 40 min, avec la santé 7 j', () => {
  reset();
  run('PAYROLL={agents:[{wf:"abcd1234-x",name:"Agent",today:{tok:0,runs:3,fail:3},week:{tok:0,runs:160,fail:136},days:[0,0,0,0,0,0,0]}],days:[]};');
  const st = J(`stateAt(${agentWith([failRun('a', 300), failRun('b', 200), failRun('c', 100)].join(','))}, ${T11})`);
  assert.equal(st.st, 'error');
  assert.equal(st.alarm, 3);
  assert.equal(st.bubble, '🚨 3');
  assert.match(st.label, /3 échecs d'affilée.*136 échecs sur 160 runs en 7 j \(85 %\)/);
  run('PAYROLL=null;');
});

test('alarme : 2 échecs seulement, panne oubliée après 40 min comme avant', () => {
  reset();
  const st = J(`stateAt(${agentWith([failRun('b', 200), failRun('c', 100)].join(','))}, ${T11})`);
  assert.notEqual(st.st, 'error');
});

test('alarme : un succès après les échecs remet le compteur à zéro', () => {
  reset();
  const ok = `{run:'d',wf:'abcd1234-x',status:'Success',_s:${T11 - 60 * MIN},_e:${T11 - 59 * MIN},_ve:${T11 - 56 * MIN},steps:[],vars:{}}`;
  const st = J(`stateAt(${agentWith([failRun('a', 300), failRun('b', 200), failRun('c', 100), ok].join(','))}, ${T11})`);
  assert.notEqual(st.st, 'error');
});

test('données figées : un run « en cours » n\'est plus cru quand le direct a plus de 3 min', () => {
  reset();
  const now = Date.now(), gen = now - 2 * 3600e3; // dernier relevé il y a 2 h (la nuit)
  run(`LIVE_DATA=true; LIVE={generated_at:'${new Date(gen).toISOString()}',runs:[]}; REND=${now};`);
  const running = `{run:'r1',wf:'abcd1234-x',status:'Running',_s:${gen - 10 * MIN},_e:null,_ve:Infinity,
    steps:[{n:'review',k:'Agent',at:'${new Date(gen - 5 * MIN).toISOString()}'}],vars:{}}`;
  const st = J(`stateAt(${agentWith(running)}, ${now})`);
  assert.equal(st.st, 'frozen');
  assert.match(st.label, /^Données figées depuis \d\d:\d\d : était sur review$/);
  // en rejeu, juste avant le dernier relevé : au travail comme d'habitude
  assert.equal(J(`stateAt(${agentWith(running)}, ${gen - MIN})`).st, 'work');
  // direct frais : au travail
  run(`LIVE={generated_at:'${new Date(now - 30e3).toISOString()}',runs:[]};`);
  assert.equal(J(`stateAt(${agentWith(running)}, ${now})`).st, 'work');
  run('LIVE_DATA=false; LIVE=null;');
});

test('minuit de Paris, y compris le jour du passage à l\'heure d\'hiver', () => {
  const M = s => new Date(J(`parisMidnight(${Date.parse(s)})`)).toISOString();
  assert.equal(M('2026-10-03T12:00:00Z'), '2026-10-02T22:00:00.000Z'); // été : UTC+2
  assert.equal(M('2026-10-25T18:00:00Z'), '2026-10-24T22:00:00.000Z'); // jour du changement : minuit encore en heure d'été
  assert.equal(M('2026-10-26T08:00:00Z'), '2026-10-25T23:00:00.000Z'); // hiver : UTC+1
});

test('workflow désactivé : plus de panne ni d\'alarme, l\'agent est absent', () => {
  reset();
  run(`DATA={runs:[],disabled:['abcd1234-ffff']};`);
  const st = J(`stateAt(${agentWith([failRun('a', 300), failRun('b', 200), failRun('c', 100)].join(','))}, ${T11})`);
  assert.equal(st.st, 'off');
  assert.match(st.label, /désactivé/);
  run('DATA={runs:[]};');
});

test('MEP d\'un autre dépôt suivi (github.deploys) : nom du projet, pas de release inventée, scène du plateau TV', () => {
  reset();
  const dep = `{status:'in_progress',conclusion:null,start:'2026-10-01T08:50:00Z',end:null,url:'https://x/r/9',project:'api',repo:'acme/front_api'}`;
  run(`TEAM_BASE={people:[],meps:[]};LIVE={deploys:{staging:{},prod:{'api 2.4.0':${dep}}}};TEAM=mergedTeam();`);
  const m = J(`TEAM.meps[0]`);
  assert.equal(m.tag, 'api 2.4.0');
  assert.equal(m.name, 'api 2.4.0');
  assert.equal(m.released, null);
  assert.equal(m.repo, 'acme/front_api');
  assert.equal(J(`mepPhase(TEAM.meps[0],${T11})`), 'prod');
  assert.equal(J(`stageAt(${T11}).m.tag`), 'api 2.4.0');
  assert.equal(J(`mepChar(TEAM.meps[0])`), null); // personne : on ne sait pas qui l'a lancée
  run(`TEAM=null;TEAM_BASE=null;LIVE=null;`);
});

test('MEP d\'un autre dépôt : celui qui a lancé le déploiement (login GitHub du run) la porte, au plateau et dans le fil', () => {
  const q = load(), R = code => JSON.parse(q.run('JSON.stringify(' + code + ')')); // démo complète : les collègues du roster
  const dep = by => `{status:'in_progress',conclusion:null,start:'2026-10-01T08:50:00Z',end:null,url:'https://x/r/9',project:'api',repo:'acme/front_api',by:${JSON.stringify(by)}}`;
  q.run(`TEAM_BASE={people:[],meps:[]};LIVE={deploys:{staging:{},prod:{'api 2.4.0':${dep('PamBeesly')}}}};TEAM=mergedTeam();`);
  assert.equal(R(`TEAM.meps[0].by`), 'PamBeesly');
  assert.equal(R(`mepChar(TEAM.meps[0]).key`), 'p_pam'); // casse ignorée
  assert.equal(R(`mepName(TEAM.meps[0])`), 'Pam');
  const st = R(`stateAt(chars.find(c=>c.key==='p_pam'),${T11})`);
  assert.equal(st.st, 'mep');
  assert.equal(st.label, 'Met en prod api 2.4.0 : ' + R(`MEP_TXT.prod`)); // pas de « (null) » sans ticket
  q.run(`T=${T11};renderFeed();`);
  assert.ok(R(`FEED_EV.filter(e=>e.ty==='mep').map(e=>e.txt).join('|')`).includes('>Pam</a> met'));
});

test('MEP lancée par un inconnu (ni roster ni sprint) : un visiteur entre le temps de la MEP et de la fête, puis repart', () => {
  const q = load(), R = code => JSON.parse(q.run('JSON.stringify(' + code + ')'));
  const dep = `{status:'completed',conclusion:'success',start:'2026-10-01T08:50:00Z',end:'2026-10-01T09:10:00Z',url:'https://x/r/9',project:'api',repo:'acme/front_api',by:'Outsider-Dev'}`;
  q.run(`TEAM_BASE={people:[],meps:[]};LIVE={deploys:{staging:{},prod:{'api 2.4.0':${dep}}}};setTeam(mergedTeam());`);
  const v = R(`(c=>c&&{key:c.key,name:c.name,guest:c.guest,on:c.on,sprite:c.sprite,person:c.person||null})(mepChar(TEAM.meps[0]))`);
  assert.deepEqual(v, {key: 'g_mep_outsiderdev', name: 'Outsider-Dev', guest: true, on: 'mep', sprite: 'temp', person: null});
  assert.equal(R(`mepName(TEAM.meps[0])`), 'Outsider-Dev');
  const at = h => R(`stateAt(byKey.g_mep_outsiderdev,Date.parse('2026-10-01T00:00:00Z')+${h}*3600e3)`);
  assert.equal(at(8.5).st, 'off'); // avant le déploiement (8h50 UTC) : pas encore là
  assert.deepEqual([at(9).st, at(9).zone], ['mep', 'stage']); // pendant le déploiement, sur la scène
  assert.deepEqual([at(9.2).st, at(9.2).zone], ['party', 'stage']); // fête dans les 10 min après la fin
  assert.equal(at(10).st, 'gone'); // puis il repart
  q.run(`setTeam(mergedTeam());`); // un rafraîchissement ne le duplique pas
  assert.equal(R(`chars.filter(c=>c.on==='mep').length`), 1);
  q.run(`T=Date.parse('2026-10-01T09:30:00Z');renderFeed();`);
  assert.match(R(`FEED_EV.filter(e=>e.ty==='mep').map(e=>e.txt).join('|')`), /data-who="g_mep_outsiderdev"[^>]*>Outsider-Dev<\/a> met .*api 2\.4\.0/);
});

test('whoCards : titre sans « [Composant] », un rôle à titre court garde son détail en gris, liste complète en infobulle', () => {
  reset();
  run(`chars=[
    {key:'p_b',name:'Bob',person:'Bob',runs:[],present:true,_st:{st:'work',human:true,label:'En cours',tk:[
      {key:'DM-1',cat:'doing',type:'Bug',summary:'[Panier] Lecteur'},{key:'DM-2',cat:'review',summary:'[Panier] Autre'},{key:'DM-3',cat:'test',summary:'Trois'}]}},
    {key:'p_q',name:'Karen',person:'Karen',runs:[],present:true,_st:{st:'work',human:true,label:'Teste 2 tickets : DM-4, DM-5',head:'Teste 2 tickets',
      sub:'le plus ancien depuis 3 j',chips:[{key:'DM-4',cat:'test',summary:'[Stock] Quatre'},{key:'DM-5',cat:'test',summary:'Cinq'}],tk:[{key:'DM-4',cat:'test'}]}}
  ]`);
  const [b, q] = J(`whoCards(${T11}).map(x=>({what:x.what,sub:x.sub,tip:x.tip,tone:x.tone}))`);
  assert.equal(b.what, '🐛 DM-1 Lecteur');
  assert.equal(b.sub, 'en cours · +2 autres');
  assert.equal(b.tip, 'DM-1 Lecteur\nDM-2 Autre\nDM-3 Trois');
  assert.deepEqual(q, {what: 'Teste 2 tickets', sub: 'le plus ancien depuis 3 j', tip: 'DM-4 Quatre\nDM-5 Cinq', tone: '#7a5cc8'});
});

test('fiche : ligne d\'état d\'une ligne (titre court, libellé complet au survol), compteurs, tickets cliquables', () => {
  const h = run(`statusHtml({st:'work',label:'Teste 2 tickets : DM-4, DM-5 · 2 écrits cette semaine',head:'Teste 2 tickets',
    facts:[{n:'2',t:'écrits cette semaine'}],chips:[{key:'DM-4',summary:'[Stock] Quatre'}]})`);
  assert.match(h, /<div class="status" title="Teste 2 tickets : DM-4, DM-5 · 2 écrits cette semaine">.*<span class="stt">Teste 2 tickets<\/span>/);
  assert.match(h, /<div class="st-facts"><span><b>2<\/b> écrits cette semaine<\/span><\/div>/);
  assert.match(h, /<a href="#" data-tk="DM-4" title="Quatre">DM-4<\/a>/);
  assert.match(run(`statusHtml({st:'work',label:'En cours : DM-1, DM-2',pill:'En cours sur 2 tickets'})`), /stt">En cours sur 2 tickets</);
  assert.doesNotMatch(run(`statusHtml({st:'off',label:'Rentré chez soi'})`), /st-facts|st-chips/);
});

test('plateau TV : seule la prod déplace l\'auteur et le boss ; une release ou un staging seuls (un test) ne déplacent personne', () => {
  const q = load(), R = code => JSON.parse(q.run('JSON.stringify(' + code + ')'));
  const at = h => `Date.parse('2026-10-01T00:00:00Z')+${h}*3600e3`;
  const stg = `{status:'completed',conclusion:'success',start:'2026-10-01T08:00:00Z',end:'2026-10-01T08:15:00Z',url:'',project:'api',repo:'acme/front_api',by:'pambeesly'}`;
  q.run(`TEAM_BASE={people:[],meps:[]};LIVE={deploys:{staging:{'api 2.4.0':${stg}},prod:{}}};setTeam(mergedTeam());`);
  assert.equal(R(`mepPhase(TEAM.meps[0],${at(8.1)})`), 'staging');
  assert.equal(R(`mepPhase(TEAM.meps[0],${at(9)})`), 'staged');
  for (const h of [8.1, 9, 10.5]) {
    assert.equal(R(`stageAt(${at(h)})`), null, `staging seul, ${h} h UTC`);
    assert.notEqual(R(`stateAt(byKey.p_pam,${at(h)}).zone`), 'stage');
    assert.notEqual(R(`stateAt(chars.find(c=>c.boss),${at(h)}).zone`), 'stageout');
  }
  // la prod part : l'auteur monte sur la scène, le boss vient devant le plateau
  const prd = `{status:'in_progress',conclusion:null,start:'2026-10-01T09:30:00Z',end:null,url:'',project:'api',repo:'acme/front_api',by:'pambeesly'}`;
  q.run(`LIVE={deploys:{staging:{'api 2.4.0':${stg}},prod:{'api 2.4.0':${prd}}}};setTeam(mergedTeam());`);
  assert.equal(R(`stageAt(${at(9.2)})`), null); // validée sur staging, prod pas encore partie
  assert.equal(R(`stageAt(${at(9.6)}).phase`), 'prod');
  assert.deepEqual(R(`(s=>[s.st,s.zone])(stateAt(byKey.p_pam,${at(9.6)}))`), ['mep', 'stage']);
});
