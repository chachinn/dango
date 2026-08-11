(() => {
'use strict';

const STORAGE_KEY = 'dango.app.v1';
const APP_VERSION = '1.0.0';
const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));
const deepClone = x => JSON.parse(JSON.stringify(x));

const UNIT = {
  cm: {label:'cm', toCm:1}, m:{label:'m',toCm:100}, in:{label:'in',toCm:2.54}, ft:{label:'ft',toCm:30.48}
};
const PRESETS = [
  ['bed','🛏️','Bed',150,200,'#f7c8d5'],['single-bed','🛏️','Single bed',90,190,'#f9d7df'],['desk','🧑‍💻','Desk',120,60,'#ddb892'],
  ['wardrobe','🚪','Wardrobe',120,60,'#d8c5b2'],['sofa','🛋️','Sofa',200,90,'#e8c4bd'],['chair','🪑','Chair',50,50,'#f3d4a8'],
  ['table','🍽️','Dining table',160,90,'#d9b58c'],['coffee','☕','Coffee table',100,55,'#e8caa6'],['shelf','📚','Shelf',90,35,'#cfb49b'],
  ['dresser','🧺','Dresser',100,45,'#e4c4aa'],['tv','📺','TV / console',140,40,'#b8b7b9'],['rug','🧶','Rug',180,120,'#f3d6df'],
  ['fridge','🧊','Refrigerator',75,75,'#cfd6da'],['washer','🫧','Washer',65,65,'#d8e0e5'],['stove','🍳','Stove',60,60,'#bfc4c7'],
  ['plant','🪴','Plant',45,45,'#b8cf9e'],['storage','📦','Storage box',60,45,'#e6c69f'],['custom','⬜','Custom object',100,100,'#eadce0']
];

function defaultState(){
  return {
    version:1, settings:{unit:'cm',grid:true,snap:true,snapSize:10,labels:true,dimensions:true,clearances:true,haptics:true,theme:'pink'},
    rooms:[], currentRoomId:null, currentLayoutId:null, selectedId:null, view:'rooms', zoom:1,
    history:[], future:[], measurements:[], measureDraft:null
  };
}
let state = load();
let drag = null;
let saveTimer = null;
let roomFilter = 'all';

function load(){
  try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')); }
  catch { return defaultState(); }
}
function persist(){
  $('#saveStatus').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('#saveStatus').textContent='Saved';},120);
}
function snapshot(){
  const r=currentRoom(); if(!r)return;
  state.history.push(JSON.stringify({rooms:state.rooms,currentRoomId:state.currentRoomId,currentLayoutId:state.currentLayoutId}));
  if(state.history.length>40) state.history.shift(); state.future=[];
}
function undo(){
  if(!state.history.length)return toast('Nothing to undo');
  const now=JSON.stringify({rooms:state.rooms,currentRoomId:state.currentRoomId,currentLayoutId:state.currentLayoutId});
  state.future.push(now); const prev=JSON.parse(state.history.pop()); Object.assign(state,prev); state.selectedId=null; persist(); renderAll(); toast('Undone');
}
function redo(){
  if(!state.future.length)return toast('Nothing to redo');
  state.history.push(JSON.stringify({rooms:state.rooms,currentRoomId:state.currentRoomId,currentLayoutId:state.currentLayoutId}));
  const next=JSON.parse(state.future.pop());Object.assign(state,next);state.selectedId=null;persist();renderAll();toast('Redone');
}
function currentRoom(){return state.rooms.find(r=>r.id===state.currentRoomId)||null}
function currentLayout(){const r=currentRoom();return r?.layouts.find(l=>l.id===state.currentLayoutId)||r?.layouts[0]||null}
function objects(){return currentLayout()?.objects||[]}
function display(vCm,unit=state.settings.unit){const u=UNIT[unit]||UNIT.cm;const val=vCm/u.toCm;return unit==='cm'?`${Math.round(val)} cm`:unit==='m'?`${Number(val.toFixed(2))} m`:unit==='in'?`${Number(val.toFixed(1))} in`:`${Number(val.toFixed(2))} ft`}
function toCm(value,unit){return Number(value||0)*(UNIT[unit]?.toCm||1)}
function haptic(){if(state.settings.haptics && navigator.vibrate) navigator.vibrate(8)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1800)}

function modal(title,html,onOpen){
  const tpl=$('#modalTemplate').content.cloneNode(true);const root=tpl.querySelector('.modal-backdrop');
  root.querySelector('h3').textContent=title;root.querySelector('.modal-body').innerHTML=html;root.querySelector('.modal-close').onclick=()=>root.remove();
  root.addEventListener('click',e=>{if(e.target===root)root.remove()});$('#modalRoot').appendChild(root);onOpen?.(root);return root;
}
function closeModal(root){root?.remove()}

function createRoom(data){
  snapshot(); const w=toCm(data.width,data.unit),h=toCm(data.height,data.unit);
  const layoutId=uid('layout');
  const room={id:uid('room'),name:data.name||'Untitled Room',width:Math.max(100,w),height:Math.max(100,h),unit:data.unit||'cm',starred:false,notes:'',createdAt:Date.now(),updatedAt:Date.now(),layouts:[{id:layoutId,name:'Layout A',objects:[],createdAt:Date.now()}]};
  state.rooms.unshift(room);state.currentRoomId=room.id;state.currentLayoutId=layoutId;state.view='plan';state.zoom=1;persist();renderAll();toast('Room created');
}
function unitInput(cm,u){return Number((cm/(UNIT[u]?.toCm||1)).toFixed(u==='cm'?0:2))}
function newRoomModal(){
  const u=state.settings.unit; const dw=unitInput(350,u), dh=unitInput(420,u);
  const root=modal('Create a room',`<form id="newRoomForm" class="form-grid">
    <div class="field full"><label>Room name</label><input name="name" value="My Room" maxlength="40" required></div>
    <div class="field"><label>Width</label><input name="width" type="number" inputmode="decimal" min="1" step="0.1" value="${dw}" required></div>
    <div class="field"><label>Length</label><input name="height" type="number" inputmode="decimal" min="1" step="0.1" value="${dh}" required></div>
    <div class="field full"><label>Unit</label><select name="unit">${Object.keys(UNIT).map(k=>`<option value="${k}" ${k===u?'selected':''}>${UNIT[k].label}</option>`).join('')}</select></div>
    <div class="field full"><p class="help">You can change the room dimensions and display unit later. Dango stores the plan at real scale.</p></div>
    <div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Create room</button></div>
  </form>`,m=>{const f=m.querySelector('#newRoomForm');m.querySelector('.cancel').onclick=()=>m.remove();f.onsubmit=e=>{e.preventDefault();createRoom(Object.fromEntries(new FormData(f)));m.remove()}});return root;
}

