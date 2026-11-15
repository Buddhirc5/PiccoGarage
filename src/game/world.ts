import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityDef } from './data';
import { HEIGHT, buildSprites, type SpriteName, type SpriteSpot } from './sprites';

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
function asphalt(photo: HTMLImageElement): THREE.CanvasTexture {
  const t = canvasTex(512, 1024, (c) => {
    c.drawImage(photo, 0, 0, 512, 512); c.save(); c.translate(0, 1024); c.scale(1, -1); c.drawImage(photo, 0, 0, 512, 512); c.restore();
    c.fillStyle = 'rgba(0,0,0,0.10)'; for (const x of [95, 170, 342, 417]) c.fillRect(x - 24, 0, 48, 1024); // tyre wear
    c.fillStyle = 'rgba(236,232,220,0.92)'; c.fillRect(14, 0, 9, 1024); c.fillRect(489, 0, 9, 1024); // edge lines
    c.fillRect(251, 0, 10, 330); c.fillRect(251, 512, 10, 330); // centre dashes
  });
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
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
  const groundName = city.id === 'anuradhapura' ? 'earth' : 'grass';
  const [facades, skyMap, propsMap, groundMap, paversMap, asphaltImg] = await Promise.all([
    tl.loadAsync('/assets/tex/facades.webp'), tl.loadAsync('/assets/tex/sky.webp'), tl.loadAsync('/assets/tex/props.webp'),
    tl.loadAsync(`/assets/tex/g_${groundName}.webp`), tl.loadAsync('/assets/tex/g_pavers.webp'),
    new THREE.ImageLoader().loadAsync('/assets/tex/g_asphalt.webp')]);
  for (const t of [propsMap, groundMap, paversMap]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; keep(t); }
  groundMap.wrapS = groundMap.wrapT = THREE.MirroredRepeatWrapping; groundMap.repeat.set(220, 220);
  paversMap.wrapS = paversMap.wrapT = THREE.RepeatWrapping;
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
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(2400, 2400)), keep(new THREE.MeshStandardMaterial({ map: groundMap, color: city.id === 'anuradhapura' ? 0xc8b8a0 : 0xb5bf9a, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.03, cz); ground.receiveShadow = true;
  g.add(ground);
  const roadMat = keep(new THREE.MeshStandardMaterial({ map: keep(asphalt(asphaltImg)), roughness: 0.82, metalness: 0.05 }));
  const road = new THREE.Mesh(keep(ribbon(tr, ROAD_HALF, 0.02, -ROAD_HALF, 0.02, 17.6)), roadMat);
  road.receiveShadow = true; g.add(road);
  const paveMat = keep(new THREE.MeshStandardMaterial({ map: paversMap, roughness: 0.95 }));
  const kerbMat = keep(new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 }));
  for (const s of [1, -1]) {
    const a = s * ROAD_HALF, b = s * (ROAD_HALF + WALK);
    const walk = new THREE.Mesh(keep(s > 0 ? ribbon(tr, b, 0.17, a, 0.17, WALK) : ribbon(tr, a, 0.17, b, 0.17, WALK)), paveMat);
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
          if (f === 2 || f === 3) uv.setXY(q, u0 + 0.012, v0 + 0.47); // roof and floor: plain wall colour
          else uv.setXY(q, u0 + 0.003 + u * 0.244, v0 + 0.004 + v * 0.492); // every wall gets a real facade
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

  // ── trees and roadside props: realistic photo sprites ──
  const spots: SpriteSpot[] = [];
  const at = (i: number, side: number, lat: number, name: SpriteName) => {
    const p = tr.pos[i].clone().addScaledVector(tr.left[i], side * lat);
    const [lo, hi] = HEIGHT[name];
    spots.push({ name, x: p.x, z: p.z, h: lo + R() * (hi - lo), flip: R() < 0.5 });
  };
  const treeName = (): SpriteName => {
    if (R() < city.palms) return R() < 0.5 ? 'palm' : 'palm2';
    const r = R(); return r < 0.3 ? 'raintree' : r < 0.55 ? 'mango' : r < 0.8 ? 'jak' : 'banana';
  };
  for (const f of free) {
    if (R() < city.trees) at(f.i, f.side, ROAD_HALF + WALK + 2 + R() * 5, treeName());
    if (R() < 0.35) at(f.i, f.side, ROAD_HALF + WALK + 0.9, R() < 0.5 ? 'hedge' : 'banana');
  }
  const far = Math.round(320 * city.trees);
  for (let k = 0; k < far; k++) at(Math.floor(R() * tr.n), R() < 0.5 ? 1 : -1, 22 + R() * 110, treeName());
  for (let i = 0; i < tr.n; i += 9) if (R() < city.trees * 0.5) at(i, R() < 0.5 ? 1 : -1, ROAD_HALF + WALK - 0.6, treeName());
  for (let i = 4, k = 0; i < tr.n; i += 16, k++) at(i, k % 2 ? 1 : -1, ROAD_HALF + 0.45, 'pole');
  const extras: SpriteName[] = ['halt', 'stall', 'bike', 'sign', 'stall', 'bike'];
  for (let i = 12, k = 0; i < tr.n; i += 22 + Math.floor(R() * 14), k++) at(i, R() < 0.6 ? 1 : -1, ROAD_HALF + WALK * 0.55, extras[k % extras.length]);
  const sprites = buildSprites(spots, propsMap, new THREE.Color(city.sky.fog));
  keep(sprites); g.add(sprites.group);

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
