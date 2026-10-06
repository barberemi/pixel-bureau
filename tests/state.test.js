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
  assert.equal(cards[0].sub, '✋ 1 validation à faire · en cours · +1 : DM-6');
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
  run(`TEAM=null;TEAM_BASE=null;LIVE=null;`);
});
