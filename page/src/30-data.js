// ---------- data ----------
const ms=s=>s?Date.parse(s):null;
const VIS_MIN=4*60e3;
let DATA=null, LIVE_DATA=false, chars=[], byKey={};
// collègues « de passage » (dans le sprint, absents du roster) : gardés d'une reconstruction à l'autre (position, place)
const OUTSIDERS={};
let TEAM=null;
const nameKey=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// la palette des statuts de ticket, la seule de la page (bureaux, Kanban, fiches, bulles, KPI, fil, TV)
const TCAT={
  doing:{t:'En cours',c:'#2e9e5b'},
  review:{t:'En review',c:'#4a7fe0'},
  test:{t:'En test',c:'#7a5cc8'},
  deploy:{t:'À déployer',c:'#2e9e9b'},
  todo:{t:'À faire',c:'#8a8478'},
  done:{t:'Déployé',c:'#647282'}
};
const TORDER=['doing','review','test','deploy','todo','done'];
function readTeam(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.team; if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    if(d&&d.payload)d=typeof d.payload==='string'?JSON.parse(d.payload):d.payload;
    return d&&Array.isArray(d.people)?d:null;
  }catch(e){return null;}
}
function roleTickets(kind){
  if(!TEAM)return [];
  if(kind==='qa')return TEAM.people.flatMap(p=>p.tickets.filter(x=>x.cat==='test').map(x=>({...x,owner:p.name})));
  if(kind==='po')return [...(TEAM.unassigned||[]).filter(x=>x.cat!=='done'),...TEAM.people.flatMap(p=>p.tickets.filter(x=>x.cat==='todo').map(x=>({...x,owner:p.name})))];
  return [];
}
function attachTeam(){
  for(const c of chars)c.team=null;
  if(!TEAM){applyNames();return;}
  for(const c of chars)if(c.roleKind){
    const first=n=>nameKey(String(n||'').split(' ')[0]); // le roster peut avoir le nom complet ou le seul prénom
    const own=TEAM.people.find(p=>nameKey(p.name)===nameKey(c.person)||first(p.name)===first(c.person));
    c.team={
      id:own?own.id:'role_'+c.key,
      name:c.person,
      gh:own?own.gh:[],
      tickets:[...roleTickets(c.roleKind),...(own?own.tickets.filter(x=>!roleTickets(c.roleKind).some(y=>y.key===x.key)):[])],
      prs:own?own.prs:[],
      merged:own?own.merged:[],
      role:c.roleKind
    };
  }
  const free=FREE_SEATS.filter(s=>!chars.some(c=>c.seat&&c.seat[0]===s[0]&&c.seat[1]===s[1]));
  for(const p of TEAM.people){
    if(chars.some(x=>x.roleKind&&x.team&&x.team.id===p.id))continue;
    let c=chars.find(x=>x.person&&!x.roleKind&&(nameKey(x.person)===nameKey(p.name)||!String(x.person).includes(' ')&&nameKey(x.person)===nameKey(String(p.name).split(' ')[0])));
    if(!c){
      const key='p_'+String(p.id).slice(-8);
      // de passage : pas un membre de l'équipe ; sa place se prend par la fin des places libres (l'îlot du fond),
      // loin des intérimaires qui les prennent par le début, et il garde la sienne d'un rafraîchissement à l'autre
      c=byKey[key]||OUTSIDERS[key]||mkChar({
        key,
        sprite:'temp',
        name:String(p.name).split(' ')[0],
        role:'De passage',
        person:p.name,
        wf:[],
        outsider:true,
        seat:free.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).pop()||null // la plus au fond (à droite) du plan
      });
      OUTSIDERS[key]=c;
      if(!byKey[key]){chars.push(c);byKey[key]=c;}
    }
    c.team=p;
  }
  applyNames();
}
const MEP_TXT={
  released:'release publiée',
  staging:'déploiement staging',
  staged:'validée sur staging',
  prod:'déploiement en prod',
  done:'en prod',
  failed:'échec'
};
function mepPhase(m,t){
  const P=x=>x?ms(x):null;
  const pe=m.prod&&P(m.prod.end),ps=m.prod&&P(m.prod.start),se=m.staging&&P(m.staging.end),ss=m.staging&&P(m.staging.start),r=P(m.released);
  if(pe&&t>=pe)return m.prod.conclusion==='success'?'done':'failed';
  if(ps&&t>=ps)return 'prod';
  if(se&&t>=se)return m.staging.conclusion==='success'?'staged':'failed';
  if(ss&&t>=ss)return 'staging';
  if(r&&t>=r)return 'released';
  return null;
  }
