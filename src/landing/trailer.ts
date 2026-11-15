import * as THREE from 'three';
import { environment, type Stage } from '../core/renderer';
import { buildVehicle, defaultDesign, type VehicleDesign, type VehicleModel } from '../vehicles';
import { LANE_X, buildStreet, setupSky } from '../world/street';

/**
 * The animated "trailer": a live Colombo street with buses and tuk-tuks
 * driving, filmed by a cycling set of camera shots. Also used as the menu
 * backdrop and to render the landing-page screenshots.
 */

interface Mover { model: VehicleModel; speed: number; lane: 1 | -1; z: number }

export interface Trailer extends Stage {
  movers: Mover[];
  /** Pin the camera to one shot (used for screenshots and the menu backdrop). */
  setShot(i: number | null, t?: number): void;
  /** QA hook: look at mover i from an offset (vehicle space). null resumes the trailer. */
  inspect(i: number | null, offset?: [number, number, number]): void;
  shotCount: number;
  hero: VehicleModel;
  dispose(): void;
}

function design(cls: VehicleDesign['cls'], patch: Partial<VehicleDesign>): VehicleDesign {
  return { ...defaultDesign(cls), ...patch };
}

export function createTrailer(): Trailer {
  const scene = new THREE.Scene();
  scene.environment = environment();
  scene.environmentIntensity = 0.55;
  const sun = setupSky(scene, 'golden');
  const street = buildStreet(260, 11);
  scene.add(street.group);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 700);

  const half = street.length / 2;
  const movers: Mover[] = [];
  const add = (d: VehicleDesign, lane: 1 | -1, z: number, speed: number, skin = 1024) => {
    const model = buildVehicle(d, { skinSize: skin });
    scene.add(model.root);
    movers.push({ model, lane, z, speed });
    return model;
  };

  const hero = add(design('private_bus', {}), 1, -40, 11, 2048);
  add(design('tuktuk', {}), 1, -14, 12.5);
  add(design('public_bus', {}), -1, 20, 10);
  add(design('tuktuk', {
    paint: { body: '#1f8f4e', accent: '#ffffff', roof: '#1d1d1f', mudguard: '#d9d9de', rims: '#f2f2f2' },
    nameplate: { text: 'අම්මාගේ පුතා', style: 'neon', pos: 'front' },
  }), -1, -30, 12);
  add(design('private_bus', {
    livery: 'neon',
    paint: { body: '#0a2a8a', stripe1: '#1e6bff', stripe2: '#5ee7ff', accent: '#ffffff', bumper: '#0b0b0f' },
    nameplate: { text: 'නිල් කුමරා', style: 'neon', pos: 'front' },
  }), -1, 70, 9.5);
  add(design('tuktuk', {
    paint: { body: '#d81b60', accent: '#ffd54f', roof: '#1d1d1f', mudguard: '#d9d9de', rims: '#ffffff' },
    nameplate: { text: 'රෝස මල', style: 'gold', pos: 'front' },
  }), 1, 40, 11);
  add(design('private_bus', {
    livery: 'flame',
    paint: { body: '#ffcf33', stripe1: '#ff5a1f', stripe2: '#b3120f', accent: '#ffffff', bumper: '#1b1b1b' },
    nameplate: { text: 'ගිනි කුරුල්ලා', style: 'gold', pos: 'front' },
  }), 1, 90, 10.5);

  // shots: [position offset from target, look offset, target index, fov]
  type Shot = (t: number) => { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
  const tgt = (i: number) => movers[i].model.root.position;
  const shots: Shot[] = [
    // low front three-quarter tracking of the hero bus
    (t) => ({ pos: tgt(0).clone().add(new THREE.Vector3(-3.4 + Math.sin(t * 0.3) * 0.6, 1.4, 13 - t * 0.7)), look: tgt(0).clone().add(new THREE.Vector3(0, 2, 1)), fov: 45 }),
    // side pass of the tuk-tuk
    (t) => ({ pos: tgt(1).clone().add(new THREE.Vector3(3.6, 1.1, -1.5 + t * 0.5)), look: tgt(1).clone().add(new THREE.Vector3(0, 0.9, 0.6)), fov: 40 }),
    // high wide street view
    (t) => ({ pos: new THREE.Vector3(-9, 14, tgt(0).z - 22 + t * 2), look: tgt(0).clone().add(new THREE.Vector3(0, 0, 12)), fov: 55 }),
    // head-on of the public bus
    (t) => ({ pos: tgt(2).clone().add(new THREE.Vector3(-1.5, 1.6, -14 + t * 0.8)), look: tgt(2).clone().add(new THREE.Vector3(0, 1.9, 0)), fov: 38 }),
    // driver-seat (first person) in the hero bus
    () => {
      const m = movers[0].model;
      const eye = m.driverEye.clone().applyMatrix4(m.root.matrixWorld);
      return { pos: eye, look: eye.clone().add(new THREE.Vector3(0, -0.15, 10)), fov: 62 };
    },
  ];
  const SHOT_LEN = 5;
  let pinned: number | null = null;
  let pinnedT = 0;
  let inspecting: { i: number; off: THREE.Vector3 } | null = null;

  function place(m: Mover) {
    const x = m.lane * LANE_X;
    m.model.root.position.set(x, 0, m.z);
    m.model.root.rotation.y = m.lane === 1 ? 0 : Math.PI;
    m.model.root.updateMatrixWorld();
  }
  movers.forEach(place);

  function applyShot(i: number, t: number) {
    const s = shots[i](t);
    camera.position.copy(s.pos);
    camera.lookAt(s.look);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
  }

  const trailer: Trailer = {
    scene,
    camera,
    movers,
    hero,
    shotCount: shots.length,
    inspect(i, off = [6, 2, 6]) { inspecting = i === null ? null : { i, off: new THREE.Vector3(...off) }; },
    setShot(i, t = 1.5) { pinned = i; pinnedT = t; if (i !== null) applyShot(i, t); },
    update(dt, time) {
      for (const m of movers) {
        if (!inspecting) m.z += m.lane * m.speed * dt;
        if (m.z > half - 5) m.z = -half + 5;
        if (m.z < -half + 5) m.z = half - 5;
        place(m);
        const spin = (m.speed * dt) / m.model.wheels[0].radius;
        for (const w of m.model.wheels) w.mesh.rotation.x += spin;
        // gentle body sway
        m.model.body.rotation.z = Math.sin(time * 2.1 + m.z) * 0.006;
        m.model.body.position.y = Math.sin(time * 9 + m.z) * 0.006;
      }
      // keep the hero bus and the shadow camera together
      sun.position.set(tgt(0).x - 40, 28, tgt(0).z + 30);
      sun.target.position.copy(tgt(0));
      if (inspecting) {
        const m = movers[inspecting.i].model;
        const target = m.root.position.clone().add(new THREE.Vector3(0, m.dims.height * 0.45, 0));
        camera.position.copy(target).add(inspecting.off.clone().applyQuaternion(m.root.quaternion));
        camera.lookAt(target);
        return;
      }
      if (pinned !== null) { applyShot(pinned, pinnedT + time * 0.15); return; }
      const idx = Math.floor(time / SHOT_LEN) % shots.length;
      applyShot(idx, time % SHOT_LEN);
    },
    dispose() {
      movers.forEach((m) => m.model.dispose());
    },
  };
  return trailer;
}
