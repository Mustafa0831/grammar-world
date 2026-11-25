// 3D obby world for Grammar World (Three.js r160, local copy)
import * as THREE from './three.module.min.js';

const COLORS = [0xff4d5e, 0x3a86ff, 0xffd23f, 0x2ecc71, 0x9b5de5, 0xff8c42, 0x00b4d8, 0xff8fab];
const ICON = { choice: '⚡', listening: '🎧', reading: '📖', speaking: '🎤', writing: '✏️', reflection: '🏁' };
const GRAV = 28, JUMP_V = 10.6, SPEED = 7.2, FALL_Y = -7;

let R, S, C, root, sun, host, ctrl, raf = 0, last = 0, lavaTex;
let K = null;            // course
let P = null;            // player
const keys = {}; const joy = { x: 0, y: 0 }; let jumpReq = false;
let paused = true, visible = false, builtKey = '';
const W = { onButton: null, onPortal: null, onCoin: null, onFall: null, sfx: () => {} };

/* ---------------- helpers ---------------- */
const lighten = (c, k) => { const col = new THREE.Color(c); col.lerp(new THREE.Color(0xffffff), k); return col; };
function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
function block(w, h, d, color, topColor) {
  const side = mat(color), top = mat(topColor ?? lighten(color, 0.25));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side]);
  m.castShadow = true; m.receiveShadow = true; return m;
}
function textSprite(lines, opt = {}) {
  const cw = opt.w || 640, ch = opt.h || 200;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  const r = 40; g.fillStyle = opt.bg || 'rgba(255,255,255,.95)';
  g.beginPath(); g.roundRect(8, 8, cw - 16, ch - 16, r); g.fill();
  g.lineWidth = 10; g.strokeStyle = opt.border || '#1d2340'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = opt.color || '#1d2340';
  const n = lines.length;
  lines.forEach((t, k) => {
    const big = k === 0; g.font = `${big ? 700 : 600} ${big ? (opt.big || 64) : (opt.small || 46)}px Fredoka, system-ui, sans-serif`;
    g.fillText(t, cw / 2, ch / 2 + (k - (n - 1) / 2) * (opt.gap || 66));
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sc = opt.scale || 6.4; s.scale.set(sc, sc * ch / cw, 1); return s;
}
function emojiSprite(e, size = 1.6) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.font = '100px system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(e, 64, 72); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(size, size, 1); return s;
}

/* ---------------- init ---------------- */
function init() {
  host = document.getElementById('world');
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(R.domElement);
  S = new THREE.Scene(); S.fog = new THREE.Fog(0xbfe9ff, 45, 130);
  C = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  S.add(new THREE.HemisphereLight(0xffffff, 0x9ab8ff, 2.2));
  sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
  sun.shadow.bias = -0.0008; S.add(sun); S.add(sun.target);
  // lava sea
  const lc = document.createElement('canvas'); lc.width = lc.height = 256; const lg = lc.getContext('2d');
  lg.fillStyle = '#e8501a'; lg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 22;
    const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, Math.random() < .5 ? '#ffb347' : '#ff7b29'); gr.addColorStop(1, 'rgba(232,80,26,0)');
    lg.fillStyle = gr; for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { lg.beginPath(); lg.arc(x + ox, y + oy, r, 0, 7); lg.fill(); } }
  lavaTex = new THREE.CanvasTexture(lc); lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.repeat.set(30, 30); lavaTex.colorSpace = THREE.SRGBColorSpace;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: lavaTex, fog: true }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = -9; S.add(lava);
  root = new THREE.Group(); S.add(root);
  makePlayer();
  makeControls();
  addEventListener('resize', resize); resize();
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    keys[e.code] = true; if (e.code === 'Space') { jumpReq = true; if (visible && !paused) e.preventDefault(); }
    if (visible && !paused && /^Arrow/.test(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
}
function resize() { if (!R) return; const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; R.setSize(w, h); C.aspect = w / h; C.fov = w / h < 1 ? 72 : 58; C.updateProjectionMatrix(); }

/* ---------------- player (blocky avatar) ---------------- */
function makePlayer() {
  const g = new THREE.Group();
  const part = (w, h, d, c, x, y, z, pivotY) => {
    const piv = new THREE.Group(); piv.position.set(x, pivotY ?? y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.castShadow = true;
    m.position.y = pivotY !== undefined ? y - pivotY : 0; piv.add(m); g.add(piv); return piv;
  };
  const legL = part(.48, 1.0, .5, 0x2ecc71, -.27, .5, 0, 1.0), legR = part(.48, 1.0, .5, 0x2ecc71, .27, .5, 0, 1.0);
  part(1.06, 1.05, .56, 0x3a86ff, 0, 1.52, 0);
  const armL = part(.42, 1.0, .46, 0xffd23f, -.76, 1.5, 0, 2.0), armR = part(.42, 1.0, .46, 0xffd23f, .76, 1.5, 0, 2.0);
  const head = part(.78, .74, .74, 0xffd23f, 0, 2.43, 0);
  [-.17, .17].forEach(x => { const e = new THREE.Mesh(new THREE.BoxGeometry(.11, .17, .02), mat(0x1d2340)); e.position.set(x, .06, .38); head.add(e); });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(.26, .05, .02), mat(0x1d2340)); mouth.position.set(0, -.16, .38); head.add(mouth);
  S.add(g);
  P = { g, legL, legR, armL, armR, pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: false, ground: null, phase: 0, yaw: 0, cp: null, coins: 0 };
}

/* ---------------- course ---------------- */
function clearCourse() { while (root.children.length) { const o = root.children.pop(); o.traverse?.(x => { x.geometry?.dispose?.(); }); } }
function plat(x, top, z, w, d, color, mover) {
  const m = block(w, 1, d, color); m.position.set(x, top - .5, z); root.add(m);
  const p = { m, x, top, z, hw: w / 2, hd: d / 2, mover, dx: 0 }; K.plats.push(p); if (mover) K.movers.push(p); return p;
}
function island(x, top, z, w, d, grass = 0x7bd389) {
  const m = block(w, 2.2, d, 0x8b5a2b, grass); m.position.set(x, top - 1.1, z); root.add(m);
  const p = { m, x, top, z, hw: w / 2, hd: d / 2, island: true, dx: 0 }; K.plats.push(p); return p;
}
function coin(x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .12, 20), mat(0xffd23f, { emissive: 0x6b4d00 }));
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; root.add(m); K.coins.push({ m, x, y, z, got: false });
}
function button(i, x, top, z) {
  const g = new THREE.Group(); g.position.set(x, top, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, .35, 32), mat(0x5d6488)); base.position.y = .17; base.receiveShadow = true; base.castShadow = true; g.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .32, 32), mat(0xff4d5e, { emissive: 0x551018 })); cap.position.y = .5; cap.castShadow = true; g.add(cap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, .08, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .1; g.add(ring);
  const arrow = emojiSprite('⬇️', 1.3); arrow.position.y = 2.6; g.add(arrow);
  root.add(g); const b = { i, g, cap, ring, arrow, x, z, top, armed: true, done: false }; K.buttons.push(b); return b;
}
function gate(i, x, top, z, w) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, .35), new THREE.MeshLambertMaterial({ color: 0xff4d5e, emissive: 0x661020, transparent: true, opacity: .5 }));
  m.position.set(x, top + 2.1, z); root.add(m);
  const lock = emojiSprite('🔒', 1.6); lock.position.set(x, top + 2.4, z - .3); root.add(lock);
  const gt = { i, m, lock, z, x, hw: w / 2, top, open: false, t: 0 }; K.gates.push(gt); return gt;
}
function cloud(x, y, z) {
  const g = new THREE.Group(); const m = mat(0xffffff, { emissive: 0x666666 });
  const n = 3 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) { const s = 2 + Math.random() * 2.5; const b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s * .7, s), m); b.position.set(k * 2.2 - n, Math.random() * .8, Math.random() * 1.5); g.add(b); }
  g.position.set(x, y, z); root.add(g); K.clouds.push(g);
}
function labelFor(m, i, done) {
  const lines = [`LEVEL ${i + 1}  ${ICON[m.type] || ''}`, m.place + (done ? '  ✓' : '')];
  return textSprite(lines, { scale: 5, bg: done ? 'rgba(220,252,231,.96)' : 'rgba(255,255,255,.95)' });
}