// début d'une MEP : sa release, sinon son premier déploiement (autre dépôt suivi, sans release connue)
const mepStart=m=>m.released||(m.staging||m.prod||{}).start||null;
// qui porte une MEP : l'assigné du ticket de sa release (dépôt principal), sinon qui a lancé le déploiement (login GitHub
// du run, m.by) : un collègue du roster ou de passage (dans le sprint) ; null si personne de connu
function mepChar(m){return personChar(m.who,m.who_name)||ghChar(m.by)||null;}
function mepName(m){const c=mepChar(m);return c?c.name:String(m.who_name||'').split(' ')[0]||m.by||'';}
function mepsAt(t){return ((TEAM&&TEAM.meps)||[]).map(m=>({m,phase:mepPhase(m,t)})).filter(x=>x.phase);}
function stageAt(t){
  const list=mepsAt(t);
  const live=list.filter(x=>['released','staging','staged','prod'].includes(x.phase)&&t-ms(mepStart(x.m))<3*3600e3);
  if(live.length)return live[live.length-1];
  const party=list.filter(x=>x.phase==='done'&&t-ms(x.m.prod.end)<10*60e3);
  return party.length?party[party.length-1]:null;
}
// classement aux points déployés du sprint ouvert ; tant qu'il n'a rien livré, celui du dernier sprint fermé (prev:true)
function bestEmployee(){
  if(!TEAM)return [];
  const rankOf=list=>list.map(p=>{
    const d=(p.tickets||[]).filter(x=>x.cat==='done');
    return {p,pts:d.reduce((a,x)=>a+(+x.points||0),0),tickets:d};
  }).sort((a,b)=>b.pts-a.pts||b.tickets.length-a.tickets.length);
  const cur=rankOf(TEAM.people), ps=TEAM.prev_sprint;
  if(cur.length&&cur[0].pts||!ps||!(ps.people||[]).length)return Object.assign(cur,{sprint:TEAM.sprint&&TEAM.sprint.name,prev:false});
  return Object.assign(rankOf(ps.people),{sprint:ps.name,prev:true});
}
// le personnage d'un classement (le gagnant du sprint fermé peut n'avoir aucun ticket dans le nouveau)
const empChar=r=>r&&(chars.find(x=>x.team&&x.team.id===r.p.id)||(typeof personChar==='function'?personChar(r.p.id,r.p.name):null));
// discussions ouvertes par le Bureau (questions aux agents « Le Bureau · … », le canard « 🦆 … ») : jamais des visiteurs,
// comme is_bureau_disc de workflows/_lib.py
const bureauDisc=d=>{const t=String((d&&d.title)||'');return t.startsWith('Le Bureau')||t.startsWith('🦆');};
// minuit (heure de Paris) du jour de t ; juste aussi les jours de changement d'heure (minuit est avant le changement, à 2h ou 3h)
function parisMidnight(t){
  const u=Date.parse(dtf('en-CA',{}).format(new Date(t))+'T00:00:00Z'), p=parisHM(u);
  return u-(p.h*60+p.m)*60e3;
}
function parisHM(t){
  const p=dtf('en-GB',{hour:'numeric',minute:'numeric',weekday:'short',hour12:false}).formatToParts(new Date(t));
  const g=k=>(p.find(x=>x.type===k)||{}).value;
  return {h:+g('hour')%24,m:+g('minute'),wd:g('weekday')};
}
function inSax(t){const p=parisHM(t);return p.h>=RHYTHM.office_hours[0]&&p.h<RHYTHM.office_hours[1]&&p.m>=45&&p.m<50;}
// pas de mise en prod le vendredi ni le week-end : le plateau TV est fermé (ruban, lumière éteinte, porte bloquée)
// jours calendaires (Paris) restants avant une date : J-0 le jour même
function daysLeft(end,t){
  const d=x=>Date.parse(dtf('en-CA',{}).format(new Date(x))+'T00:00:00Z');
  return Math.max(0,Math.round((d(end)-d(t))/864e5));
}
function stageClosed(t){return RHYTHM.mep_freeze.includes(parisHM(t).wd);}
const DAILY_MIN=(([h,m])=>+h*60+(+m||0))(String(RHYTHM.daily).split(':')); // heure du daily en minutes
function inDaily(t){const p=parisHM(t);if(p.wd==='Sat'||p.wd==='Sun')return false;const mn=p.h*60+p.m;return mn>=DAILY_MIN&&mn<DAILY_MIN+RHYTHM.daily_minutes;}
// cérémonies de l'équipe en salle de réunion : sprint planning (animé par la facilitatrice) et rétrospective (animée par un
// collègue tiré au sort). Réglages rhythm.planning et rhythm.retro : {day:'Fri', at:'10:00', minutes:30, every?:2, from?:'AAAA-MM-JJ'}
const CEREMONY_TITLE={planning:'Sprint planning',retro:'Rétrospective'};
const dayNum=t=>Math.round(Date.parse(parisDay(t)+'T00:00:00Z')/864e5);
function ceremonyAt(t){
  const p=parisHM(t), mn=p.h*60+p.m;
  for(const k of ['retro','planning']){
    const c=RHYTHM[k]; if(!c||c.day!==p.wd)continue;
    const a=(([h,m])=>+h*60+(+m||0))(String(c.at||'').split(':')), len=+c.minutes||30;
    if(!(mn>=a&&mn<a+len))continue;
    const every=Math.max(1,+c.every||1), from=c.from?Date.parse(c.from+'T00:00:00Z')/864e5:null;
    if(every>1&&from!=null&&((Math.round((dayNum(t)-from)/7)%every)+every)%every)continue; // pas la bonne semaine
    const start=parisMidnight(t)+a*60e3;
    return {k,title:CEREMONY_TITLE[k],start,end:start+len*60e3};
  }
  return null;
}
// qui anime : la facilitatrice pour le planning, un collègue tiré au sort pour la rétro (le même pour tous, d'après la date)
function ceremonyHost(cr){
  const all=chars.filter(c=>c.person), real=all.some(c=>c.sprite!=='temp')?all.filter(c=>c.sprite!=='temp'):all; // pas un intérimaire
  const ppl=real.filter(c=>c.boss||!absentAt(c,cr.start)).length?real.filter(c=>c.boss||!absentAt(c,cr.start)):real; if(!ppl.length)return null; // les absents n'animent pas
  if(cr.k==='planning')return ppl.find(c=>c.roleKind==='sm')||ppl.find(c=>c.boss)||ppl[0];
  return ppl[Math.floor(hash(dayNum(cr.start)%100000,17)*ppl.length)%ppl.length];
}
function cronField(f,v,min){
  return f.split(',').some(part=>{
    let [r,st]=part.split('/');
    st=st?+st:1;
    let lo,hi;
    if(r==='*'){lo=min;hi=99;}else if(r.includes('-')){[lo,hi]=r.split('-').map(Number);}else{lo=hi=+r;if(part.includes('/'))hi=99;}
    return v>=lo&&v<=hi&&(v-lo)%st===0;
  });
}
function cronMatch(e,d){
  const [mi,ho,dom,mon,dow]=e.trim().split(/\s+/);
  return cronField(mi,d.getUTCMinutes(),0)&&cronField(ho,d.getUTCHours(),0)&&cronField(dom,d.getUTCDate(),1)&&cronField(mon,d.getUTCMonth()+1,1)&&cronField(dow,d.getUTCDay(),0);
}
let PLAN_CACHE={k:null,v:[]};
function planningToday(){
  const crons=(DATA&&DATA.crons)||(SNAP&&SNAP.crons)||[]; const k=DAY0+'|'+crons.length; if(PLAN_CACHE.k===k)return PLAN_CACHE.v;
  const out=[];
  for(const c of crons){if(!c.schedule)continue;const who=chars.find(x=>x.wf&&x.wf.includes(String(c.wf).slice(0,8)));
    for(let t=DAY0;t<DAY0+864e5;t+=60e3){if(cronMatch(c.schedule,new Date(t)))out.push({t,c,who});}}
  const cnt={};out.forEach(p=>cnt[p.c.wf]=(cnt[p.c.wf]||0)+1);out.forEach(p=>p.hourly=cnt[p.c.wf]>8);
  out.sort((a,b)=>a.t-b.t); PLAN_CACHE={k,v:out}; return out;
}
function setTeam(t){TEAM=t;attachTeam();updateBadge();renderSide();renderKpis();renderFeed();}
// en direct : d'où viennent les données ; en rejeu ou en pause : l'heure rejouée et celle des données
function badgeText(){
  if(mode!=='live')return 'Rejeu '+hm(T)+' · données de '+hm(ms(DATA.generated_at));
  return (DATA.empty?'En attente du premier rafraîchissement':LIVE_DATA?'Données live':'Instantané du '+hm(ms(DATA.generated_at))+(DEMO?' (démo)':''))+
    (TEAM?' · équipe '+hm(ms(TEAM.generated_at)):'')+(typeof LIVE!=='undefined'&&LIVE?' · direct '+hms(ms(LIVE.generated_at)):'');
}
function updateBadge(){
  if(!DATA)return;
  const b=document.getElementById('badge');
  b.classList.toggle('live',LIVE_DATA&&mode==='live');b.classList.toggle('replay',mode!=='live');
  b.querySelector('span').textContent=badgeText();
}
function readData(src){
  try{
    if(!src)return null;
    let d=src.datasets&&src.datasets.office; if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    if(d&&d.payload)d=typeof d.payload==='string'?JSON.parse(d.payload):d.payload;
    return d&&Array.isArray(d.runs)?d:null;
  }catch(e){return null;}
}
const clean=s=>String(s||'').replace(/\s+—\s+/g,' · ').replace(/—/g,'-');
function mkChar(def){
  return {...def, baseName:def.name, runs:[], pos:null, tile:null, path:[], dir:'down', pose:'idle', moving:false, phase:keySeed(def.key)%97/9.7,
    spotKey:null, idlePlan:null, present:false, st:null};
}
function setData(d,live){
  DATA=d; LIVE_DATA=live;
  const old=byKey; chars=[]; byKey={};
  const add=def=>{
    const c=old[def.key]?Object.assign(old[def.key],def,{runs:[],baseName:def.name}):mkChar(def);
    chars.push(c);
    byKey[c.key]=c;
    return c;
  };
  CAST.forEach(add);
  GUESTS.forEach(add);
  const sameSeat=(a,s)=>a.seat&&a.seat[0]===s[0]&&a.seat[1]===s[1];
  const free=FREE_SEATS.filter(s=>!CAST.some(c=>sameSeat(c,s))&&!Object.values(OUTSIDERS).some(o=>sameSeat(o,s))); // places des de passage : réservées
  let tempN=0; DISC_BY_RUN={};
  DAY0=parisMidnight(ms(d.generated_at));
  for(const r of d.runs){
    r._s=ms(r.start); r._e=ms(r.end);
    const realEnd=r._e||null;
    r._ve=(r.status==='Running'||r.status==='WaitingApproval'||r.status==='Pending')?Infinity:Math.max(realEnd||r._s,r._s+VIS_MIN);
    const p8=(r.wf||'').slice(0,8);
    let c=chars.find(x=>x.wf&&x.wf.includes(p8));
    if(!c){
      const key='temp_'+p8;
      c=byKey[key]||add({key,sprite:'temp',name:'Intérimaire '+(++tempN),role:clean(r.wf_name),wf:[p8],seat:free.shift()||null,temp:true});
    }
    c.runs.push(r);
  }
  for(const disc of (d.discussions||[]).filter(x=>!bureauDisc(x))){ // discussions créées par le Bureau : pas des visiteurs
    const key='v_'+disc.id.slice(0,8);
    const c=add({
      key,
      sprite:VISITOR[disc.agent]||'v_claude',
      name:(disc.agent||'Agent').replace('Code',' Code'),
      role:clean(disc.title).replace(/\s+/g,' ').slice(0,60),
      wf:[],
      seat:null,
      visitor:true,
      disc
    });
    const s0=ms(disc.start)>=DAY0?ms(disc.start):ms(disc.end)-30*60e3;
    c.runs.push({
      visitor:true,
      run:disc.id,
      wf_name:clean(disc.title),
      status:disc.awaiting?'Running':'Success',
      _s:s0,
      _e:ms(disc.end),
      _ve:Math.max(ms(disc.end),s0+VIS_MIN),
      steps:[],
      tok:0,
      msgs:disc.msgs
    });
    if(disc.run)(DISC_BY_RUN[disc.run]=DISC_BY_RUN[disc.run]||[]).push(c);
  }
  // une discussion d'un autre jour dont une question attend ta réponse revient en visiteur : arrivée à sa question
  for(const q of QUESTIONS){
    if(q.bureau||byKey['v_'+String(q.disc).slice(0,8)])continue;
    const s0=ms(q.since)||ms(d.generated_at);
    const disc={id:q.disc,title:q.title,agent:q.agent,start:q.since,end:q.since,msgs:null,awaiting:false,pending:0,run:null,imp:0,fromQ:true}; // connue par ses questions seulement
    add({key:'v_'+String(q.disc).slice(0,8),sprite:VISITOR[q.agent]||'v_claude',name:(q.agent||'Agent').replace('Code',' Code'),
      role:clean(q.title).replace(/\s+/g,' ').slice(0,60),wf:[],seat:null,visitor:true,disc}).runs.push(
      {visitor:true,run:q.disc,wf_name:clean(q.title),status:'Success',_s:s0,_e:s0,_ve:s0+VIS_MIN,steps:[],tok:0,msgs:null});
  }
  for(const c of chars){
    c.runs.sort((a,b)=>a._s-b._s);
    c.sprite=c.sprite||c.key;
  }
  // child runs (foreach) attach to their parent for display
  for(const c of chars){
    const ids=new Set(c.runs.map(r=>r.run));
    c.top=c.runs.filter(r=>!r.parent||!ids.has(r.parent));
    c.kids={}; for(const r of c.runs)if(r.parent&&ids.has(r.parent))(c.kids[r.parent]=c.kids[r.parent]||[]).push(r);
  }
  const firsts=d.runs.map(r=>r._s).filter(Boolean);
  RSTART=Math.max(DAY0,(firsts.length?Math.min(...firsts):DAY0)-15*60e3);
  REND=live?Date.now():ms(d.generated_at);
  document.getElementById('tstart').textContent=hm(RSTART);
  document.getElementById('tend').textContent=hm(REND);
  const b=document.getElementById('badge');
  b.classList.toggle('live',live);
  b.querySelector('span').textContent=live?'Données live':'Instantané du '+hm(ms(d.generated_at))+' (démo)';
  attachTeam(); updateBadge(); if(!FIRST_LOAD_DONE){needTeleport=true;FIRST_LOAD_DONE=true;} renderSide(); renderFeed(); renderKpis();
}
let DAY0=0,RSTART=0,REND=0,DISC_BY_RUN={},FIRST_LOAD_DONE=false;

