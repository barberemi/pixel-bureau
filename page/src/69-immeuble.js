// ---------- L'immeuble : une tuile du haut de page pour tous les étages ----------
// Une ligne par étage, de haut en bas comme l'immeuble : son icône et son numéro (ETAGES), une fenêtre allumée par bureau
// occupé quand l'étage en a un nombre fixe (1er, 3e), ce qui t'attend (✋) et les pannes ; le reste (sortis, poussées, file)
// au survol. Un clic sur une ligne monte à l'étage. Remplace les tuiles « Le 1er étage » et « Le 3e étage », qui
// laissaient le -1 et le 2e hors du haut de page.
function imRows(t){
  const out=[];
  for(const f of floorsOn().filter(f=>f)){
    const {cnt,cap,wait}=floorLoad(f), r={f,cnt,cap:cap||0,wait,pannes:0,todo:0,tip:[]};
    if(f===1){const a=atKpi(t);r.pannes=a.pannes;r.tip.push(`📦 ${a.out} ${a.out>1?'sortis':'sorti'} aujourd'hui`);if(a.queue)r.tip.push(`⏳ ${a.queue} en file`);}
    if(f===3){const a=rtKpi(t);r.pannes=a.pannes;r.tip.push(`📤 ${a.out} ${a.out>1?'poussées':'poussée'} aujourd'hui`);if(a.queue)r.tip.push(`⏳ ${a.queue} en file`);}
    if(f===-1&&supportOn())r.todo=spTodo().length;
    out.push(r);
  }
  return out;
}
function imKpiHtml(rows){
  const any=k=>rows.some(r=>r[k]);
  const row=r=>{const e=ETAGES[r.f], tip=[e.n+' · '+e.nom,(r.cap?r.cnt+'/'+r.cap:r.cnt)+' en cours',r.wait?'✋ '+r.wait+' t\'attend':'',
      r.pannes?plural(r.pannes,'panne','pannes'):'',r.todo?plural(r.todo,'fil','fils')+' à traiter':'',...r.tip].filter(Boolean).join(' · ');
    const win=r.cap?`<span class="im-win" aria-hidden="true">${Array.from({length:r.cap},(_,i)=>`<i${i<r.cnt?' class="on"':''}></i>`).join('')}</span>`:'<span class="im-win"></span>';
    return `<button type="button" class="im-fl" data-floor="${r.f}" title="${esc('Monter : '+tip)}" aria-label="${esc(tip)}"><b>${e.ico} ${e.n}</b>${win}`+
      `<span class="im-n">${r.cap?r.cnt+'/'+r.cap:r.cnt?r.cnt+' en cours':'calme'}</span><span class="im-t">`+
      (r.wait?`<span class="im-tag warn">✋ ${r.wait}</span>`:'')+(r.pannes?`<span class="im-tag err">${plural(r.pannes,'panne','pannes')}</span>`:'')+
      (r.todo?`<span class="im-tag soft">${plural(r.todo,'fil','fils')}</span>`:'')+'</span></button>';};
  return `<section class="dash immeuble${any('pannes')?' err':any('wait')?' warn':''}"><h3>L'immeuble</h3><div class="im-rows">${rows.map(row).join('')}</div></section>`;
}