function build(lesson, done) {
  const key = JSON.stringify(lesson.missions.map(m => [m.type, m.place])) + lesson.id;
  if (!R) init();
  if (key === builtKey && K) { K.lesson = lesson; syncDone(lesson, done, false); return; }
  builtKey = key; clearCourse();
  K = { plats: [], movers: [], coins: [], buttons: [], gates: [], clouds: [], labels: [], spawns: [], islands: [], lesson };
  const ms = lesson.missions; const hasRef = ms.length && ms[ms.length - 1].type === 'reflection'; const n = ms.length - (hasRef ? 1 : 0);
  K.n = n; K.hasRef = hasRef;
  let y = 0, zc = 0;
  island(0, y, 0, 11, 11, 0xcfd8e3);
  const st = textSprite(['START', 'Go to the red button!'], { scale: 4.2, small: 40 }); st.position.set(-4.3, 2.4, 3.5); root.add(st);
  K.start = new THREE.Vector3(0, 0, -2.5);
  let edge = 5.5;
  for (let i = 0; i < n; i++) {
    const k = 3 + Math.min(i, 2), ny = y + 1.6; let pz = edge - 1.2;
    for (let j = 0; j < k; j++) {
      pz += 4.4; const px = (j % 2 ? 2.4 : -2.4) * (i % 2 ? -1 : 1);
      const py = y + (ny - y) * (j + 1) / (k + 1);
      const mv = i >= 1 && j === Math.floor(k / 2) ? { amp: 2.4 + .2 * i, spd: .9 + .12 * i, ph: i } : null;
      plat(px, py, pz, 3.5, 3.5, COLORS[(i * 3 + j) % COLORS.length], mv);
      if (j % 2 === 0) coin(px, py + 1.4, pz);
    }
    zc = pz + 1.75 + 1.9 + 5.5; y = ny;
    const isl = island(0, y, zc, 11, 11, [0x7bd389, 0x9be0a5, 0x66e3c4, 0xa8e6a1][i % 4]); isl.idx = i; K.islands.push(isl);
    button(i, 0, y, zc);
    const lb = labelFor(ms[i], i, !!done[i]); lb.position.set(0, y + 6.4, zc + 5.4); root.add(lb); K.labels[i] = lb;
    gate(i, 0, y, zc + 5.4, 11);
    K.spawns[i] = new THREE.Vector3(0, y, zc - 3);
    edge = zc + 5.5;
  }
  // portal section
  let pz = edge - 1.2; const ny = y + 1.2;
  for (let j = 0; j < 3; j++) { pz += 4.4; const px = (j % 2 ? 2.2 : -2.2); const py = y + (ny - y) * (j + 1) / 4; plat(px, py, pz, 3.6, 3.6, COLORS[(j + 4) % 8]); coin(px, py + 1.4, pz); }
  const pc = pz + 1.8 + 1.9 + 6; y = ny;
  const pis = island(0, y, pc, 12, 12, 0xd9c2ff); pis.portal = true;
  const pg = new THREE.Group(); pg.position.set(0, y + 3, pc + 2.5);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(2.4, .42, 16, 48), mat(0x9b5de5, { emissive: 0x3c096c })); torus.castShadow = true; pg.add(torus);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: .75, side: THREE.DoubleSide })); pg.add(disc);
  root.add(pg);
  const plb = textSprite([hasRef ? ms[n].place : 'PORTAL', 'FINAL'], { scale: 5.6, bg: 'rgba(243,232,255,.96)' }); plb.position.set(0, y + 6.8, pc + 2.5); root.add(plb);
  K.portal = { g: pg, torus, disc, x: 0, z: pc + 2.5, top: y, armed: true };
  K.portalSpawn = new THREE.Vector3(0, y, pc - 3);
  for (let k = 0; k < 16; k++) cloud((Math.random() - .5) * 90, 8 + Math.random() * 18, -20 + Math.random() * (pc + 40));
  syncDone(lesson, done, true);
  // spawn at furthest completed checkpoint
  let sp = K.start; for (let i = 0; i < n; i++) if (done[i]) sp = K.spawns[i];
  P.cp = sp.clone(); respawn(false);
}
function syncDone(lesson, done, instant) {
  for (let i = 0; i < K.n; i++) if (done[i]) markDone(i, instant !== false);
}
function markDone(i, instant) {
  if (!K) return; const b = K.buttons[i]; const g = K.gates.find(g => g.i === i);
  if (b && !b.done) { b.done = true; b.cap.material = mat(0x2ecc71, { emissive: 0x0d4d26 }); b.arrow.visible = false;
    const lb = labelFor(K.lesson.missions[i], i, true); lb.position.copy(K.labels[i].position); root.remove(K.labels[i]); root.add(lb); K.labels[i] = lb; }
  if (g && !g.open) { g.open = true; g.t = instant ? 1 : 0; g.lock.visible = false; if (instant) g.m.visible = false; }
}
function respawn(sound = true) {
  P.pos.copy(P.cp); P.pos.y += .05; P.vel.set(0, 0, 0); P.onGround = false; P.ground = null; P.yaw = 0;
  C.position.set(P.pos.x, P.pos.y + 6, P.pos.z - 10); if (sound) W.onFall && W.onFall();
}