function renderRooms(){
  const grid=$('#roomsGrid');let rooms=state.rooms.filter(r=>roomFilter==='all'||r.starred);
  $('#roomCountLabel').textContent=`${rooms.length} saved room${rooms.length===1?'':'s'}`;
  if(!rooms.length){grid.innerHTML=`<div class="empty-state"><div class="big">🍡</div><h3>${state.rooms.length?'No starred rooms yet':'Your first layout starts here'}</h3><p>${state.rooms.length?'Tap the star on any room to keep favorites together.':'Create a room with real measurements, then start placing furniture and fixtures.'}</p>${state.rooms.length?'':'<button class="primary-btn" id="emptyNewBtn">＋ Create room</button>'}</div>`;$('#emptyNewBtn')?.addEventListener('click',newRoomModal);return}
  grid.innerHTML=rooms.map(r=>{
    const l=r.layouts[0];return `<article class="room-card" data-room="${r.id}"><div class="room-thumb">${miniPlan(r,l)}</div><div><h3>${esc(r.name)}</h3><p>${display(r.width,r.unit)} × ${display(r.height,r.unit)}<br>${r.layouts.length} layout${r.layouts.length===1?'':'s'} • ${l.objects.length} item${l.objects.length===1?'':'s'}</p></div><div class="room-actions"><button class="tiny-btn star" aria-label="Star">${r.starred?'⭐':'☆'}</button><button class="tiny-btn menu" aria-label="Room actions">⋮</button></div></article>`
  }).join('');
  grid.querySelectorAll('.room-card').forEach(card=>{
    card.onclick=e=>{if(e.target.closest('button'))return;openRoom(card.dataset.room)};
    card.querySelector('.star').onclick=()=>{const r=state.rooms.find(x=>x.id===card.dataset.room);r.starred=!r.starred;persist();renderRooms()};
    card.querySelector('.menu').onclick=()=>roomActions(card.dataset.room);
  })
}
function miniPlan(r,l){
  const W=100,H=70,s=Math.min((W-8)/r.width,(H-8)/r.height),ox=(W-r.width*s)/2,oy=(H-r.height*s)/2;
  let obj=(l?.objects||[]).slice(0,12).map(o=>`<rect x="${ox+o.x*s}" y="${oy+o.y*s}" width="${Math.max(2,o.w*s)}" height="${Math.max(2,o.h*s)}" rx="1.5" fill="${o.color||'#e7ccd4'}" opacity=".85"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="${ox}" y="${oy}" width="${r.width*s}" height="${r.height*s}" fill="#fff" stroke="#6d565e" stroke-width="1.5"/>${obj}</svg>`
}
function roomActions(id){const r=state.rooms.find(x=>x.id===id);if(!r)return;modal(r.name,`<div class="list">
  <button class="list-row" data-a="open"><span>📐 Open room</span><span>›</span></button>
  <button class="list-row" data-a="rename"><span>✏️ Rename</span><span>›</span></button>
  <button class="list-row" data-a="duplicate"><span>⧉ Duplicate room</span><span>›</span></button>
  <button class="list-row" data-a="star"><span>${r.starred?'☆ Remove from starred':'⭐ Add to starred'}</span><span>›</span></button>
  <button class="list-row" data-a="delete"><span>🗑️ Delete room</span><span>›</span></button>
</div>`,m=>{m.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{const a=b.dataset.a;if(a==='open'){m.remove();openRoom(id)}if(a==='rename'){m.remove();renameRoom(id)}if(a==='duplicate'){snapshot();const cp=deepClone(r);cp.id=uid('room');cp.name=`${r.name} Copy`;cp.layouts.forEach(l=>{l.id=uid('layout');l.objects.forEach(o=>o.id=uid('obj'))});state.rooms.unshift(cp);persist();m.remove();renderRooms();toast('Room duplicated')}if(a==='star'){r.starred=!r.starred;persist();m.remove();renderRooms()}if(a==='delete'){if(confirm(`Delete “${r.name}”?`)){snapshot();state.rooms=state.rooms.filter(x=>x.id!==id);if(state.currentRoomId===id){state.currentRoomId=null;state.currentLayoutId=null}persist();m.remove();renderAll();toast('Room deleted')}}})})}
function renameRoom(id){const r=state.rooms.find(x=>x.id===id);modal('Rename room',`<form id="renameForm"><div class="field"><label>Name</label><input name="name" value="${attr(r.name)}" maxlength="40"></div><div class="form-actions"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Save</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();snapshot();r.name=new FormData(e.target).get('name').trim()||r.name;r.updatedAt=Date.now();persist();m.remove();renderAll()}})}
function openRoom(id){const r=state.rooms.find(x=>x.id===id);if(!r)return;state.currentRoomId=id;state.currentLayoutId=r.layouts[0]?.id;state.view='plan';state.selectedId=null;state.measureDraft=null;renderAll()}

function renderAll(){
  $('#roomsView').classList.toggle('active',state.view==='rooms');$('#planView').classList.toggle('active',state.view==='plan');
  $$('.bottom-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  const r=currentRoom();$('#projectSubtitle').textContent=r?`${r.name} • ${display(r.width,r.unit)} × ${display(r.height,r.unit)}`:'Room Layout Planner';
  if(state.view==='rooms')renderRooms(); if(state.view==='plan')renderPlan(); updateUndoRedo();
}
function updateUndoRedo(){$('#undoBtn').disabled=!state.history.length;$('#redoBtn').disabled=!state.future.length}

function planGeometry(){
  const r=currentRoom(),wrap=$('#canvasWrap');if(!r||!wrap)return null;const bb=wrap.getBoundingClientRect();const pad=44;const base=Math.min((bb.width-pad*2)/r.width,(bb.height-pad*2)/r.height);const scale=base*state.zoom;const rw=r.width*scale,rh=r.height*scale;return {scale,ox:(bb.width-rw)/2,oy:(bb.height-rh)/2,rw,rh,w:bb.width,h:bb.height};
}
function renderPlan(){
  const r=currentRoom(),l=currentLayout(),svg=$('#planCanvas');
  if(!r||!l){state.view='rooms';renderAll();return}
  $('#canvasWrap').classList.toggle('no-grid',!state.settings.grid);const g=planGeometry();if(!g)return;
  svg.setAttribute('viewBox',`0 0 ${g.w} ${g.h}`);svg.innerHTML='';
  const defs=S('defs');defs.innerHTML=`<filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#6c4c56" flood-opacity=".15"/></filter>`;svg.appendChild(defs);
  const room=S('rect',{x:g.ox,y:g.oy,width:g.rw,height:g.rh,fill:'#fffdfd',stroke:'#514147','stroke-width':Math.max(3,g.scale*3),rx:2});svg.appendChild(room);
  if(state.settings.dimensions) renderRoomDimensions(svg,r,g);
  // fixed fixtures first, then normal objects
  l.objects.filter(o=>['door','window','outlet','ac','column'].includes(o.type)).forEach(o=>renderObject(svg,o,g));
  l.objects.filter(o=>!['door','window','outlet','ac','column'].includes(o.type)).forEach(o=>renderObject(svg,o,g));
  state.measurements.forEach(m=>renderMeasurement(svg,m,g));
  if(state.measureDraft) renderMeasureDraft(svg,state.measureDraft,g);
  renderSelectionOverlay();
  const issues=detectIssues();$('#issueCount').textContent=issues.length;
  svg.onpointerdown=canvasPointerDown;
}
function S(tag,attrs={}){const el=document.createElementNS(SVG_NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el}
function renderRoomDimensions(svg,r,g){
  const topY=g.oy-20,leftX=g.ox-22;
  svg.appendChild(S('line',{x1:g.ox,y1:topY,x2:g.ox+g.rw,y2:topY,stroke:'#7b666c','stroke-width':1}));
  svg.appendChild(S('text',{x:g.ox+g.rw/2,y:topY-4,'text-anchor':'middle','font-size':11,fill:'#65545a'})).textContent=display(r.width,r.unit);
  svg.appendChild(S('line',{x1:leftX,y1:g.oy,x2:leftX,y2:g.oy+g.rh,stroke:'#7b666c','stroke-width':1}));
  const t=S('text',{x:leftX-5,y:g.oy+g.rh/2,'text-anchor':'middle','font-size':11,fill:'#65545a',transform:`rotate(-90 ${leftX-5} ${g.oy+g.rh/2})`});t.textContent=display(r.height,r.unit);svg.appendChild(t);
}
function renderObject(svg,o,g){
  const x=g.ox+o.x*g.scale,y=g.oy+o.y*g.scale,w=o.w*g.scale,h=o.h*g.scale,cx=x+w/2,cy=y+h/2;const selected=o.id===state.selectedId;
  const group=S('g',{'data-id':o.id,transform:`rotate(${o.rotation||0} ${cx} ${cy})`,style:'cursor:pointer;touch-action:none'});
  if(o.clearance && state.settings.clearances && !['door','window'].includes(o.type)) group.appendChild(S('rect',{x:x-o.clearance*g.scale,y:y-o.clearance*g.scale,width:w+2*o.clearance*g.scale,height:h+2*o.clearance*g.scale,fill:'none',stroke:'#f3a0b8','stroke-width':1,'stroke-dasharray':'5 4',rx:4,opacity:.65}));
  if(o.type==='door'){
    const rad=(o.clearance||Math.max(o.w,o.h))*g.scale;
    const isH=o.wall==='top'||o.wall==='bottom';
    if(o.kind==='sliding'){
      group.appendChild(S('line',{x1:x,y1:y+h/2,x2:x+w,y2:y+h/2,stroke:'#5d4b51','stroke-width':Math.max(3,2.5*g.scale),'stroke-linecap':'round'}));
      group.appendChild(S('line',{x1:isH?x+w*.25:x+w/2,y1:isH?y+h/2:y+h*.25,x2:isH?x+w*.75:x+w/2,y2:isH?y+h/2:y+h*.75,stroke:'#d86c8a','stroke-width':2.5}));
    }else if(isH){
      const wallY=y+h/2, hinge=o.hinge==='right'?x+w:x, side=o.hinge==='right'?-1:1;
      const inside=o.wall==='top'?1:-1, swingDir=o.swing==='outward'?-inside:inside;
      group.appendChild(S('line',{x1:x,y1:wallY,x2:x+w,y2:wallY,stroke:'#5d4b51','stroke-width':Math.max(3,2.5*g.scale),'stroke-linecap':'round'}));
      group.appendChild(S('line',{x1:hinge,y1:wallY,x2:hinge,y2:wallY+swingDir*rad,stroke:'#d86c8a','stroke-width':2}));
      const endX=hinge+side*rad; group.appendChild(S('path',{d:`M ${endX} ${wallY} A ${rad} ${rad} 0 0 ${swingDir*side>0?1:0} ${hinge} ${wallY+swingDir*rad}`,fill:'none',stroke:'#f09bb3','stroke-width':1.4,'stroke-dasharray':'5 4'}));
    }else{
      const wallX=x+w/2, hinge=o.hinge==='right'?y+h:y, side=o.hinge==='right'?-1:1;
      const inside=o.wall==='left'?1:-1, swingDir=o.swing==='outward'?-inside:inside;
      group.appendChild(S('line',{x1:wallX,y1:y,x2:wallX,y2:y+h,stroke:'#5d4b51','stroke-width':Math.max(3,2.5*g.scale),'stroke-linecap':'round'}));
      group.appendChild(S('line',{x1:wallX,y1:hinge,x2:wallX+swingDir*rad,y2:hinge,stroke:'#d86c8a','stroke-width':2}));
      const endY=hinge+side*rad; group.appendChild(S('path',{d:`M ${wallX} ${endY} A ${rad} ${rad} 0 0 ${swingDir*side<0?1:0} ${wallX+swingDir*rad} ${hinge}`,fill:'none',stroke:'#f09bb3','stroke-width':1.4,'stroke-dasharray':'5 4'}));
    }
  } else if(o.type==='window'){
    group.appendChild(S('rect',{x,y:y+h/2-2,width:w,height:4,fill:'#b9d7df',stroke:'#62828b','stroke-width':1,rx:2}));
  } else if(o.type==='outlet'){
    group.appendChild(S('circle',{cx,cy,r:Math.max(5,Math.min(w,h)/2),fill:'#fff',stroke:'#8b747b','stroke-width':1.5}));const tx=S('text',{x:cx,y:cy+3,'text-anchor':'middle','font-size':8,fill:'#6e5a61'});tx.textContent='⌁';group.appendChild(tx);
  } else if(o.type==='ac'){
    group.appendChild(S('rect',{x,y,width:w,height:h,rx:4,fill:'#e5f0f1',stroke:'#809ca2','stroke-width':1.2}));
  } else {
    group.appendChild(S('rect',{x,y,width:w,height:h,rx:Math.min(8,Math.min(w,h)/6),fill:o.color||'#eadce0',stroke:selected?'#d86182':'#8e777e','stroke-width':selected?2.3:1.1,filter:'url(#shadow)'}));
    if(state.settings.labels && w>35 && h>22){const text=S('text',{x:cx,y:cy-1,'text-anchor':'middle','dominant-baseline':'middle','font-size':clamp(Math.min(w/7,h/3),8,12),fill:'#5d484f','pointer-events':'none'});text.textContent=o.name;group.appendChild(text)}
    if(state.settings.dimensions && selected){const dm=S('text',{x:cx,y:y+h+14,'text-anchor':'middle','font-size':10,fill:'#d86182','pointer-events':'none'});dm.textContent=`${display(o.w,rUnit())} × ${display(o.h,rUnit())}`;group.appendChild(dm)}
  }
  if(selected){group.appendChild(S('rect',{x:x-4,y:y-4,width:w+8,height:h+8,rx:7,fill:'none',stroke:'#f07e9f','stroke-width':2,'stroke-dasharray':'5 3','pointer-events':'none'}))}
  group.addEventListener('pointerdown',objectPointerDown);group.addEventListener('click',e=>{e.stopPropagation();state.selectedId=o.id;renderPlan()});svg.appendChild(group);
}
function rUnit(){return currentRoom()?.unit||state.settings.unit}

function objectPointerDown(e){
  e.stopPropagation();const id=e.currentTarget.dataset.id,o=objects().find(x=>x.id===id);if(!o||o.locked)return toast(o?.locked?'Object is locked':'');
  state.selectedId=id;const p=svgPoint(e);drag={id,startX:p.x,startY:p.y,origX:o.x,origY:o.y,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove',objectPointerMove);window.addEventListener('pointerup',objectPointerUp,{once:true});renderPlan();
}
function objectPointerMove(e){if(!drag)return;const o=objects().find(x=>x.id===drag.id),g=planGeometry(),p=svgPoint(e);if(!o||!g)return;let nx=drag.origX+(p.x-drag.startX)/g.scale,ny=drag.origY+(p.y-drag.startY)/g.scale;if(state.settings.snap){const s=state.settings.snapSize||10;nx=Math.round(nx/s)*s;ny=Math.round(ny/s)*s;const r=currentRoom(),t=Math.max(10,s);if(Math.abs(nx)<t)nx=0;if(Math.abs(ny)<t)ny=0;if(Math.abs(nx+o.w-r.width)<t)nx=r.width-o.w;if(Math.abs(ny+o.h-r.height)<t)ny=r.height-o.h}o.x=clamp(nx,-o.w/2,currentRoom().width-o.w/2);o.y=clamp(ny,-o.h/2,currentRoom().height-o.h/2);drag.moved=true;renderPlan();}
function objectPointerUp(){if(!drag)return;if(drag.moved){snapshotFromDrag();currentRoom().updatedAt=Date.now();persist();haptic()}drag=null;window.removeEventListener('pointermove',objectPointerMove);renderPlan()}
function snapshotFromDrag(){// Save a history checkpoint representing the pre-drag object location
  const o=objects().find(x=>x.id===drag.id);if(!o)return;const nx=o.x,ny=o.y;o.x=drag.origX;o.y=drag.origY;snapshot();o.x=nx;o.y=ny;
}
function canvasPointerDown(e){
  if(e.target.closest?.('[data-id]'))return;state.selectedId=null;
  if(state.measureDraft!==null || $('.tool-btn[data-action="measure"]').getAttribute('aria-pressed')==='true'){
    const p=canvasToRoom(svgPoint(e));if(!p)return;if(!state.measureDraft){state.measureDraft={x1:p.x,y1:p.y,x2:p.x,y2:p.y};toast('Tap the second point')}else{state.measureDraft.x2=p.x;state.measureDraft.y2=p.y;state.measurements.push({...state.measureDraft,id:uid('measure')});state.measureDraft=null;toast('Measurement added')}renderPlan();return;
  }
  renderPlan();
}
function svgPoint(e){const svg=$('#planCanvas'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse())}
function canvasToRoom(p){const g=planGeometry(),r=currentRoom();if(!g||!r)return null;return{x:clamp((p.x-g.ox)/g.scale,0,r.width),y:clamp((p.y-g.oy)/g.scale,0,r.height)}}
function renderMeasurement(svg,m,g){const x1=g.ox+m.x1*g.scale,y1=g.oy+m.y1*g.scale,x2=g.ox+m.x2*g.scale,y2=g.oy+m.y2*g.scale;svg.appendChild(S('line',{x1,y1,x2,y2,stroke:'#e66f92','stroke-width':2,'stroke-dasharray':'5 4'}));svg.appendChild(S('circle',{cx:x1,cy:y1,r:4,fill:'#f381a2'}));svg.appendChild(S('circle',{cx:x2,cy:y2,r:4,fill:'#f381a2'}));const d=Math.hypot(m.x2-m.x1,m.y2-m.y1);const t=S('text',{x:(x1+x2)/2,y:(y1+y2)/2-7,'text-anchor':'middle','font-size':10,fill:'#b84f6d'});t.textContent=display(d,rUnit());svg.appendChild(t)}
function renderMeasureDraft(svg,m,g){renderMeasurement(svg,m,g)}

function renderSelectionOverlay(){
  let tray=$('#selectionTray');if(!tray){tray=document.createElement('div');tray.id='selectionTray';tray.style.cssText='position:absolute;left:50%;bottom:68px;transform:translateX(-50%);z-index:8;background:#fff;border:1px solid var(--line);border-radius:15px;padding:6px;box-shadow:0 8px 25px rgba(60,30,40,.15);display:flex;gap:4px';$('#canvasWrap').appendChild(tray)}
  const o=objects().find(x=>x.id===state.selectedId);if(!o){tray.style.display='none';return}tray.style.display='flex';tray.innerHTML=`<button class="tiny-btn" data-sel="edit" title="Edit">✏️</button><button class="tiny-btn" data-sel="rotate" title="Rotate">↻</button><button class="tiny-btn" data-sel="duplicate" title="Duplicate">⧉</button><button class="tiny-btn" data-sel="lock" title="Lock">${o.locked?'🔒':'🔓'}</button><button class="tiny-btn" data-sel="delete" title="Delete">🗑️</button>`;
  tray.querySelectorAll('button').forEach(b=>b.onclick=()=>selectionAction(b.dataset.sel,o.id));
}
function selectionAction(a,id){const o=objects().find(x=>x.id===id);if(!o)return;if(a==='edit')return editObjectModal(id);snapshot();if(a==='rotate')o.rotation=((o.rotation||0)+90)%360;if(a==='duplicate'){const cp=deepClone(o);cp.id=uid('obj');cp.name=`${o.name} Copy`;cp.x+=15;cp.y+=15;objects().push(cp);state.selectedId=cp.id}if(a==='lock')o.locked=!o.locked;if(a==='delete'){objects().splice(objects().findIndex(x=>x.id===id),1);state.selectedId=null}persist();renderPlan()}

function addObjectModal(){
  if(!currentRoom())return newRoomModal();const root=modal('Add object',`<div class="field"><label>Search furniture & objects</label><input id="objectSearch" placeholder="Bed, desk, sofa…"></div><div class="option-grid" id="objectGrid">${PRESETS.map(p=>objectCard(p)).join('')}</div><div class="form-actions"><button class="secondary-btn" id="customObjectBtn">＋ Custom object</button></div>`,m=>{
    const grid=m.querySelector('#objectGrid'),search=m.querySelector('#objectSearch');search.oninput=()=>{const q=search.value.toLowerCase();grid.innerHTML=PRESETS.filter(p=>p[2].toLowerCase().includes(q)).map(objectCard).join('');wireOptions()};
    const wireOptions=()=>grid.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=PRESETS.find(x=>x[0]===b.dataset.preset);addPreset(p);m.remove()});wireOptions();m.querySelector('#customObjectBtn').onclick=()=>{m.remove();customObjectModal()}
  });return root;
}
function objectCard(p){return `<button class="object-option" data-preset="${p[0]}"><span class="emoji">${p[1]}</span><span><b>${p[2]}</b><small>${p[3]} × ${p[4]} cm</small></span></button>`}
function addPreset(p){snapshot();const r=currentRoom();objects().push({id:uid('obj'),type:'furniture',preset:p[0],name:p[2],x:Math.max(0,r.width/2-p[3]/2),y:Math.max(0,r.height/2-p[4]/2),w:p[3],h:p[4],rotation:0,color:p[5],locked:false,clearance:0,notes:''});state.selectedId=objects().at(-1).id;persist();renderPlan();toast(`${p[2]} added`)}
function customObjectModal(){const u=rUnit();modal('Custom object',`<form id="customForm" class="form-grid"><div class="field full"><label>Label</label><input name="name" value="Custom object"></div><div class="field"><label>Width (${u})</label><input type="number" name="w" value="100" step="0.1"></div><div class="field"><label>Depth (${u})</label><input type="number" name="h" value="60" step="0.1"></div><div class="field"><label>Color</label><input type="color" name="color" value="#f1c8d4"></div><div class="field"><label>Clearance (${u})</label><input type="number" name="clearance" value="0" step="0.1"></div><div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Add</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),r=currentRoom();snapshot();const o={id:uid('obj'),type:'furniture',name:d.name||'Custom object',w:toCm(d.w,u),h:toCm(d.h,u),x:r.width/2-toCm(d.w,u)/2,y:r.height/2-toCm(d.h,u)/2,rotation:0,color:d.color,clearance:toCm(d.clearance,u),locked:false,notes:''};objects().push(o);state.selectedId=o.id;persist();m.remove();renderPlan()}})}
function editObjectModal(id){const o=objects().find(x=>x.id===id);if(!o)return;const u=rUnit();modal(`Edit ${o.name}`,`<form id="editObjectForm" class="form-grid">
<div class="field full"><label>Label</label><input name="name" value="${attr(o.name)}"></div><div class="field"><label>Width (${u})</label><input type="number" step="0.1" name="w" value="${Number((o.w/UNIT[u].toCm).toFixed(2))}"></div><div class="field"><label>Depth (${u})</label><input type="number" step="0.1" name="h" value="${Number((o.h/UNIT[u].toCm).toFixed(2))}"></div>
<div class="field"><label>X from left (${u})</label><input type="number" step="0.1" name="x" value="${Number((o.x/UNIT[u].toCm).toFixed(2))}"></div><div class="field"><label>Y from top (${u})</label><input type="number" step="0.1" name="y" value="${Number((o.y/UNIT[u].toCm).toFixed(2))}"></div>
<div class="field"><label>Rotation</label><input type="number" name="rotation" value="${o.rotation||0}" step="1"></div><div class="field"><label>Clearance (${u})</label><input type="number" name="clearance" value="${Number(((o.clearance||0)/UNIT[u].toCm).toFixed(2))}" step="0.1"></div>
<div class="field"><label>Color</label><input type="color" name="color" value="${o.color||'#f1c8d4'}"></div><div class="field"><label>Lock</label><select name="locked"><option value="false" ${!o.locked?'selected':''}>Unlocked</option><option value="true" ${o.locked?'selected':''}>Locked</option></select></div>
<div class="field full"><label>Notes</label><textarea name="notes" rows="3">${esc(o.notes||'')}</textarea></div><div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Save changes</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));snapshot();Object.assign(o,{name:d.name||o.name,w:toCm(d.w,u),h:toCm(d.h,u),x:toCm(d.x,u),y:toCm(d.y,u),rotation:Number(d.rotation)||0,clearance:toCm(d.clearance,u),color:d.color,locked:d.locked==='true',notes:d.notes});persist();m.remove();renderPlan()}})}

