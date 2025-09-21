// packages/admin/index.js
const fs = require("fs");
const path = require("path");

// ---------- Files ----------
const DATA_DIR    = path.join(__dirname, "data");
const IDS_FILE    = path.join(DATA_DIR, "player_ids.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const BANS_FILE   = path.join(DATA_DIR, "bans.json");
const CARS_FILE   = path.join(DATA_DIR, "cars.json");
const JAIL_FILE   = path.join(DATA_DIR, "jail.json");
const LOGS_FILE   = path.join(DATA_DIR, "action_logs.json");
const VEHICLES_FILE = path.join(DATA_DIR, "vehicles.json");

// ---------- Config ----------
const FLY_MIN_LEVEL = 6;
const BAN_MIN_LEVEL = 8;
const ALLOW_PROCESS_EXIT_ON_RESTART = false;

// ---------- Ensure files ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const ensureFile = (f, v) => { if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
ensureFile(ADMINS_FILE, {});           // Fill with { "<identifier>": levelNumber }
ensureFile(BANS_FILE,   {});
ensureFile(JAIL_FILE,   {});
ensureFile(LOGS_FILE,   []);
ensureFile(CARS_FILE,   {});
ensureFile(IDS_FILE,    { nextId: 1, byIdentifier: {}, byId: {} });
if (!fs.existsSync(VEHICLES_FILE)) {
  fs.writeFileSync(VEHICLES_FILE, JSON.stringify({
    Cars: ["SULTAN","ADDER","BANSHEE","BULLET","CHEETAH","COMET2","COQUETTE","ENTITYXF","INFERNUS","JESTER","MASSACRO","NINEF","PENUMBRA","RAPIDGT","RAPIDGT2","SCHAFTER2","SURANO","VOLTIC","ZENTORNO","FELTZER2","F620","ELEGY2","BUFFALO","BUFFALO2","FUTO","BANSHEE2"],
    Bikes:["AKUMA","BATI","BATI2","DOUBLE","SANCHEZ","SANCHEZ2","PCJ","VADER","BF400","NEMESIS","DIABLOUS","DIABLOUS2","CLIFFHANGER"],
    Helicopters:["BUZZARD","MAVERICK","SWIFT","SWIFT2","ANNIHILATOR","VOLATUS","FROGGER","FROGGER2","SEASPARROW"],
    Planes:["DUSTER","DODO","CUBAN800","MAMMATUS","LUXOR","LUXOR2","VELUM","VELUM2","SHAMAL","HYDRA","LAZER","MILJET","TITAN"],
    Boats:["DINGHY","SEASHARK","SEASHARK2","SEASHARK3","SPEEDER","TORO","TORO2","TROPIC","TROPIC2","MARQUIS","JETMAX","SUNTRAP"],
    Custom:[]
  }, null, 2));
}

// ---------- State ----------
const J = (f, fb={}) => { try { return JSON.parse(fs.readFileSync(f,"utf8")); } catch { return fb; } };
const W = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
let admins   = J(ADMINS_FILE, {});
let bans     = J(BANS_FILE,   {});
let idsData  = J(IDS_FILE);
let carsData = J(CARS_FILE,   {});
let jailData = J(JAIL_FILE,   {});
let actionLogs = J(LOGS_FILE, []);

const disabledCommands = new Set();
const muted = new Map();
const warns = new Map();
const lastSpawnedVeh = new Map();
const carSingle = new Map();
const carMulti  = new Map();
const lastDriverVeh = new Map();
const registry = new Map(); // command registry

const identOf = p => p.serial || p.socialClub || p.ip || p.name;
const lvlOf   = p => admins[identOf(p)] || 0;
const save    = { admins:()=>W(ADMINS_FILE,admins), bans:()=>W(BANS_FILE,bans), ids:()=>W(IDS_FILE,idsData), cars:()=>W(CARS_FILE,carsData), jail:()=>W(JAIL_FILE,jailData), logs:()=>W(LOGS_FILE,actionLogs) };
const now = ()=>Date.now();
const msg = (p, t, color="#9bdcff") => { p.outputChatBox(`!{${color}}${t}`); p.call("admin:smallMsg",[String(t),[155,220,255,255]]); };
const small = (p, t, c=[102,204,255,255]) => p.call("admin:smallMsg",[String(t),c]);

function parseDur(s){ if(!s) return null; let ms=0; const re=/(\d+)\s*(d|h|m|s)/gi; let m; while((m=re.exec(s))){ const n=+m[1], u=m[2].toLowerCase(); ms+=u==="d"?n*864e5:u==="h"?n*36e5:u==="m"?n*6e4:n*1e3; } return ms||null; }
const splitFirst = t => { if(!t) return ["",""]; const [a,...r]=t.trim().split(/\s+/); return [a||"",r.join(" ")]; };
const findTarget = (q)=>{ if(!q) return null; const id=parseInt(q,10); if(!isNaN(id)){ const pid=idsData.byId[id]; if(pid){ const t=[...mp.players.toArray()].find(p=>identOf(p)===pid); if(t) return t; } } q=String(q).toLowerCase(); let best=null; mp.players.forEach(p=>{ if(p.name.toLowerCase().includes(q)) best=p; }); return best; };

function logAction(admin, action, {target=null, details=null}={}){
  const entry = { ts: new Date().toISOString(), action, admin:{ ident: identOf(admin), name: admin.name, level: lvlOf(admin) }, target: target ? (typeof target==="string"?target:{ ident: identOf(target), name: target.name }) : null, details };
  actionLogs.push(entry); if(actionLogs.length>50000) actionLogs = actionLogs.slice(-40000); save.logs();
}

function addCmd(level, name, fn){
  const impl = (p, _f, args) => {
    if(disabledCommands.has(name)) return msg(p, `[Disabled] /${name} is currently disabled.`, "#ff5555");
    if(lvlOf(p) < level)  return msg(p, `You need admin level ${level}+ to use /${name}.`, "#ff5555");
    try { fn(p, args||""); logAction(p, `/${name}`, { details: args||"" }); } catch(e){ msg(p, `Error: ${e.message}`, "#ff5555"); }
  };
  mp.events.addCommand(name, impl);
  registry.set(name, (p, args)=>impl(p,"",args||""));
}

// ----------- helpers ----------
const setFrozen     = (t, s) => t.call("admin:setFrozen",[!!s]);
const startSpectate = (a, t) => a.call("admin:spectateStart",[t.remoteId]);
const stopSpectate  = (a)    => a.call("admin:spectateStop");
const dropToGround  = (p)    => p.call("admin:dropToGround");

function ensureCarBucket(id){ if(!carsData[id]) carsData[id]={ single:null, multi:[] }; }
function spawnCarFor(p, model, {removeOld=true, plate="ADMIN"}={}){
  const id=identOf(p); ensureCarBucket(id);
  const mdl=(model||"SULTAN").toUpperCase();
  const pos=p.position;
  const v=mp.vehicles.new(mp.joaat(mdl), new mp.Vector3(pos.x+2,pos.y,pos.z), { numberPlate: plate.toUpperCase(), dimension: p.dimension });
  try { p.putIntoVehicle(v,0); } catch {}
  const rec={ id:v.id, model:mdl, plate:plate.toUpperCase(), createdAt:now() };
  if(removeOld){ const prev=carSingle.get(p); if(prev&&prev.handle) prev.destroy(); carSingle.set(p,v); carsData[id].single=rec; }
  else { let set=carMulti.get(p); if(!set){ set=new Set(); carMulti.set(p,set); } set.add(v); carsData[id].multi.push(rec); }
  save.cars(); return v;
}
function removeAllCarsFor(p){
  const id=identOf(p);
  const s=carSingle.get(p); if(s&&s.handle) s.destroy();
  carSingle.delete(p);
  const set=carMulti.get(p); if(set){ for(const v of set) if(v&&v.handle) v.destroy(); }
  carMulti.delete(p);
  ensureCarBucket(id); carsData[id].single=null; carsData[id].multi=[]; save.cars();
}

// ----------- jail ----------
function jail(admin, target, ms, reason){
  const id = identOf(target);
  const prev = { x: target.position.x, y: target.position.y, z: target.position.z, dim: target.dimension };
  const until = now() + ms;
  const jailPos = new mp.Vector3(1691.0, 2605.0, 45.5);
  jailData[id] = { until, reason: reason||"DeMorgan", prevPos: prev }; save.jail();
  target.dimension = 555; target.position = jailPos; target.setVariable("jailedUntil", until);
  msg(target, `[JAIL] You have been jailed for ${Math.ceil(ms/60000)} min.`, "#ffcc00");
  msg(admin, `Sent ${target.name} to DeMorgan for ${Math.ceil(ms/60000)} min.`);
}
function unjail(admin, target){
  const id = identOf(target), rec=jailData[id];
  if(!rec) return msg(admin, `${target.name} is not jailed.`, "#ffcc00");
  delete jailData[id]; save.jail();
  target.dimension = rec.prevPos?.dim ?? 0;
  target.position = new mp.Vector3(rec.prevPos?.x||target.position.x, rec.prevPos?.y||target.position.y, (rec.prevPos?.z||target.position.z)+0.5);
  dropToGround(target);
  target.setVariable("jailedUntil", null);
  msg(target, `You have been released from DeMorgan.`, "#a3ff9b");
  msg(admin, `Released ${target.name}.`);
}
setInterval(()=>{ mp.players.forEach(p=>{ const id=identOf(p), r=jailData[id]; if(r && r.until && r.until<=now()){ delete jailData[id]; save.jail(); try{ p.dimension=r.prevPos?.dim??0; p.position=new mp.Vector3(r.prevPos?.x||p.position.x, r.prevPos?.y||p.position.y, (r.prevPos?.z||p.position.z)+0.5); dropToGround(p); }catch{} p.setVariable("jailedUntil", null); small(p, "You served your DeMorgan time.", [120,255,120,255]); } }); }, 5000);

// ----------- lifecycle ----------
mp.events.add("playerJoin", (p) => {
  const id = identOf(p);
  let sid = idsData.byIdentifier[id];
  if(!sid){ sid=idsData.nextId++; idsData.byIdentifier[id]=sid; idsData.byId[sid]=id; save.ids(); }
  p.setVariable("sessionId", sid);
  p.setVariable("adminLevel", lvlOf(p));
  p.setVariable("invisMode", "none");
  if(!carsData[id]){ carsData[id] = { single:null, multi:[] }; save.cars(); }

  const ban=bans[id];
  if(ban){ if(ban.expires && now()>=ban.expires){ delete bans[id]; save.bans(); } else return p.kick(ban.reason || "Banned."); }

  const jailRec = jailData[id];
  if (jailRec && jailRec.until && jailRec.until > now()){
    p.position = new mp.Vector3(1691.0, 2605.0, 45.5);
    p.dimension = 555;
    p.setVariable("jailedUntil", jailRec.until);
  }

  msg(p, `[INFO] Your session ID is ${sid}. Use /checkid anytime.`);
});
mp.events.add("playerEnterVehicle", (p, v, seat)=>{ if(seat===0) lastDriverVeh.set(p, v); });
mp.events.add("playerExitVehicle", (p, v)=>{ try{ const last=lastDriverVeh.get(p); if(last&&last.handle&&last===v){ last.engine=false; small(p,"Engine OFF (auto)",[255,200,90,255]); } lastDriverVeh.delete(p); }catch{} });
mp.events.add("playerQuit", (p)=>{ try{ const id=identOf(p); const s=carSingle.get(p); if(s&&s.handle) s.destroy(); carSingle.delete(p); const set=carMulti.get(p); if(set){ for(const v of set) if(v&&v.handle) v.destroy(); } carMulti.delete(p); if(carsData[id]){ carsData[id]={single:null,multi:[]}; save.cars(); } lastDriverVeh.delete(p); }catch{} const v=lastSpawnedVeh.get(p); if(v&&v.handle) v.destroy(); lastSpawnedVeh.delete(p); });
mp.events.add("playerChat", (p,text)=>{ const m=muted.get(identOf(p)); if(m&&(m===Infinity||m>now())){ msg(p,"You are muted.", "#ff5555"); return false; } });

// ----------- remote (panel & hotkeys) ----------
mp.events.add("admin:toggleEngine",(p)=>{ try{ const v=p.vehicle; if(!v) return msg(p,"You are not in a vehicle.","#ff5555"); let driver=false; try{ driver=(v.getOccupant(0)===p); }catch{} if(!driver){ try{ driver=(p.seat===0); }catch{} } if(!driver) return msg(p,"Only the driver can toggle the engine.","#ff5555"); v.engine=!v.engine; msg(p,`Engine ${v.engine?"ON":"OFF"}`, v.engine?"#a3ff9b":"#ffcc00"); logAction(p,"toggleEngine",{details:v.engine?"ON":"OFF"}); }catch(e){ msg(p,`Engine toggle error: ${e.message}`,"#ff5555"); } });

mp.events.add("admin:panelCmd", (p, cmd, args)=>{ const fn=registry.get(cmd); if(!fn) return msg(p, `Unknown command: /${cmd}`, "#ff5555"); fn(p, args||""); });

mp.events.add("admin:getPlayers",(p)=>{ const list = mp.players.toArray().map(pl=>({ id: pl.getVariable("sessionId")||0, name: pl.name, level: pl.getVariable("adminLevel")||0, health: pl.health||0, armor: pl.armour||0, ping: pl.ping||0, money: pl.getVariable("money")||0, jailedUntil: pl.getVariable("jailedUntil")||null })); p.call("panel:setPlayers",[JSON.stringify(list)]); });
mp.events.add("admin:getBans",(p)=>{ const list = Object.keys(bans).map(k=>({ident:k,reason:bans[k].reason||"Banned",expires:bans[k].expires||null})); p.call("panel:setBans",[JSON.stringify(list)]); });
mp.events.add("admin:getVehicles",(p)=>{ try{ p.call("panel:setVehicles",[JSON.stringify(J(VEHICLES_FILE,{}))]); } catch { p.call("panel:setVehicles",[JSON.stringify({Cars:["SULTAN"]})]); } });
mp.events.add("admin:getActionLogs",(p)=>{ p.call("panel:setLogs",[JSON.stringify(actionLogs.slice(-500))]); });

// ----------- commands -----------
// L1
const pair = a => { const [who,rest]=splitFirst(a||""); return { who, rest }; };
addCmd(1,"warn",(p,a)=>{ const{who,rest}=pair(a); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); const id=identOf(t); warns.set(id,(warns.get(id)||0)+1); msg(t,`[WARN] ${rest||"No reason provided."}`,"#ffcc00"); msg(p,`Warned ${t.name}. Total warns: ${warns.get(id)}`,"#ffcc00"); });
addCmd(1,"freeze",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); setFrozen(t,true); msg(t,`You have been frozen by ${p.name}.`,"#ff5555"); msg(p,`Froze ${t.name}.`); });
addCmd(1,"unfreeze",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); setFrozen(t,false); t.call("admin:dropToGround"); msg(t,`You have been unfrozen.`,"#a3ff9b"); msg(p,`Unfroze ${t.name}.`); });
addCmd(1,"checkid",(p)=>msg(p,`Your session ID: ${p.getVariable("sessionId")}`));

