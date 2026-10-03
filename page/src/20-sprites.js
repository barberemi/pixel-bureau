// ---------- sprites ----------
// Les avatars sont assemblés ici à partir des calques LPC (LAYERS) et des recettes (RECIPES = cast.json),
// recettes surchargées par le dataset `avatars` (toute l'équipe) puis par les retouches locales.
const IMG={};
const ready=im=>!!im&&(im.complete===undefined||im.complete);
for(const k of Object.keys(SPR)){const im=new Image();im.onload=()=>renderSide();im.src=SPR[k];IMG[k]=im;}
const LIMG={}, LPX={};
let layersLoaded=false;
Promise.all(Object.entries(LAYERS.layers).map(([id,l])=>new Promise(res=>{
  const im=new Image();
  im.onload=im.onerror=()=>res();
  im.src=l.src;
  LIMG[id]=im;
}))).then(()=>{layersLoaded=true;});
function layerPx(id){
  if(id in LPX)return LPX[id];
  const im=LIMG[id]; if(!im||!im.naturalWidth)return LPX[id]=null;
  const c=document.createElement('canvas');c.width=576;c.height=384;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
  return LPX[id]=x.getImageData(0,0,576,384).data;
}
const rgbOf=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');if(!m)return null;const n=parseInt(m[1],16);return [n>>16,n>>8&255,n&255];};
const isSet=v=>!!v&&v!=='none';
function specLayers(s){
  const sex=s.sex==='female'?'female':'male', skin=LAYERS.skin[s.skin]||LAYERS.skin.light, has=id=>!!LAYERS.layers[id];
  const torso=has('torso/'+s.torso+'/'+sex)?s.torso:'longsleeve/longsleeve', legs=has('legs/'+s.legs+'/'+sex)?s.legs:'pants';
  const L=[['body/'+sex,'mul',skin],['feet/'+sex,'lum',s.shoes||'#3a2a22'],['legs/'+legs+'/'+sex,'lum',s.legs_color||'#3b4a63'],['torso/'+torso+'/'+sex,'lum',s.shirt||'#8a8f99'],
    ['head/'+(sex==='female'?'female':has('head/'+s.head)?s.head:'male'),'mul',skin],['eyes','raw']];
  if(isSet(s.beard))L.push(['beard/'+s.beard,'lum',s.hair_color]);
  if(isSet(s.hair))L.push([has('hair/'+s.hair+'/'+sex)?'hair/'+s.hair+'/'+sex:'hair/'+s.hair+'/male','lum',s.hair_color]);
  if(isSet(s.hat))L.push(['hat/'+s.hat,'lum',s.hat_color||'#6b4a2e']);
  if(isSet(s.glasses))L.push(['glasses/'+s.glasses,'raw']);
  return L;
}
// même calcul que build_sprites.recolor : 'lum' = rampe de la couleur choisie, 'mul' = teinte de peau
function composeSheet(s){
  const out=new ImageData(576,384), o=out.data;
  for(const [id,mode,col] of specLayers(s)){
    const p=layerPx(id); if(!p)continue; const t=rgbOf(col)||[255,255,255];
    for(let i=0;i<p.length;i+=4){
      const a=p[i+3]; if(!a)continue;
      let r,g,b;
      if(mode==='lum'){const k=.15+p[i]/255;r=t[0]*k;g=t[1]*k;b=t[2]*k;}
      else if(mode==='mul'){r=p[i]*t[0]/255;g=p[i+1]*t[1]/255;b=p[i+2]*t[2]/255;}
      else{r=p[i];g=p[i+1];b=p[i+2];}
      if(a===255||!o[i+3]){o[i]=r;o[i+1]=g;o[i+2]=b;o[i+3]=a;continue;}
      const sa=a/255, da=o[i+3]/255*(1-sa), na=sa+da;
      o[i]=(r*sa+o[i]*da)/na;o[i+1]=(g*sa+o[i+1]*da)/na;o[i+2]=(b*sa+o[i+2]*da)/na;o[i+3]=na*255;
    }
  }
  const c=document.createElement('canvas');c.width=576;c.height=384;c.getContext('2d').putImageData(out,0,0);return c;
}
// planches assemblées, par recette ; une file étale le travail sur plusieurs images (≈ 8 ms par image)
const SHEETS=new Map(), QUEUE=[];
let composeMs=0, composeN=0;
function sheetFor(spec){const k=JSON.stringify(spec);const c=SHEETS.get(k);if(c)return c;if(!QUEUE.includes(k))QUEUE.push(k);return null;}
function pumpSheets(budget){
  if(!layersLoaded||!QUEUE.length)return;
  const t0=performance.now();
  while(QUEUE.length&&performance.now()-t0<budget){
    const k=QUEUE.shift();
    const a=performance.now();
    SHEETS.set(k,composeSheet(JSON.parse(k)));
    composeMs+=performance.now()-a;
    composeN++;
    if(SHEETS.size>80)SHEETS.delete(SHEETS.keys().next().value);}
  if(!QUEUE.length)renderSide();
}
function lookOf(c){const base=RECIPES[c.sprite];if(!base)return null;const ov=avatarFor(c.key);return ov&&ov.look?{...base,...ov.look}:base;}
function spriteOf(c){if(!c)return null;if(SPR[c.sprite])return IMG[c.sprite];const spec=lookOf(c);return spec?sheetFor(spec):null;}