function addDoorModal(){if(!currentRoom())return newRoomModal();const u=rUnit(),dw=unitInput(90,u),off=unitInput(30,u);modal('Add door',`<form id="doorForm" class="form-grid"><div class="field"><label>Width (${u})</label><input type="number" name="width" value="${dw}" step="0.1"></div><div class="field"><label>Wall</label><select name="wall"><option>top</option><option>right</option><option>bottom</option><option>left</option></select></div><div class="field"><label>Door type</label><select name="kind"><option value="hinged">Hinged</option><option value="sliding">Sliding</option></select></div><div class="field"><label>Hinge side</label><select name="hinge"><option value="left">Left</option><option value="right">Right</option></select></div><div class="field"><label>Open direction</label><select name="swing"><option value="inward">Inward</option><option value="outward">Outward</option></select></div><div class="field full"><label>Offset from wall start (${u})</label><input type="number" name="offset" value="${off}" step="0.1"></div><div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Add door</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));addDoor(d);m.remove()}})}
function addDoor(d){snapshot();const r=currentRoom(),width=toCm(d.width,rUnit()),off=toCm(d.offset,rUnit());let o={id:uid('obj'),type:'door',name:'Door',w:width,h:4,rotation:0,color:'#f7a8bd',hinge:d.hinge,swing:d.swing,kind:d.kind||'hinged',wall:d.wall,clearance:width,locked:false};if(d.wall==='top'){o.x=clamp(off,0,r.width-width);o.y=-2}else if(d.wall==='bottom'){o.x=clamp(off,0,r.width-width);o.y=r.height-2}else if(d.wall==='left'){o.w=4;o.h=width;o.x=-2;o.y=clamp(off,0,r.height-width);o.rotation=0}else{o.w=4;o.h=width;o.x=r.width-2;o.y=clamp(off,0,r.height-width);o.rotation=0}objects().push(o);state.selectedId=o.id;persist();renderPlan();toast('Door added')}
function addWindowModal(){if(!currentRoom())return newRoomModal();const u=rUnit(),dw=unitInput(120,u),off=unitInput(60,u);modal('Add window',`<form id="windowForm" class="form-grid"><div class="field"><label>Width (${u})</label><input type="number" name="width" value="${dw}" step="0.1"></div><div class="field"><label>Wall</label><select name="wall"><option>top</option><option>right</option><option>bottom</option><option>left</option></select></div><div class="field full"><label>Offset from wall start (${u})</label><input type="number" name="offset" value="${off}" step="0.1"></div><div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Add window</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),r=currentRoom(),w=toCm(d.width,u),off=toCm(d.offset,u);snapshot();let o={id:uid('obj'),type:'window',name:'Window',w,h:8,x:0,y:0,rotation:0,color:'#cbe5ea',wall:d.wall,locked:false,clearance:0};if(d.wall==='top'){o.x=clamp(off,0,r.width-w);o.y=-4}else if(d.wall==='bottom'){o.x=clamp(off,0,r.width-w);o.y=r.height-4}else if(d.wall==='left'){o.w=8;o.h=w;o.x=-4;o.y=clamp(off,0,r.height-w)}else{o.w=8;o.h=w;o.x=r.width-4;o.y=clamp(off,0,r.height-w)}objects().push(o);state.selectedId=o.id;persist();m.remove();renderPlan();toast('Window added')}})}
function fixedFeaturesModal(){modal('Fixed room features',`<div class="option-grid"><button class="object-option" data-fixed="outlet"><span class="emoji">🔌</span><span><b>Outlet</b><small>Electrical point</small></span></button><button class="object-option" data-fixed="ac"><span class="emoji">❄️</span><span><b>Air conditioner</b><small>Fixed appliance</small></span></button><button class="object-option" data-fixed="column"><span class="emoji">▣</span><span><b>Column</b><small>Structural obstacle</small></span></button></div>`,m=>m.querySelectorAll('[data-fixed]').forEach(b=>b.onclick=()=>{const type=b.dataset.fixed,r=currentRoom();snapshot();const cfg=type==='outlet'?{name:'Outlet',w:12,h:12,color:'#fff'}:type==='ac'?{name:'Air conditioner',w:90,h:25,color:'#dfecef'}:{name:'Column',w:35,h:35,color:'#c5bec0'};objects().push({id:uid('obj'),type,...cfg,x:r.width/2-cfg.w/2,y:r.height/2-cfg.h/2,rotation:0,locked:false,clearance:0});state.selectedId=objects().at(-1).id;persist();m.remove();renderPlan()}))}

