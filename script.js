// Crowd Lab: éditeur + simulation simple sur grille
// Peinture: mur, porte, obstacle, gomme, spawn, goal
// Simulation: agents (cercles) avec forces: goal, séparation, murs

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const ui = {
  tabEdit: document.getElementById("tabEdit"),
  tabSim: document.getElementById("tabSim"),
  simBlock: document.getElementById("simBlock"),

  pop: document.getElementById("pop"),
  popVal: document.getElementById("popVal"),
  vmax: document.getElementById("vmax"),
  vmaxVal: document.getElementById("vmaxVal"),
  goalForce: document.getElementById("goalForce"),
  goalVal: document.getElementById("goalVal"),
  sepForce: document.getElementById("sepForce"),
  sepVal: document.getElementById("sepVal"),
  wallForce: document.getElementById("wallForce"),
  wallVal: document.getElementById("wallVal"),
  radius: document.getElementById("radius"),
  radVal: document.getElementById("radVal"),

  clear: document.getElementById("clear"),
  fillRoom: document.getElementById("fillRoom"),
  exportBtn: document.getElementById("export"),
  importBtn: document.getElementById("import"),
  file: document.getElementById("file"),

  start: document.getElementById("start"),
  pause: document.getElementById("pause"),
  resetAgents: document.getElementById("resetAgents"),
  trails: document.getElementById("trails"),
};

function setLabel(el, val) { el.textContent = String(val); }
function refreshLabels(){
  setLabel(ui.popVal, ui.pop.value);
  setLabel(ui.vmaxVal, ui.vmax.value);
  setLabel(ui.goalVal, ui.goalForce.value);
  setLabel(ui.sepVal, ui.sepForce.value);
  setLabel(ui.wallVal, ui.wallForce.value);
  setLabel(ui.radVal, ui.radius.value);
}
["input","change"].forEach(evt=>{
  [ui.pop,ui.vmax,ui.goalForce,ui.sepForce,ui.wallForce,ui.radius].forEach(x=>x.addEventListener(evt,refreshLabels));
});
refreshLabels();

// --- monde grille
const CELL = 16; // taille cellule en px (base, avant zoom)
const GRID_W = 90; // largeur grille en cellules
const GRID_H = 55; // hauteur grille en cellules

// types: 0 vide, 1 mur, 2 porte, 3 obstacle, 4 spawn
const grid = new Uint8Array(GRID_W * GRID_H);
function idx(x,y){ return y*GRID_W + x; }
function inBounds(x,y){ return x>=0 && y>=0 && x<GRID_W && y<GRID_H; }

let goal = { x: Math.floor(GRID_W*0.82), y: Math.floor(GRID_H*0.5) };

// view transform
let zoom = 1.25;
let panX = 24;
let panY = 24;
let panning = false;
let panStart = null;