// L2
addCmd(2,"kick",(p,a)=>{ const{who,rest}=pair(a); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); t.kick(rest||"Kicked by staff."); msg(p,`Kicked ${t.name}.`); });
addCmd(2,"check",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); const info=[`Name:${t.name}`,`ID:${t.getVariable("sessionId")}`,`Admin:${lvlOf(t)}`,`Dim:${t.dimension}`,`Pos:${t.position.x.toFixed(2)}, ${t.position.y.toFixed(2)}, ${t.position.z.toFixed(2)}`].join(" | "); msg(p,info); });

// L3-4
addCmd(3,"mute",(p,a)=>{ const{who,rest}=pair(a); const [durStr,...rs]=rest.split(" "); const ms=parseDur(durStr); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); muted.set(identOf(t), ms?now()+ms:Infinity); msg(t,`[MUTED] ${rs.join(" ")||"Muted by staff."} ${ms?`(${durStr})`:"(indefinite)"}`,"#ffcc00"); msg(p,`Muted ${t.name}.`); });
addCmd(3,"unmute",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); muted.delete(identOf(t)); msg(t,`You were unmuted.`,"#a3ff9b"); msg(p,`Unmuted ${t.name}.`); });

addCmd(3,"tp",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); p.position=new mp.Vector3(t.position.x+1,t.position.y,t.position.z); msg(p,`Teleported to ${t.name}.`); });
addCmd(3,"bring",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); t.position=new mp.Vector3(p.position.x+1,p.position.y,p.position.z); dropToGround(t); msg(p,`Brought ${t.name}.`); });
addCmd(4,"spectate",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); startSpectate(p,t); msg(p,`Spectating ${t.name}. Use /stopspec to stop.`); });
addCmd(4,"stopspec",(p)=>{ stopSpectate(p); msg(p,`Stopped spectating.`); });

