// ---------- éditeur d'avatar ----------
let EDIT=null; // {k, name, look|null, base|null, hint}
const LBL={
  hair:{
    none:'Aucun (chauve)',
    plain:'Courts classiques',
    buzzcut:'Très courts',
    high_and_tight:'Rasés sur les côtés',
    bangslong:'Mi-longs à frange',
    long:'Longs',
    lob:'Carré long',
    long_messy:'Longs en bataille',
    curly_short:'Bouclés courts',
    curly_short2:'Bouclés très courts',
    messy1:'En bataille',
    messy2:'Ébouriffés',
    parted2:'Raie sur le côté',
    bob:'Carré',
    bangs_bun:'Chignon à frange',
    balding:'Dégarni',
    spiked:'En pics',
    cowlick:'Épi',
    twists_fade:'Twists',
    pixie:'Pixie',
    afro:'Afro',
    bedhead:'Saut du lit',
    page:'Au bol',
    shorthawk:'Petite crête',
    dreadlocks_long:'Dreadlocks',
    loose:'Mi-longs en arrière',
    swoop:'Mèche balayée',
    long_straight:'Longs raides',
    curtains_long:'Raie au milieu',
    parted3:'Raie classique'
  },
  beard:{none:'Aucune','beard/5oclock_shadow':'De 3 jours','beard/trimmed':'Taillée','beard/basic':'Pleine','mustache/basic':'Moustache'},
  hat:{
    none:'Aucun',
    'cloth/leather_cap':'Casquette',
    'cloth/bandana':'Bandana',
    'formal/bowler':'Chapeau melon',
    'cloth/hood':'Capuche',
    'headband/thick':'Bandeau'
  },
  glasses:{none:'Aucunes',glasses:'Lunettes',halfmoon:'Demi-lune',sunglasses:'De soleil'},
  torso:{'longsleeve/longsleeve':'Pull','shortsleeve/tshirt':'T-shirt'},
  legs:{pants:'Pantalon',formal:'Costume'},
  head:{male:'Normal',male_plump:'Rond',male_elderly:'Âgé'}};
const SKINS=[['light','#f6dcc8','Très claire'],['pale','#eccaa9','Claire'],['tan','#d7a57e','Mate'],['brown','#a8724e','Brune'],['dark','#7a5038','Foncée']];
const HAIR_COLORS=['#14100e','#3a2418','#5a3a1e','#8a5a2e','#c2462a','#e6cf86','#c9c9c9','#2f4a7a'];
const CLOTH_COLORS=['#25221d','#e9e4d8','#a33b3b','#e0a020','#4f7a4f','#2e9e9b','#2f6fd6',MEP_COLOR];
const canLook=c=>!SPR[c.sprite]&&!!RECIPES[c.sprite];
function normLook(s){
  return {
    sex:s.sex==='female'?'female':'male',skin:s.skin||'light',head:s.head||'male',hair:s.hair||'none',hair_color:s.hair_color||'#5a3a1e',beard:s.beard||'none',
  torso:LBL.torso[s.torso]?s.torso:'longsleeve/longsleeve',shirt:s.shirt||'#8a8f99',legs:LBL.legs[s.legs]?s.legs:'pants',legs_color:s.legs_color||'#3b4a63',shoes:s.shoes||'#3a2a22',
  hat:s.hat||'none',hat_color:s.hat_color||'#2f4a7a',glasses:s.glasses||'none'};}
function openEditor(c){
  const ov=avatarFor(c.key)||{};
  EDIT={k:c.key,name:ov.name||'',base:canLook(c)?normLook(RECIPES[c.sprite]):null,look:null,hint:null};
  EDIT.look=EDIT.base?normLook({...RECIPES[c.sprite],...(ov.look||{})}):null;
  syncDraft();renderSide(true);
}
function closeEditor(){EDIT=null;AV_DRAFT=null;applyNames();}
function syncDraft(){if(!EDIT)return;AV_DRAFT={k:EDIT.k,name:EDIT.name.trim()||undefined,look:EDIT.look||undefined};applyNames();}
function editorEntry(){
  const name=EDIT.name.trim().slice(0,24), same=EDIT.base&&JSON.stringify(EDIT.look)===JSON.stringify(EDIT.base);
  return {k:EDIT.k,n:name||null,l:EDIT.look&&!same?EDIT.look:null,at:Date.now()};
}
function keepLocal(e){AV_LOCAL[e.k]=e.n||e.l?{name:e.n||undefined,look:e.l||undefined,at:e.at}:{reset:true,at:e.at};saveLocal();}
// étapes des cartes Kronn qui demandent un code (avatar, agent) : copié pour toi, à coller, puis Lancer
function codeHint(hint,code,label,last,done){const ok=copyText(code);
  hint.innerHTML=`<ol class="steps3"><li class="done">${ok?done||'Code copié ✓':'Copie ce code :'}</li><li>Clique dans le champ <b>${label}</b> ci-dessous et colle (<kbd>⌘V</kbd>)</li><li>Clique <b>Lancer</b>${last?' : '+last:''}</li></ol><input type="text" readonly aria-label="${label}" style="${ok?'display:none':''}">`;
  const inp=hint.querySelector('input');inp.value=code;inp.onclick=()=>inp.select();}