function resize(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener("resize", resize);
resize();

function worldToScreen(wx, wy){
  const s = CELL * zoom;
  return { x: panX + wx*s, y: panY + wy*s };
}
function screenToWorld(sx, sy){
  const s = CELL * zoom;
  return { x: (sx - panX)/s, y: (sy - panY)/s };
}

// outils
function currentTool(){
  return document.querySelector('input[name="tool"]:checked').value;
}

// painting
let mouseDown = false;

canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("wheel", (e)=>{
  e.preventDefault();
  const before = screenToWorld(e.offsetX, e.offsetY);
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoom = Math.max(0.5, Math.min(3.0, zoom * factor));
  const after = screenToWorld(e.offsetX, e.offsetY);
  panX += (after.x - before.x) * CELL * zoom;
  panY += (after.y - before.y) * CELL * zoom;
}, { passive:false });

window.addEventListener("keydown",(e)=>{
  if(e.code === "Space"){ panning = true; canvas.style.cursor = "grab"; }
});
window.addEventListener("keyup",(e)=>{
  if(e.code === "Space"){ panning = false; panStart = null; canvas.style.cursor = "default"; }
});

canvas.addEventListener("pointerdown",(e)=>{
  mouseDown = true;
  if(panning){
    panStart = { x:e.clientX, y:e.clientY, panX, panY };
    return;
  }
  paintAt(e.offsetX, e.offsetY);
});
canvas.addEventListener("pointermove",(e)=>{
  if(!mouseDown) return;
  if(panning && panStart){
    panX = panStart.panX + (e.clientX - panStart.x);
    panY = panStart.panY + (e.clientY - panStart.y);
    return;
  }
  paintAt(e.offsetX, e.offsetY);
});
window.addEventListener("pointerup",()=>{
  mouseDown = false;
  panStart = null;
});

function paintAt(sx, sy){
  const w = screenToWorld(sx, sy);
  const gx = Math.floor(w.x);
  const gy = Math.floor(w.y);
  if(!inBounds(gx,gy)) return;

  const tool = currentTool();
  if(tool === "goal"){
    goal = { x: gx, y: gy };
    return;
  }
  const id = idx(gx,gy);

  if(tool === "erase") grid[id] = 0;
  if(tool === "wall") grid[id] = 1;
  if(tool === "door") grid[id] = 2;
  if(tool === "obstacle") grid[id] = 3;
  if(tool === "spawn") grid[id] = 4;
}

// quick actions
ui.clear.addEventListener("click", ()=>{
  grid.fill(0);
  goal = { x: Math.floor(GRID_W*0.82), y: Math.floor(GRID_H*0.5) };
  resetAgents();
});
ui.fillRoom.addEventListener("click", ()=>{
  // bordures mur
  grid.fill(0);
  for(let x=0;x<GRID_W;x++){
    grid[idx(x,0)] = 1;
    grid[idx(x,GRID_H-1)] = 1;
  }
  for(let y=0;y<GRID_H;y++){
    grid[idx(0,y)] = 1;
    grid[idx(GRID_W-1,y)] = 1;
  }
  // porte sur le bord droit
  const doorW = 8;
  const mid = Math.floor(GRID_H/2);
  for(let y=mid - Math.floor(doorW/2); y<= mid + Math.floor(doorW/2); y++){
    if(inBounds(GRID_W-1,y)) grid[idx(GRID_W-1,y)] = 2;
  }
  // spawn à gauche
  for(let y=5; y<GRID_H-5; y++){
    for(let x=2; x<16; x++){
      grid[idx(x,y)] = 4;
    }
  }
  goal = { x: GRID_W-2, y: mid };
  resetAgents();
});

// export import
ui.exportBtn.addEventListener("click", ()=>{
  const data = {
    v: 1,
    w: GRID_W,
    h: GRID_H,
    cell: CELL,
    goal,
    grid: Array.from(grid),
  };
  const blob = new Blob([JSON.stringify(data)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "crowd-lab.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

ui.importBtn.addEventListener("click", ()=> ui.file.click());
ui.file.addEventListener("change", async ()=>{
  const f = ui.file.files?.[0];
  if(!f) return;
  const txt = await f.text();
  const data = JSON.parse(txt);
  if(data?.w !== GRID_W || data?.h !== GRID_H || !Array.isArray(data.grid)) return;
  grid.set(Uint8Array.from(data.grid.map(n=>n|0)));
  if(data.goal) goal = { x: data.goal.x|0, y: data.goal.y|0 };
  resetAgents();
  ui.file.value = "";
});

// --- mode
let mode = "edit";
function setMode(m){
  mode = m;
  ui.tabEdit.classList.toggle("active", m==="edit");
  ui.tabSim.classList.toggle("active", m==="sim");
  ui.simBlock.classList.toggle("hidden", m!=="sim");
}
ui.tabEdit.addEventListener("click", ()=> setMode("edit"));
ui.tabSim.addEventListener("click", ()=> setMode("sim"));
setMode("edit");

// --- simulation agents
let agents = [];
let running = false;
let lastT = performance.now();

function rand(a,b){ return a + Math.random()*(b-a); }

function spawnCells(){
  const cells = [];
  for(let y=0;y<GRID_H;y++){
    for(let x=0;x<GRID_W;x++){
      if(grid[idx(x,y)] === 4) cells.push({x,y});
    }
  }
  return cells;
}

function resetAgents(){
  const n = parseInt(ui.pop.value,10);
  const sp = spawnCells();
  agents = [];
  const rad = parseFloat(ui.radius.value);
  for(let i=0;i<n;i++){
    const c = sp.length ? sp[(Math.random()*sp.length)|0] : {x:2,y:2};
    const px = c.x + rand(0.15,0.85);
    const py = c.y + rand(0.15,0.85);
    agents.push({ x:px, y:py, vx:0, vy:0, r: rad/(CELL*zoom) });
  }
}
ui.resetAgents.addEventListener("click", resetAgents);

ui.start.addEventListener("click", ()=>{
  if(agents.length === 0) resetAgents();
  running = true;
});
ui.pause.addEventListener("click", ()=> running = false);

// --- champs et collisions
function cellTypeAt(x,y){
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if(!inBounds(gx,gy)) return 1; // dehors = mur
  return grid[idx(gx,gy)];
}
function isSolid(t){
  return t===1 || t===3; // mur ou obstacle
}
function isPassable(t){
  return t===0 || t===2 || t===4; // vide, porte, spawn
}

function step(dt){
  const vmax = parseFloat(ui.vmax.value);
  const goalK = parseFloat(ui.goalForce.value);
  const sepK = parseFloat(ui.sepForce.value);
  const wallK = parseFloat(ui.wallForce.value);
  const rPx = parseFloat(ui.radius.value);
  const rWorld = rPx / (CELL*zoom);

  // pré calc goal
  const gx = goal.x + 0.5;
  const gy = goal.y + 0.5;

  // séparation: grille de voisinage
  const bucketSize = 1.0;
  const buckets = new Map();
  function bkey(x,y){ return (x<<16) ^ y; }
  for(let i=0;i<agents.length;i++){
    const ax = Math.floor(agents[i].x / bucketSize);
    const ay = Math.floor(agents[i].y / bucketSize);
    const key = bkey(ax,ay);
    if(!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }

  for(let i=0;i<agents.length;i++){
    const a = agents[i];
    a.r = rWorld;

    // force vers goal
    let fx = (gx - a.x);
    let fy = (gy - a.y);
    const d = Math.hypot(fx,fy) + 1e-6;
    fx = (fx/d) * goalK;
    fy = (fy/d) * goalK;

    // séparation
    const bx = Math.floor(a.x / bucketSize);
    const by = Math.floor(a.y / bucketSize);
    for(let oy=-1; oy<=1; oy++){
      for(let ox=-1; ox<=1; ox++){
        const key = bkey(bx+ox, by+oy);
        const list = buckets.get(key);
        if(!list) continue;
        for(const j of list){
          if(j===i) continue;
          const b = agents[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx,dy) + 1e-6;
          const minD = (a.r + b.r) * 2.1;
          if(dist < minD){
            const push = (minD - dist) / minD;
            fx += (dx/dist) * push * sepK;
            fy += (dy/dist) * push * sepK;
          }
        }
      }
    }

    // répulsion murs et obstacles via échantillons autour
    // on regarde les 8 cellules proches
    const cx = Math.floor(a.x);
    const cy = Math.floor(a.y);
    for(let oy=-1; oy<=1; oy++){
      for(let ox=-1; ox<=1; ox++){
        const tx = cx + ox;
        const ty = cy + oy;
        if(!inBounds(tx,ty)) continue;
        const t = grid[idx(tx,ty)];
        if(!isSolid(t)) continue;
        // centre cellule solide
        const sx = tx + 0.5;
        const sy = ty + 0.5;
        const dx = a.x - sx;
        const dy = a.y - sy;
        const dist = Math.hypot(dx,dy) + 1e-6;
        const range = 1.2;
        if(dist < range){
          const push = (range - dist) / range;
          fx += (dx/dist) * push * wallK;
          fy += (dy/dist) * push * wallK;
        }
      }
    }

    // intégration vitesse
    a.vx += fx * dt;
    a.vy += fy * dt;

    // clamp vitesse
    const sp = Math.hypot(a.vx,a.vy);
    if(sp > vmax){
      a.vx = (a.vx/sp) * vmax;
      a.vy = (a.vy/sp) * vmax;
    }

    // tentative move
    const nx = a.x + a.vx * dt;
    const ny = a.y + a.vy * dt;

    // collision simple cellule solide
    const tNext = cellTypeAt(nx, ny);
    if(isSolid(tNext)){
      // on essaye séparément x puis y
      const tx = cellTypeAt(nx, a.y);
      if(!isSolid(tx)) a.x = nx;
      else a.vx *= -0.2;

      const ty = cellTypeAt(a.x, ny);
      if(!isSolid(ty)) a.y = ny;
      else a.vy *= -0.2;
    }else{
      a.x = nx; a.y = ny;
    }
  }
}

function draw(){
  if(!ui.trails.checked){
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }else{
    ctx.fillStyle = "rgba(11,15,20,0.12)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  const s = CELL * zoom;

  // fond grille léger
  ctx.save();
  ctx.translate(panX, panY);

  // draw cells
  for(let y=0;y<GRID_H;y++){
    for(let x=0;x<GRID_W;x++){
      const t = grid[idx(x,y)];
      if(t===0) continue;

      if(t===1){ ctx.fillStyle = "rgba(185,198,220,0.8)"; }      // mur
      if(t===2){ ctx.fillStyle = "rgba(106,255,181,0.9)"; }      // porte
      if(t===3){ ctx.fillStyle = "rgba(255,106,106,0.9)"; }      // obstacle
      if(t===4){ ctx.fillStyle = "rgba(255,204,106,0.35)"; }     // spawn

      ctx.fillRect(x*s, y*s, s, s);
    }
  }

  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for(let x=0;x<=GRID_W;x++){
    ctx.beginPath();
    ctx.moveTo(x*s,0);
    ctx.lineTo(x*s, GRID_H*s);
    ctx.stroke();
  }
  for(let y=0;y<=GRID_H;y++){
    ctx.beginPath();
    ctx.moveTo(0,y*s);
    ctx.lineTo(GRID_W*s, y*s);
    ctx.stroke();
  }

  // goal
  ctx.fillStyle = "rgba(106,169,255,1)";
  ctx.beginPath();
  ctx.arc((goal.x+0.5)*s, (goal.y+0.5)*s, Math.max(5, s*0.22), 0, Math.PI*2);
  ctx.fill();

  // agents
  const rPx = parseFloat(ui.radius.value);
  ctx.fillStyle = "rgba(106,169,255,0.95)";
  for(const a of agents){
    ctx.beginPath();
    ctx.arc(a.x*s, a.y*s, rPx, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  // HUD
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`Mode: ${mode} | Agents: ${agents.length} | Zoom: ${zoom.toFixed(2)}`, 12, 18);
}

function loop(t){
  const dt = Math.min(0.033, (t - lastT)/1000);
  lastT = t;

  if(mode === "sim" && running){
    step(dt);
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// init salle par défaut
ui.fillRoom.click();
resetAgents();
