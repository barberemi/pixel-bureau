// ---------- le Nazgûl, messager de l'Œil : il part de la tour, apporte un parchemin sur ton bureau, puis y retourne ----------
// Il ne fait le travail de personne : il porte ce que l'Œil a vu. Ses livraisons, datées par les données (rejouables) :
// - le rapport du matin, NAZ_REPORT avant le daily : ce qui est arrivé depuis la veille à 18 h (relectures demandées,
//   retours sur tes PR), s'il y a du neuf ;
// - dans la journée, chaque nouveauté pour toi : une PR dont on te demande la relecture (ouverte dans la journée : GitHub ne
//   date pas la demande), un nouveau retour sur une de tes PR (changements demandés, fil d'un relecteur).
// Une scène de NAZ_MS (fxEvents, 43-fx.js) ; rien sans la tour (objects.oeil), avec « réduire les animations », ni pour un
// brouillon. Données : OEIL (69-oeil.js).
const NAZ_MS=9e3, NAZ_REPORT=10*60e3;
// les nouveautés pour toi, datées : {at, k, txt}
function nazNews(){
  if(!OEIL)return [];
  const out=[];
  for(const p of OEIL.asked||[])if(!p.draft&&p.since)
    out.push({at:ms(p.since),k:'a:'+p.id,txt:'👀 '+oePrName(p)+' : relecture demandée'+(p.author?' par '+p.author:'')});
  for(const p of OEIL.mine||[])if(!p.draft&&p.last&&p.last.at&&(p.review==='changes'||p.threads>0))
    out.push({at:ms(p.last.at),k:'f:'+p.id+':'+p.last.at,txt:'🛠 '+oePrName(p)+' : '+(p.last.k==='changes'?'changements demandés':'un fil')+' · '+p.last.who});
  return out.sort((a,b)=>a.at-b.at);
}
// le rapport du matin du jour de t : NAZ_REPORT avant le daily, avec ce qui est arrivé depuis la veille à 18 h
function nazReport(t){
  const [h,m]=String(RHYTHM.daily||'09:40').split(':').map(Number), d=parisMidnight(t), at=d+((h||9)*60+(m||0))*60e3-NAZ_REPORT;
  const news=nazNews().filter(x=>x.at>d-6*36e5&&x.at<=at);
  return news.length?{at,news}:null;
}
// les livraisons du jour de t : le rapport, puis chaque nouveauté arrivée après lui
function nazDeliveries(t){
  if(!OEIR)return [];
  const r=nazReport(t), from=r?r.at:parisMidnight(t)+6*36e5, out=[];
  if(r)out.push({at:r.at,id:'naz:rapport:'+r.at,txt:'📜 Le rapport de l\'Œil : '+plural(r.news.length,'nouveauté','nouveautés')+' depuis hier soir'});
  for(const x of nazNews())if(x.at>from&&parisMidnight(x.at)===parisMidnight(t))out.push({at:x.at,id:'naz:'+x.k,txt:'📜 '+x.txt});
  return out;
}
function nazFxEvents(recent){return REDUCED_MOTION?[]:nazDeliveries(T).filter(x=>recent(x.at)).map(x=>({...x,kind:'nazgul',ms:NAZ_MS}));}
// la monture ailée et son cavalier, à la façon des maquettes : ailes membraneuses, long cou, capuche sans visage ; pr : le parchemin
function nazFigure(x,y,dir,flap,scroll){
  const s=1.4;ctx.save();ctx.translate(x,y);ctx.scale(dir*s,s);
  const B='#141016', M='#2a2030', up=Math.sin(flap*Math.PI*2);
  for(const w of [-1,1]){const wy=-6-up*16*(w<0?1:.8);ctx.fillStyle=w<0?M:B;ctx.beginPath();ctx.moveTo(-4,-4);ctx.lineTo(-18+w*2,wy-10);ctx.lineTo(-34,wy+2);ctx.lineTo(-30,wy+8);
    ctx.lineTo(-22,wy+4);ctx.lineTo(-18,wy+12);ctx.lineTo(-10,wy+8);ctx.lineTo(-6,4);ctx.fill();}
  ctx.fillStyle=B;ctx.beginPath();ctx.ellipse(0,0,14,7,0,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(-30,6);ctx.lineTo(-12,4);ctx.fill();
  ctx.beginPath();ctx.moveTo(10,-3);ctx.quadraticCurveTo(20,-14,26,-12);ctx.lineTo(27,-8);ctx.quadraticCurveTo(20,-8,12,3);ctx.fill();
  ctx.beginPath();ctx.moveTo(24,-14);ctx.lineTo(34,-10);ctx.lineTo(24,-7);ctx.fill();ctx.fillStyle='#ff5a14';ctx.fillRect(28,-12,2,2);
  ctx.fillStyle='#0c0a0e';ctx.beginPath();ctx.moveTo(-6,-4);ctx.lineTo(4,-4);ctx.lineTo(1,-22);ctx.lineTo(-3,-24);ctx.lineTo(-8,-14);ctx.fill();
  ctx.fillStyle=B;ctx.fillRect(-2,5,2,7);ctx.fillRect(4,5,2,7);
  if(scroll){ctx.fillStyle='#efe2c0';ctx.fillRect(-7,11,14,9);ctx.fillStyle='#c8b088';ctx.fillRect(-8,10,2,11);ctx.fillRect(6,10,2,11);ctx.fillStyle='#8a1010';ctx.fillRect(-1,14,3,3);}
  ctx.restore();
}
// la scène : de l'œil au bureau du boss (piqué), le parchemin posé, puis retour à la tour ; la bulle pendant la livraison
function nazDraw(e,now){
  const a=oeEyePos(); if(!a)return;
  const b=oeBoss(), desk={x:b.x+16,y:b.y-30}, p=Math.min(1,(now-e.t0)/e.ms), ease=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
  let x,y,dir,scroll;
  if(p<.35){const u=ease(p/.35);x=a.x+(desk.x-a.x)*u;y=a.y+(desk.y-a.y)*u-Math.sin(u*Math.PI)*40;dir=desk.x<a.x?-1:1;scroll=true;}
  else if(p<.6){x=desk.x;y=desk.y+Math.sin(now/120)*2;dir=desk.x<a.x?-1:1;scroll=p<.45;}
  else{const u=ease((p-.6)/.4);x=desk.x+(a.x-desk.x)*u;y=desk.y+(a.y-desk.y)*u-Math.sin(u*Math.PI)*40;dir=a.x<desk.x?-1:1;scroll=false;}
  if(p>=.45){ctx.fillStyle='#efe2c0';ctx.fillRect(b.x+10,b.y+4,12,8);ctx.fillStyle='#8a1010';ctx.fillRect(b.x+15,b.y+7,3,3);} // le parchemin sur le bureau
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,Math.max(y+50,b.y+14),18,5,0,0,7);ctx.fill();
  nazFigure(x,y,dir,now/600,scroll);
  if(p>.35&&p<.85)fxBubble(desk.x,desk.y-30,e.txt,'#7a1a1a');
}
