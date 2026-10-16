// ---------- « Nouvel agent » : le « + » de la dernière baie de la salle Serveurs (#64) ----------
// La fenêtre propose les workflows sans agent, un prénom, un métier, un siège libre et un avatar tiré au hasard ;
// « Créer l'agent » copie un code AGENT1 que demande la carte Kronn du workflow « Le Bureau · agents » (agent_save.py),
// qui range l'agent dans le dataset agents (31-agents.js). L'apparence se retouche ensuite depuis sa fiche.
let NA=null, RACK_HOVER=false;
function newAgentRack(){const l=FURN_AT.server_rack||[];const o=l[l.length-1];return o?{x:13*TS+2+o.dx,y:TS+10+o.dy,w:28,h:52}:null;}
const newAgentOn=()=>!TV&&!!ACTIONS.agent&&!!newAgentRack();
// le « + » sur la baie, au survol seulement (le plan reste tel quel ; le curseur et l'infobulle le signalent)
const RACK_PLUS={get y(){const r=newAgentRack();return r?r.y+r.h+1:-1;},draw:()=>{
  if(!RACK_HOVER||!newAgentOn())return;
  const r=newAgentRack(), x=r.x+r.w-12, y=r.y+r.h-13, on=true;
  if(on)R(ctx,x-2,y-2,12,12,'rgba(125,255,176,.55)');
  R(ctx,x,y,9,9,on?'#1f8a4c':'#173a24');
  R(ctx,x+3,y+1,3,7,on?'#ffffff':'#5ff08a');R(ctx,x+1,y+3,7,3,on?'#ffffff':'#5ff08a');
}};
// workflows actifs hors Bureau qu'aucun agent n'incarne (les intérimaires du jour comptent comme « sans agent »)
function workflowsWithoutAgent(){
  const has=p=>chars.some(c=>!c.temp&&!c.person&&!c.visitor&&(c.wf||[]).includes(p));
  return ASKABLE.filter(w=>w&&w.wf&&!has(String(w.wf).slice(0,8))).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'));
}
const pickOf=l=>l[Math.floor(Math.random()*l.length)];
function randomLook(){
  const sex=pickOf(['male','female']);
  const look={sex,skin:pickOf(SKINS)[0],hair:pickOf(LAYERS.catalog.hair),hair_color:pickOf(HAIR_COLORS),torso:pickOf(LAYERS.catalog.torso),
    shirt:pickOf(CLOTH_COLORS),legs:pickOf(LAYERS.catalog.legs),legs_color:pickOf(CLOTH_COLORS)};
  if(sex==='male')look.head=pickOf(LAYERS.catalog.head);
  if(Math.random()<.25)look.glasses=pickOf(LAYERS.catalog.glasses);
  return look;
}
// clé a_<prénom>_<4 premiers caractères du workflow> : jamais celle d'une personne ni d'un agent de la config
function agentKey(name,wf){
  const slug=String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,16)||'agent';
  return 'a_'+slug+'_'+String(wf||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,4);
}
// sièges libres du plan (numéro de siège), pour choisir sa place ; vide : la page lui en donne un
function freeSeatIds(){
  const used=new Set(CAST.filter(c=>c.seat).map(c=>c.seat.join(',')));
  return SEATS.filter(t=>t.id&&!used.has(t.x+','+t.y)).map(t=>t.id);
}
function agentCode(){
  const w=NA.wf;
  return 'AGENT1:'+btoa(unescape(encodeURIComponent(JSON.stringify({op:'add',k:agentKey(NA.name,w),n:NA.name,r:NA.role,wf:[String(w).slice(0,8)],
    seat:NA.seat||null,sp:null,l:NA.look,at:Date.now()}))));
}
let NA_BACK=null, NA_INERT=[];
function openNewAgent(){
  if(!newAgentOn())return;
  closeNewAgent(false);
  NA_BACK=document.activeElement;
  const list=workflowsWithoutAgent();
  NA={wf:list[0]?list[0].wf:'',name:'',role:list[0]?clean(list[0].name):'',seat:'',look:randomLook()};
  const bd=document.createElement('div');bd.className='bp-backdrop na-backdrop';bd.onclick=()=>closeNewAgent();
  const box=document.createElement('div');box.className='bp-modal na-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Nouvel agent');
  const opts=list.map(w=>`<option value="${esc(w.wf)}">${esc(clean(w.name))}</option>`).join('');
  box.innerHTML=`<div class="bp-head"><h2>Nouvel agent</h2><button type="button" class="bp-x" aria-label="Fermer">×</button></div>`+
    (list.length?`<div class="na-grid"><div class="na-form">
      <label>Workflow à incarner <small>(sans agent pour l'instant)</small><select class="na-wf">${opts}</select></label>
      <label>Prénom<input class="na-name" type="text" maxlength="24" placeholder="Ex. Mose" autocomplete="off"></label>
      <label>Métier <small>(affiché sur sa fiche)</small><input class="na-role" type="text" maxlength="60"></label>
      <label>Place<select class="na-seat"><option value="">Automatique : un siège libre</option>${freeSeatIds().map(id=>`<option value="${esc(id)}">Siège ${esc(id)}</option>`).join('')}</select></label>
    </div><div class="na-av"><canvas id="naprev" width="256" height="64" aria-label="Aperçu de l'avatar"></canvas>
      <button type="button" class="na-dice">🎲 Au hasard</button><small>Retouche-le ensuite depuis sa fiche (✎ Personnaliser).</small></div></div>
    <div class="na-save" data-kronn-action-slot-host><button type="button" class="on na-create" data-kronn-action="bureau-agent">Créer l'agent</button>
      <div class="hint na-hint">Kronn va te demander un <b>code agent</b> : ce bouton le copie pour toi, il n'y a qu'à le coller.</div></div>`
    :`<p class="note">Tous tes workflows ont déjà un agent.</p>`);
  NA_INERT=[...document.body.children].filter(e=>!e.inert&&e.tagName!=='SCRIPT');
  NA_INERT.forEach(e=>{e.inert=true;});
  document.body.append(bd,box);
  box.querySelector('.bp-x').onclick=()=>closeNewAgent();
  if(list.length){
    const $=s=>box.querySelector(s), name=$('.na-name'), role=$('.na-role'), wf=$('.na-wf'), create=$('.na-create'), hint=$('.na-hint');
    role.value=NA.role;
    const sync=()=>{NA.name=name.value.trim();NA.role=role.value.trim();create.disabled=!NA.name;};
    name.oninput=sync;role.oninput=sync;
    wf.onchange=()=>{const w=list.find(x=>String(x.wf)===wf.value);NA.wf=wf.value;if(w&&(!role.value||list.some(x=>clean(x.name)===role.value)))role.value=clean(w.name);sync();};
    $('.na-seat').onchange=e=>{NA.seat=e.target.value;};
    $('.na-dice').onclick=()=>{NA.look=randomLook();};
    create.onclick=()=>{const code=agentCode(), ok=copyText(code);NA.sent=true;
      hint.innerHTML=`<ol class="steps3"><li class="done">${ok?'Code copié ✓':'Copie ce code :'}</li><li>Clique dans le champ <b>Code agent</b> ci-dessous et colle (<kbd>⌘V</kbd>)</li><li>Clique <b>Lancer</b> : ${esc(NA.name)} arrive d'ici une minute</li></ol><input type="text" readonly aria-label="Code agent" style="${ok?'display:none':''}">`;
      const inp=hint.querySelector('input');inp.value=code;inp.onclick=()=>inp.select();};
    new MutationObserver(()=>{const st=create.getAttribute('data-kronn-action-state');if(!NA||!NA.sent)return;
      if(st==='succeeded')hint.innerHTML=`<b style="color:var(--ok)">✓ ${esc(NA.name)} est embauché.</b> Il sort de la salle Serveurs au prochain rafraîchissement de la page.`;
      else if(st==='failed')hint.innerHTML='<b style="color:var(--err)">Code refusé.</b> Vérifie que tu as collé le code en entier (il commence par AGENT1:), puis relance.';
    }).observe(create,{attributes:true,attributeFilter:['data-kronn-action-state']});
    sync();name.focus();
  }else box.querySelector('.bp-x').focus();
}
function closeNewAgent(restore=true){
  const was=!!document.querySelector('.na-modal');
  document.querySelectorAll('.na-backdrop,.na-modal').forEach(e=>e.remove());
  NA_INERT.forEach(e=>{e.inert=false;});NA_INERT=[];NA=null;
  if(!restore||!was)return;
  const back=NA_BACK;NA_BACK=null;
  if(back&&back!==document.body&&back.isConnected&&back.focus){back.focus();if(document.activeElement===back)return;}
  const plan=document.getElementById('cv');
  if(plan){if(!plan.hasAttribute('tabindex'))plan.tabIndex=-1;plan.focus();}
}
addEventListener('keydown',e=>{
  const box=document.querySelector('.na-modal');if(!box)return;
  if(e.key==='Escape'){closeNewAgent();return;}
  if(e.key!=='Tab')return;
  const f=[...box.querySelectorAll('button:not([disabled]),input,select,a[href]')];if(!f.length)return;
  const a=f[0], z=f[f.length-1], cur=document.activeElement, inside=box.contains(cur);
  if(e.shiftKey&&(cur===a||!inside)){e.preventDefault();z.focus();}
  else if(!e.shiftKey&&(cur===z||!inside)){e.preventDefault();a.focus();}
});
// aperçu animé de l'avatar tiré, comme celui de l'éditeur (appelé à chaque image par la boucle)
function drawNewAgentPreview(now){
  if(!NA||!NA.look)return;const cv2=document.getElementById('naprev');if(!cv2)return;
  const img=sheetFor({...(RECIPES.temp||{}),...NA.look}), x=cv2.getContext('2d');
  x.imageSmoothingEnabled=false;x.clearRect(0,0,256,64);
  if(!ready(img))return;const f=1+Math.floor(now/110)%8;
  ['down','left','right','up'].forEach((d,i)=>x.drawImage(img,f*64,DIRROW[d]*64,64,64,i*64,0,64,64));
}
