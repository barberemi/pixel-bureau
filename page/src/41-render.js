// ---------- une image : sol, meubles et personnages triés en profondeur, voile, bulles, noms ----------
function render(now){
  ctx.drawImage(bg,0,0); drawWindows(T,now);
  const list=FURN.map(f=>({y:f.y,d:f.draw}));
  for(const c of chars)if(c.present&&c.pos)list.push({y:c.pos.y,d:n=>drawChar(c,n)});
  list.sort((a,b)=>a.y-b.y);
  for(const it of list)it.d(now);
  drawLight(now); // voile du soir et de la nuit, sous les bulles et les noms
  themeOverlay(now); // 46-themes.js : chauves-souris, confettis
  const shown=c=>!FILTER||famOf(c)===FILTER||c.key===sel;
  if(FILTER){ // les autres familles passent dans l'ombre, la famille choisie est redessinée par-dessus
    ctx.fillStyle='rgba(10,12,22,.58)';ctx.fillRect(0,0,W,H);
    for(const c of chars.filter(c=>c.present&&c.pos&&shown(c)).sort((a,b)=>a.pos.y-b.pos.y))drawChar(c,now);
  }
  const sc=sel&&byKey[sel];
  if(sc&&sc.present&&sc.pos){
    const gx=sc.pos.x, gy=sc.pos.y-26, g=ctx.createRadialGradient(gx,gy,30,gx,gy,120);
    g.addColorStop(0,'rgba(10,12,22,0)');g.addColorStop(1,'rgba(10,12,22,.52)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    drawSeatTrail(sc,now);
  }
  // bulles : celui qui vient voir quelqu'un (ticket livré, réouvert) passe par-dessus la bulle de la personne visitée
  const onTop=c=>c._st&&(c._st.st==='deliver'||c._st.st==='reopen');
  for(const c of chars)if(c.present&&shown(c)&&!onTop(c))drawOverlay(c,now);
  for(const c of chars)if(c.present&&shown(c)&&onTop(c))drawOverlay(c,now);
  drawEnvelopes(now,FILTER?shown:null);
  NAME_BOXES=[];
  for(const c of chars)if(c.present&&c.key!==sel&&shown(c))drawName(c);
  if(sc&&sc.present)drawName(sc);
  for(const c of chars)if(c.present&&shown(c)&&isFocus(c))drawDetail(c,now);
  {
    const b=chars.find(c=>c.boss);
    if(b&&b.pos&&b._st&&b._st.st==='sax'&&!b.moving){
      ctx.font='bold 12px system-ui,sans-serif';
      for(let i=0;i<3;i++){
        const k=((now/1400)+i/3)%1;
        ctx.fillStyle=`rgba(201,162,39,${1-k})`;
        ctx.fillText(i%2?'♫':'♪',b.pos.x+10+Math.sin(k*6+i)*6+k*10,b.pos.y-40-k*34);
      }
    }
  }
  const sg=stageAt(T);
  const so=furnAt('stage_closure')||{dx:0,dy:0}; // confettis sur le plateau TV
  if(sg&&sg.phase==='done'){
    const cols=['#e0a020','#d1453b','#2f6fd6','#2e9e5b','#7a5cc8'];
    for(let i=0;i<40;i++){
      const k=((now/1800)+hash(i,3))%1;
      R(ctx,28*TS+so.dx+hash(i,7)*4*TS+Math.sin(now/300+i)*4,2*TS-8+so.dy+k*3*TS,3,3,cols[i%5]);
    }
  }
}