function detectIssues(){const r=currentRoom(),arr=objects(),issues=[];if(!r)return issues;arr.forEach(o=>{if(o.type==='door'||o.type==='window')return;if(o.x<0||o.y<0||o.x+o.w>r.width||o.y+o.h>r.height)issues.push({type:'outside',ids:[o.id],title:`${o.name} extends outside the room`,detail:'Move or resize the item so it stays inside the room.'})});for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){const a=arr[i],b=arr[j];if(['door','window','outlet'].includes(a.type)||['door','window','outlet'].includes(b.type))continue;if(overlap(a,b))issues.push({type:'overlap',ids:[a.id,b.id],title:`${a.name} overlaps ${b.name}`,detail:'Separate the items or intentionally ignore the conflict.'})}arr.filter(d=>d.type==='door').forEach(d=>arr.filter(o=>o.id!==d.id&&!['window','outlet'].includes(o.type)).forEach(o=>{const z=doorClearanceRect(d);if(overlap(z,o))issues.push({type:'door',ids:[d.id,o.id],title:`Door swing may hit ${o.name}`,detail:'Keep the door-swing area clear.'})}));return dedupeIssues(issues)}
function overlap(a,b){return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y}
function doorClearanceRect(d){const rad=d.clearance||Math.max(d.w,d.h);if(d.wall==='top')return{x:d.x,y:d.swing==='outward'?-rad:0,w:Math.max(d.w,rad),h:rad};if(d.wall==='bottom')return{x:d.x,y:d.swing==='outward'?currentRoom().height:currentRoom().height-rad,w:Math.max(d.w,rad),h:rad};if(d.wall==='left')return{x:d.swing==='outward'?-rad:0,y:d.y,w:rad,h:Math.max(d.h,rad)};return{x:d.swing==='outward'?currentRoom().width:currentRoom().width-rad,y:d.y,w:rad,h:Math.max(d.h,rad)}}
function dedupeIssues(a){const seen=new Set();return a.filter(x=>{const k=x.type+':'+x.ids.slice().sort().join('|');if(seen.has(k))return false;seen.add(k);return true})}
function issuesModal(){const issues=detectIssues();modal(`Layout issues (${issues.length})`,issues.length?`<div class="list">${issues.map(i=>`<div class="issue-card bad"><b>⚠️ ${esc(i.title)}</b><p>${esc(i.detail)}</p></div>`).join('')}</div><div class="form-actions"><button class="secondary-btn" id="selectFirstIssue">Select first issue</button></div>`:`<div class="empty-state"><div class="big">✨</div><h3>No conflicts found</h3><p>Dango did not find object overlaps, outside-room items, or door-swing conflicts in this layout.</p></div>`,m=>{m.querySelector('#selectFirstIssue')?.addEventListener('click',()=>{state.selectedId=issues[0].ids.at(-1);m.remove();renderPlan()})})}

