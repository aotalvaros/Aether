// Validador del nivel de Aether.
// Uso (desde la raíz del proyecto):  node tools/validate_level.js [intentos_por_tramo]
//
// 1) Comprobaciones estáticas: checkpoints/inicio sobre plataformas, orbes fuera de paredes, etc.
// 2) Alcanzabilidad: para cada tramo, un "bot" prueba miles de secuencias de inputs aleatorias
//    (moverse, saltar, engancharse, soltar, planear) usando la física REAL del juego, y mide
//    qué porcentaje llega a la plataforma objetivo. 0% = tramo probablemente imposible;
//    porcentajes bajos = tramo difícil. Los drones NO se simulan (solo plataformas y trampas).

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const window = { addEventListener() {}, innerWidth: 1280, innerHeight: 720 };
const document = { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }) };
const G = new Function("window", "document",
  script + "\nreturn { LEVEL_DATA, CONFIG, Player, Hazard, V2 };")(window, document);
const { LEVEL_DATA: L, CONFIG, Player, Hazard, V2 } = G;

const walls = L.walls.map(([x, y, w, h]) => ({ x, y, w, h }));
const nodes = L.nodes.map(([x, y]) => ({ pos: { x, y }, radius: 15 }));
const hazards = L.hazards.map(([x, y, w, h]) => new Hazard(x, y, w, h));
const R = CONFIG.PLAYER.COLLISION_RADIUS;

const W = (x, y) => {
  const w = walls.find((w) => w.x === x && w.y === y);
  if (!w) throw new Error(`No existe plataforma en (${x},${y})`);
  return w;
};
const N = (x, y) => {
  const i = L.nodes.findIndex(([nx, ny]) => nx === x && ny === y);
  if (i < 0) throw new Error(`No existe nodo en (${x},${y})`);
  return i;
};

// ---------- Comprobaciones estáticas ----------
let problems = 0;
const warn = (m) => { problems++; console.log("  ✗ " + m); };
const onPlatform = (x, y, off) => walls.some((w) => x >= w.x && x <= w.x + w.w && Math.abs(w.y - off - y) <= 5);
const insideWall = (x, y) => walls.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);

console.log("Comprobaciones estáticas");
if (!walls.some((w) => L.start.x >= w.x && L.start.x <= w.x + w.w && w.y > L.start.y && w.y - L.start.y < 80))
  warn("El inicio no está sobre una plataforma");
L.checkpoints.forEach(([x, y]) => { if (!onPlatform(x, y, 30)) warn(`Checkpoint (${x},${y}) no está sobre una plataforma`); });
L.echoes.forEach(([x, y]) => { if (insideWall(x, y)) warn(`Orbe (${x},${y}) dentro de una pared`); });
L.nodes.forEach(([x, y]) => { if (insideWall(x, y)) warn(`Nodo (${x},${y}) dentro de una pared`); });
L.checkpoints.forEach(([x, y]) => {
  if (hazards.some((h) => x > h.x - 60 && x < h.x + h.w + 60 && y > h.y - 60 && y < h.y + h.h + 60))
    warn(`Checkpoint (${x},${y}) demasiado cerca de una trampa`);
  // Distancia al tramo de patrulla del drone (se mueve en horizontal ±r) vs. su radio de visión (250)
  L.drones.forEach(([dx, dy, r]) => {
    const px = Math.max(dx - r, Math.min(dx + r, x));
    if (Math.hypot(x - px, y - dy) < 250)
      warn(`Checkpoint (${x},${y}) dentro del rango de visión del drone (${dx},${dy})`);
  });
});
if (!onPlatform(L.goal.x, L.goal.y + 70, 25) && !walls.some((w) => L.goal.x >= w.x && L.goal.x <= w.x + w.w && w.y - L.goal.y < 120 && w.y > L.goal.y))
  warn("La meta no está cerca de una plataforma");
if (problems === 0) console.log("  ✓ Sin problemas");

// ---------- Simulación ----------
const audio = { playGrapple() {}, playJump() {}, playCollect() {}, playDamage() {} };
const particles = { spawnSpark() {} };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function randomPlan(seg) {
  const towards = Math.sign((seg.minX ?? seg.target.x + seg.target.w / 2) - seg.from.x) || 1;
  const pick = () => (Math.random() < 0.7 ? towards : [-1, 0, 1][rnd(0, 2)]);
  const plan = { dir1: pick(), dir2: pick(), switchAt: rnd(0, 300), jumps: [], grapples: [], glide: null };
  const nJumps = Math.random() < 0.8 ? rnd(1, 3) : 0;
  for (let i = 0; i < nJumps; i++) { const at = rnd(0, 250); plan.jumps.push([at, at + rnd(1, 30)]); }
  let t = rnd(0, 90);
  for (const n of seg.nodes || []) {
    if (Math.random() < 0.1) continue;
    const hold = rnd(5, 220);
    plan.grapples.push({ node: nodes[n], from: t, to: t + hold });
    t += hold + rnd(1, 50);
  }
  if (Math.random() < 0.6) { const at = t + rnd(-10, 30); plan.glide = [at, at + rnd(10, 220)]; }
  return plan;
}

