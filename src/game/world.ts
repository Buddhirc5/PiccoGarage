import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityDef } from './data';

/**
 * City builder. Every city is a closed road loop (drive on the left) with
 * pavements, photo-textured buildings, trees, lamp posts and a landmark.
 * Static geometry is merged / instanced to keep draw calls low on phones.
 */
export const ROAD_HALF = 4.4;
export const LANE = 2.2;         // lane centre offset from the middle line
export const WALK = 2.6;         // pavement width
export const LIMIT = ROAD_HALF + WALK - 0.3; // how far a vehicle can stray

export interface Track {
  n: number; step: number; length: number;
  pos: THREE.Vector3[]; tan: THREE.Vector3[]; left: THREE.Vector3[];
  /** Nearest sample to p, searching around a hint index. */
  nearest(p: THREE.Vector3, hint: number): { i: number; lat: number };
  /** World position at distance s along the loop, shifted lat metres to the left. */
  at(s: number, lat: number, out?: THREE.Vector3): THREE.Vector3;
  heading(s: number): number;
}

export interface World { group: THREE.Group; track: Track; sun: THREE.DirectionalLight; dispose(): void }

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makeTrack(loop: [number, number][]): Track {
  const curve = new THREE.CatmullRomCurve3(loop.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
  const length = curve.getLength();
  const n = Math.round(length / 2);
  const step = length / n;
  const pos = curve.getSpacedPoints(n).slice(0, n);
  const tan: THREE.Vector3[] = [], left: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = pos[(i + 1) % n].clone().sub(pos[(i - 1 + n) % n]).normalize();
    tan.push(t);
    left.push(new THREE.Vector3(t.z, 0, -t.x)); // left of travel (y up)
  }
  const tmp = new THREE.Vector3();
  return {
    n, step, length, pos, tan, left,
    nearest(p, hint) {
      let best = hint, bd = Infinity;
      for (let k = -30; k <= 30; k++) {
        const i = ((hint + k) % n + n) % n;
        const d = tmp.copy(p).sub(pos[i]).lengthSq();
        if (d < bd) { bd = d; best = i; }
      }
      return { i: best, lat: tmp.copy(p).sub(pos[best]).dot(left[best]) };
    },
    at(s, lat, out = new THREE.Vector3()) {
      const f = (((s % length) + length) % length) / step;
      const i = Math.floor(f) % n, j = (i + 1) % n, a = f - Math.floor(f);
      out.copy(pos[i]).lerp(pos[j], a);
      return out.addScaledVector(tmp.copy(left[i]).lerp(left[j], a), lat);
    },
    heading(s) {
      const i = Math.floor(((((s % length) + length) % length) / step)) % n;
      return Math.atan2(tan[i].x, tan[i].z);
    },
  };
}