function layoutsModal(){const r=currentRoom();if(!r)return toast('Create a room first');modal('Layouts',`<div class="list">${r.layouts.map(l=>`<div class="list-row"><div><b>${esc(l.name)}</b><div class="meta">${l.objects.length} items ${l.id===state.currentLayoutId?'• Current':''}</div></div><div class="row-actions"><button class="tiny-btn" data-open="${l.id}">Open</button><button class="tiny-btn" data-menu="${l.id}">⋮</button></div></div>`).join('')}</div><div class="form-actions"><button class="primary-btn" id="duplicateLayout">＋ Duplicate current layout</button><button class="secondary-btn" id="blankLayout">Blank layout</button></div>`,m=>{
    m.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{state.currentLayoutId=b.dataset.open;state.selectedId=null;m.remove();renderAll()});
    m.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{const l=r.layouts.find(x=>x.id===b.dataset.menu);const name=prompt('Layout name',l.name);if(name){l.name=name;persist();m.remove();layoutsModal()}});
    m.querySelector('#duplicateLayout').onclick=()=>{const cur=currentLayout();snapshot();const cp=deepClone(cur);cp.id=uid('layout');cp.name=nextLayoutName(r);cp.objects.forEach(o=>o.id=uid('obj'));r.layouts.push(cp);state.currentLayoutId=cp.id;persist();m.remove();renderPlan();toast('Layout duplicated')};
    m.querySelector('#blankLayout').onclick=()=>{snapshot();const l={id:uid('layout'),name:nextLayoutName(r),objects:[],createdAt:Date.now()};r.layouts.push(l);state.currentLayoutId=l.id;persist();m.remove();renderPlan();toast('Blank layout added')}
  })}
