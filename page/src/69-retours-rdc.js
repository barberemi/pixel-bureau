// ---------- le 3e étage vu du RDC : Qui fait quoi, chiffres du haut ----------
// Les retours de PR (68-retours.js) ne se dessinent qu'à l'étage ; comme le 1er (69-atelier-rdc.js), le RDC en montre une
// tuile en haut de page (bureaux occupés, corrections qui t'attendent, pannes, PR poussées aujourd'hui, file) et ses PR au
// travail dans « Qui fait quoi » (page et mode TV). Son fil et ⌘K sont dans 68-retours.js. Tout mène à l'étage (rtGoto).
// ---------- Qui fait quoi (72-whoboard.js, 75-tv.js) : le poste en cours de chaque bureau, ou ta validation ----------
function rtWhoRows(t){
  if(!retoursOn())return [];
  return rtSlots().map((r,i)=>{if(!r)return null;
    const c=rtCur(r), err=!!(c&&rtState(r,c)==='err'), g=r.gate&&rtEvents().filter(e=>e.run===r.run&&e.k==='gate'&&ms(e.t)<=t).pop(), a=g?ms(g.t):ms(r.since);
    const todo=rtCount(r,'a_traiter'), done=rtCount(r,'corrige');
    return {run:r.run,i,attn:!!r.gate,st:r.gate?'gate':err?'error':'work',ico:r.gate?'✋':err?'🧯':c?c.i:'🛠',
      name:r.gate?'T\'attend':err?c.n+' en panne':c?c.n:'Retours',what:rtName(r)+(r.title?' '+r.title:''),
      sub:r.gate?'ses corrections à valider':[todo?plural(todo,'fil à traiter','fils à traiter'):'',done?plural(done,'corrigé','corrigés'):'',rtWho(r)].filter(Boolean).join(' · '),
      since:a&&a<=t?sinceTxt(t-a):''};
  }).filter(Boolean);
}
function rtWhoHtml(t){
  const rows=rtWhoRows(t);if(!rows.length)return '';
  return `<h3 class="who-sub">🛠 3e étage <span class="cnt">${rows.length}</span></h3><div class="who-grid">`+rows.map(x=>
    `<button class="wc${x.attn?' attn':''}" data-rt-run="${esc(x.run)}" title="${esc([x.what,x.sub].filter(Boolean).join('\n'))}" style="--st:${ST_CSS[x.st]||'var(--idle)'};--tk:transparent">`+
    `<span class="wp ic" aria-hidden="true">${x.ico}</span><span class="wt"><span class="wn">${esc(x.name)}<span class="ws">bureau ${x.i+1}${x.since?' · '+esc(x.since):''}</span></span>`+
    `<span class="ww nt">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></button>`).join('')+'</div>';
}
function rtTvWhoHtml(t){
  const rows=rtWhoRows(t);if(!rows.length)return '';
  return '<h2>3e étage</h2>'+rows.map(x=>`<div class="tw ag" style="--st:${ST_CSS[x.st]||'var(--idle)'}"><span class="wt"><span class="wn">${x.ico} ${esc(x.name)}<span class="ws">bureau ${x.i+1}${x.since?' · '+esc(x.since):''}</span></span>`+
    `<span class="ww nt">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></div>`).join('');
}
// ---------- tuile du haut de page (70-kpis-feed.js) ----------
function rtKpi(t){
  const d=RETOURS||{}, rooms=rtRooms(), ev=rtEvents();
  const out=ev.length?ev.filter(e=>e.k==='push'&&ms(e.t)>=DAY0&&ms(e.t)<=t).length:(+d.pousses||0);
  return {rooms:rooms.length,wait:rooms.filter(r=>r.gate).length,out,queue:(d.queue||[]).length,pannes:(d.pannes||[]).length};
}
// une seule ligne sous le chiffre, comme la tuile du 1er : le bandeau ne grandit pas ; le texte entier au survol
function rtKpiHtml(a){
  const parts=[a.wait?`<span style="color:var(--warn)">✋ ${a.wait} ${a.wait>1?"t'attendent":"t'attend"}</span>`:'',a.pannes?`<span style="color:var(--err)">🧯 ${plural(a.pannes,'panne','pannes')}</span>`:'',
    `📤 ${a.out} ${a.out>1?'poussées':'poussée'} aujourd'hui`,a.queue?`⏳ ${a.queue} en file`:''].filter(Boolean);
  return `<section class="dash retours click${a.pannes?' err':a.wait?' warn':''}" data-open="retours" tabindex="0" role="button" title="${esc('Monter au 3e étage : les retours de PR\n'+parts.map(p=>p.replace(/<[^>]+>/g,'')).join(' · '))}">`+
    `<h3>Le 3e étage</h3><div class="row"><div class="big">${a.rooms}<small>/${RT_N}</small></div><div class="grow">PR en correction</div></div>`+
    `<div class="cap">${parts.join(' · ')}</div></section>`;
}
