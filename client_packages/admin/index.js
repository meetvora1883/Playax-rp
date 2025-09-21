// client_packages/admin/client.js
const local = mp.players.local;

let panel = null, panelOpen=false;
let isFrozen=false, spectating=false, spectateTargetId=-1;
let noclip=false, flySpeed=1.6, turnRate=2.0; // A/D turns camera (vehicle feel)
let lastInvisMode="none", camSmoothFrames=0;

// ---------- toasts ----------
const smallMsgs=[];
function pushSmall(t,c=[102,204,255,255],ms=3500){ smallMsgs.push({text:String(t),color:c,until:Date.now()+ms}); }
mp.events.add("admin:smallMsg",(t,c)=>pushSmall(t,c||[102,204,255,255]));
mp.events.add("render",()=>{
  const now=Date.now(); let y=0.72;
  for(let i=smallMsgs.length-1;i>=0;i--){ const m=smallMsgs[i]; if(m.until<now){ smallMsgs.splice(i,1); continue; } mp.game.graphics.drawText(m.text,[0.015,y],{font:0,color:m.color,scale:[0.30,0.30],outline:true,shadow:true}); y+=0.024; }
});

// ---------- utils ----------
function adminLvl(){ try { return (local.getVariable("adminLevel")||0); } catch{ return 0; } }
function third(){ try{ mp.game.cam.setFollowPedCamViewMode(1); }catch{} }
function first(){ try{ mp.game.cam.setFollowPedCamViewMode(4); }catch{} }

function ray(a,b,ign=true){ return mp.raycasting.testPointToPoint(a,b,ign?local:null,1); }
function ground(pos,pad=1.0){
  let h = ray(new mp.Vector3(pos.x,pos.y,Math.max(pos.z+1000,1200)), new mp.Vector3(pos.x,pos.y,-2000));
  if(h && h.position) return new mp.Vector3(h.position.x,h.position.y,h.position.z+pad);
  h = ray(new mp.Vector3(pos.x,pos.y,pos.z-1000), new mp.Vector3(pos.x,pos.y,pos.z+2000), false);
  if(h && h.position) return new mp.Vector3(h.position.x,h.position.y,h.position.z+pad);
  const offs=[[6,0],[0,6],[-6,0],[0,-6],[8,8],[-8,8],[8,-8],[-8,-8]];
  for(const[oX,oY] of offs){ h=ray(new mp.Vector3(pos.x+oX,pos.y+oY,1200), new mp.Vector3(pos.x+oX,pos.y+oY,-2000)); if(h && h.position) return new mp.Vector3(h.position.x,h.position.y,h.position.z+pad); }
  return new mp.Vector3(pos.x,pos.y,5.0+pad);
}
function drop(){ const g=ground(local.position,1.0); local.setCoordsNoOffset(g.x,g.y,g.z,true,true,true); return true; }
mp.events.add("admin:dropToGround", ()=> drop());

// ---------- freeze ----------
mp.events.add("admin:setFrozen",(s)=>{ isFrozen=!!s; local.freezePosition(isFrozen); if(isFrozen){ local.setVelocity(0,0,0); local.taskStandStill(100000); } else { mp.game.invoke("0x919BE13EED931959", local.handle); } });

// ---------- spectate ----------
mp.events.add("admin:spectateStart",(rid)=>{ spectateTargetId=rid; spectating=true; local.setInvincible(true); local.setAlpha(0); local.setCollision(false,false); pushSmall("Spectate ON"); });
mp.events.add("admin:spectateStop",()=>{ spectating=false; spectateTargetId=-1; local.setInvincible(false); local.setAlpha(255); local.setCollision(true,true); pushSmall("Spectate OFF"); });
mp.events.add("render",()=>{
  if(!spectating||spectateTargetId<0) return;
  const t=mp.players.atRemoteId(spectateTargetId); if(!t||!t.handle) return;
  const head=t.getHeading()*Math.PI/180.0, behind=3.0, above=1.6;
  const tp=t.getCoords(true), desired=new mp.Vector3(tp.x-Math.sin(head)*behind, tp.y+Math.cos(head)*behind, tp.z+above);
  const cur=local.position, k=0.25;
  local.setCoordsNoOffset(cur.x+(desired.x-cur.x)*k, cur.y+(desired.y-cur.y)*k, cur.z+(desired.z-cur.z)*k, true,true,true);
});