function nextLayoutName(r){return `Layout ${String.fromCharCode(65+r.layouts.length)}`}

function settingsModal(){const s=state.settings;modal('Settings',`<div class="field"><label>Default display unit</label><select id="settingUnit">${Object.keys(UNIT).map(k=>`<option value="${k}" ${k===s.unit?'selected':''}>${UNIT[k].label}</option>`).join('')}</select></div><div class="switch-row"><span>Grid</span><input type="checkbox" class="switch" id="settingGrid" ${s.grid?'checked':''}></div><div class="switch-row"><span>Snap to grid</span><input type="checkbox" class="switch" id="settingSnap" ${s.snap?'checked':''}></div><div class="field"><label>Snap size (cm)</label><input type="number" id="settingSnapSize" value="${s.snapSize}" min="1" max="100"></div><div class="switch-row"><span>Object labels</span><input type="checkbox" class="switch" id="settingLabels" ${s.labels?'checked':''}></div><div class="switch-row"><span>Dimensions</span><input type="checkbox" class="switch" id="settingDimensions" ${s.dimensions?'checked':''}></div><div class="switch-row"><span>Clearance areas</span><input type="checkbox" class="switch" id="settingClearances" ${s.clearances?'checked':''}></div><div class="switch-row"><span>Haptics</span><input type="checkbox" class="switch" id="settingHaptics" ${s.haptics?'checked':''}></div><div class="form-actions"><button class="primary-btn" id="saveSettings">Save settings</button></div>`,m=>m.querySelector('#saveSettings').onclick=()=>{Object.assign(state.settings,{unit:m.querySelector('#settingUnit').value,grid:m.querySelector('#settingGrid').checked,snap:m.querySelector('#settingSnap').checked,snapSize:clamp(Number(m.querySelector('#settingSnapSize').value)||10,1,100),labels:m.querySelector('#settingLabels').checked,dimensions:m.querySelector('#settingDimensions').checked,clearances:m.querySelector('#settingClearances').checked,haptics:m.querySelector('#settingHaptics').checked});persist();m.remove();renderAll();toast('Settings saved')})}
function roomSettingsModal(){const r=currentRoom();if(!r)return;const u=r.unit;modal('Room settings',`<form id="roomSettingsForm" class="form-grid"><div class="field full"><label>Room name</label><input name="name" value="${attr(r.name)}"></div><div class="field"><label>Width (${u})</label><input type="number" step="0.1" name="width" value="${Number((r.width/UNIT[u].toCm).toFixed(2))}"></div><div class="field"><label>Length (${u})</label><input type="number" step="0.1" name="height" value="${Number((r.height/UNIT[u].toCm).toFixed(2))}"></div><div class="field full"><label>Display unit</label><select name="unit">${Object.keys(UNIT).map(k=>`<option ${k===u?'selected':''}>${k}</option>`).join('')}</select></div><div class="field full"><label>Room notes</label><textarea name="notes" rows="4">${esc(r.notes||'')}</textarea></div><div class="form-actions field full"><button type="button" class="secondary-btn cancel">Cancel</button><button class="primary-btn">Save room</button></div></form>`,m=>{m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));snapshot();r.name=d.name||r.name;r.width=toCm(d.width,u);r.height=toCm(d.height,u);r.unit=d.unit;r.notes=d.notes;r.updatedAt=Date.now();persist();m.remove();renderAll();toast('Room updated')}})}

