// ===== 3D scene — kantor kartun + 2 meja agent (Three.js) =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('scene3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1120);
scene.fog = new THREE.Fog(0x0a1120, 18, 60);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(7.5, 6.5, 10);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 4; controls.maxDistance = 26;

// lights
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x0c1020, 0.9));
const sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
sun.position.set(6, 12, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(sun);

const neon = new THREE.PointLight(0xf97316, 8, 14, 2);
neon.position.set(0, 3.4, -6.4);
scene.add(neon);

// floor
{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x101a2e, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // grid garis lembut
  const grid = new THREE.GridHelper(40, 40, 0x1b2942, 0x14203a);
  grid.position.y = 0.01; scene.add(grid);
}

// walls + neon sign
{
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(22, 7, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x0d1526, roughness: 1 })
  );
  wall.position.set(0, 3.5, -8); wall.receiveShadow = true; scene.add(wall);

  // teks neon "GOOD IDEAS BETTER WEBSITES" — pakai canvas texture
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1526'; g.fillRect(0, 0, 1024, 128);
  g.font = 'bold 54px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#f97316'; g.shadowBlur = 26; g.fillStyle = '#ffab66';
  g.fillText('GOOD IDEAS · BETTER WEBSITES', 512, 64);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 4.4, -7.8); scene.add(sign);
}

// materials helper
const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
function box(w, h, d, color, x, y, z, rough) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  return m;
}

// ---- properti kantor ----
// sofa
{
  box(3.4, 0.5, 1.4, 0x27406b, -6.5, 0.45, -4);
  box(3.4, 0.9, 0.3, 0x2d4a7a, -6.5, 1.0, -4.7);
  box(0.3, 0.55, 1.4, 0x2d4a7a, -8.25, 0.9, -4);
  box(0.3, 0.55, 1.4, 0x2d4a7a, -4.75, 0.9, -4);
}
// meja kopi
box(1.2, 0.08, 0.7, 0x33507f, -6.5, 0.55, -2.6);
// tanaman
function plant(x, z) {
  box(0.5, 0.55, 0.5, 0x7c4a21, x, 0.28, z);
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x2e9e5b, 0.9));
  leaf.position.set(x, 1.05, z); leaf.castShadow = true; scene.add(leaf);
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), mat(0x35b567, 0.9));
  leaf2.position.set(x + 0.15, 1.4, z - 0.1); leaf2.castShadow = true; scene.add(leaf2);
}
plant(9.2, -6.6); plant(-9.2, -6.6); plant(9.2, 6.2); plant(-9.2, 6.2);

// ---- stasiun agent (2 meja + PC + layar) ----
export const stations = {};
function station(id, x, z, rotY, color) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z); grp.rotation.y = rotY;

  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.3), mat(0x50699b));
  desk.position.y = 1.05; desk.castShadow = true; grp.add(desk);
  for (const [dx, dz] of [[-1.15, 0.45], [1.15, 0.45], [-1.15, -0.45], [1.15, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.09), mat(0x2c3e60));
    leg.position.set(dx, 0.5, dz); grp.add(leg);
  }
  // monitor
  const mon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.06), mat(0x0b0f18));
  mon.position.set(0, 1.75, -0.35); mon.castShadow = true; grp.add(mon);
  // layar (emissive — warna berganti saat agent "thinking")
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 0.72),
    new THREE.MeshBasicMaterial({ color })
  );
  screen.position.set(0, 1.75, -0.31); grp.add(screen);

  // kursi
  const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 16), mat(0x1f2c48));
  chair.position.set(0, 0.62, 1.05); chair.castShadow = true; grp.add(chair);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.1), mat(0x243352));
  back.position.set(0, 1.05, 1.38); back.castShadow = true; grp.add(back);

  scene.add(grp);
  stations[id] = { grp, screen, baseColor: color };
}
station('vela-one', -3.2, 1.2, 0.5, 0x38bdf8);
station('vela-two', 3.2, 1.2, -0.5, 0xa78bfa);

// ---- pesan melayang (balon chat 3D saat agent kirim pesan) ----
const floats = [];
export function floatMessage(agentId, color = 0xf97316) {
  const s = stations[agentId]; if (!s) return;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,30,.92)'; g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
  g.lineWidth = 4; g.beginPath(); g.roundRect(4, 4, 248, 56, 14); g.fill(); g.stroke();
  g.fillStyle = '#dbe4f5'; g.font = 'bold 26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('💬 pesan baru', 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(2.6, 0.65, 1);
  spr.position.copy(s.grp.position).add(new THREE.Vector3(0, 2.9, 0));
  scene.add(spr);
  floats.push({ spr, born: performance.now() });
}

// status layar agent
export function setAgentScreen(agentId, mode) {
  const s = stations[agentId]; if (!s) return;
  const c = s.screen.material.color;
  if (mode === 'thinking') c.setHex(0xf59e0b);
  else if (mode === 'idle') c.setHex(s.baseColor);
  else if (mode === 'offline') c.setHex(0x24324e);
}

// ---- animasi loop ----
let tour = false, orbitOn = true;
const clock = new THREE.Clock();
export function setTour(v) { tour = v; }
export function setOrbit(v) { orbitOn = v; controls.autoRotate = v; controls.autoRotateSpeed = 0.9; }

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}

renderer.setAnimationLoop(() => {
  resize();
  const t = clock.getElapsedTime();
  // idle bobbing kursi + neon pulse
  neon.intensity = 7 + Math.sin(t * 2.4) * 1.6;
  for (const id in stations) {
    const grp = stations[id].grp;
    grp.rotation.y += Math.sin(t * 0.5 + (id === 'vela-one' ? 0 : 2)) * 0.0006;
  }
  // pesan melayang naik + fade
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    const age = (performance.now() - f.born) / 1000;
    f.spr.position.y = 2.9 + age * 0.4;
    f.spr.material.opacity = Math.max(0, 1 - age / 3.5);
    if (age > 3.5) { scene.remove(f.spr); floats.splice(i, 1); }
  }
  // auto-tour: kamera jalan mengitari
  if (tour) {
    const a = t * 0.18;
    camera.position.set(Math.cos(a) * 11, 5.5 + Math.sin(t * 0.3), Math.sin(a) * 11);
    camera.lookAt(0, 1.2, 0);
  }
  controls.update();
  renderer.render(scene, camera);
});