function simulate(seg, plan, maxTicks = 700) {
  const p = new Player(seg.from.x, seg.from.y);
  p.glideCharge = seg.glideCharge || 0;
  let target = null;
  const input = {
    keys: { left: false, right: false, up: false },
    mouse: { down: false }, isTouch: false,
    getWorldMouse: () => (target ? target.pos : { x: 1e9, y: 1e9 }),
  };
  for (let t = 0; t < maxTicks; t++) {
    const dir = t < plan.switchAt ? plan.dir1 : plan.dir2;
    input.keys.right = dir > 0;
    input.keys.left = dir < 0;
    input.keys.up = plan.jumps.some(([a, b]) => t >= a && t < b) || (plan.glide && t >= plan.glide[0] && t < plan.glide[1]);
    const g = plan.grapples.find((g) => t >= g.from && t < g.to);
    input.mouse.down = !!g;
    target = g ? g.node : null;
    p.update(input, { walls, nodes }, {}, [], particles, [], [], audio);
    p.energy = 100;
    if (p.invulnerable > 0) return false; // Tocó una trampa
    if (p.pos.y > CONFIG.LEVEL.DEATH_Y) return false;
    const T = seg.target;
    if (p.grounded && p.pos.x >= T.x && p.pos.x <= T.x + T.w && Math.abs(p.pos.y - (T.y - R)) < 3 &&
        (!seg.minX || p.pos.x >= seg.minX)) return true;
  }
  return false;
}

const stand = (w, x) => ({ x, y: w.y - R });
const SEGMENTS = [
  { name: "Z1 suelo → escalón 1 (opcional)", from: stand(W(-400, 500), 850), target: W(1000, 420) },
  { name: "Z1 escalón 1 → escalón 2 (opcional)", from: stand(W(1000, 420), 1200), target: W(1350, 320) },
  { name: "Z1 suelo → subir al bloque", from: stand(W(-400, 500), 1550), target: W(1700, 420) },
  { name: "Z1 saltar la trampa", from: stand(W(-400, 500), 2400), target: W(-400, 500), minX: 2700 },
  { name: "Z1→Z2 primer abismo (gancho)", from: stand(W(-400, 500), 3050), target: W(3600, 500), nodes: [N(3350, 250)] },
  { name: "Z2 isla A → isla B (2 nodos)", from: stand(W(3600, 500), 3850), target: W(4700, 450), nodes: [N(4100, 200), N(4450, 180)] },
  { name: "Z2 isla B → isla C", from: stand(W(4700, 450), 4900), target: W(5200, 250), nodes: [N(5050, 50)] },
  { name: "Z2 isla C → isla D (gancho + planeo)", from: stand(W(5200, 250), 5350), target: W(6150, 350), nodes: [N(5600, 0)] },
  { name: "Z3 suelo de seguridad → isla D", from: stand(W(6500, 500), 6700), target: W(6150, 350) },
  { name: "Z3 isla D → Z1", from: stand(W(6150, 350), 6450), target: W(6650, 200) },
  { name: "Z3 Z1 → Z2", from: stand(W(6650, 200), 6700), target: W(6300, 50) },
  { name: "Z3 Z2 → Z3", from: stand(W(6300, 50), 6450), target: W(6700, -100) },
  { name: "Z3 Z3 → Z4", from: stand(W(6700, -100), 6750), target: W(6300, -250) },
  { name: "Z3 Z4 → Z5", from: stand(W(6300, -250), 6450), target: W(6700, -400) },
  { name: "Z3 Z5 → plataforma final (3 nodos)", from: stand(W(6700, -400), 6850), target: W(6700, -1250), nodes: [N(6500, -700), N(6800, -1000), N(6600, -1350)] },
];

const tries = parseInt(process.argv[2] || "6000", 10);
console.log(`\nAlcanzabilidad (${tries} intentos aleatorios por tramo; drones no simulados)`);
let impossible = 0;
for (const seg of SEGMENTS) {
  let ok = 0;
  const n = seg.nodes ? tries * 3 : tries;
  for (let i = 0; i < n; i++) if (simulate(seg, randomPlan(seg))) ok++;
  const pct = (100 * ok) / n;
  if (ok === 0) impossible++;
  // Métrica "humana" para saltos: correr hacia el objetivo, saltar en el tick k (k = 0..90)
  // y soltar la dirección en algún momento r. La ventana es cuántos valores de k tienen
  // al menos un r que funcione: >= 6 ticks (0.1 s) es cómodo.
  let windowInfo = "";
  if (!seg.nodes) {
    const towards = Math.sign((seg.minX ?? seg.target.x + seg.target.w / 2) - seg.from.x) || 1;
    let win = 0;
    for (let k = 0; k <= 90; k++) {
      for (let r = k; r <= k + 100; r += 4) {
        const plan = { dir1: towards, dir2: 0, switchAt: r, jumps: [[k, k + 15]], grapples: [], glide: null };
        if (simulate(seg, plan)) { win++; break; }
      }
    }
    windowInfo = `  [ventana de salto: ${win} ticks${win > 0 && win < 6 ? " — AJUSTADA" : ""}]`;
  }
  const tag = ok === 0 ? "✗ SIN SOLUCIÓN" : "✓";
  console.log(`  ${tag.padEnd(15)} ${pct.toFixed(2).padStart(6)}%  ${seg.name}${windowInfo}`);
}
console.log(impossible === 0 && problems === 0 ? "\nNivel OK" : `\n${impossible} tramo(s) sin solución, ${problems} problema(s) estático(s)`);
process.exit(impossible === 0 && problems === 0 ? 0 : 1);