function aboutModal(){modal('About Dango',`<div class="about-card"><b>Dango (団子)</b> is a Japanese sweet made of small rice dumplings arranged together on a skewer. Just like each little piece of dango has its place, Dango helps you arrange the pieces of your room—furniture, doors, windows, and spaces—until everything fits together just right.</div><div class="feature-pills"><span class="chip">📐 Real measurements</span><span class="chip">🚪 Door swings</span><span class="chip">📏 Distance tools</span><span class="chip">🗂️ Layout versions</span><span class="chip">⚠️ Collision checks</span><span class="chip">💾 Offline-first</span></div><p class="help" style="margin-top:16px">Dango ${APP_VERSION} • Data stays on this device unless you export a backup.</p>`)}
function backupModal(){modal('Backup & restore',`<div class="list"><button class="list-row" id="exportBackup"><span>⬇️ Export Dango backup</span><span>JSON</span></button><label class="list-row" for="importBackup"><span>⬆️ Restore from backup</span><span>Choose file</span></label><input id="importBackup" type="file" accept="application/json,.json" hidden><button class="list-row" id="clearData"><span>🗑️ Reset all local data</span><span>›</span></button></div><p class="help">Backups include rooms, layouts, furniture positions, notes and settings.</p>`,m=>{m.querySelector('#exportBackup').onclick=()=>downloadBlob(JSON.stringify(state,null,2),'dango-backup.json','application/json');m.querySelector('#importBackup').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.rooms))throw new Error();state=Object.assign(defaultState(),data);persist();m.remove();renderAll();toast('Backup restored')}catch{alert('That backup file could not be read.')}};m.querySelector('#clearData').onclick=()=>{if(confirm('Reset Dango and delete all locally saved rooms?')){localStorage.removeItem(STORAGE_KEY);state=defaultState();m.remove();renderAll();toast('Local data reset')}}})}

function layersModal(){const s=state.settings;modal('Layers & visibility',`<div class="switch-row"><span>▦ Grid</span><input class="switch" data-k="grid" type="checkbox" ${s.grid?'checked':''}></div><div class="switch-row"><span>🏷️ Object labels</span><input class="switch" data-k="labels" type="checkbox" ${s.labels?'checked':''}></div><div class="switch-row"><span>📐 Dimensions</span><input class="switch" data-k="dimensions" type="checkbox" ${s.dimensions?'checked':''}></div><div class="switch-row"><span>↔️ Clearance zones</span><input class="switch" data-k="clearances" type="checkbox" ${s.clearances?'checked':''}></div><div class="form-actions"><button class="secondary-btn" id="clearMeasurements">Clear measurements</button></div>`,m=>{m.querySelectorAll('[data-k]').forEach(i=>i.onchange=()=>{state.settings[i.dataset.k]=i.checked;persist();renderPlan()});m.querySelector('#clearMeasurements').onclick=()=>{state.measurements=[];state.measureDraft=null;renderPlan();m.remove();toast('Measurements cleared')}})}
function measureModal(){const active=$('.tool-btn[data-action="measure"]');active.setAttribute('aria-pressed','true');state.measureDraft=null;toast('Tap two points on the plan to measure')}
function stopMeasureMode(){$('.tool-btn[data-action="measure"]')?.setAttribute('aria-pressed','false');state.measureDraft=null}

