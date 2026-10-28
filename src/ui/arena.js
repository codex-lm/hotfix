import { t } from './i18n.js';
import { getImage } from './assets.js';

const COLORS = ['#F2652B','#3B8EA5','#8E5CC9','#3C9D5D','#E0B23C','#D64A8A','#5B6B7F','#2BB3A3'];
const round = (ctx,x,y,w,h,r=5) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); };
function rect(ctx,x,y,w,h,color,r=0) { ctx.fillStyle=color; if(r) { round(ctx,x,y,w,h,r);ctx.fill(); } else ctx.fillRect(x,y,w,h); }
function arrow(ctx,x,y,size,dir,color,width=2) {
  ctx.save();ctx.translate(x,y);ctx.rotate(dir*Math.PI/2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(0,size/2);ctx.lineTo(0,-size/2);ctx.moveTo(-size/3,-size/6);ctx.lineTo(0,-size/2);ctx.lineTo(size/3,-size/6);ctx.stroke();ctx.restore();
}
function imageTile(ctx,key,x,y,s) { const image=getImage(key); if (!image) return false; ctx.drawImage(image,x,y,s,s); return true; }
const tintedMasks = new WeakMap();
function robotMask(color) {
  const mask=getImage('robots/robot-mask');if(!mask)return null;
  let colors=tintedMasks.get(mask);if(!colors){colors=new Map();tintedMasks.set(mask,colors);}
  if(colors.has(color))return colors.get(color);
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(mask.naturalWidth||mask.width||256,mask.naturalHeight||mask.height||256):globalThis.document?.createElement('canvas');
  if(!canvas)return null;
  canvas.width=mask.naturalWidth||mask.width||256;canvas.height=mask.naturalHeight||mask.height||256;
  const ctx=canvas.getContext('2d');ctx.drawImage(mask,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);
  colors.set(color,canvas);return canvas;
}
export function drawRobot(ctx,x,y,s,dir=0,color=COLORS[0],op='',alpha=1) {
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(dir*Math.PI/2);
  const cardinal=((Math.round(dir)%4)+4)%4;
  let sprite=getImage(`robots/robot-${['N','E','S','O'][cardinal]}`),spriteDir=cardinal;
  if(!sprite){sprite=getImage('robots/robot-N');spriteDir=0;}
  if(sprite){
    // Cardinal renders rotate only by the fractional turn still being animated.
    ctx.rotate(-spriteDir*Math.PI/2);ctx.drawImage(sprite,-s*.45,-s*.45,s*.9,s*.9);ctx.rotate(spriteDir*Math.PI/2);
    const mask=robotMask(color);if(mask)ctx.drawImage(mask,-s*.45,-s*.45,s*.9,s*.9);
  }else{
    ctx.shadowColor='#1b1d2138';ctx.shadowBlur=s*.09;ctx.shadowOffsetY=s*.07;
    rect(ctx,-s*.28,-s*.32,s*.56,s*.67,color,s*.16);ctx.shadowColor='transparent';
    rect(ctx,-s*.36,-s*.19,s*.1,s*.33,'#282c32',s*.035);rect(ctx,s*.26,-s*.19,s*.1,s*.33,'#282c32',s*.035);
    rect(ctx,-s*.22,-s*.27,s*.44,s*.3,'#F7F6F2',s*.075);
    rect(ctx,-s*.16,s*.12,s*.32,s*.05,'#ffffff50',s*.025);
    ctx.fillStyle='#F7F6F2';ctx.beginPath();ctx.arc(s*.16,s*.24,s*.025,0,Math.PI*2);ctx.fill();
  }
  rect(ctx,-s*.18,-s*.23,s*.36,s*.2,'#23272E',s*.045);
  if(op) {ctx.fillStyle='#F7F6F2';ctx.font=`600 ${s*.115}px "JetBrains Mono",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(op,0,-s*.13);}
  else {rect(ctx,-s*.11,-s*.17,s*.065,s*.065,'#a1dbe0',s*.02);rect(ctx,s*.045,-s*.17,s*.065,s*.065,'#a1dbe0',s*.02);}
  ctx.restore();
}

const unit=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,p)=>a+(b-a)*p;
const turnDelta=(from,to)=>((to-from+6)%4)-2;
function presentationPose(entity,options,kind){
  const progress=unit(options.progress??1),old=options.from?.[kind==='robot'?'robots':'crates']?.find(item=>item.id===entity.id);
  const final={x:entity.x,y:entity.y,dir:entity.dir??0,scale:1,alpha:1,lift:0,flash:0,fallFrame:0};
  if(!old)return final;
  const events=(options.events??[]).filter(event=>kind==='robot'?event.robotId===entity.id:event.crateId===entity.id);
  const filled=kind==='crate'&&events.some(event=>event.type==='filled');
  if(progress>=1)return filled?{...final,scale:0,alpha:0}:final;
  const segments=[];
  let x=old.x,y=old.y,dir=old.dir??0;
  for(const event of events){
    if(['moved','pushed','conveyed'].includes(event.type)&&event.from&&event.to){
      segments.push({type:'move',from:event.from,to:event.to,fromDir:dir,toDir:dir,weight:1,jump:event.op==='JUMP'});x=event.to.x;y=event.to.y;
    }else if(event.type==='turned'){
      segments.push({type:'turn',from:event.at??{x,y},to:event.at??{x,y},fromDir:event.fromDir??dir,toDir:event.dir,weight:.65});dir=event.dir;
    }else if(event.type==='fell'||event.type==='filled'){
      const at=event.from??event.at??{x,y};
      segments.push({type:'fall',from:at,to:at,fromDir:dir,toDir:dir,weight:.75});x=at.x;y=at.y;
    }else if(event.type==='respawned'){
      const at=event.to??{x:entity.x,y:entity.y};dir=event.dir??entity.dir??dir;
      segments.push({type:'respawn',from:at,to:at,fromDir:dir,toDir:dir,weight:.65});x=at.x;y=at.y;
    }
  }
  if(!segments.length){
    // Compatibility for callers which provide only adjacent before/after worlds.
    const teleport=Math.abs(old.x-entity.x)+Math.abs(old.y-entity.y)>2;
    return {...final,x:teleport?entity.x:mix(old.x,entity.x,progress),y:teleport?entity.y:mix(old.y,entity.y,progress),dir:(old.dir??0)+turnDelta(old.dir??0,entity.dir??0)*progress};
  }
  const total=segments.reduce((sum,segment)=>sum+segment.weight,0);
  let remaining=progress*total;
  for(let index=0;index<segments.length;index++){
    const segment=segments[index];
    if(remaining>segment.weight&&index<segments.length-1){remaining-=segment.weight;continue;}
    const p=unit(remaining/segment.weight);
    const pose={...final,x:mix(segment.from.x,segment.to.x,p),y:mix(segment.from.y,segment.to.y,p),dir:segment.fromDir+turnDelta(segment.fromDir,segment.toDir)*p};
    if(segment.jump){pose.lift=Math.sin(Math.PI*p)*.17;pose.scale=1+Math.sin(Math.PI*p)*.07;}
    if(segment.type==='fall'){pose.scale=Math.max(0,1-p*.94);pose.alpha=Math.max(0,1-p*1.2);pose.dir+=p*.32;pose.fallFrame=Math.min(6,Math.floor(p*6)+1);}
    if(segment.type==='respawn'){pose.scale=.65+.35*p;pose.alpha=unit(p*2);pose.flash=Math.sin(Math.PI*p);}
    return pose;
  }
  return final;
}

// Shared by the arena and the Prod number badges so one presentation pose is
// used even while a robot shrinks into a hole or appears at its home tile.
export function getRobotPose(robot,options={}){return presentationPose(robot,options,'robot');}
export function getCratePose(crate,options={}){return presentationPose(crate,options,'crate');}

function drawCrate(ctx,x,y,s,pose){
  if(pose.alpha<=0||pose.scale<=0)return;
  ctx.save();ctx.globalAlpha*=pose.alpha;ctx.translate(x+s/2,y+s/2);ctx.scale(pose.scale,pose.scale);ctx.rotate((pose.dir??0)*Math.PI/2);
  const px=-s/2,py=-s/2;
  if(!imageTile(ctx,'props/crate',px,py,s)){
    ctx.shadowColor='#0002';ctx.shadowBlur=3;ctx.shadowOffsetY=3;rect(ctx,px+s*.16,py+s*.16,s*.68,s*.7,'#507f8c',4);ctx.shadowColor='transparent';
    rect(ctx,px+s*.22,py+s*.2,s*.56,s*.08,'#739eaa',2);ctx.strokeStyle='#345f6c';ctx.lineWidth=3;ctx.strokeRect(px+s*.26,py+s*.34,s*.48,s*.34);
  }
  ctx.restore();
}
function drawPath(ctx,world,trace,s,ox,oy,color,active=false,robotId=world.robots[0]?.id) {
  if (!trace?.length) return;
  const start=(trace[0].before||world).robots.find(r=>r.id===robotId);if(!start)return;
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=active?3:2;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(active?[5,5]:[3,6]);
  const point=r=>[ox+(r.x+.5)*s,oy+(r.y+.5)*s];
  let previous=start;
  for(const frame of trace){
    const next=frame.world.robots.find(r=>r.id===robotId);if(!next)continue;
    // Respawns are discontinuities, rather than paths across walls.
    const fell=frame.events.some(e=>e.type==='fell'&&e.robotId===robotId);
    if(!fell){ctx.beginPath();ctx.moveTo(...point(previous));ctx.lineTo(...point(next));ctx.stroke();}
    else {const fall=frame.events.find(e=>e.type==='fell'&&e.robotId===robotId);const pos=fall.from||{x:previous.x,y:previous.y};const [fx,fy]=point(pos);ctx.setLineDash([]);ctx.strokeStyle='#D63A2F';ctx.beginPath();ctx.moveTo(fx-6,fy-6);ctx.lineTo(fx+6,fy+6);ctx.moveTo(fx+6,fy-6);ctx.lineTo(fx-6,fy+6);ctx.stroke();ctx.strokeStyle=color;ctx.setLineDash(active?[5,5]:[3,6]);}
    previous=next;
  }
  ctx.setLineDash([]);
  if(s<38){
    const groups=new Map();
    trace.forEach((frame,index)=>{
      const robot=frame.world.robots.find(item=>item.id===robotId);if(!robot)return;
      const key=`${robot.x},${robot.y}`;
      if(!groups.has(key))groups.set(key,{x:robot.x,y:robot.y,ticks:new Set(),turned:false,pushed:false});
      const group=groups.get(key);group.ticks.add(index%6+1);
      group.turned ||= frame.events.some(event=>event.type==='turned'&&event.robotId===robotId);
      group.pushed ||= frame.events.some(event=>event.type==='pushed'&&event.by===robotId);
    });
    for(const group of groups.values()){
      const ticks=[...group.ticks].sort((a,b)=>a-b);
      const consecutive=ticks.length>1&&ticks.every((tick,index)=>tick===ticks[0]+index);
      const label=consecutive?`${ticks[0]}–${ticks.at(-1)}`:ticks.join('·');
      const cx=ox+(group.x+.5)*s,cy=oy+(group.y+.5)*s;
      const font=Math.max(7,Math.min(9,s*.26)),height=Math.min(font+5,s-2);
      ctx.save();
      // A compact trace label belongs to this tile, including when a robot
      // waits or turns six times. The tile clip also bounds narrow thumbnails.
      ctx.beginPath();ctx.rect(ox+group.x*s+1,oy+group.y*s+1,s-2,s-2);ctx.clip();
      ctx.font=`600 ${font}px "JetBrains Mono",monospace`;
      const width=Math.min(s-4,Math.max(13,ctx.measureText(label).width+7));
      const edge=s/2-height/2-1;
      const y=cy+Math.max(-edge,Math.min(edge,(active?-1:1)*s*.26));
      rect(ctx,cx-width/2,y-height/2,width,height,active?color:'#8f9594',3);
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,cx,y+.25,Math.max(1,width-4));
      if(group.turned){ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(cx-s*.33,cy,Math.min(3,s*.09),-Math.PI*.9,.15);ctx.stroke();}
      if(group.pushed){ctx.fillStyle=color;ctx.fillRect(cx+s*.29,cy-2,Math.min(3,s*.10),4);}
      ctx.restore();
    }
    ctx.restore();return;
  }
  const occurrences=new Map();
  trace.forEach((frame,index)=>{
    const robot=frame.world.robots.find(r=>r.id===robotId);if(!robot)return;
    const key=`${robot.x},${robot.y}`,count=occurrences.get(key)||0;occurrences.set(key,count+1);
    let [x,y]=point(robot);x+=(count%3-1)*14;y+=active?-s*.25-Math.floor(count/3)*14:s*.24+Math.floor(count/3)*14;
    ctx.fillStyle=active?color:'#a6a7a2';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=active?'#fff':'#fff';ctx.font='600 10px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index%6+1),x,y+.5);
    if(frame.events.some(e=>e.type==='turned'&&e.robotId===robotId)){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,11,-Math.PI*.9,0);ctx.stroke();}
    if(frame.events.some(e=>e.type==='pushed'&&e.by===robotId)){ctx.fillStyle=color;ctx.fillRect(x+9,y+5,4,5);}
  });ctx.restore();
}
export function drawArena(canvas,world,options={}) {
  if(!canvas||!world)return;
  const box=canvas.getBoundingClientRect();
  const width=options.width||box.width||720,height=options.height||box.height||540;
  const dpr=options.dpr??Math.min(globalThis.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const margin=options.compact?12:27,s=Math.min((width-margin*2)/world.w,(height-margin*2)/world.h);
  const ox=(width-world.w*s)/2,oy=(height-world.h*s)/2;
  const progress=unit(options.progress??1),events=options.events??[];
  const fillingHoles=new Set(options.from&&progress<1?events.filter(event=>event.type==='filled'&&event.at).map(event=>event.at.y*world.w+event.at.x):[]);
  ctx.fillStyle=options.background||'#D5D4CD';ctx.fillRect(0,0,width,height);
  // Painted bay border and subtle coordinate labels keep the board legible.
  ctx.fillStyle='#b6b7ae';ctx.fillRect(ox-5,oy-5,world.w*s+10,world.h*s+10);
  for(let y=0;y<world.h;y++)for(let x=0;x<world.w;x++){
    const px=ox+x*s,py=oy+y*s,index=y*world.w+x,tile=fillingHoles.has(index)?2:world.tiles[index];
    if(!imageTile(ctx,`tiles/floor-${1+(x*3+y*7)%4}`,px,py,s)){
      rect(ctx,px,py,s,s,(x+y)%2?'#E6E4DD':'#EAE8E1');
      ctx.strokeStyle='#d5d3cb';ctx.lineWidth=1;ctx.strokeRect(px+.5,py+.5,s-1,s-1);
      rect(ctx,px+s*.12,py+s*.13,2,2,'#c9c7c0');rect(ctx,px+s*.85,py+s*.84,2,2,'#ceccc4');
    }
    if(tile===1&&!imageTile(ctx,'tiles/wall',px,py,s)){
      rect(ctx,px+3,py+6,s-6,s-6,'#8d9694',4);rect(ctx,px+3,py+3,s-6,s-8,'#b1b8b1',4);
      rect(ctx,px+6,py+6,s-12,s*.1,'#c9cec5',2);
      ctx.strokeStyle='#969f97';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+10,py+s*.3);ctx.lineTo(px+s-10,py+s*.3);ctx.moveTo(px+10,py+s*.69);ctx.lineTo(px+s-10,py+s*.69);ctx.stroke();
      rect(ctx,px+7,py+s*.34,3,s*.25,'#858e86',1);rect(ctx,px+s-10,py+s*.34,3,s*.25,'#858e86',1);
    }
    if(tile===2&&!imageTile(ctx,'tiles/hole',px,py,s)){
      rect(ctx,px+3,py+3,s-6,s-6,'#34383c',4);rect(ctx,px+8,py+8,s-16,s-16,'#1B1D21',3);
      ctx.save();ctx.beginPath();ctx.rect(px+3,py+3,s-6,5);ctx.rect(px+3,py+s-8,s-6,5);ctx.clip();ctx.strokeStyle='#F2652B';ctx.lineWidth=5;
      for(let i=-s;i<s*2;i+=13){ctx.beginPath();ctx.moveTo(px+i,py);ctx.lineTo(px+i+s,py+s);ctx.stroke();}ctx.restore();
    }
    if(world.conveyors.has(index)){
      const dir=world.conveyors.get(index);ctx.save();ctx.translate(px+s/2,py+s/2);ctx.rotate(dir*Math.PI/2);
      if(!imageTile(ctx,'tiles/conveyor',-s/2,-s/2,s)){
        rect(ctx,-s*.44,-s*.47,s*.88,s*.94,'#c1d1ce',2);rect(ctx,-s*.42,-s*.46,s*.06,s*.92,'#567d83');rect(ctx,s*.36,-s*.46,s*.06,s*.92,'#567d83');
        for(let a=-2;a<=2;a++){ctx.strokeStyle='#8faeaf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-s*.3,a*s*.2);ctx.lineTo(s*.3,a*s*.2);ctx.stroke();}
        arrow(ctx,0,0,s*.4,0,'#397d8c',3);
      }ctx.restore();
    }
  }
  if(world.exit){const{x,y}=world.exit,px=ox+x*s,py=oy+y*s;if(!imageTile(ctx,'tiles/exit',px,py,s)){
    rect(ctx,px+3,py+3,s-6,s-6,'#c8ded0',3);ctx.strokeStyle='#3C9D5D';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(px+6,py+6,s-12,s-12);ctx.setLineDash([]);arrow(ctx,px+s*.5,py+s*.5,s*.42,1,'#33834e',3);
  }}
  for(const robot of world.robots){const hx=ox+robot.home.x*s,hy=oy+robot.home.y*s;ctx.strokeStyle='#F2652B66';ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.strokeRect(hx+s*.12,hy+s*.12,s*.76,s*.76);ctx.setLineDash([]);}
  const crates=new Map(world.crates.map(crate=>[crate.id,crate]));
  if(options.from&&progress<1)for(const crate of options.from.crates){
    if(crates.has(crate.id))continue;
    const filled=events.find(event=>event.type==='filled'&&event.crateId===crate.id);
    if(filled)crates.set(crate.id,{...crate,x:filled.at.x,y:filled.at.y});
  }
  for(const crate of crates.values()){
    const pose=getCratePose(crate,options);
    drawCrate(ctx,ox+pose.x*s,oy+pose.y*s,s,pose);
  }
  for(const beacon of world.beacons){const px=ox+beacon.x*s,py=oy+beacon.y*s;if(!imageTile(ctx,'props/beacon',px,py,s)){
    ctx.fillStyle='#F2652B22';ctx.beginPath();ctx.arc(px+s*.5,py+s*.5,s*.36,0,Math.PI*2);ctx.fill();
    rect(ctx,px+s*.34,py+s*.34,s*.32,s*.32,'#F2652B',5);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px+s*.5,py+s*.5,s*.07,0,Math.PI*2);ctx.fill();
  }}
  drawPath(ctx,world,options.baseTrace,s,ox,oy,'#8f9594',false,options.robotId);
  drawPath(ctx,world,options.patchTrace,s,ox,oy,'#e45b25',true,options.robotId);
  for(let i=0;i<world.robots.length;i++){
    const robot=world.robots[i],pose=getRobotPose(robot,options);
    if(pose.alpha<=0||pose.scale<=0)continue;
    const x=ox+(pose.x+.5)*s,y=oy+(pose.y+.5)*s;
    if(pose.lift){ctx.save();ctx.globalAlpha=.12;ctx.fillStyle='#1B1D21';ctx.beginPath();ctx.ellipse(x,y+s*.25,s*.28,s*.10,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(pose.flash){ctx.save();ctx.globalAlpha=pose.flash*.55;ctx.strokeStyle='#F7F6F2';ctx.fillStyle='#F7F6F2';ctx.lineWidth=Math.max(2,s*.06);ctx.beginPath();ctx.arc(x,y,s*(.35+pose.flash*.14),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=pose.flash*.2;ctx.fill();ctx.restore();}
    ctx.save();ctx.translate(x,y-pose.lift*s);ctx.scale(pose.scale,pose.scale);
    const fall=pose.fallFrame?getImage(`fx/fall-${pose.fallFrame}`):null;
    if(fall){ctx.globalAlpha*=pose.alpha;ctx.drawImage(fall,-s*.45,-s*.45,s*.9,s*.9);}
    else drawRobot(ctx,0,0,s,pose.dir,robot.color||COLORS[i%8],options.opByRobot?.[robot.id]??options.opByRobot?.get?.(robot.id)??options.op??'',pose.alpha);
    ctx.restore();
  }
  if(!options.compact){ctx.font='500 10px "JetBrains Mono",monospace';ctx.fillStyle='#64716c';ctx.textAlign='center';ctx.textBaseline='middle';for(let x=0;x<world.w;x++)ctx.fillText(String.fromCharCode(65+x),ox+(x+.5)*s,oy-13);for(let y=0;y<world.h;y++)ctx.fillText(String(y+1).padStart(2,'0'),ox-14,oy+(y+.5)*s);}
}
export function describeArena(world){
  const r=world.robots[0];return t('arenaDescription',{w:world.w,h:world.h,x:r.x+1,y:r.y+1,dir:t(['north','east','south','west'][r.dir]),ex:(world.exit?.x??0)+1,ey:(world.exit?.y??0)+1,crates:world.crates.length,holes:[...world.tiles].filter(v=>v===2).length});
}