// depuis quand ça attend : entrée d'un ticket dans son statut (since, tiré de l'historique Jira par le cron équipe ;
// repli sur updated, que les bascules de sprint et les pushs réécrivent), création d'une PR
const tkSince=x=>ms(x&&(x.since||x.updated));
const prSince=x=>ms(x&&x.created);
// ce qui bloque l'équipe (mode TV, fiche d'un collègue) : ticket immobile en review ou en test, PR sans review
const BLOCKED_DAYS=2, PR_STALE_H=24;
// PR ouvertes de l'équipe (sans les brouillons), avec leur auteur
function teamPrs(){
  if(!TEAM)return [];
  return [...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({...x,who:p.name}))),...(TEAM.other_prs||[]).map(x=>({...x,who:x.author}))].filter(x=>!x.draft);
}
// tickets en review ou en test sans mouvement depuis BLOCKED_DAYS jours, les plus anciens d'abord
function blockedTickets(t){
  if(!TEAM)return [];
  return [...TEAM.people.flatMap(p=>(p.tickets||[]).map(x=>({...x,who:p.name}))),...(TEAM.unassigned||[])]
    .filter(x=>(x.cat==='review'||x.cat==='test')&&tkSince(x)&&t-tkSince(x)>BLOCKED_DAYS*864e5)
    .sort((a,b)=>tkSince(a)-tkSince(b));
}
// PR qui attendent une review depuis plus de PR_STALE_H heures, les plus anciennes d'abord
function stalePrs(t){
  return teamPrs().filter(x=>x.review==='pending'&&prSince(x)&&t-prSince(x)>PR_STALE_H*36e5).sort((a,b)=>prSince(a)-prSince(b));
}
// ---------- time ----------
let mode='live', T=0, lastReal=performance.now(), needTeleport=true;
const fmtTZ=dtf('fr-FR',{hour:'2-digit',minute:'2-digit'});
const hm=t=>fmtTZ.format(new Date(t));
const hms=t=>dtf('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(t));
function liveT(){return LIVE_DATA?Date.now():ms(DATA.generated_at);}
function fmtDur(d){
  if(d==null||isNaN(d))return '';
  if(d<1000)return '<1 s';
  const s=Math.round(d/1000);
  if(s<60)return s+' s';
  const m=Math.floor(s/60);
  if(m<60)return m+' min'+(s%60?' '+String(s%60).padStart(2,'0'):'');
  return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');
}
const fmtTok=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1).replace('.',',')+' k':String(n||0);