// ---------- hp/armor/revive ----------
mp.events.add("admin:slap",(d)=>{ const dmg=Math.max(1,parseInt(d||10,10)); local.applyForceTo(0,0,2.0,0,0,0,0,true,true,true,true,true); local.setHealth(Math.max(0, local.getHealth()-dmg)); });
mp.events.add("admin:setHealth",(v)=> local.setHealth(Math.max(0,Math.min(200,parseInt(v||100,10)))));
mp.events.add("admin:setArmor",(v)=> local.setArmour(Math.max(0,Math.min(100,parseInt(v||100,10)))));
mp.events.add("admin:reviveAt",(x,y,z)=>{ try{ mp.game.invoke("0x71BC8E838B9C6035", local.handle); }catch{} local.setCoordsNoOffset(x,y,z+0.5,true,true,true); drop(); local.setHealth(200); mp.game.invoke("0x919BE13EED931959", local.handle); third(); pushSmall("Revived: HP full",[120,255,120,255]); });

// ---------- admin chat ----------
mp.events.add("admin:adminChat",(text)=>{ mp.gui.chat.push("!{#66ccff}"+text); pushSmall(text,[102,204,255,255]); });

// ---------- invis ----------
mp.events.add("admin:setInvis",(mode)=>{ lastInvisMode=String(mode||"none"); local.setCollision(true,true); local.setAlpha(255); try{ local.setVisible(true,false); }catch{} pushSmall(`Invisibility: ${lastInvisMode.toUpperCase()}`, lastInvisMode==="full"?[255,120,120,255]:lastInvisMode==="partial"?[255,180,120,255]:[120,255,120,255]); });

function alphaFor(viewerLvl,targetLvl,targetMode){ if(targetMode==="none") return 255; if(viewerLvl>=8) return 255; if(targetMode==="full") return 0; if(targetMode==="partial") return 100; return 255; }
const lastSeen=new Map();
mp.events.add("render",()=>{
  const me=adminLvl();
  mp.players.forEach(p=>{ if(!p||!p.handle||p===local) return; const lvl=(p.getVariable&&(p.getVariable("adminLevel")||0))||0; const mode=(p.getVariable&&(p.getVariable("invisMode")||"none")); const a=alphaFor(me,lvl,mode); if(lastSeen.get(p.remoteId)===a) return; lastSeen.set(p.remoteId,a); p.setAlpha(a); });
});

// ---------- ID tag ----------
function draw3D(text,pos,color=[255,50,50,255],scale=0.40){ const c=mp.game.graphics.world3dToScreen2d(pos.x,pos.y,pos.z); if(!c[0]) return; mp.game.graphics.drawText(text,[c[1],c[2]],{font:0,color,scale:[scale,scale],outline:true,shadow:true,centre:true}); }
mp.events.add("render",()=>{ mp.players.forEach(p=>{ if(!p||!p.handle) return; const lvl=(p.getVariable&&(p.getVariable("adminLevel")||0)); if(lvl>=1){ const head=p.getBoneCoords(12844,0,0,0); draw3D(`[ID:${p.getVariable("sessionId")||"?"}]`, new mp.Vector3(head.x,head.y,head.z+0.55)); } }); });

// ---------- fly (F2): W/S forward/back; A/D turn (vehicle-like) ----------
function dirFromCam(){ const rot=mp.game.cam.getGameplayCamRot(2), z=rot.z*Math.PI/180, x=rot.x*Math.PI/180, c=Math.abs(Math.cos(x)); return { x:-Math.sin(z)*c, y:Math.cos(z)*c, z:Math.sin(x) }; }
function smoothThird(fr=12){ camSmoothFrames=fr; third(); }
mp.keys.bind(0x71/*F2*/,true,()=>{
  if(adminLvl()<6){ mp.gui.chat.push("~r~You are not allowed to use fly."); return; }
  noclip=!noclip;
  if(noclip){ first(); local.freezePosition(true); local.setInvincible(true); local.setCollision(false,false); pushSmall("Fly: ON (W/S, A/D turn, Space/E up, Q down, Shift fast, Ctrl slow)"); }
  else { local.setVelocity(0,0,0); local.freezePosition(false); local.setInvincible(false); local.setCollision(true,true); smoothThird(12); pushSmall("Fly: OFF"); }
});
mp.events.add("render",()=>{
  if(camSmoothFrames>0){ camSmoothFrames--; try{ mp.game.cam.setGameplayCamRelativeHeading(0.0); mp.game.cam.setGameplayCamRelativePitch(0.0,1.0);}catch{} }
  if(!noclip) return;

  local.freezePosition(true); local.setVelocity(0,0,0);

  // A/D turn camera (vehicle-like)
  if(mp.game.controls.isControlPressed(0,34)){ // A
    const h = mp.game.cam.getGameplayCamRelativeHeading(); mp.game.cam.setGameplayCamRelativeHeading(h + turnRate);
  }
  if(mp.game.controls.isControlPressed(0,35)){ // D
    const h = mp.game.cam.getGameplayCamRelativeHeading(); mp.game.cam.setGameplayCamRelativeHeading(h - turnRate);
  }

  // speed modifiers
  let sp=flySpeed;
  if(mp.game.controls.isControlPressed(0,21)) sp*=2.5; // Shift
  if(mp.game.controls.isControlPressed(0,36)) sp*=0.5; // Ctrl

  const dir=dirFromCam(); let pos=local.position;

  if(mp.game.controls.isControlPressed(0,32)) pos=new mp.Vector3(pos.x+dir.x*sp,pos.y+dir.y*sp,pos.z+dir.z*sp); // W
  if(mp.game.controls.isControlPressed(0,33)) pos=new mp.Vector3(pos.x-dir.x*sp,pos.y-dir.y*sp,pos.z-dir.z*sp); // S

  if(mp.game.controls.isControlPressed(0,22) || mp.game.controls.isControlPressed(0,38)) pos=new mp.Vector3(pos.x,pos.y,pos.z+sp); // Space/E
  if(mp.game.controls.isControlPressed(0,44)) pos=new mp.Vector3(pos.x,pos.y,pos.z-sp); // Q

  local.setCoordsNoOffset(pos.x,pos.y,pos.z,true,true,true);
});