// ── textures ────────────────────────────────────────────────────────────────
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) {
  for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
}
function asphalt(): THREE.CanvasTexture {
  const t = canvasTex(512, 512, (c) => {
    c.fillStyle = '#34363a'; c.fillRect(0, 0, 512, 512);
    speckle(c, 512, 512, 14000, 0.16);
    c.fillStyle = 'rgba(0,0,0,0.12)'; for (const x of [95, 170, 342, 417]) c.fillRect(x - 22, 0, 44, 512); // tyre wear
    c.strokeStyle = 'rgba(20,20,22,0.6)'; c.lineWidth = 1.5; // cracks
    for (let i = 0; i < 9; i++) { let x = Math.random() * 512, y = Math.random() * 512; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += Math.random() * 40; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = '#e8e4d6'; c.fillRect(14, 0, 9, 512); c.fillRect(489, 0, 9, 512); // edge lines
    c.fillRect(251, 0, 10, 250); // centre dash
  });
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
const paving = () => canvasTex(128, 128, (c) => {
  c.fillStyle = '#8f8a82'; c.fillRect(0, 0, 128, 128); speckle(c, 128, 128, 1500, 0.14);
  c.strokeStyle = 'rgba(40,38,34,0.5)'; c.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 128); c.moveTo(0, i); c.lineTo(128, i); c.stroke(); }
});
const groundTex = (hex: string) => canvasTex(256, 256, (c) => {
  c.fillStyle = hex; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${Math.random() < 0.6 ? '0,0,0' : '255,255,210'},${Math.random() * 0.2})`; c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 5); }
  for (let i = 0; i < 26; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 14 + Math.random() * 30, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${Math.random() < 0.5 ? '40,30,10' : '0,0,0'},0.22)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
}, [90, 90]);
const glassTex = () => canvasTex(128, 256, (c) => {
  c.fillStyle = '#2b3642'; c.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 16) for (let x = 4; x < 128; x += 16) {
    const l = 40 + Math.random() * 50; c.fillStyle = `hsl(${205 + Math.random() * 15},${25 + Math.random() * 20}%,${l}%)`; c.fillRect(x, y, 12, 11);
  }
}, [1, 1]);

/** A strip following the road between two lateral offsets (may be at different heights). */
function ribbon(tr: Track, latA: number, yA: number, latB: number, yB: number, vScale: number): THREE.BufferGeometry {
  const p: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= tr.n; i++) {
    const k = i % tr.n, c = tr.pos[k], l = tr.left[k];
    p.push(c.x + l.x * latA, yA, c.z + l.z * latA, c.x + l.x * latB, yB, c.z + l.z * latB);
    uv.push(0, (i * tr.step) / vScale, 1, (i * tr.step) / vScale);
    if (i < tr.n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function basis(tr: Track, i: number, side: number, lat: number, y = 0): THREE.Matrix4 {
  // local +x along the road, local -z faces the road, for a box on the given side
  const t = tr.tan[i], l = tr.left[i];
  const X = t.clone().multiplyScalar(-side), Z = l.clone().multiplyScalar(side), Y = new THREE.Vector3(0, 1, 0);
  const p = tr.pos[i].clone().addScaledVector(l, side * lat); p.y = y;
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
}

export async function buildWorld(city: CityDef): Promise<World> {
  const R = rng(city.id.length * 7919 + city.loop.length * 31 + city.id.charCodeAt(0));
  const tr = makeTrack(city.loop);
  const g = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const tl = new THREE.TextureLoader();
  const [facades, skyMap] = await Promise.all([tl.loadAsync('/assets/tex/facades.webp'), tl.loadAsync('/assets/tex/sky.webp')]);
  facades.colorSpace = skyMap.colorSpace = THREE.SRGBColorSpace; facades.anisotropy = 8;
  keep(facades); keep(skyMap);

  const cx = tr.pos.reduce((a, p) => a + p.x, 0) / tr.n, cz = tr.pos.reduce((a, p) => a + p.z, 0) / tr.n;

  // ── sky, light, fog ──
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(900, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    keep(new THREE.MeshBasicMaterial({ map: skyMap, color: city.sky.tint, side: THREE.BackSide, fog: false, depthWrite: false })));
  sky.position.set(cx, -20, cz); sky.renderOrder = -1;
  g.add(sky);
  g.add(new THREE.HemisphereLight(0xdfeaff, 0x6b6250, 1.15));
  const sun = new THREE.DirectionalLight(city.sky.sun, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006;
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 220;
  sun.userData.offset = new THREE.Vector3(-60, city.sky.sunY, 40);
  g.add(sun, sun.target);

  // ── ground + road + pavements ──
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(2400, 2400)), keep(new THREE.MeshStandardMaterial({ map: keep(groundTex(city.ground)), color: 0x9a9a9a, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.03, cz); ground.receiveShadow = true;
  g.add(ground);
  const roadMat = keep(new THREE.MeshStandardMaterial({ map: keep(asphalt()), roughness: 0.82, metalness: 0.05 }));
  const road = new THREE.Mesh(keep(ribbon(tr, ROAD_HALF, 0.02, -ROAD_HALF, 0.02, 10)), roadMat);
  road.receiveShadow = true; g.add(road);
  const pave = keep(paving()); pave.wrapS = pave.wrapT = THREE.RepeatWrapping; pave.repeat.set(2, 1);
  const paveMat = keep(new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95 }));
  const kerbMat = keep(new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 }));
  for (const s of [1, -1]) {
    const a = s * ROAD_HALF, b = s * (ROAD_HALF + WALK);
    const walk = new THREE.Mesh(keep(s > 0 ? ribbon(tr, b, 0.17, a, 0.17, 1.5) : ribbon(tr, a, 0.17, b, 0.17, 1.5)), paveMat);
    walk.receiveShadow = true;
    const kerb = new THREE.Mesh(keep(s > 0 ? ribbon(tr, a, 0.17, a, 0.0, 3) : ribbon(tr, a, 0.0, a, 0.17, 3)), kerbMat);
    g.add(walk, kerb);
  }

  // ── buildings along the road ──
  const geos: THREE.BufferGeometry[] = [];
  const flyAt = city.landmark === 'flyover' ? Math.floor(tr.n * 0.3) : -999;
  const free: { i: number; side: number }[] = []; // gaps for trees
  for (const side of [1, -1]) {
    let i = Math.floor(R() * 6);
    while (i < tr.n - 6) {
      const seaSide = city.sea && side === -1 && tr.pos[i].z < cz - 40;
      const nearFly = Math.abs(i - flyAt) < 12;
      if (!seaSide && !nearFly && R() < city.density) {
        const tile = Math.floor(R() * 8);
        const h = 8.5 + R() * 2.5, w = h * 1.16, d = 9 + R() * 4;
        const box = new THREE.BoxGeometry(w, h, d);
        const uv = box.attributes.uv as THREE.BufferAttribute;
        const u0 = (tile % 4) * 0.25, v0 = 1 - (Math.floor(tile / 4) + 1) * 0.5;
        for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
          const q = f * 4 + k, u = uv.getX(q), v = uv.getY(q);
          if (f === 5) uv.setXY(q, u0 + 0.003 + u * 0.244, v0 + 0.004 + v * 0.492);
          else uv.setXY(q, u0 + 0.012, v0 + 0.47); // side walls and roof: one plain wall colour
        }
        const span = Math.max(1, Math.round(w / tr.step));
        box.applyMatrix4(basis(tr, Math.min(tr.n - 1, i + (span >> 1)), side, ROAD_HALF + WALK + 0.4 + d / 2, h / 2));
        geos.push(box);
        i += span + (R() < 0.3 ? 1 + Math.floor(R() * 3) : 0);
      } else {
        if (!nearFly) free.push({ i, side });
        i += 3 + Math.floor(R() * 4);
      }
    }
  }
  if (geos.length) {
    const b = new THREE.Mesh(keep(mergeGeometries(geos)), keep(new THREE.MeshStandardMaterial({ map: facades, roughness: 0.9 })));
    b.castShadow = b.receiveShadow = true; g.add(b);
    geos.forEach((x) => x.dispose());
  }

  // ── background towers ──
  if (city.towers) {
    const tg: THREE.BufferGeometry[] = [];
    for (let k = 0; k < city.towers; k++) {
      const i = Math.floor(R() * tr.n), side = R() < 0.5 ? 1 : -1;
      const w = 18 + R() * 16, h = 35 + R() * 95, d = 18 + R() * 14;
      const box = new THREE.BoxGeometry(w, h, d);
      const uv = box.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * Math.round(w / 6), uv.getY(q) * Math.round(h / 12));
      box.applyMatrix4(basis(tr, i, side, 34 + R() * 70, h / 2));
      tg.push(box);
    }
    const gt = keep(glassTex()); gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    g.add(new THREE.Mesh(keep(mergeGeometries(tg)), keep(new THREE.MeshStandardMaterial({ map: gt, roughness: 0.25, metalness: 0.6 }))));
    tg.forEach((x) => x.dispose());
  }

  // ── trees ──
  const palmM: THREE.Matrix4[] = [], leafM: THREE.Matrix4[] = [];
  const place = (i: number, side: number, lat: number) => {
    const p = tr.pos[i].clone().addScaledVector(tr.left[i], side * lat);
    const s = 0.8 + R() * 0.6;
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12)), new THREE.Vector3(s, s, s));
    (R() < city.palms ? palmM : leafM).push(m);
  };
  for (const f of free) if (R() < city.trees) place(f.i, f.side, ROAD_HALF + WALK + 2 + R() * 6);
  const far = Math.round(260 * city.trees);
  for (let k = 0; k < far; k++) place(Math.floor(R() * tr.n), R() < 0.5 ? 1 : -1, 24 + R() * 90);
  for (let i = 0; i < tr.n; i += 9) if (R() < city.trees * 0.5) place(i, R() < 0.5 ? 1 : -1, ROAD_HALF + WALK - 0.7);
  g.add(...instancedTrees(palmM, leafM, keep));

  // ── lamp posts ──
  const lampGeo = keep(mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.11, 8, 6).translate(0, 4, 0),
    new THREE.BoxGeometry(0.12, 0.1, 2.2).translate(0, 7.9, -1.0),
    new THREE.BoxGeometry(0.34, 0.12, 0.7).translate(0, 7.84, -2.0),
  ]));
  const lampIdx: number[] = []; for (let i = 4; i < tr.n; i += 18) lampIdx.push(i);
  const lamps = new THREE.InstancedMesh(lampGeo, keep(new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.6, metalness: 0.5 })), lampIdx.length);
  lampIdx.forEach((i, k) => lamps.setMatrixAt(k, basis(tr, i, k % 2 ? 1 : -1, ROAD_HALF + 0.5)));
  lamps.castShadow = true; g.add(lamps);

  // ── landmarks ──
  const white = keep(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.75 }));
  const stone = keep(new THREE.MeshStandardMaterial({ color: 0x5d5a52, roughness: 1 }));
  const concrete = keep(new THREE.MeshStandardMaterial({ color: 0xa9a8a3, roughness: 0.9 }));
  if (city.landmark === 'stupa') {
    for (const [dx, dz, r] of [[40, 30, 46], [-150, 120, 30]] as const) {
      const st = new THREE.Group();
      st.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 1.25, r * 1.3, 4, 40)), white).translateY(2));
      st.add(new THREE.Mesh(keep(new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)), white).translateY(4));
      st.add(new THREE.Mesh(keep(new THREE.BoxGeometry(r * 0.42, r * 0.26, r * 0.42)), white).translateY(4 + r + r * 0.1));
      st.add(new THREE.Mesh(keep(new THREE.ConeGeometry(r * 0.16, r * 0.8, 20)), white).translateY(4 + r + r * 0.62));
      st.position.set(cx + dx, 0, cz + dz);
      st.traverse((o) => { o.castShadow = true; });
      g.add(st);
    }
  }
  if (city.landmark === 'fort' || city.sea) {
    const minZ = Math.min(...tr.pos.map((p) => p.z));
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(3000, 1400)), keep(new THREE.MeshStandardMaterial({ color: 0x1f6f8f, roughness: 0.12, metalness: 0.5 })));
    sea.rotation.x = -Math.PI / 2; sea.position.set(cx, 0.0, minZ - 22 - 700); g.add(sea);
    const sand = new THREE.Mesh(keep(new THREE.PlaneGeometry(3000, 16)), keep(new THREE.MeshStandardMaterial({ color: 0xd8c59a, roughness: 1 })));
    sand.rotation.x = -Math.PI / 2; sand.position.set(cx, -0.01, minZ - 15); g.add(sand);
    // rampart + lighthouse on a headland
    const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(150, 9, 12)), stone); wall.position.set(cx + 120, 4.5, minZ - 46); wall.castShadow = true; g.add(wall);
    for (const dx of [-75, 75]) { const b = new THREE.Mesh(keep(new THREE.CylinderGeometry(9, 11, 11, 8)), stone); b.position.set(cx + 120 + dx, 5.5, minZ - 46); b.castShadow = true; g.add(b); }
    const lh = new THREE.Group();
    lh.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(2.4, 3.6, 24, 16)), white).translateY(12));
    lh.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(3.1, 3.1, 0.6, 16)), stone).translateY(24.3));
    lh.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(1.7, 1.7, 3, 12)), keep(new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd77a, emissiveIntensity: 1.2 }))).translateY(26));
    lh.add(new THREE.Mesh(keep(new THREE.ConeGeometry(2.2, 2.4, 12)), stone).translateY(28.6));
    lh.position.set(cx + 150, 9, minZ - 46); lh.traverse((o) => { o.castShadow = true; }); g.add(lh);
  }
  if (city.landmark === 'flyover') {
    const m = basis(tr, flyAt, 1, 0, 0);
    const fo = new THREE.Group();
    fo.add(new THREE.Mesh(keep(new THREE.BoxGeometry(13, 1.3, 420)), concrete).translateY(8.2));
    for (const x of [-6.3, 6.3]) fo.add(new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, 1.1, 420)), concrete).translateX(x).translateY(9.3));
    for (let z = -190; z <= 190; z += 38) if (Math.abs(z) > 10) fo.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.3, 7.6, 10)), concrete).translateZ(z).translateY(3.8));
    for (const z of [-9.5, 9.5]) fo.add(new THREE.Mesh(keep(new THREE.BoxGeometry(2.2, 7.6, 1.6)), concrete).translateZ(z).translateY(3.8));
    fo.applyMatrix4(m); fo.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); g.add(fo);
  }
  if (city.landmark === 'towers') {
    const t = new THREE.Group();
    const teal = keep(new THREE.MeshStandardMaterial({ color: 0x2f7f72, roughness: 0.5 }));
    t.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(3.2, 6, 150, 16)), teal).translateY(75));
    const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(13, 20, 14)), keep(new THREE.MeshStandardMaterial({ color: 0xa4407a, roughness: 0.35, metalness: 0.3 })));
    bulb.position.y = 158; bulb.scale.set(1, 1.25, 1); t.add(bulb);
    t.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 1.2, 40, 8)), teal).translateY(192));
    t.position.set(cx + 20, 0, cz + 10); g.add(t);
  }

  return {
    group: g, track: tr, sun,
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

function instancedTrees(palmM: THREE.Matrix4[], leafM: THREE.Matrix4[], keep: <T extends { dispose(): void }>(x: T) => T): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const bark = keep(new THREE.MeshStandardMaterial({ color: 0x6f5b45, roughness: 1 }));
  if (palmM.length) {
    const trunk = new THREE.CylinderGeometry(0.15, 0.24, 9, 7, 6).translate(0, 4.5, 0);
    const p = trunk.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.pow(p.getY(i) / 9, 2) * 1.0);
    trunk.computeVertexNormals();
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const f = new THREE.PlaneGeometry(1.0, 4.4, 2, 6).translate(0, 2.2, 0);
      const q = f.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < q.count; k++) { const y = q.getY(k), x = q.getX(k); q.setXYZ(k, x * (1 - y / 5.2), y * 0.9, -Math.pow(y / 4.4, 2) * (1.4 + (i % 3) * 0.5) - Math.abs(x) * 0.5); }
      f.rotateX(-Math.PI / (2.3 + (i % 2) * 0.5)); f.rotateY((i / 11) * Math.PI * 2);
      f.deleteAttribute('uv'); fronds.push(f.toNonIndexed());
    }
    const crown = mergeGeometries(fronds); crown.computeVertexNormals(); crown.translate(1.0, 9, 0);
    const leafMat = keep(new THREE.MeshStandardMaterial({ color: 0x3c6d25, roughness: 0.8, side: THREE.DoubleSide }));
    const a = new THREE.InstancedMesh(keep(trunk), bark, palmM.length), b = new THREE.InstancedMesh(keep(crown), leafMat, palmM.length);
    palmM.forEach((m, i) => { a.setMatrixAt(i, m); b.setMatrixAt(i, m); });
    a.castShadow = b.castShadow = true; out.push(a, b);
  }
  if (leafM.length) {
    const trunk = new THREE.CylinderGeometry(0.28, 0.45, 5, 7).translate(0, 2.5, 0);
    // dense, irregular canopy: many small noisy clumps, smooth shaded, dark natural greens
    const rr = rng(77);
    const blobs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 13; k++) {
      const r = 1.5 + rr() * 1.4, ang = rr() * 6.28, rad = rr() * 2.8;
      const sph = new THREE.SphereGeometry(r, 10, 8);
      const q = sph.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < q.count; i++) { const n = 1 + (Math.sin(q.getX(i) * 5.1 + k) * Math.cos(q.getZ(i) * 4.3) + Math.sin(q.getY(i) * 6.7)) * 0.13; q.setXYZ(i, q.getX(i) * n, q.getY(i) * n * 0.8, q.getZ(i) * n); }
      sph.translate(Math.cos(ang) * rad, 6.2 + rr() * 3.2, Math.sin(ang) * rad); sph.deleteAttribute('uv');
      blobs.push(sph);
    }
    const crown = mergeGeometries(blobs); crown.computeVertexNormals();
    const leafMat = keep(new THREE.MeshStandardMaterial({ color: 0x27401d, roughness: 1 }));
    const a = new THREE.InstancedMesh(keep(trunk), bark, leafM.length), b = new THREE.InstancedMesh(keep(crown), leafMat, leafM.length);
    leafM.forEach((m, i) => { a.setMatrixAt(i, m); b.setMatrixAt(i, m); });
    a.castShadow = b.castShadow = true; out.push(a, b);
  }
  return out;
}