// L3 tempban
addCmd(3,"tempban",(p,a)=>{ const{who,rest}=pair(a); const [durStr,...rs]=rest.split(" "); const ms=parseDur(durStr); if(!ms) return msg(p,"Usage: /tempban [player] [duration 1h30m] [reason]"); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); const id=identOf(t); bans[id]={ reason: rs.join(" ")||"Temp-banned", expires: now()+ms }; save.bans(); t.kick(`${bans[id].reason} (${durStr})`); msg(p,`Temp-banned ${t.name} for ${durStr}.`); });

// L3 revive (double)
addCmd(3,"revive",(p,a)=>{ const t=(a||"").trim()?findTarget(a):p; if(!t) return msg(p,"Player not found.","#ff5555"); const pos=t.position; const doRv=()=>t.call("admin:reviveAt",[pos.x,pos.y,pos.z]); doRv(); setTimeout(doRv,250); msg(p,`Revived ${t===p?"yourself":t.name} (safe-land).`,"#a3ff9b"); });
mp.events.addCommand("review",(p,f,a)=>registry.get("revive")(p,a));
mp.events.addCommand("rev",(p,f,a)=>registry.get("revive")(p,a));
mp.events.addCommand("revieve",(p,f,a)=>registry.get("revive")(p,a));

// L5-6
addCmd(5,"slap",(p,a)=>{ const{who,rest}=pair(a); const dmg=Math.max(1,Math.min(200,parseInt(rest||"10",10))); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); t.call("admin:slap",[dmg]); msg(p,`Slapped ${t.name} for ${dmg}.`); });
addCmd(5,"sethealth",(p,a)=>{ const{who,rest}=pair(a); const v=Math.max(0,Math.min(200,parseInt(rest||"100",10))); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); t.call("admin:setHealth",[v]); msg(p,`Set ${t.name} health to ${v}.`); });
addCmd(5,"setarmor",(p,a)=>{ const{who,rest}=pair(a); const v=Math.max(0,Math.min(100,parseInt(rest||"100",10))); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); t.call("admin:setArmor",[v]); msg(p,`Set ${t.name} armor to ${v}.`); });

