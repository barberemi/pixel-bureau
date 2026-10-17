// programme d'un agent cron en clair : Kronn lit les crons en UTC (cronMatch), on les dit à l'heure du bureau (RHYTHM.timezone).
// cronText : les passages de la semaine (7 jours entiers depuis minuit), regroupés par jours qui ont les mêmes heures ;
// cronNext / cronPrev : passage suivant / précédent (8 jours au plus), gardés à la minute ; agentNext : le plus proche des
// crons d'un agent (DATA.crons).
const WEEK=Object.keys(DAY_FR); // lundi d'abord
const hhm=t=>{const p=parisHM(t);return p.h+'h'+(p.m?String(p.m).padStart(2,'0'):'');};
const andList=a=>a.length<2?a[0]:a.slice(0,-1).join(', ')+' et '+a[a.length-1];
function cronDays(ds){
  const k=WEEK.map((d,i)=>ds.includes(d)?i:-1).filter(i=>i>=0), n=k.length, f=i=>DAY_FR[WEEK[i]];
  return n===7?'tous les jours':n===2&&k[0]===5?'le week-end':n>2&&k[n-1]-k[0]===n-1?'du '+f(k[0])+' au '+f(k[n-1]):'le '+andList(k.map(f));
}
function cronTimes(ts){
  const st=(ts[1]-ts[0])/60e3, n=ts.length;
  if(n<4||ts.some((t,i)=>i&&t-ts[i-1]!==st*60e3))return 'à '+andList(ts.map(hhm));
  if(st===60&&n===24){const m=parisHM(ts[0]).m;return 'toutes les heures'+(m?', à la minute '+String(m).padStart(2,'0'):' pile');}
  return 'toutes les '+(st===1?'minutes':st===60?'heures':st%60?st+' min':st/60+' heures')+' de '+hhm(ts[0])+' à '+hhm(ts[n-1]);
}
const CRON_MEMO={};
function cronMemo(k,f){if(!(k in CRON_MEMO)){if(Object.keys(CRON_MEMO).length>400)for(const x in CRON_MEMO)delete CRON_MEMO[x];CRON_MEMO[k]=f();}return CRON_MEMO[k];}
function cronText(e,t){
  return cronMemo('t'+e+parisDay(t),()=>{
    const by={},g={};let m=parisMidnight(t);
    for(let i=0;i<10080;i++,m+=60e3)if(cronMatch(e,new Date(m)))(by[parisHM(m).wd]=by[parisHM(m).wd]||[]).push(m);
    for(const wd in by){const k=by[wd].map(hhm).join();(g[k]=g[k]||{wd:[],ts:by[wd]}).wd.push(wd);}
    const out=Object.values(g).map(x=>{const d=cronDays(x.wd),h=cronTimes(x.ts);return d[0]==='t'&&h[0]==='t'?h:d+' '+h;});
    return out.length?out.join(' ; ').replace(/^./,x=>x.toUpperCase()):'Cron « '+e+' » (heure UTC)';
  });
}
function cronStep(e,t,dir){
  return cronMemo(dir+e+Math.floor(t/60e3),()=>{
    let m=Math.floor(t/60e3)*60e3+(dir>0?60e3:0);
    for(let i=0;i<11520;i++,m+=dir*60e3)if(cronMatch(e,new Date(m)))return m;
    return null;
  });
}
const cronNext=(e,t)=>cronStep(e,t,1), cronPrev=(e,t)=>cronStep(e,t,-1);
// « 12h », « demain 8h20 », « lundi 9h30 » ; long : « aujourd'hui à 12h », « demain à 8h20 »
function whenTxt(at,t,long){
  const d=parisDay(at), day=d===parisDay(t)?'':d===parisDay(t+864e5)?'demain':DAY_FR[parisHM(at).wd];
  return long?(day||"aujourd'hui")+' à '+hhm(at):(day&&day+' ')+hhm(at);
}
const inTxt=n=>{const m=Math.max(1,Math.round(n/60e3));return 'dans '+(n>=1296e5?Math.round(n/864e5)+' j':m%60?hmin(m):m/60+' h');};
const cronsOf=c=>((DATA&&DATA.crons)||[]).filter(x=>x.schedule&&(c.wf||[]).some(w=>String(x.wf).startsWith(String(w).slice(0,8))));
const agentNext=(c,t)=>cronsOf(c).map(x=>cronNext(x.schedule,t)).filter(n=>n!=null).sort((a,b)=>a-b)[0];
// « ⏰ demain 8h20 » d'un agent cron au repos (étiquette du plan, liste du panneau) ; rien au travail ni en mode TV
const cronTag=c=>{const n=!TV&&!AGENT_BUSY.includes((c._st||{}).st)&&agentNext(c,T);return n?'⏰ '+whenTxt(n,T):'';};
