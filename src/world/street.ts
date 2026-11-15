import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHOPS, facadeAtlas, grassTexture, kerbTexture, pavementTexture, roadTexture, skyTexture } from './textures';

/**
 * A straight Colombo-style street segment: two-lane road (drive on the left),
 * raised pavements with painted kerbs, shop-houses with fictional signs,
 * coconut palms, power poles and a bus stop. Static parts are merged so the
 * whole street costs only a handful of draw calls.
 */
export const ROAD_HALF = 4;     // road is 8 m wide
export const PAVE_W = 3;        // pavement width
export const LANE_X = 2;        // centre of the left-hand lane for +z traffic

export interface Street {
  group: THREE.Group;
  length: number;
  busStopZ: number;
}

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildStreet(length = 240, seed = 7): Street {
  const R = rand(seed);
  const g = new THREE.Group();
  g.name = 'street';
  const half = length / 2;

  // ground
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(400, length + 200),
    new THREE.MeshStandardMaterial({ map: grassTexture(60), roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  g.add(grass);

  // road
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, length),
    new THREE.MeshStandardMaterial({ map: roadTexture(length / 12), roughness: 0.92 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  g.add(road);

  // pavements + kerbs
  const paveMat = new THREE.MeshStandardMaterial({ map: pavementTexture([PAVE_W / 1.5, length / 1.5]), roughness: 0.95 });
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTexture(length / 1.2), roughness: 0.8 });
  for (const side of [-1, 1]) {
    const pave = new THREE.Mesh(new THREE.BoxGeometry(PAVE_W, 0.15, length), paveMat);
    pave.position.set(side * (ROAD_HALF + PAVE_W / 2), 0.075, 0);
    pave.receiveShadow = true;
    const kerbGeo = new THREE.PlaneGeometry(length, 0.16);
    const kerb = new THREE.Mesh(kerbGeo, kerbMat);
    kerb.rotation.y = side * -Math.PI / 2;
    kerb.position.set(side * (ROAD_HALF + 0.001), 0.08, 0);
    g.add(pave, kerb);
  }

  // ── shop-houses (merged) ──
  const atlas = facadeAtlas();
  const buildingMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9 });
  const geos: THREE.BufferGeometry[] = [];
  let busStopZ = 30;
  for (const side of [-1, 1]) {
    let z = -half + 4;
    while (z < half - 6) {
      const w = 7 + R() * 3;
      if (side === 1 && Math.abs(z + w / 2 - busStopZ) < 9) { z += w + 1; continue; } // gap for the bus stop
      const h = 6.8 + R() * 2.4;
      const d = 9;
      const cell = Math.floor(R() * SHOPS.length);
      const box = new THREE.BoxGeometry(d, h, w);
      // UVs: road-facing face gets the facade cell, others a plain wall patch
      const cu = (cell % 4) * 0.25, cv = Math.floor(cell / 4) * 0.5; // from top
      const uv = box.attributes.uv as THREE.BufferAttribute;
      const facing = side === 1 ? 1 : 0; // face index looking at the road: -x face for +x side
      for (let f = 0; f < 6; f++) {
        for (let i = 0; i < 4; i++) {
          const idx = f * 4 + i;
          const u = uv.getX(idx), v = uv.getY(idx);
          if (f === facing) uv.setXY(idx, cu + u * 0.25, 1 - (cv + 0.5) + v * 0.5);
          else uv.setXY(idx, cu + 0.005 + u * 0.03, 1 - (cv + 0.25) + v * 0.05);
        }
      }
      box.translate(side * (ROAD_HALF + PAVE_W + d / 2 + 0.2), h / 2, z + w / 2);
      geos.push(box);
      z += w + (R() < 0.25 ? 2 + R() * 3 : 0.05);
    }
  }
  const buildings = new THREE.Mesh(mergeGeometries(geos), buildingMat);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  geos.forEach((x) => x.dispose());
  g.add(buildings);

  // ── coconut palms (instanced) ──
  const palmSpots: THREE.Matrix4[] = [];
  for (let z = -half; z < half; z += 9 + R() * 10) {
    const side = R() < 0.5 ? -1 : 1;
    const behind = R() < 0.6;
    const x = behind ? side * (ROAD_HALF + PAVE_W + 11 + R() * 10) : side * (ROAD_HALF + PAVE_W - 0.6);
    const s = behind ? 1.3 + R() * 0.6 : 0.9 + R() * 0.25;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.15, R() * Math.PI * 2, (R() - 0.5) * 0.15)),
      new THREE.Vector3(s, s, s),
    );
    palmSpots.push(m);
  }
  g.add(...palms(palmSpots));

  // ── power poles + sagging wires ──
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 9, 6);
  poleGeo.translate(0, 4.5, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 });
  const poleZs: number[] = [];
  for (let z = -half + 5; z < half; z += 32) poleZs.push(z);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleZs.length);
  poleZs.forEach((z, i) => poles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-(ROAD_HALF + 0.5), 0, z)));
  poles.castShadow = true;
  g.add(poles);
  const wirePts: number[] = [];
  for (let i = 0; i < poleZs.length - 1; i++) {
    for (const dy of [8.6, 8.2, 7.8]) {
      const a = poleZs[i], b = poleZs[i + 1];
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8, t1 = (k + 1) / 8;
        const sag = (t: number) => dy - Math.sin(t * Math.PI) * 0.7;
        wirePts.push(-(ROAD_HALF + 0.5), sag(t0), a + (b - a) * t0, -(ROAD_HALF + 0.5), sag(t1), a + (b - a) * t1);
      }
    }
  }
  const wires = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3)),
    new THREE.LineBasicMaterial({ color: 0x1a1a1a }),
  );
  g.add(wires);

  // ── bus stop shelter ──
  g.add(busShelter(ROAD_HALF + 1.6, busStopZ));

  return { group: g, length, busStopZ };
}