// L6 jail
addCmd(6,"demorgan",(p,a)=>{ const{who,rest}=pair(a); const [durStr,...rs]=(rest||"").split(" "); const ms=parseDur(durStr); if(!ms) return msg(p,"Usage: /demorgan [player] [duration 30m] [reason]"); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); jail(p,t,ms,rs.join(" ")); });
addCmd(6,"unjail",(p,a)=>{ const t=findTarget(a); if(!t) return msg(p,"Player not found.","#ff5555"); unjail(p,t); });

// L7-8 cars/money/announce
addCmd(7,"car",(p,a)=>{ const m=(a||"").trim()||"SULTAN"; spawnCarFor(p,m,{removeOld:true,plate:"ADMIN"}); msg(p,`Spawned /car: ${m}`); });
addCmd(7,"carn",(p,a)=>{ const m=(a||"").trim()||"SULTAN"; spawnCarFor(p,m,{removeOld:false,plate:"ADMIN"}); msg(p,`Spawned /carn: ${m}`); });
addCmd(7,"removecar",(p)=>{ removeAllCarsFor(p); msg(p,`Removed your /car and all /carn cars.`); });

addCmd(8,"announce",(p,a)=>{ const t=(a||"").trim(); if(!t) return msg(p,"Usage: /announce [message]"); mp.players.broadcast(`!{#ffd25a}[ANNOUNCEMENT] ${t}`); mp.players.forEach(pl=>small(pl,`[ANNOUNCEMENT] ${t}`,[255,210,90,255])); });
addCmd(8,"money",(p,a)=>{ const t=findTarget(a)||p; const m=t.getVariable("money")||0; msg(p,`${t.name} money: ${m}`); });
addCmd(BAN_MIN_LEVEL,"ban",(p,a)=>{ const{who,rest}=pair(a); const t=findTarget(who); if(!t) return msg(p,"Player not found.","#ff5555"); const id=identOf(t); bans[id]={ reason:rest||"Banned by staff", expires:null }; save.bans(); t.kick(bans[id].reason); msg(p,`Banned ${t.name}.`); });
addCmd(BAN_MIN_LEVEL,"unban",(p,a)=>{ const id=(a||"").trim(); if(!id) return msg(p,"Usage: /unban [identifier]"); if(bans[id]){ delete bans[id]; save.bans(); msg(p,`Unbanned ${id}.`);} else msg(p,`No ban found for ${id}.`,"#ffcc00"); });