function previewModal(){const r=currentRoom();if(!r)return;const root=modal('Clean preview',`<div class="preview-stage" id="previewStage"></div><div class="form-actions"><button class="secondary-btn" id="previewPng">Save PNG</button><button class="secondary-btn" id="previewJson">Export project</button></div>`,m=>{m.classList.add('preview-modal');const src=$('#planCanvas').cloneNode(true);src.querySelectorAll('[stroke="#f07e9f"]').forEach(n=>n.remove());m.querySelector('#previewStage').appendChild(src);m.querySelector('#previewPng').onclick=exportPNG;m.querySelector('#previewJson').onclick=exportProject})}
function exportModal(){modal('Export & share',`<div class="list"><button class="list-row" id="expPng"><span>🖼️ Export plan as PNG</span><span>›</span></button><button class="list-row" id="expProject"><span>📦 Export Dango project</span><span>JSON</span></button><button class="list-row" id="expFurniture"><span>🪑 Export furniture list</span><span>CSV</span></button><button class="list-row" id="expSummary"><span>📋 Copy room summary</span><span>›</span></button></div>`,m=>{m.querySelector('#expPng').onclick=exportPNG;m.querySelector('#expProject').onclick=exportProject;m.querySelector('#expFurniture').onclick=exportFurnitureCSV;m.querySelector('#expSummary').onclick=copySummary})}
function exportPNG(){const svg=$('#planCanvas'),copy=svg.cloneNode(true);copy.setAttribute('xmlns',SVG_NS);const xml=new XMLSerializer().serializeToString(copy);const blob=new Blob([xml],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=Math.max(1200,img.width*2||1200);c.height=Math.max(900,img.height*2||900);const ctx=c.getContext('2d');ctx.fillStyle='#fffafa';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{downloadBlob(b,`${slug(currentRoom().name)}-${slug(currentLayout().name)}.png`,'image/png');URL.revokeObjectURL(url)},'image/png')};img.src=url}
function exportProject(){const r=currentRoom();if(r)downloadBlob(JSON.stringify({dangoProjectVersion:1,room:r},null,2),`${slug(r.name)}.dango.json`,'application/json')}
function exportFurnitureCSV(){const rows=[['Name','Width cm','Depth cm','X cm','Y cm','Rotation','Type','Notes'],...objects().map(o=>[o.name,o.w,o.h,o.x,o.y,o.rotation||0,o.type,o.notes||''])];const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');downloadBlob(csv,`${slug(currentRoom().name)}-furniture.csv`,'text/csv')}
async function copySummary(){const r=currentRoom(),l=currentLayout(),issues=detectIssues();const text=`${r.name}\nRoom: ${display(r.width,r.unit)} × ${display(r.height,r.unit)}\nLayout: ${l.name}\nObjects: ${l.objects.length}\nIssues: ${issues.length}`;try{await navigator.clipboard.writeText(text);toast('Summary copied')}catch{prompt('Copy this summary:',text)}}
function downloadBlob(blob,name,type){const b=blob instanceof Blob?blob:new Blob([blob],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function moreModal(){modal('More tools',`<div class="list"><button class="list-row" data-more="room"><span>🏠 Room settings</span><span>›</span></button><button class="list-row" data-more="fixed"><span>🔌 Fixed features</span><span>›</span></button><button class="list-row" data-more="settings"><span>⚙️ App settings</span><span>›</span></button><button class="list-row" data-more="backup"><span>💾 Backup & restore</span><span>›</span></button><button class="list-row" data-more="about"><span>🍡 About Dango</span><span>›</span></button></div>`,m=>m.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{m.remove();({room:roomSettingsModal,fixed:fixedFeaturesModal,settings:settingsModal,backup:backupModal,about:aboutModal}[b.dataset.more])()}))}

function toggleDrawer(show){$('#drawer').classList.toggle('hidden',!show);$('#drawerBackdrop').classList.toggle('hidden',!show);$('#drawer').setAttribute('aria-hidden',String(!show))}
function wire(){
  $('#menuBtn').onclick=()=>toggleDrawer(true);$('#closeDrawerBtn').onclick=()=>toggleDrawer(false);$('#drawerBackdrop').onclick=()=>toggleDrawer(false);
  $('#newRoomHeroBtn').onclick=newRoomModal;$('#quickAddBtn').onclick=()=>state.view==='plan'?addObjectModal():newRoomModal();$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
  $$('.bottom-nav [data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='plan'&&!currentRoom())return newRoomModal();state.view=b.dataset.view;renderAll()});
  $('[data-action="layoutsNav"]').onclick=layoutsModal;$('[data-action="moreNav"]').onclick=moreModal;
  $$('.planner-toolbar [data-action]').forEach(b=>b.onclick=()=>{stopMeasureMode();const a=b.dataset.action;({addObject:addObjectModal,addDoor:addDoorModal,addWindow:addWindowModal,measure:measureModal,layers:layersModal}[a])?.()});
  $('#zoomInBtn').onclick=()=>{state.zoom=clamp(state.zoom+.15,.55,2.2);renderPlan()};$('#zoomOutBtn').onclick=()=>{state.zoom=clamp(state.zoom-.15,.55,2.2);renderPlan()};$('#fitBtn').onclick=()=>{state.zoom=1;renderPlan()};
  $('#layoutBtn').onclick=layoutsModal;$('#issuesBtn').onclick=issuesModal;$('#previewBtn').onclick=previewModal;$('#exportBtn').onclick=exportModal;$('#moreBtn').onclick=moreModal;
  $('#roomFilter').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#roomFilter button.active').classList.remove('active');b.classList.add('active');roomFilter=b.dataset.filter;renderRooms()});
  $$('#drawer [data-drawer-action]').forEach(b=>b.onclick=()=>{toggleDrawer(false);const a=b.dataset.drawerAction;if(a==='rooms'){state.view='rooms';renderAll()}else if(a==='newRoom')newRoomModal();else if(a==='objects')addObjectModal();else if(a==='layouts')layoutsModal();else if(a==='backup')backupModal();else if(a==='settings')settingsModal();else if(a==='about')aboutModal()});
  window.addEventListener('resize',()=>{if(state.view==='plan')renderPlan()});
  document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
  document.addEventListener('touchmove',e=>{if(e.touches?.length>1)e.preventDefault()},{passive:false});
  document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});document.addEventListener('gestureend',e=>e.preventDefault(),{passive:false});
  let lastTouch=0;document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouch<320)e.preventDefault();lastTouch=now},{passive:false});
}
function registerSW(){if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}))}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attr(s=''){return esc(s)}
function slug(s='dango'){return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'dango'}

wire();renderAll();registerSW();
})();
