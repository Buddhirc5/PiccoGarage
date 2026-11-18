import * as THREE from 'three';
import { environment, type Stage } from '../core/renderer';
import { VEHICLES, type VehicleId } from '../game/data';
import { loadModel, type LoadedModel } from '../game/models';
import { progress } from '../game/progress';

/** 3D turntable on a transparent canvas: the CSS gradient and giant type show through. */
export class Showroom implements Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private pivot = new THREE.Group();
  private model: LoadedModel | null = null;
  private glow: THREE.Mesh;
  private token = 0;
  spin = 0.3; yaw = -0.6; private len = 10; private h = 3; private intro = 0;

  constructor() {
    const s = this.scene;
    s.environment = environment(); s.environmentIntensity = 0.95;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2; shadow.receiveShadow = true; s.add(shadow);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 12, 9); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
    s.add(key);
    const rim = new THREE.DirectionalLight(0xff4a3a, 3); rim.position.set(-8, 4, -8); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff6a50, 2); rim2.position.set(8, 3, -6); s.add(rim2);
    s.add(new THREE.HemisphereLight(0xfff0ea, 0x4a1012, 0.8));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.04; this.glow.visible = false;
    this.pivot.add(this.glow);
    s.add(this.pivot);
  }

  async show(id: VehicleId): Promise<void> {
    const t = ++this.token;
    const def = VEHICLES.find((v) => v.id === id)!;
    const m = await loadModel(def.model);
    if (t !== this.token) { m.dispose(); return; }
    if (this.model) { this.pivot.remove(this.model.root); this.model.dispose(); }
    this.model = m; this.len = def.length; this.h = m.size.y; this.intro = 1;
    this.pivot.add(m.root);
    this.glow.scale.set(def.width * 2.6, def.length * 1.4, 1);
    this.paint(id);
  }
  paint(id: VehicleId) {
    const def = VEHICLES.find((v) => v.id === id)!, g = progress.garage[id];
    if (def.tintable) this.model?.setTint(g.tint);
    this.model?.setFinish(g.finish);
    this.glow.visible = !!g.glow;
    if (g.glow) (this.glow.material as THREE.MeshBasicMaterial).color.set(g.glow);
  }
  update(dt: number) {
    this.yaw += this.spin * dt;
    this.intro = Math.max(0, this.intro - dt * 1.6);
    const e = this.intro * this.intro;
    this.pivot.rotation.y = this.yaw - e * 1.2;
    this.pivot.position.x = e * this.len * 0.9;
    // frame the whole vehicle whatever the canvas shape
    const a = this.camera.aspect, vf = THREE.MathUtils.degToRad(this.camera.fov);
    const span = Math.max(this.len * 0.82, this.h * 1.3);
    const fit = (span / 2) / Math.tan(vf / 2) / Math.min(1, a);
    const d = fit * 0.98 + this.len * 0.12;
    this.camera.position.set(0, this.h * 0.55 + d * 0.2, d);
    this.camera.lookAt(0, this.h * 0.42, 0);
  }
}


let room: Showroom | null = null;
export const showroom = () => (room ??= new Showroom());