function palms(mats: THREE.Matrix4[]): THREE.Object3D[] {
  // curved trunk
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 9, 7, 6);
  trunkGeo.translate(0, 4.5, 0);
  const pos = trunkGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.pow(y / 9, 2) * 0.9);
  }
  trunkGeo.computeVertexNormals();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 });
  // crown: drooping fronds merged into one geometry
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(0.9, 4.2, 1, 5);
    f.translate(0, 2.1, 0);
    const p = f.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      const x = p.getX(k);
      p.setXYZ(k, x * (1 - y / 5), y * 0.9, -Math.pow(y / 4.2, 2) * 1.8);
    }
    f.rotateX(-Math.PI / 2.6);
    f.rotateY((i / 9) * Math.PI * 2);
    fronds.push(f);
  }
  const coconut = new THREE.SphereGeometry(0.18, 6, 4);
  for (let i = 0; i < 4; i++) {
    const c = coconut.clone();
    c.translate(Math.cos(i * 1.6) * 0.25, -0.25, Math.sin(i * 1.6) * 0.25);
    fronds.push(c.deleteAttribute('uv'));
  }
  fronds.forEach((f) => f.deleteAttribute('uv'));
  const crownGeo = mergeGeometries(fronds.map((f) => f.toNonIndexed()));
  crownGeo.computeVertexNormals();
  crownGeo.translate(0.9, 9, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7f2a, roughness: 0.85, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, mats.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, mats.length);
  mats.forEach((m, i) => { trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m); });
  trunks.castShadow = crowns.castShadow = true;
  return [trunks, crowns];
}

function busShelter(x: number, z: number): THREE.Group {
  const s = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2e6f9e, roughness: 0.5, metalness: 0.4 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 6), metal);
  roof.position.y = 2.7;
  roof.rotation.z = 0.08;
  s.add(roof);
  for (const dz of [-2.8, 2.8]) for (const dx of [-0.9, 0.9]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6), metal);
    p.position.set(dx, 1.35, dz);
    s.add(p);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 4.5), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  bench.position.set(0.6, 0.6, 0);
  s.add(bench);
  // stop sign pole with Sinhala / English board
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.font = '800 40px "Noto Sans Sinhala", sans-serif';
  ctx.fillText('බස් නැවතුම', 128, 56);
  ctx.font = '800 30px "Baloo 2", sans-serif';
  ctx.fillText('BUS STOP', 128, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
  board.position.set(-1.3, 2.6, -3.4);
  board.rotation.y = -Math.PI / 2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), metal);
  pole.position.set(-1.3, 1.4, -3.4);
  s.add(board, pole);
  s.position.set(x, 0.15, z);
  s.traverse((o) => { o.castShadow = true; });
  return s;
}

/** Sky dome + sun + fill light. Returns the sun so callers can move its shadow camera. */
export function setupSky(scene: THREE.Scene, preset: 'day' | 'golden' = 'golden'): THREE.DirectionalLight {
  const sky = preset === 'golden'
    ? skyTexture('#3d6fb6', '#f5b26b', '#ffd9a8')
    : skyTexture('#2f7fd8', '#8cc4f2', '#dceefa');
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 12),
    new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -1;
  scene.add(dome);
  const fogCol = preset === 'golden' ? 0xf0c9a0 : 0xcfe4f4;
  scene.fog = new THREE.Fog(fogCol, 60, 260);
  scene.add(new THREE.HemisphereLight(preset === 'golden' ? 0xffe2c0 : 0xdbeeff, 0x5a6b3a, 1.1));
  const sun = new THREE.DirectionalLight(preset === 'golden' ? 0xffd2a0 : 0xffffff, preset === 'golden' ? 2.6 : 2.8);
  sun.position.set(-40, preset === 'golden' ? 28 : 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  return sun;
}
