// ---------- mode TV : bande de chiffres sous le plan ----------
// Lisible à 3 m : chiffres de 48 px environ, rien de personnel (pas de validation ni de PR « à toi »). Plus de scènes du daily,
// du planning ni de la rétro : la TV reste sur le plan, on n'y fait que changer d'étage.
function agentsDown(){return chars.filter(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error');}
function tvKpis(t){
  const d=dashData(t), out=[], k=(cls,num,lbl,sub)=>`<div class="tk ${cls}"><b>${num}</b><span>${lbl}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  if(d.sprint){const s=d.sprint, pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    out.push(k('k-sprint',pct+'<i>%</i>','du sprint '+esc(s.name),(s.j!=null?'J-'+s.j:'')+(s.time!=null?' · '+Math.round(s.time*100)+' % du temps':'')));}
  if(d.prod){const p=d.prod, live=p.live[p.live.length-1];
    out.push(k(p.failed.length?'err':'mep',p.done,plural(p.done,'mise en prod','mises en prod').replace(/^\d+ /,''),
      live?'🚀 '+esc(live.m.tag)+' : '+esc(MEP_TXT[live.phase]):p.failed.length?'✗ '+esc(p.failed[0].m.tag)+' en échec':
      [p.last?'dernière '+esc(p.last.m.tag)+' à '+hm(ms(p.last.m.prod.end)):'',p.closed?'plateau fermé':''].filter(Boolean).join(' · ')));}
  const bt=blockedTickets(t).length, sp=stalePrs(t).length;
  out.push(k(bt?'warn':'ok',bt,bt>1?'tickets bloqués':'ticket bloqué','en revue ou test depuis plus de '+BLOCKED_DAYS+' j'));
  out.push(k(sp?'warn':'ok',sp,'PR sans review','depuis plus de '+PR_STALE_H+' h'));
  const down=agentsDown();
  out.push(k(down.length?'err':'ok',down.length,down.length>1?'agents en panne':'agent en panne',down.length?esc(down.slice(0,3).map(c=>c.name).join(', ')):'tout tourne'));
  return out.join('');
}
// dernier daily avant t (jours ouvrés) : les « nouveaux tickets » sont ceux créés depuis
function prevDaily(t){
  for(let k=1;k<8;k++){const d=parisMidnight(t-k*864e5)+DAILY_MIN*60e3;if(!['Sat','Sun'].includes(parisHM(d).wd))return d;}
  return t-864e5;
}
// dernier daily passé à t (aujourd'hui s'il a eu lieu, sinon le précédent) : la pile de la facilitatrice repart de zéro
function lastDaily(t){const d=parisMidnight(t)+DAILY_MIN*60e3;return t>=d&&!['Sat','Sun'].includes(parisHM(d).wd)?d:prevDaily(t);}
// tickets créés par des collègues entre since et t (team.new_tickets, cron équipe), le plus récent d'abord, avec leur auteur
function teamCreated(since,t){
  return ((TEAM&&TEAM.new_tickets)||[]).map(x=>({...x,c:personChar(x.by,x.by_name)})).filter(x=>x.c&&x.c.person&&ms(x.created)>since&&ms(x.created)<=t)
    .sort((a,b)=>ms(b.created)-ms(a.created));
}
function sprintTickets(){return TEAM?[...TEAM.people.flatMap(p=>(p.tickets||[]).map(x=>({...x,who:p.name}))),...(TEAM.unassigned||[])]:[];}
// la bande du bas, réécrite seulement quand elle change
function renderTvKpis(){
  const kpi=document.getElementById('tvkpi'); if(!kpi)return;
  const k=tvKpis(T); if(kpi.dataset.sig!==k){kpi.dataset.sig=k;kpi.innerHTML=k;}
}
