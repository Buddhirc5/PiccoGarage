import * as THREE from 'three';

/**
 * Pooled visual effects, each one draw call:
 * - tyre smoke (soft billboards that grow and fade)
 * - sparks (short bright streaks on hard contact)
 * - skid marks (dark quads laid on the road, recycled ring buffer)
 * - rain (falling streaks around the camera)
 */
function softDot(inner: string, outer: string, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// shared billboard shader: instances carry position (xyz) + size (w) + alpha
function billboardMaterial(map: THREE.Texture, additive: boolean, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, color: { value: new THREE.Color(color) } },
    vertexShader: `
      attribute vec4 inst; attribute float alpha; varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv; vA = alpha;
        vec4 mv = viewMatrix * vec4(inst.xyz, 1.0);
        mv.xy += position.xy * inst.w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vA;
      void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(color * t.rgb, t.a * vA); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

class Particles {
  mesh: THREE.Mesh;
  private inst: THREE.InstancedBufferAttribute; private alpha: THREE.InstancedBufferAttribute;
  private p: { x: number; y: number; z: number; vx: number; vy: number; vz: number; s: number; grow: number; life: number; max: number }[] = [];
  private next = 0;
  constructor(count: number, map: THREE.Texture, additive: boolean, color: THREE.ColorRepresentation, private gravity = 0) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index; geo.setAttribute('position', plane.attributes.position); geo.setAttribute('uv', plane.attributes.uv);
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.inst.setUsage(THREE.DynamicDrawUsage); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('inst', this.inst); geo.setAttribute('alpha', this.alpha);
    geo.instanceCount = count;
    this.mesh = new THREE.Mesh(geo, billboardMaterial(map, additive, color));
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) this.p.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: 0, grow: 0, life: 0, max: 1 });
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: number, grow: number, life: number) {
    const q = this.p[this.next]; this.next = (this.next + 1) % this.p.length;
    Object.assign(q, { x, y, z, vx, vy, vz, s, grow, life, max: life });
  }
  update(dt: number) {
    const a = this.inst.array as Float32Array, al = this.alpha.array as Float32Array;
    this.p.forEach((q, i) => {
      if (q.life > 0) {
        q.life -= dt; q.vy -= this.gravity * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.s += q.grow * dt;
        if (q.y < 0.02 && this.gravity) { q.y = 0.02; q.vy *= -0.3; }
      }
      const k = Math.max(0, q.life / q.max);
      a[i * 4] = q.x; a[i * 4 + 1] = q.life > 0 ? q.y : -99; a[i * 4 + 2] = q.z; a[i * 4 + 3] = q.s;
      al[i] = k * k;
    });
    this.inst.needsUpdate = true; this.alpha.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

export class Fx {
  group = new THREE.Group();
  private smoke: Particles; private sparks: Particles;
  private skids: THREE.InstancedMesh; private skidNext = 0; private lastSkid: (THREE.Vector3 | null)[] = [null, null];
  private rain: THREE.LineSegments | null = null;
  private tex: THREE.Texture[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0);

  constructor(lowQuality: boolean, rain: boolean) {
    const smokeTex = softDot('rgba(235,235,235,0.55)', 'rgba(235,235,235,0)');
    const sparkTex = softDot('rgba(255,255,255,1)', 'rgba(255,170,60,0)', 32);
    this.tex.push(smokeTex, sparkTex);
    this.smoke = new Particles(lowQuality ? 40 : 90, smokeTex, false, 0xdddddd);
    this.sparks = new Particles(60, sparkTex, true, 0xffc070, 9);
    this.group.add(this.smoke.mesh, this.sparks.mesh);

    const skidGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), lowQuality ? 300 : 700);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.skids.count; i++) this.skids.setMatrixAt(i, this.m);
    this.skids.frustumCulled = false; this.skids.renderOrder = 2;
    this.group.add(this.skids);

    if (rain) {
      const n = lowQuality ? 700 : 1600, pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
        pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.05], i * 6);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c4, transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.group.add(this.rain);
    }
  }

  puff(p: THREE.Vector3, vx = 0, vz = 0, size = 1) {
    this.smoke.emit(p.x + (Math.random() - 0.5) * 0.3, 0.25, p.z + (Math.random() - 0.5) * 0.3, vx * 0.2 + (Math.random() - 0.5), 0.6 + Math.random() * 0.5, vz * 0.2 + (Math.random() - 0.5), 0.8 * size, 2.2 * size, 1.4);
  }
  sparkBurst(p: THREE.Vector3, n = 14) {
    for (let i = 0; i < n; i++) this.sparks.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9, 0.12 + Math.random() * 0.12, 0, 0.35 + Math.random() * 0.4);
  }
  /** Lay skid segments for each wheel point (call every frame while sliding; pass null to lift). */
  skid(points: (THREE.Vector3 | null)[], width: number) {
    points.forEach((p, k) => {
      const last = this.lastSkid[k];
      if (!p) { this.lastSkid[k] = null; return; }
      if (last) {
        const dx = p.x - last.x, dz = p.z - last.z, len = Math.hypot(dx, dz);
        if (len < 0.25) return;
        this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
        this.m.compose(this.sc.set((last.x + p.x) / 2, 0.035, (last.z + p.z) / 2), this.q, new THREE.Vector3(width, 1, len + 0.05));
        this.skids.setMatrixAt(this.skidNext, this.m);
        this.skidNext = (this.skidNext + 1) % this.skids.count;
        this.skids.instanceMatrix.needsUpdate = true;
      }
      this.lastSkid[k] = p.clone();
    });
  }
  update(dt: number, cam: THREE.Vector3) {
    this.smoke.update(dt); this.sparks.update(dt);
    if (this.rain) {
      this.rain.position.set(cam.x, cam.y - 10, cam.z);
      const a = this.rain.geometry.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= 28 * dt; arr[i + 4] -= 28 * dt;
        if (arr[i + 4] < 0) { arr[i + 1] += 30; arr[i + 4] += 30; }
      }
      a.needsUpdate = true;
    }
  }
  dispose() {
    this.smoke.dispose(); this.sparks.dispose(); this.tex.forEach((t) => t.dispose());
    this.skids.geometry.dispose(); (this.skids.material as THREE.Material).dispose();
    if (this.rain) { this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose(); }
  }
}

/** Additive glow quad (headlights, tail lights, lamp heads). */
export function glowTexture(): THREE.CanvasTexture { return softDot('rgba(255,255,255,1)', 'rgba(255,255,255,0)'); }
export function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}