// L10 weather/time/debug/restart
addCmd(10,"changeweather",(p,a)=>{ const w=(a||"").trim().toUpperCase()||"EXTRASUNNY"; mp.players.forEach(pl=>pl.call("admin:weatherTransition",[w,30000])); msg(p,`Weather transitioning to ${w}.`); });
addCmd(10,"changetime",(p,a)=>{ const h=Math.max(0,Math.min(23,parseInt(a||"12",10))); mp.world.time.set(h,0,0); msg(p,`Time set to ${h}:00.`); });
addCmd(10,"debug",(p)=>{ const cur=p.getVariable("debug")?false:true; p.setVariable("debug",cur); msg(p,`Debug ${cur?"ON":"OFF"}.`); });
addCmd(10,"restartserver",(p)=>{ if(!ALLOW_PROCESS_EXIT_ON_RESTART) return msg(p,"Restart disabled in config.","#ffcc00"); mp.players.broadcast("!{#ff5555}[SERVER] Restarting..."); setTimeout(()=>process.exit(0),1000); });

// Admin chat
addCmd(1,"a",(p,a)=>{ const t=(a||"").trim(); if(!t) return msg(p,"Usage: /a [message]"); const l=lvlOf(p); mp.players.forEach(pl=>{ if(lvlOf(pl)>=1){ pl.call("admin:adminChat",[`[AdminChat L${l}] ${p.name}: ${t}`]); small(pl,`[AdminChat] ${p.name}: ${t}`,[255,200,90,255]); } }); });
mp.events.addCommand("adminchat",(p,f,a)=>registry.get("a")(p,a));

// Invisibility
addCmd(FLY_MIN_LEVEL,"invis",(p,a)=>{
  const tok=(a||"").trim().split(/\s+/).filter(Boolean);
  const modes=new Set(["full","partial","none"]);
  let target=p, mode=tok[0]?.toLowerCase();
  if(tok.length>=2){ const cand=findTarget(tok[0]); if(cand){ target=cand; mode=tok[1]?.toLowerCase(); } }
  if(!modes.has(mode||"")) return msg(p,"Usage: /invis [player?] full|partial|none","#ff5555");
  target.setVariable("invisMode", mode);
  target.call("admin:setInvis",[mode]);
  msg(p,`Invisibility set to ${mode} for ${target===p?"yourself":target.name}.`);
});
