// ---------- agents ajoutés depuis la page (#64) ----------
// Dataset `agents` (workflow « Le Bureau · agents », script agent_save.py) : {agents: {a_…: {name, role, wf, seat (numéro de siège ou null),
// sprite?, look?, at}}}. Ils rejoignent le casting après ceux de la config (AGENTS, CAST), prennent une place comme
// eux (placeCast) et se comportent en agents ordinaires : fiche, relance, question, fiche de paie par préfixe de workflow.
let EXTRA_KEY='';
function readAgents(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.agents;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&d.agents&&typeof d.agents==='object'?d.agents:null;
  }catch(e){return null;}
}
// entrées valides du dataset -> définitions de personnages ; jamais la clé d'une personne, d'un invité ou d'un agent
// de la config (le script n'accepte que « a_… », la page le revérifie)
function extraAgents(map){
  const known=new Set([...ROSTER.map(p=>p.key),...(CFG.agents||[]).map(a=>a.key),...GUESTS.map(g=>g.key)]);
  return Object.entries(map||{})
    .filter(([k,a])=>/^a_[a-z0-9_]{1,30}$/.test(k)&&!known.has(k)&&a&&Array.isArray(a.wf)&&a.wf.length)
    .sort((x,y)=>(+x[1].at||0)-(+y[1].at||0)||(x[0]<y[0]?-1:1))
    .map(([k,a])=>{
      const base=RECIPES[a.sprite]?a.sprite:'temp';
      let sprite=base;
      if(a.look&&typeof a.look==='object'){sprite='agent:'+k;RECIPES[sprite]={...(RECIPES[base]||{}),...a.look};}
      return {key:k,name:String(a.name||k).slice(0,24),role:String(a.role||'').slice(0,60),wf:a.wf.map(w=>String(w).slice(0,8)),
        seat:typeof a.seat==='string'?a.seat:null,sprite,added:true,at:+a.at||0};
    });
}
// remplace les agents ajoutés du casting par ceux du dataset ; false si rien n'a changé (pas de rafraîchissement)
function applyAgents(map){
  const defs=extraAgents(map), key=JSON.stringify(defs);
  if(key===EXTRA_KEY)return false;
  EXTRA_KEY=key;
  for(const list of [AGENTS,CAST])for(let i=list.length-1;i>=0;i--)if(list[i].added)list.splice(i,1);
  for(const d of defs){AGENTS.push(d);CAST.push({...d});}
  placeCast();
  refreshAll();
  return true;
}
