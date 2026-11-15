import * as THREE from 'three';
import { mapBoxToAtlas, paintBusSkin } from './livery';
import { M, cachedGeo, finishParams, makeWheel, paintMat, plateMesh, type Wheel } from './parts';
import type { VehicleDesign } from './types';
import type { VehicleModel } from './model';

const L = 10.4, W = 2.5, H = 2.45, FLOOR = 0.62;

/**
 * Generic Leyland-style bus (private or red public). Body is one textured box
 * with an arched roof; details (bumpers, quad lamps, mirrors, rack) are meshes.
 */
export function buildBus(design: VehicleDesign, opts: { skinSize?: number } = {}): VehicleModel {
  const isPublic = design.cls === 'public_bus';
  const root = new THREE.Group();
  root.name = design.cls;
  const body = new THREE.Group();
  root.add(body);
  const zones: VehicleModel['zones'] = {};
  const addZone = (z: string, m: THREE.MeshStandardMaterial) => ((zones[z] ??= []).push(m), m);

  // ── skin ──
  const skin = paintBusSkin(design, { L, W, H }, opts.skinSize ?? 2048);
  const tex = new THREE.CanvasTexture(skin);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const fp = finishParams(design.finish);
  const skinMat = new THREE.MeshStandardMaterial({ map: tex, ...fp });
  skinMat.userData.skin = true;

  const boxGeo = new THREE.BoxGeometry(W, H, L);
  mapBoxToAtlas(boxGeo);
  const shell = new THREE.Mesh(boxGeo, skinMat);
  shell.position.y = FLOOR + H / 2;
  shell.castShadow = true;
  body.add(shell);

  // arched roof cap
  const roofCol = isPublic ? '#d6d6d6' : design.paint.body;
  const roofMat = addZone(isPublic ? 'roofcap' : 'body', paintMat(roofCol, design.finish));
  const arch = new THREE.Mesh(
    cachedGeo('busArch', () => {
      // low arched roof: circular segment (chord = body width, rise 0.2 m) extruded along the length
      const rise = 0.2, half = W / 2;
      const s = new THREE.Shape();
      s.moveTo(-half, 0);
      s.quadraticCurveTo(0, rise * 2, half, 0);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 12 });
      g.translate(0, 0, -L / 2);
      return g;
    }),
    roofMat,
  );
  arch.position.set(0, FLOOR + H - 0.002, 0);
  arch.castShadow = true;
  body.add(arch);
  // front dome lip over the destination board
  const lip = new THREE.Mesh(cachedGeo('busLip', () => new THREE.BoxGeometry(W + 0.04, 0.12, 0.28)), roofMat);
  lip.position.set(0, FLOOR + H + 0.06, L / 2 - 0.12);
  body.add(lip);

  // ── bumpers ──
  const bumperMat = addZone('bumper', paintMat(design.paint.bumper, design.finish));
  const bumperGeo = cachedGeo('busBumper', () => new THREE.BoxGeometry(W + 0.08, 0.34, 0.2));
  const fb = new THREE.Mesh(bumperGeo, bumperMat);
  fb.position.set(0, FLOOR + 0.12, L / 2 + 0.07);
  const rb = fb.clone();
  rb.position.z = -L / 2 - 0.07;
  body.add(fb, rb);
  const chromeStrip = new THREE.Mesh(cachedGeo('busStrip', () => new THREE.BoxGeometry(W + 0.1, 0.05, 0.22)), M.chrome());
  chromeStrip.position.set(0, FLOOR + 0.31, L / 2 + 0.07);
  body.add(chromeStrip);

  // ── quad headlights ──
  const headlights: THREE.Mesh[] = [];
  const lampGeo = cachedGeo('busLamp', () => new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16).rotateX(Math.PI / 2));
  const lampY = FLOOR + H - 1.92;
  for (const x of [-W / 2 + 0.23, -W / 2 + 0.49, W / 2 - 0.49, W / 2 - 0.23]) {
    const lamp = new THREE.Mesh(lampGeo, M.headlight());
    lamp.position.set(x, lampY, L / 2 + 0.02);
    body.add(lamp);
    headlights.push(lamp);
  }
  // amber indicators
  const indGeo = cachedGeo('busInd', () => new THREE.BoxGeometry(0.22, 0.08, 0.04));
  for (const x of [-W / 2 + 0.36, W / 2 - 0.36]) {
    const ind = new THREE.Mesh(indGeo, M.amber());
    ind.position.set(x, FLOOR + 0.44, L / 2 + 0.17);
    body.add(ind);
  }

  // ── mirrors on long arms (rabbit-ear style) ──
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(cachedGeo('busArm', () => new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6)), M.black());
    arm.position.set(side * (W / 2 + 0.12), FLOOR + H - 0.35, L / 2 + 0.25);
    arm.rotation.set(Math.PI / 2.6, 0, side * -0.5);
    const mirror = new THREE.Mesh(cachedGeo('busMirror', () => new THREE.BoxGeometry(0.2, 0.36, 0.05)), M.black());
    mirror.position.set(side * (W / 2 + 0.22), FLOOR + H - 0.75, L / 2 + 0.52);
    const face = new THREE.Mesh(cachedGeo('busMirrorFace', () => new THREE.PlaneGeometry(0.17, 0.32)), M.chrome());
    face.position.z = -0.03;
    face.rotation.y = Math.PI;
    mirror.add(face);
    body.add(arm, mirror);
  }

  // ── chassis + wheels ──
  const chassis = new THREE.Mesh(cachedGeo('busChassis', () => new THREE.BoxGeometry(W - 0.4, 0.35, L - 1.2)), M.black());
  chassis.position.y = FLOOR - 0.12;
  body.add(chassis);
  const wheels: Wheel[] = [];
  const rimMat = isPublic ? M.black() : M.chrome();
  const r = 0.5;
  const frontZ = L / 2 - 1.95, rearZ = L / 2 - 7.75;
  for (const side of [-1, 1]) {
    const w = makeWheel(r, 0.3, rimMat);
    w.steer = true;
    w.pivot.position.set(side * (W / 2 - 0.22), r, frontZ);
    root.add(w.pivot);
    wheels.push(w);
    for (const inset of [0.22, 0.52]) {
      const rw = makeWheel(r, 0.28, rimMat);
      rw.pivot.position.set(side * (W / 2 - inset), r, rearZ);
      root.add(rw.pivot);
      wheels.push(rw);
    }
  }

  // ── plates ──
  const anchors: VehicleModel['anchors'] = {};
  const fp1 = plateMesh(design.plate, 0.52, 0.13, false);
  fp1.position.set(0, FLOOR + 0.12, L / 2 + 0.175);
  const rp = plateMesh(design.plate, 0.52, 0.13, true);
  rp.position.set(0, FLOOR + 0.12, -L / 2 - 0.175);
  rp.rotation.y = Math.PI;
  body.add(fp1, rp);

  // ── roof equipment ──
  const roofY = FLOOR + H + 0.17;
  const roofAnchor = new THREE.Group();
  roofAnchor.position.y = roofY;
  body.add(roofAnchor);
  anchors.roof = roofAnchor;
  if (!isPublic) {
    // roof rack rails + crossbars over the rear 60%, ladder at the back
    const railGeo = cachedGeo('rackRail', () => new THREE.BoxGeometry(0.04, 0.04, L * 0.6));
    const postGeo = cachedGeo('rackPost', () => new THREE.BoxGeometry(0.04, 0.22, 0.04));
    const barGeo = cachedGeo('rackBar', () => new THREE.BoxGeometry(W - 0.2, 0.03, 0.04));
    const rackZ = -L * 0.18;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, M.chrome());
      rail.position.set(side * (W / 2 - 0.12), 0.2, rackZ);
      roofAnchor.add(rail);
      for (let i = 0; i <= 6; i++) {
        const post = new THREE.Mesh(postGeo, M.chrome());
        post.position.set(side * (W / 2 - 0.12), 0.09, rackZ - L * 0.3 + (i * L * 0.6) / 6);
        roofAnchor.add(post);
      }
    }
    for (let i = 0; i <= 8; i++) {
      const bar = new THREE.Mesh(barGeo, M.chrome());
      bar.position.set(0, 0.04, rackZ - L * 0.3 + (i * L * 0.6) / 8);
      roofAnchor.add(bar);
    }
    // ladder at the rear on the kerb side
    const ladder = new THREE.Group();
    for (const dx of [-0.17, 0.17]) {
      const rail = new THREE.Mesh(cachedGeo('ladderRail', () => new THREE.BoxGeometry(0.03, 2.2, 0.03)), M.chrome());
      rail.position.set(dx, 0, 0);
      ladder.add(rail);
    }
    for (let i = 0; i < 7; i++) {
      const rung = new THREE.Mesh(cachedGeo('ladderRung', () => new THREE.BoxGeometry(0.34, 0.025, 0.025)), M.chrome());
      rung.position.y = -0.95 + i * 0.3;
      ladder.add(rung);
    }
    ladder.position.set(W / 2 - 0.45, FLOOR + H - 0.95, -L / 2 - 0.06);
    body.add(ladder);
  }
  if (design.roof.includes('marker_lights') || isPublic) {
    const mk = cachedGeo('marker', () => new THREE.BoxGeometry(0.1, 0.06, 0.05));
    const n = isPublic ? 2 : 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(mk, M.amber());
      const x = -W / 2 + 0.25 + (i * (W - 0.5)) / (n - 1);
      m.position.set(x, 0.0, L / 2 - 0.05);
      roofAnchor.add(m);
    }
  }
  if (design.roof.includes('horn_trumpets')) {
    for (const x of [-0.25, 0.25]) {
      const horn = new THREE.Mesh(
        cachedGeo('trumpet', () => new THREE.CylinderGeometry(0.09, 0.025, 0.55, 12, 1, true).rotateX(-Math.PI / 2)),
        M.chrome(),
      );
      horn.position.set(x, 0.07, L / 2 - 0.55);
      roofAnchor.add(horn);
    }
  }

  // anchors for name plates / stickers (garage uses these)
  const frontAnchor = new THREE.Group();
  frontAnchor.position.set(0, FLOOR + H - 1.0, L / 2 + 0.01);
  body.add(frontAnchor);
  anchors.front = frontAnchor;
  const kerb = new THREE.Group();
  kerb.position.set(W / 2 + 0.005, FLOOR, 0);
  kerb.rotation.y = Math.PI / 2;
  body.add(kerb);
  anchors.kerb = kerb;
  const road = new THREE.Group();
  road.position.set(-W / 2 - 0.005, FLOOR, 0);
  road.rotation.y = -Math.PI / 2;
  body.add(road);
  anchors.road = road;

  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

  return {
    cls: design.cls,
    root,
    body,
    wheels,
    zones,
    headlights,
    anchors,
    driverEye: new THREE.Vector3(-0.72, FLOOR + 1.55, L / 2 - 0.85),
    dims: { length: L + 0.4, width: W, height: FLOOR + H + 0.2, wheelBase: frontZ - rearZ },
    design,
    dispose() {
      tex.dispose();
      skinMat.dispose();
      boxGeo.dispose();
      for (const list of Object.values(zones)) list.forEach((m) => m.dispose());
      [fp1, rp].forEach((p) => {
        (p.material as THREE.MeshStandardMaterial).map?.dispose();
        (p.material as THREE.Material).dispose();
        p.geometry.dispose();
      });
    },
  };
}
