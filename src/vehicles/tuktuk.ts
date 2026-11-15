import * as THREE from 'three';
import { M, cachedGeo, labelTexture, makeWheel, paintMat, plateMesh, type Wheel } from './parts';
import type { VehicleDesign } from './types';
import type { VehicleModel } from './model';

/**
 * Generic three-wheeler. Faces +z, origin on the ground at the body centre.
 * Built from simple extruded shapes so it stays light on phones.
 */
export function buildTuktuk(design: VehicleDesign): VehicleModel {
  const root = new THREE.Group();
  root.name = 'tuktuk';
  const body = new THREE.Group();
  root.add(body);
  const zones: VehicleModel['zones'] = {};
  const zone = (z: string) => {
    const m = paintMat(design.paint[z], design.finish);
    (zones[z] ??= []).push(m);
    return m;
  };
  const bodyMat = zone('body');
  const accentMat = zone('accent');
  const roofMat = paintMat(design.paint.roof, 'matte');
  (zones.roof ??= []).push(roofMat);
  const guardMat = zone('mudguard');
  guardMat.metalness = 0.9; // mudguards are chrome-plated or painted metal
  guardMat.roughness = 0.22;
  const rimMat = zone('rims');

  // ── floor pan ──
  const floor = new THREE.Mesh(cachedGeo('tkFloor', () => new THREE.BoxGeometry(1.14, 0.06, 1.95)), M.black());
  floor.position.set(0, 0.36, -0.05);
  body.add(floor);

  // ── rear passenger tub (rounded, viewed from above) ──
  const tub = new THREE.Mesh(
    cachedGeo('tkTub', () => {
      // shape y = -world z, so after rotateX(-90deg) the tub spans z +0.25 .. -1.22
      const s = new THREE.Shape();
      const w = 0.65, a = -0.25, b = 1.22, r = 0.22;
      s.moveTo(-w, a);
      s.lineTo(w, a);
      s.lineTo(w, b - r);
      s.quadraticCurveTo(w, b, w - r, b);
      s.lineTo(-w + r, b);
      s.quadraticCurveTo(-w, b, -w, b - r);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6 });
      g.rotateX(-Math.PI / 2);
      return g;
    }),
    bodyMat,
  );
  tub.position.set(0, 0.38, 0);
  body.add(tub);
  // accent stripe band around the tub
  const band = new THREE.Mesh(cachedGeo('tkBand', () => new THREE.BoxGeometry(1.37, 0.06, 1.3)), accentMat);
  band.position.set(0, 0.8, -0.55);
  body.add(band);

  // ── front cowl (side profile extruded across the width) ──
  const cowl = new THREE.Mesh(
    cachedGeo('tkCowl', () => {
      const s = new THREE.Shape();
      s.moveTo(0.6, 0.36);
      s.lineTo(1.02, 0.36);
      s.quadraticCurveTo(1.16, 0.55, 1.14, 0.82);
      s.quadraticCurveTo(1.12, 1.1, 0.98, 1.2);
      s.lineTo(0.78, 1.2);
      s.lineTo(0.76, 0.66);
      s.lineTo(0.6, 0.52);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 8 });
      g.rotateY(-Math.PI / 2); // local x (profile z) -> world z, extrude -> -x
      g.translate(0.5, 0, 0);
      return g;
    }),
    bodyMat,
  );
  body.add(cowl);
  // nose panel (accent zone)
  const nose = new THREE.Mesh(cachedGeo('tkNose', () => new THREE.BoxGeometry(0.2, 0.46, 0.04)), accentMat);
  nose.position.set(0, 0.7, 1.19);
  nose.rotation.x = -0.12;
  body.add(nose);

  // ── lights ──
  const headlights: THREE.Mesh[] = [];
  const lampGeo = cachedGeo('tkLamp', () => new THREE.CylinderGeometry(0.075, 0.075, 0.08, 16).rotateX(Math.PI / 2));
  const rimGeo = cachedGeo('tkLampRim', () => new THREE.TorusGeometry(0.08, 0.015, 6, 16));
  for (const x of [-0.31, 0.31]) {
    const lamp = new THREE.Mesh(lampGeo, M.headlight());
    lamp.position.set(x, 0.98, 1.15);
    const ring = new THREE.Mesh(rimGeo, M.chrome());
    ring.position.copy(lamp.position).add(new THREE.Vector3(0, 0, 0.04));
    body.add(lamp, ring);
    headlights.push(lamp);
    const ind = new THREE.Mesh(cachedGeo('tkInd', () => new THREE.BoxGeometry(0.1, 0.05, 0.04)), M.amber());
    ind.position.set(x * 1.15, 1.13, 1.06);
    body.add(ind);
  }
  for (const x of [-0.5, 0.5]) {
    const tail = new THREE.Mesh(cachedGeo('tkTail', () => new THREE.BoxGeometry(0.16, 0.08, 0.04)), M.red());
    tail.position.set(x, 0.75, -1.27);
    body.add(tail);
  }

  // ── windscreen with visor sticker (name plate in front style) ──
  const wsGeo = cachedGeo('tkWs', () => new THREE.PlaneGeometry(1.12, 0.52));
  const ws = new THREE.Mesh(wsGeo, M.glass());
  ws.position.set(0, 1.46, 0.92);
  ws.rotation.x = -0.25;
  body.add(ws);
  const visorTex = labelTexture(512, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#0d0d10');
    g.addColorStop(0.5, '#1d1d24');
    g.addColorStop(1, '#0d0d10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '800 38px "Noto Sans Sinhala", "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = design.paint.accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = design.paint.accent;
    ctx.fillText(design.nameplate.text || 'PICCO', w / 2, h / 2 + 2, w - 20);
  });
  const visorMat = new THREE.MeshStandardMaterial({ map: visorTex, roughness: 0.5 });
  const visor = new THREE.Mesh(cachedGeo('tkVisor', () => new THREE.PlaneGeometry(1.12, 0.13)), visorMat);
  visor.position.set(0, 1.66, 0.875);
  visor.rotation.x = -0.25;
  body.add(visor);

  // ── pillars ──
  const pillarGeo = cachedGeo('tkPillar', () => new THREE.CylinderGeometry(0.022, 0.022, 1, 6));
  const pillar = (a: THREE.Vector3, b: THREE.Vector3) => {
    const p = new THREE.Mesh(pillarGeo, M.black());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    p.position.copy(mid);
    p.scale.y = a.distanceTo(b);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    body.add(p);
  };
  for (const x of [-0.58, 0.58]) {
    pillar(new THREE.Vector3(x * 0.95, 1.2, 0.98), new THREE.Vector3(x, 1.72, 0.84));
    pillar(new THREE.Vector3(x, 0.88, 0.2), new THREE.Vector3(x, 1.72, 0.2));
    pillar(new THREE.Vector3(x, 0.88, -1.18), new THREE.Vector3(x, 1.72, -1.18));
  }

  // ── canvas roof + back ──
  const roof = new THREE.Mesh(
    cachedGeo('tkRoof', () => {
      const g = new THREE.BoxGeometry(1.36, 0.08, 2.18, 1, 1, 6);
      // slight dome
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + 0.05 * Math.cos((z / 1.09) * (Math.PI / 2)));
      }
      g.computeVertexNormals();
      return g;
    }),
    roofMat,
  );
  roof.position.set(0, 1.74, -0.17);
  body.add(roof);
  const back = new THREE.Mesh(cachedGeo('tkBack', () => new THREE.BoxGeometry(1.32, 0.86, 0.04)), roofMat);
  back.position.set(0, 1.3, -1.24);
  body.add(back);
  const rearWin = new THREE.Mesh(cachedGeo('tkRearWin', () => new THREE.PlaneGeometry(0.7, 0.26)), M.glass());
  rearWin.position.set(0, 1.42, -1.265);
  rearWin.rotation.y = Math.PI;
  body.add(rearWin);
  // roll-edge trim around the roof
  const trim = new THREE.Mesh(cachedGeo('tkTrim', () => new THREE.BoxGeometry(1.4, 0.03, 2.22)), M.chrome());
  trim.position.set(0, 1.705, -0.17);
  body.add(trim);

  // ── interior: handlebar, driver seat, passenger bench ──
  const bar = new THREE.Mesh(cachedGeo('tkBar', () => new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8).rotateZ(Math.PI / 2)), M.chrome());
  bar.position.set(0, 1.15, 0.66);
  body.add(bar);
  const seatMat = M.seat();
  const dseat = new THREE.Mesh(cachedGeo('tkDSeat', () => new THREE.BoxGeometry(0.56, 0.12, 0.38)), seatMat);
  dseat.position.set(0, 0.8, 0.3);
  const bench = new THREE.Mesh(cachedGeo('tkBench', () => new THREE.BoxGeometry(1.18, 0.16, 0.46)), seatMat);
  bench.position.set(0, 0.95, -0.9);
  const backrest = new THREE.Mesh(cachedGeo('tkBackrest', () => new THREE.BoxGeometry(1.18, 0.42, 0.1)), seatMat);
  backrest.position.set(0, 1.22, -1.14);
  backrest.rotation.x = -0.1;
  body.add(dseat, bench, backrest);

  // ── wheels + mudguard ──
  const wheels: Wheel[] = [];
  const whitewall = true;
  const fw = makeWheel(0.21, 0.13, rimMat, whitewall);
  fw.steer = true;
  fw.pivot.position.set(0, 0.21, 0.98);
  root.add(fw.pivot);
  wheels.push(fw);
  const guard = new THREE.Mesh(
    // open half-shell over the wheel: axis along x, arc from front-low over the top
    cachedGeo('tkGuard', () => new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14, 1, true, -Math.PI * 0.2, Math.PI * 0.95).rotateZ(Math.PI / 2)),
    guardMat,
  );
  guardMat.side = THREE.DoubleSide;
  fw.pivot.add(guard);
  const fork = new THREE.Mesh(cachedGeo('tkFork', () => new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6)), M.chrome());
  fork.position.set(0, 0.25, -0.05);
  fork.rotation.x = 0.2;
  fw.pivot.add(fork);
  for (const x of [-0.58, 0.58]) {
    const rw = makeWheel(0.21, 0.13, rimMat, whitewall);
    rw.pivot.position.set(x, 0.21, -0.72);
    root.add(rw.pivot);
    wheels.push(rw);
  }

  // ── plates & anchors ──
  const rp = plateMesh(design.plate, 0.34, 0.11, true);
  rp.position.set(0, 0.6, -1.275);
  rp.rotation.y = Math.PI;
  const fpl = plateMesh(design.plate, 0.3, 0.09);
  fpl.position.set(0, 0.5, 1.24);
  fpl.rotation.x = -0.35;
  body.add(rp, fpl);

  const anchors: VehicleModel['anchors'] = {};
  const roofAnchor = new THREE.Group();
  roofAnchor.position.set(0, 1.8, -0.17);
  body.add(roofAnchor);
  anchors.roof = roofAnchor;
  const kerb = new THREE.Group();
  kerb.position.set(0.68, 0.4, -0.5);
  kerb.rotation.y = Math.PI / 2;
  body.add(kerb);
  anchors.kerb = kerb;
  const road = new THREE.Group();
  road.position.set(-0.68, 0.4, -0.5);
  road.rotation.y = -Math.PI / 2;
  body.add(road);
  anchors.road = road;

  // antennas + flag (classic tuk-tuk mod)
  for (const x of [-0.45, -0.32]) {
    const ant = new THREE.Mesh(cachedGeo('tkAnt', () => new THREE.CylinderGeometry(0.006, 0.01, 0.75, 4)), M.black());
    ant.position.set(x, 0.37, 0.95);
    roofAnchor.add(ant);
  }
  const flag = new THREE.Mesh(cachedGeo('tkFlag', () => new THREE.PlaneGeometry(0.16, 0.1)), accentMat);
  flag.position.set(-0.37, 0.68, 0.95);
  roofAnchor.add(flag);

  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

  return {
    cls: 'tuktuk',
    root,
    body,
    wheels,
    zones,
    headlights,
    anchors,
    driverEye: new THREE.Vector3(0, 1.42, 0.3),
    dims: { length: 2.6, width: 1.36, height: 1.8, wheelBase: 1.7 },
    design,
    dispose() {
      for (const list of Object.values(zones)) list.forEach((m) => m.dispose());
      visorTex.dispose();
      visorMat.dispose();
      [rp, fpl].forEach((p) => {
        (p.material as THREE.MeshStandardMaterial).map?.dispose();
        (p.material as THREE.Material).dispose();
        p.geometry.dispose();
      });
    },
  };
}