// ---------- F3 autoland + invis full ----------
mp.keys.bind(0x72/*F3*/,true,()=>{
  if(adminLvl()<6){ mp.gui.chat.push("~r~You are not allowed to autoland."); return; }
  if(noclip){ noclip=false; local.setVelocity(0,0,0); local.freezePosition(false); local.setInvincible(false); local.setCollision(true,true); }
  drop(); smoothThird(12); mp.events.callRemote("admin:panelCmd","invis","full"); pushSmall("Autoland: Landed (Invis FULL)");
});

// ---------- engine toggle (L/R Ctrl) ----------
function toggleEngine(){ if(!local.isInAnyVehicle(false)) return pushSmall("Not in a vehicle",[255,120,120,255]); mp.events.callRemote("admin:toggleEngine"); }
mp.keys.bind(0xA2,true,()=>toggleEngine()); mp.keys.bind(0xA3,true,()=>toggleEngine());

// ---------- smooth weather ----------
let wTrans={active:false,from:"CLEAR",to:"CLEAR",start:0,dur:0};
const wHash = n => mp.game.joaat(n);
mp.events.add("admin:weatherTransition",(to,dur)=>{ const curTo=wTrans.active?wTrans.to:(wTrans.to||"CLEAR"); wTrans={active:true,from:curTo,to:(to||"EXTRASUNNY"),start:Date.now(),dur:Math.max(1000,parseInt(dur||15000,10))}; pushSmall(`Weather -> ${wTrans.to}`,[200,220,255,255]); });
mp.events.add("render",()=>{ if(!wTrans.active) return; const p=Math.max(0,Math.min(1,(Date.now()-wTrans.start)/wTrans.dur)); mp.game.gameplay.setWeatherTypeTransition(wHash(wTrans.from), wHash(wTrans.to), p); if(p>=1){ wTrans.active=false; try{ mp.game.gameplay.setWeatherTypeNowPersist(wTrans.to); }catch{} } });

// ---------- death fade ----------
let dfInit=false; function noDeathFade(){ try{ mp.game.cam.setFadeOutAfterDeath(false); mp.game.cam.setFadeInAfterDeathArrest(false); }catch{} }
mp.events.add("render",()=>{ if(!dfInit){ noDeathFade(); dfInit=true; } if(local.isDead()){ try{ mp.game.graphics.stopScreenEffect("DeathFailOut"); mp.game.graphics.stopScreenEffect("DeathFailMP"); mp.game.cam.doScreenFadeIn(0);}catch{} } });

// ---------- PDA animation & panel toggle (J/ESC) ----------
function animLoad(dict, cb){ mp.game.streaming.requestAnimDict(dict); const t=setInterval(()=>{ if(mp.game.streaming.hasAnimDictLoaded(dict)){ clearInterval(t); if(cb) cb(); } },50); }
function pdaOpen(){
  animLoad("amb@world_human_seat_wall_tablet@female@base", ()=> {
    local.taskPlayAnim("amb@world_human_seat_wall_tablet@female@base","base",8.0,-8.0,-1,49,0,false,false,false);
  });
}
function pdaClose(){
  try{ mp.game.invoke("0x919BE13EED931959", local.handle); }catch{}
}