const avatarCode=e=>'BUREAU1:'+btoa(unescape(encodeURIComponent(JSON.stringify(e))));
function copyText(t){
  let ok=false;
  try{
    const ta=document.createElement('textarea');
    ta.value=t;
    ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    ok=document.execCommand('copy');
    ta.remove();
  }catch(e){ok=false;}
  if(!ok&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).catch(()=>{});ok=true;}
  return ok;
}
function renderEditor(side,c){
  side.innerHTML='';
  const ed=document.createElement('div');ed.className='ed';side.appendChild(ed);
  const back=document.createElement('button');
  back.className='back';
  back.textContent='← Retour à la fiche';
  back.onclick=()=>{closeEditor();renderSide(true);};
  ed.appendChild(back);
  const h=document.createElement('h2');h.textContent=(EDIT.look?'Personnaliser ':'Renommer ')+c.baseName;ed.appendChild(h);
  if(EDIT.look){
    const pv=document.createElement('div');
    pv.className='prev';
    const cv2=document.createElement('canvas');
    cv2.width=256;
    cv2.height=64;
    cv2.id='avprev';
    cv2.setAttribute('aria-label','Aperçu animé de l’avatar');
    pv.appendChild(cv2);
    ed.appendChild(pv);
  }
  const row=(label,el)=>{
    const r=document.createElement('div');
    r.className='fr';
    const sp=document.createElement('span');
    sp.textContent=label;
    r.appendChild(sp);
    r.appendChild(el);
    ed.appendChild(r);
    return r;
  };
  const set=(k,v)=>{EDIT.look[k]=v;syncDraft();};
  const nameIn=document.createElement('input');
  nameIn.type='text';
  nameIn.maxLength=24;
  nameIn.value=EDIT.name;
  nameIn.placeholder=c.baseName;
  nameIn.setAttribute('aria-label','Nom affiché');
  nameIn.oninput=()=>{EDIT.name=nameIn.value;syncDraft();};row('Nom',nameIn);
  if(!EDIT.look){
    const n=document.createElement('div');
    n.className='note';
    n.style.marginTop='8px';
    n.textContent=SPR[c.sprite]?'Ce personnage a un sprite fourni (le saxophoniste) : seul le nom se change.':'Seul le nom se change pour ce personnage.';
    ed.appendChild(n);
  }
  else{
    const L=EDIT.look;
    const sel_=(k,opts,on)=>{
      const s=document.createElement('select');
      s.setAttribute('aria-label',k);
      for(const [v,t] of opts){
        const o=document.createElement('option');
        o.value=v;
        o.textContent=t;
        if(v===L[k])o.selected=true;
        s.appendChild(o);
      }
      s.onchange=()=>{set(k,s.value);if(on)on();};
      return s;
    };
    const opts=(k,list)=>(list||Object.keys(LBL[k])).filter(v=>v==='none'||LBL[k][v]).map(v=>[v,LBL[k][v]]);
    const color=(k,pal)=>{
      const w=document.createElement('div');
      w.className='cpick';
      const i=document.createElement('input');
      i.type='color';
      i.value=L[k];
      i.setAttribute('aria-label','Couleur');
      const sws=[];const mark=()=>sws.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.c===L[k])));
      i.oninput=()=>{set(k,i.value);mark();};
      for(const p of pal){
        const b=document.createElement('button');
        b.type='button';
        b.className='sw';
        b.style.background=p;
        b.title=p;
        b.dataset.c=p;
        b.onclick=()=>{i.value=p;set(k,p);mark();};
        sws.push(b);
        w.appendChild(b);
      }
      w.appendChild(i);mark();return w;};
    const seg=(k,opts2,on)=>{
      const w=document.createElement('div');
      w.className='seg';
      for(const [v,t] of opts2){
        const b=document.createElement('button');
        b.type='button';
        b.textContent=t;
        b.className=L[k]===v?'on':'';
        b.setAttribute('aria-pressed',String(L[k]===v));
        b.onclick=()=>{
          set(k,v);
          [...w.children].forEach(x=>{
            const on2=x===b;
            x.className=on2?'on':'';
            x.setAttribute('aria-pressed',String(on2));
          });
          if(on)on();
        };
        w.appendChild(b);
      }
      return w;
    };
    const headRow={el:null};
    row('Silhouette',seg('sex',[['male','Homme'],['female','Femme']],()=>{headRow.el.style.display=L.sex==='female'?'none':'';}));
    {
      const w=document.createElement('div');
      w.className='cpick';
      const bs=[];
      for(const [v,col,t] of SKINS){
        const b=document.createElement('button');
        b.type='button';
        b.className='sw';
        b.style.background=col;
        b.title=t;
        b.setAttribute('aria-label','Peau '+t.toLowerCase());
        b.onclick=()=>{
          set('skin',v);
          bs.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
        };
        b.setAttribute('aria-pressed',String(L.skin===v));
        bs.push(b);
        w.appendChild(b);
      }
      row('Peau',w);
    }
    headRow.el=row('Visage',sel_('head',opts('head',LAYERS.catalog.head)));if(L.sex==='female')headRow.el.style.display='none';
    row('Coiffure',sel_('hair',opts('hair',['none',...LAYERS.catalog.hair])));
    row('Cheveux',color('hair_color',HAIR_COLORS));
    row('Barbe',sel_('beard',opts('beard',['none',...LAYERS.catalog.beard])));
    row('Haut',sel_('torso',opts('torso',LAYERS.catalog.torso)));
    row('Couleur haut',color('shirt',CLOTH_COLORS));
    row('Bas',sel_('legs',opts('legs',LAYERS.catalog.legs)));
    row('Couleur bas',color('legs_color',CLOTH_COLORS));
    row('Chaussures',color('shoes',['#3a2a22','#14100e','#e9e4d8','#a33b3b','#2f4a7a']));
    row('Couvre-chef',sel_('hat',opts('hat',['none',...LAYERS.catalog.hat])));
    row('Couleur',color('hat_color',CLOTH_COLORS));
    row('Lunettes',sel_('glasses',opts('glasses',['none',...LAYERS.catalog.glasses])));
  }
  const acts=document.createElement('div');acts.className='acts';ed.appendChild(acts);
  const mine=document.createElement('button');
  mine.textContent='Garder pour moi';
  mine.title='Visible seulement dans ce navigateur';
  mine.onclick=()=>{keepLocal(editorEntry());closeEditor();renderSide(true);};
  const reset=document.createElement('button');
  reset.textContent="Revenir à l'original";
  reset.onclick=()=>{
    EDIT.name='';
    if(EDIT.base)EDIT.look={...EDIT.base};
    syncDraft();
    renderSide(true);
  };
  const cancel=document.createElement('button');cancel.textContent='Annuler';cancel.onclick=()=>{closeEditor();renderSide(true);};
  acts.append(mine,reset,cancel);
  if(ACTIONS.avatar){
  // bloc « équipe » : Kronn ouvre sa carte d'action DANS ce bloc (data-kronn-action-slot-host), sous le bouton, sur toute la largeur
  const team=document.createElement('div');team.className='teamsave';team.setAttribute('data-kronn-action-slot-host','');ed.appendChild(team);
  const save=document.createElement('button');
  save.className='on';
  save.textContent="Enregistrer pour l'équipe";
  save.setAttribute('data-kronn-action','bureau-avatar');
  const hint=document.createElement('div');hint.className='hint';hint.id='avhint';
  hint.innerHTML="Kronn va te demander un <b>code avatar</b> : ce bouton le copie pour toi, il n'y a qu'à le coller.";
  save.onclick=()=>{const e=editorEntry();keepLocal(e);EDIT.hint=e.at;codeHint(hint,avatarCode(e),'Code avatar',"toute l'équipe le verra d'ici quelques secondes");};
  team.append(save,hint);kronnModal(team,save,'Enregistrer l’avatar pour l’équipe',()=>({c:EDIT&&byKey[EDIT.k],name:EDIT&&byKey[EDIT.k]?byKey[EDIT.k].name:'Avatar',small:'Toute l’équipe le verra.'}));
  // Kronn marque le bouton (data-kronn-action-state) quand le run avance : on suit pour confirmer sans attendre la relecture des données
  new MutationObserver(()=>{const st=save.getAttribute('data-kronn-action-state');if(!EDIT||!EDIT.hint)return;
    if(st==='succeeded')hint.innerHTML="<b style=\"color:var(--ok)\">✓ Enregistré pour toute l'équipe.</b> Les autres le verront au prochain rafraîchissement de la page (30 s environ).";
    else if(st==='failed')hint.innerHTML="<b style=\"color:var(--err)\">Code refusé.</b> Vérifie que tu as collé le code en entier (il commence par BUREAU1:), puis relance.";
  }).observe(save,{attributes:true,attributeFilter:['data-kronn-action-state']});
  }else{const n=document.createElement('div');n.className='hint';n.textContent="Retouche visible dans ce navigateur seulement (workflow « avatars » non installé).";ed.appendChild(n);}
}
function drawPreview(now){
  if(!EDIT||!EDIT.look)return;const cv2=document.getElementById('avprev');if(!cv2)return;
  const img=sheetFor({...RECIPES[byKey[EDIT.k].sprite],...EDIT.look});
  const x=cv2.getContext('2d');
  x.imageSmoothingEnabled=false;
  x.clearRect(0,0,256,64);
  if(!ready(img))return;const f=1+Math.floor(now/110)%8;
  ['down','left','right','up'].forEach((d,i)=>x.drawImage(img,f*64,DIRROW[d]*64,64,64,i*64,0,64,64));
}