// ---------- avatars personnalisés (nom + apparence) ----------
// AV_TEAM = dataset `avatars` (enregistré pour toute l'équipe par le workflow « Le Bureau · avatars »),
// AV_LOCAL = retouches de ce navigateur, AV_DRAFT = éditeur ouvert. La plus récente (at) l'emporte.
let AV_TEAM={}, AV_LOCAL={}, AV_DRAFT=null;
try{AV_LOCAL=JSON.parse(localStorage.getItem('bureau:avatars')||'{}')||{};}catch(e){AV_LOCAL={};}
if(AV_LOCAL.boss&&!AV_LOCAL.p_remi){AV_LOCAL.p_remi=AV_LOCAL.boss;delete AV_LOCAL.boss;} // ancienne clé du boss (avant le roster)
const saveLocal=()=>{try{localStorage.setItem('bureau:avatars',JSON.stringify(AV_LOCAL));}catch(e){}};
function readAvatars(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.avatars;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&d.avatars&&typeof d.avatars==='object'?d.avatars:null;
  }catch(e){return null;}
}
function avatarFor(k){
  if(AV_DRAFT&&AV_DRAFT.k===k)return AV_DRAFT;
  const t=AV_TEAM[k], l=AV_LOCAL[k];
  if(l&&(!t||(+l.at||0)>(+t.at||0)))return l.reset?null:l;
  return t||null;
}
const localOnly=k=>{const t=AV_TEAM[k],l=AV_LOCAL[k];return !!l&&(!t||(+l.at||0)>(+t.at||0));};
function setTeamAvatars(a){
  AV_TEAM=a||{};
  for(const k of Object.keys(AV_LOCAL)){const t=AV_TEAM[k],l=AV_LOCAL[k];if(t&&(+t.at||0)>=(+l.at||0)||!t&&l.reset)delete AV_LOCAL[k];}
  saveLocal();applyNames();
}
function applyNames(){for(const c of chars){const ov=avatarFor(c.key);c.name=(ov&&ov.name)||c.baseName||c.name;}}

const DIRROW={up:0,left:1,down:2,right:3};
function frameFor(c,now){
  if(c.moving){const f=1+Math.floor(now/90)%8;return [f,DIRROW[c.dir]];}
  const p=c.pose;
  if(c.boss&&p!=='type'&&p!=='hands')return [c.dir==='up'?0:c.dir==='left'?4:c.dir==='right'?5:2,4];
  if(p==='hands'){const s=[0,1,2,1][Math.floor(now/260)%4];return [s,5];}
  if(p==='type'){if(c.dir==='left')return [4,4];if(c.dir==='right')return [5,4];return [2+(Math.floor(now/320+c.phase)%2),4];}
  if(c.dir==='up')return [Math.floor(now/900+c.phase)%2,4];
  if(c.dir==='left')return [4,4];
  if(c.dir==='right')return [5,4];
  return [2+(Math.floor(now/1100+c.phase)%2),4];
}