/* ---------------- controls (touch joystick + jump) ---------------- */
function makeControls() {
  const css = document.createElement('style'); css.textContent = `
  #ctrl{position:fixed;inset:auto 0 0 0;height:0;z-index:20;pointer-events:none;display:none}
  #joy{position:fixed;left:28px;bottom:28px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.35);border:5px solid rgba(255,255,255,.8);pointer-events:auto;touch-action:none;box-shadow:0 6px 0 rgba(0,0,0,.15)}
  #knob{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:#fff;box-shadow:0 5px 0 rgba(0,0,0,.2)}
  #jumpBtn{position:fixed;right:34px;bottom:40px;width:140px;height:140px;border-radius:50%;background:#ffd23f;border:0;font:700 26px Fredoka,system-ui;color:#1d2340;box-shadow:0 8px 0 #c79a00;pointer-events:auto;touch-action:none}
  #jumpBtn:active,#jumpBtn.on{transform:translateY(5px);box-shadow:0 3px 0 #c79a00}
  #jumpBtn span{display:block;font-size:44px;line-height:1}`;
  document.head.appendChild(css);
  ctrl = document.createElement('div'); ctrl.id = 'ctrl';
  ctrl.innerHTML = `<div id="joy"><div id="knob"></div></div><button id="jumpBtn"><span>⤒</span>JUMP</button>`;
  document.body.appendChild(ctrl);
  const jz = ctrl.querySelector('#joy'), kn = ctrl.querySelector('#knob'); let pid = null;
  const setK = (e) => { const r = jz.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const R0 = r.width / 2 - 20, l = Math.hypot(dx, dy); if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    kn.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / R0; joy.y = dy / R0; };
  jz.addEventListener('pointerdown', e => { pid = e.pointerId; jz.setPointerCapture(pid); setK(e); });
  jz.addEventListener('pointermove', e => { if (e.pointerId === pid) setK(e); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; joy.x = joy.y = 0; kn.style.transform = ''; };
  jz.addEventListener('pointerup', end); jz.addEventListener('pointercancel', end);
  const jb = ctrl.querySelector('#jumpBtn');
  jb.addEventListener('pointerdown', e => { e.preventDefault(); jumpReq = true; jb.classList.add('on'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => jb.addEventListener(t, () => jb.classList.remove('on')));
}

/* ---------------- simulation ---------------- */
function step(dt, t) {
  K.t = t;
  // movers
  for (const p of K.movers) { const nx = p.mover.amp * Math.sin(t * p.mover.spd + p.mover.ph) + (p.baseX ??= p.x); p.dx = nx - p.x; p.x = nx; p.m.position.x = nx; }
  // gates
  for (const g of K.gates) if (g.open && g.t < 1) { g.t = Math.min(1, g.t + dt * 1.6); g.m.scale.y = 1 - g.t; g.m.position.y = g.top + 2.1 * (1 - g.t); if (g.t >= 1) g.m.visible = false; }
  // coins, buttons, portal, clouds anim
  for (const c of K.coins) if (!c.got) { c.m.rotation.z = t * 3; c.m.position.y = c.y + Math.sin(t * 2 + c.z) * .15; }
  for (const b of K.buttons) { const s = 1 + .08 * Math.sin(t * 4); b.ring.scale.set(s, s, s); b.ring.material.opacity = b.done ? .25 : .5 + .4 * Math.sin(t * 4); b.arrow.position.y = 2.6 + Math.sin(t * 3) * .25; }
  K.portal.torus.rotation.z = t * .8; K.portal.disc.material.color.setHSL(.75 + .08 * Math.sin(t * 2), .9, .7);
  for (const cl of K.clouds) { cl.position.x += dt * .6; if (cl.position.x > 50) cl.position.x = -50; }
  lavaTex.offset.x = (t * .05) % 1;
  if (paused) { P.vel.x = P.vel.z = 0; animatePlayer(dt, 0); return; }

  // input
  let ix = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + joy.x;
  let iz = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0) - joy.y;
  if (AUTO) { const a = autoInput(); ix = a.x; iz = a.z; if (a.jump) jumpReq = true; }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const tvx = -ix * SPEED, tvz = iz * SPEED, acc = P.onGround ? 14 : 6;
  P.vel.x += (tvx - P.vel.x) * Math.min(1, acc * dt); P.vel.z += (tvz - P.vel.z) * Math.min(1, acc * dt);
  if (jumpReq && P.onGround) { P.vel.y = JUMP_V; P.onGround = false; W.sfx('jump'); }
  jumpReq = false;
  P.vel.y -= GRAV * dt;
  // carry by moving platform
  if (P.onGround && P.ground && P.ground.mover) P.pos.x += P.ground.dx;
  const oy = P.pos.y;
  let nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt, ny = oy + P.vel.y * dt;
  // closed gates are walls
  for (const g of K.gates) if (!g.open && Math.abs(nx - g.x) < g.hw + .5 && ny < g.top + 4) {
    if (P.pos.z <= g.z - .55 && nz > g.z - .55) { nz = g.z - .55; P.vel.z = 0; }
  }
  // landing
  let land = null;
  for (const p of K.plats) {
    if (Math.abs(nx - p.x) <= p.hw + .25 && Math.abs(nz - p.z) <= p.hd + .25 && oy >= p.top - .05 && ny <= p.top + .001) {
      if (!land || p.top > land.top) land = p;
    }
  }
  if (land) { ny = land.top; P.vel.y = 0; P.onGround = true; P.ground = land;
    if (land.island && land.idx !== undefined && K.spawns[land.idx] && !P.cp.equals(K.spawns[land.idx])) P.cp = K.spawns[land.idx].clone();
    if (land.portal) P.cp = K.portalSpawn.clone();
  } else { P.onGround = false; P.ground = null; }
  P.pos.set(nx, ny, nz);
  if (P.pos.y < FALL_Y) { respawn(true); return; }

  // coins
  for (const c of K.coins) if (!c.got && P.pos.distanceTo(new THREE.Vector3(c.x, c.m.position.y - 1, c.z)) < 1.4) { c.got = true; c.m.visible = false; P.coins++; W.onCoin && W.onCoin(P.coins); }
  // buttons
  for (const b of K.buttons) {
    const d = Math.hypot(P.pos.x - b.x, P.pos.z - b.z);
    if (!b.done && d < 1.4 && Math.abs(P.pos.y - b.top) < .8) { if (b.armed) { b.armed = false; b.cap.position.y = .38; _onB(); W.sfx('click'); W.onButton && W.onButton(b.i); } }
    else if (d > 2.4) { b.armed = true; b.cap.position.y = .5; }
  }
  // portal
  const pd = Math.hypot(P.pos.x - K.portal.x, P.pos.z - (K.portal.z - .8));
  if (pd < 2.2 && Math.abs(P.pos.y - K.portal.top) < 1) { if (K.portal.armed) { K.portal.armed = false; _onB(); W.onPortal && W.onPortal(); } }
  else if (pd > 3.5) K.portal.armed = true;

  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (hs > .5) { const ty = Math.atan2(P.vel.x, P.vel.z); let d = ty - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw += d * Math.min(1, 12 * dt); }
  animatePlayer(dt, hs);
}
/* autopilot (used for demo recordings): walks to a mission button or the portal */
let AUTO = null;
function autoInput() {
  const gi = P.ground ? K.plats.indexOf(P.ground) : -1;
  let tx, tz, ti = -1;
  const goalIdx = AUTO.goal === 'portal' ? K.plats.findIndex(p => p.portal) : K.plats.findIndex(p => p.idx === AUTO.goal);
  if (gi >= 0 && gi >= goalIdx) { // on goal island: walk onto the button / into the portal
    if (AUTO.goal === 'portal') { tx = K.portal.x; tz = K.portal.z - .8; } else { const b = K.buttons[AUTO.goal]; tx = b.x; tz = b.z; }
  } else {
    ti = gi >= 0 ? gi + 1 : AUTO.last + 1; AUTO.last = Math.max(AUTO.last, gi);
    const p = K.plats[Math.min(ti, goalIdx)]; tx = p.x; tz = p.z;
  }
  const dx = tx - P.pos.x, dz = tz - P.pos.z, d = Math.hypot(dx, dz) || 1;
  let jump = false, sp = ti < 0 && d < 1.2 ? d / 1.2 : 1, sx = dx, sz = dz;
  if (ti >= 0 && P.onGround) { const p = K.plats[Math.min(ti, goalIdx)];
    const ex = Math.max(Math.abs(dx) - p.hw, 0), ez = Math.max(Math.abs(dz) - p.hd, 0);
    if (p.mover && P.ground) {           // moving target: go straight to our edge, jump when it is in front
      sx = P.ground.x - P.pos.x;
      const bx = p.baseX ?? p.x, best = Math.max(0, Math.abs(P.pos.x - bx) - p.mover.amp);
      const T = Math.abs(dz) / SPEED, fx = bx + p.mover.amp * Math.sin((K.t + T) * p.mover.spd + p.mover.ph);
      const fdx = fx - P.pos.x, fd = Math.hypot(fdx, dz) || 1;
      if (ez < 2.3) { if (Math.abs(fdx) < best + .6) { jump = true; P.vel.x = fdx / fd * SPEED; P.vel.z = dz / fd * SPEED; } else sp = 0; }
    } else if (Math.hypot(ex, ez) < 2.3) { jump = true; P.vel.x = dx / d * SPEED; P.vel.z = dz / d * SPEED; }
  }
  if (ti >= 0 && !P.onGround) { const p = K.plats[Math.min(ti, goalIdx)];
    if (p.mover) { const bx = p.baseX ?? p.x; sx = bx + p.mover.amp * Math.sin((K.t + .2) * p.mover.spd + p.mover.ph) - P.pos.x; } }
  const sd = Math.hypot(sx, sz) || 1;
  const x = -sx / sd * sp, z = sz / sd * sp;
  const kn = document.getElementById('knob'); if (kn) kn.style.transform = `translate(${(-x * 55).toFixed(0)}px,${(-z * 55).toFixed(0)}px)`;
  return { x, z, jump };
}
function animatePlayer(dt, hs) {
  P.g.position.copy(P.pos); P.g.rotation.y = P.yaw;
  if (P.onGround) { P.phase += dt * hs * 1.5; const a = Math.sin(P.phase) * .75 * Math.min(1, hs / 5);
    P.legL.rotation.x = a; P.legR.rotation.x = -a; P.armL.rotation.x = -a; P.armR.rotation.x = a; }
  else { P.legL.rotation.x = .5; P.legR.rotation.x = -.3; P.armL.rotation.x = -2.6; P.armR.rotation.x = -2.6; }
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - last) / 1000 || 0); last = now; const t = now / 1000;
  if (K) { const n = Math.max(1, Math.ceil(dt * 60)); for (let k = n - 1; k >= 0; k--) step(dt / n, t - k * dt / n); }
  // camera follow
  const tgt = P.pos.clone(); tgt.y += 1.6;
  const want = new THREE.Vector3(tgt.x * .7, tgt.y + 5.2, tgt.z - 9.5);
  C.position.lerp(want, Math.min(1, dt * 5)); C.lookAt(tgt.x * .85, tgt.y, tgt.z + 4);
  sun.position.set(P.pos.x + 10, P.pos.y + 18, P.pos.z - 6); sun.target.position.copy(P.pos);
  if (K) for (const lb of K.labels) if (lb) { const d = C.position.distanceTo(lb.position); lb.material.opacity = Math.min(1, Math.max(0, (d - 5) / 5)); lb.visible = d > 5; }
  R.render(S, C);
}