function sendPanelBasics(){
  if(!panel) return;
  panel.execute(`window.panelBridge && panelBridge.setAdminLevel(${adminLvl()});`);
  mp.events.callRemote("admin:getPlayers");
  mp.events.callRemote("admin:getBans");
  mp.events.callRemote("admin:getVehicles");
  mp.events.callRemote("admin:getActionLogs");
}
function setCursor(v){ try { mp.gui.cursor.show(v, v); } catch{} } // fix dropdown focus
function togglePanel(force){
  if(adminLvl()<1){ pushSmall("You are not an admin",[255,120,120,255]); return; }
  if(!panel){ panel = mp.browsers.new("package://admin/panel.html"); pushSmall("Admin Panel loaded"); setTimeout(()=>sendPanelBasics(), 250); }
  panelOpen = (typeof force==="boolean")? force : !panelOpen;
  panel.active = panelOpen;
  setCursor(panelOpen);
  if(panelOpen){ sendPanelBasics(); pdaOpen(); } else { pdaClose(); }
}

mp.keys.bind(0x4A,true,()=>togglePanel());        // J
mp.keys.bind(0x1B,true,()=>{ if(panelOpen){ togglePanel(false); } }); // ESC closes

mp.events.add("panel:ready", ()=> sendPanelBasics());
mp.events.add("panel:requestClose", ()=> togglePanel(false));

mp.events.add("panel:exec", (action, payloadJSON) => {
  let p={}; try{ p=JSON.parse(payloadJSON||"{}"); }catch{}
  const tId = p.playerId ? String(p.playerId) : "";
  const reason = p.reason ? String(p.reason) : "";
  const value  = (p.value!==undefined) ? String(p.value) : "";
  const dur    = p.duration ? String(p.duration) : "";
  const vehicle= p.vehicle || "";
  const weather= p.weather || "";
  const time   = p.time || "";
  const message= p.message || "";

  switch(action){
    case "warn": case "kick": case "mute": case "unmute": case "freeze": case "unfreeze":
    case "spectate": case "teleport": case "bring": case "revive": case "unjail":
      mp.events.callRemote("admin:panelCmd", action==="teleport"?"tp":action, action==="mute"?`${tId} ${dur} ${reason}`.trim(): (action==="warn"||action==="kick")?`${tId} ${reason}`.trim(): tId);
      break;
    case "slap": case "sethealth": case "setarmor": case "setmoney":
      mp.events.callRemote("admin:panelCmd", action, `${tId} ${value}`.trim()); break;
    case "giveweapon":
      mp.events.callRemote("admin:panelCmd","giveweapon", `${tId} ${p.weapon||"WEAPON_PISTOL"} ${p.ammo||100}`.trim()); break;
    case "tempban": case "ban": case "demorgan":
      mp.events.callRemote("admin:panelCmd", action, `${tId} ${dur} ${reason}`.trim()); break;

    case "car": case "carn": mp.events.callRemote("admin:panelCmd", action, vehicle||"SULTAN"); break;
    case "removecar": mp.events.callRemote("admin:panelCmd","removecar",""); break;

    case "weather": mp.events.callRemote("admin:panelCmd","changeweather", weather||"EXTRASUNNY"); break;
    case "time": {
      let hour=12; try{ hour=parseInt(String(time).split(":")[0]||"12",10);}catch{} 
      mp.events.callRemote("admin:panelCmd","changetime", String(hour)); break;
    }
    case "restart": mp.events.callRemote("admin:panelCmd","restartserver",""); break;
    case "announce": mp.events.callRemote("admin:panelCmd","announce", message||""); break;

    case "invis_full":  mp.events.callRemote("admin:panelCmd","invis","full"); break;
    case "invis_partial": mp.events.callRemote("admin:panelCmd","invis","partial"); break;
    case "invis_none":  mp.events.callRemote("admin:panelCmd","invis","none"); break;

    case "close": togglePanel(false); break;
    default: pushSmall(`Unknown action: ${action}`,[255,120,120,255]); break;
  }
});

// ---------- panel feed to CEF ----------
mp.events.add("panel:setPlayers", (json)=>{ if(panel) panel.execute(`panelBridge && panelBridge.setPlayers(${json});`); });
mp.events.add("panel:setBans",    (json)=>{ if(panel) panel.execute(`panelBridge && panelBridge.setBans(${json});`); });
mp.events.add("panel:setVehicles",(json)=>{ if(panel) panel.execute(`panelBridge && panelBridge.setVehicles(${json});`); });
mp.events.add("panel:setLogs",    (json)=>{ if(panel) panel.execute(`panelBridge && panelBridge.setLogs(${json});`); });