/* ---------------- API ---------------- */
W.build = (lesson, done) => build(lesson, done || {});
W.show = () => { if (!R) init(); host.style.display = 'block'; visible = true; resize(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } W.pause(false); };
W.hide = () => { if (!host) return; host.style.display = 'none'; visible = false; cancelAnimationFrame(raf); raf = 0; ctrl && (ctrl.style.display = 'none'); };
W.pause = (b) => { paused = b; for (const k in keys) keys[k] = false; joy.x = joy.y = 0; if (ctrl) ctrl.style.display = visible && !b ? 'block' : 'none'; };
W.markDone = (i) => markDone(i, false);
W.respawn = () => respawn(false);
W.coins = () => P ? P.coins : 0;
W._dbg = () => ({ pos: P.pos.toArray().map(v => +v.toFixed(2)), onGround: P.onGround, cp: P.cp.toArray(), btn: K.buttons.map(b => [b.x, b.top, b.z]), plats: K.plats.map(p => [+p.x.toFixed(2), p.top, p.z, p.hw]), ground: P.ground ? K.plats.indexOf(P.ground) : -1, portal: [K.portal.x, K.portal.top, K.portal.z] });
W._tp = (x, y, z) => { P.pos.set(x, y, z); P.vel.set(0, 0, 0); };
W._autoTo = (goal) => { AUTO = { goal, last: P.ground ? K.plats.indexOf(P.ground) : 0 }; };
const _onB = () => { if (AUTO) { AUTO = null; const kn = document.getElementById('knob'); if (kn) kn.style.transform = ''; } };
let simT = 0;
W._sim = (sec, plan, dt = 1 / 60) => { // plan: [[t0,t1,{x,y,jump}]...] for tests without rAF
  const n = Math.round(sec / dt);
  for (let k = 0; k < n; k++) { const t = k * dt; joy.x = 0; joy.y = 0;
    for (const [a, b, inp] of plan || []) if (t >= a && t < b) { joy.x = inp.x || 0; joy.y = inp.y || 0; if (inp.jump) jumpReq = true; }
    step(dt, simT += dt); }
  joy.x = joy.y = 0; frame(performance.now()); cancelAnimationFrame(raf); raf = 0; return W._dbg();
};
window.World3D = W;
window.dispatchEvent(new Event('world3d-ready'));
