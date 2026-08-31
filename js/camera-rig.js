/* ==========================================================================
   Camera rig.

   Two modes share one state (position + yaw + pitch), so switching between
   guided stops and free exploration never snaps the view:

   guided  the camera eases to a predefined stop; drag/swipe nudges the look
           direction within a limited cone, then relaxes back to centre.
   free    arrow keys / WASD walk, drag looks freely, AABBs block walls.

   Roll is never touched — the horizon stays level in both modes.
   ========================================================================== */

import * as THREE from 'three';

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TAU = Math.PI * 2;

/** Shortest signed angular difference, so a pan never takes the long way. */
function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export class CameraRig {
  constructor(camera, domElement, opts = {}) {
    this.camera = camera;
    this.dom = domElement;

    this.mode = 'guided';
    this.enabled = true;

    this.position = new THREE.Vector3(0, 1.55, 6);
    this.yaw = Math.PI;
    this.pitch = 0;

    // Guided look-around offsets, relative to the stop's own orientation.
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookLimitYaw = opts.lookLimitYaw ?? THREE.MathUtils.degToRad(38);
    this.lookLimitPitch = opts.lookLimitPitch ?? THREE.MathUtils.degToRad(17);
    this.lookRecentre = opts.lookRecentre ?? 0.9;

    this.eyeHeight = opts.eyeHeight ?? 1.58;
    this.speed = opts.speed ?? 2.5;
    this.playerRadius = opts.playerRadius ?? 0.34;
    this.pitchLimit = THREE.MathUtils.degToRad(72);

    this.colliders = [];
    this.bounds = opts.bounds ?? null;

    this.stop = null;
    this._tween = null;
    this._keys = new Set();
    this._pointer = { active: false, id: null, x: 0, y: 0, moved: 0 };
    this._listeners = [];
    this.onModeChange = opts.onModeChange ?? (() => {});
    this.onArrive = opts.onArrive ?? (() => {});

    this._bindInput();
    this.apply();
  }

  /* --- input ----------------------------------------------------------- */

  _on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._listeners.push([target, type, handler, options]);
  }

  _bindInput() {
    const dom = this.dom;

    this._on(dom, 'pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this._pointer.active = true;
      this._pointer.id = e.pointerId;
      this._pointer.x = e.clientX;
      this._pointer.y = e.clientY;
      this._pointer.moved = 0;
      dom.setPointerCapture?.(e.pointerId);
    });

    this._on(dom, 'pointermove', (e) => {
      if (!this._pointer.active || e.pointerId !== this._pointer.id) return;
      const dx = e.clientX - this._pointer.x;
      const dy = e.clientY - this._pointer.y;
      this._pointer.x = e.clientX;
      this._pointer.y = e.clientY;
      this._pointer.moved += Math.abs(dx) + Math.abs(dy);

      // Touch drags feel natural at a lower gain than a mouse.
      const gain = (e.pointerType === 'touch' ? 0.0032 : 0.0026) *
        (this.mode === 'free' ? 1.35 : 1);

      if (this.mode === 'free') {
        this.yaw -= dx * gain;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - dy * gain, -this.pitchLimit, this.pitchLimit
        );
      } else {
        this.lookYaw = THREE.MathUtils.clamp(
          this.lookYaw - dx * gain, -this.lookLimitYaw, this.lookLimitYaw
        );
        this.lookPitch = THREE.MathUtils.clamp(
          this.lookPitch - dy * gain, -this.lookLimitPitch, this.lookLimitPitch
        );
      }
    });

    const endPointer = (e) => {
      if (this._pointer.id !== null && e.pointerId !== this._pointer.id) return;
      this._pointer.active = false;
      this._pointer.id = null;
    };
    this._on(dom, 'pointerup', endPointer);
    this._on(dom, 'pointercancel', endPointer);
    this._on(dom, 'lostpointercapture', endPointer);

    this._on(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLElement &&
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      this._keys.add(e.code);
    });
    this._on(window, 'keyup', (e) => this._keys.delete(e.code));
    this._on(window, 'blur', () => this._keys.clear());
  }

  /** True if the last pointer interaction was a drag rather than a tap. */
  wasDrag(threshold = 8) {
    return this._pointer.moved > threshold;
  }

  dispose() {
    for (const [target, type, handler, options] of this._listeners) {
      target.removeEventListener(type, handler, options);
    }
    this._listeners.length = 0;
  }

  /* --- modes ----------------------------------------------------------- */

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Fold the guided look offsets into the absolute orientation so the
      // view does not jump at the moment of hand-off.
      this.yaw += this.lookYaw;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + this.lookPitch, -this.pitchLimit, this.pitchLimit
      );
      this.lookYaw = 0;
      this.lookPitch = 0;
      this.position.y = this.eyeHeight;
      this.stop = null;
      this._tween = null;
    }
    this.mode = mode;
    this.onModeChange(mode);
  }

  /* --- guided movement -------------------------------------------------- */

  /**
   * Ease to a stop.
   * @param {{position:number[]|THREE.Vector3, target:number[]|THREE.Vector3, id?:string}} stop
   */
  goTo(stop, opts = {}) {
    const position = new THREE.Vector3().fromArray(
      Array.isArray(stop.position) ? stop.position : stop.position.toArray()
    );
    const target = new THREE.Vector3().fromArray(
      Array.isArray(stop.target) ? stop.target : stop.target.toArray()
    );

    const dir = target.clone().sub(position);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));

    if (this.mode === 'free') {
      this.mode = 'guided';
      this.onModeChange('guided');
    }

    const distance = this.position.distanceTo(position);
    const turn = Math.abs(angleDelta(this.yaw + this.lookYaw, yaw));
    let duration = opts.duration ??
      THREE.MathUtils.clamp(0.55 + distance * 0.26 + turn * 0.34, 0.7, 2.6);
    if (prefersReducedMotion()) duration = Math.min(duration, 0.42);

    this._tween = {
      t: 0,
      duration,
      fromPos: this.position.clone(),
      toPos: position,
      fromYaw: this.yaw + this.lookYaw,
      toYaw: yaw,
      fromPitch: this.pitch + this.lookPitch,
      toPitch: pitch,
      stop,
      onArrive: opts.onArrive,
    };
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.stop = stop;
    return duration;
  }

  /** Snap without animation — used when entering a space for the first time. */
  jumpTo(stop) {
    this.goTo(stop, { duration: 0.001 });
    this.update(0.002);
  }

  get isMoving() {
    return this._tween !== null;
  }

  /* --- collision -------------------------------------------------------- */

  setColliders(boxes) {
    this.colliders = boxes || [];
  }

  _blocked(x, z) {
    const r = this.playerRadius;
    for (const box of this.colliders) {
      if (
        x + r > box.min.x && x - r < box.max.x &&
        z + r > box.min.z && z - r < box.max.z &&
        this.position.y + 0.4 > box.min.y && this.position.y - 1.4 < box.max.y
      ) {
        return true;
      }
    }
    return false;
  }

  _move(dt) {
    let forward = 0;
    let strafe = 0;
    const k = this._keys;
    if (k.has('ArrowUp') || k.has('KeyW')) forward += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) forward -= 1;
    if (k.has('KeyA')) strafe -= 1;
    if (k.has('KeyD')) strafe += 1;
    // In free mode the left/right arrows turn rather than strafe: less
    // disorienting for anyone not used to game controls.
    if (k.has('ArrowLeft')) this.yaw += dt * 1.5;
    if (k.has('ArrowRight')) this.yaw -= dt * 1.5;

    if (forward === 0 && strafe === 0) return;

    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 1.7 : 1;
    const step = this.speed * boost * dt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // yaw 0 looks down -Z.
    let dx = (-sin * forward + cos * strafe) * step;
    let dz = (-cos * forward - sin * strafe) * step;

    // Resolve each axis independently so walking into a wall slides along it.
    const nextX = this.position.x + dx;
    if (!this._blocked(nextX, this.position.z)) this.position.x = nextX;
    const nextZ = this.position.z + dz;
    if (!this._blocked(this.position.x, nextZ)) this.position.z = nextZ;

    if (this.bounds) {
      this.position.x = THREE.MathUtils.clamp(this.position.x, this.bounds.min.x, this.bounds.max.x);
      this.position.z = THREE.MathUtils.clamp(this.position.z, this.bounds.min.z, this.bounds.max.z);
    }
    this.position.y = this.eyeHeight;
  }

  /* --- frame ------------------------------------------------------------ */

  update(dt) {
    if (!this.enabled) return;
    const step = Math.min(dt, 1 / 20);

    if (this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + step / tw.duration);
      const e = EASE(tw.t);
      this.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.yaw = tw.fromYaw + angleDelta(tw.fromYaw, tw.toYaw) * e;
      this.pitch = tw.fromPitch + (tw.toPitch - tw.fromPitch) * e;
      if (tw.t >= 1) {
        this._tween = null;
        tw.onArrive?.(tw.stop);
        this.onArrive(tw.stop);
      }
    } else if (this.mode === 'free') {
      this._move(step);
    } else {
      // Relax the look offsets back toward the stop's framing.
      const relax = Math.exp(-this.lookRecentre * step * 3);
      if (!this._pointer.active) {
        this.lookYaw *= relax;
        this.lookPitch *= relax;
      }
    }

    this.apply();
  }

  apply() {
    const yaw = this.yaw + (this.mode === 'guided' ? this.lookYaw : 0);
    const pitch = THREE.MathUtils.clamp(
      this.pitch + (this.mode === 'guided' ? this.lookPitch : 0),
      -this.pitchLimit,
      this.pitchLimit
    );
    this.camera.position.copy(this.position);
    // YXZ keeps yaw and pitch independent and leaves roll at zero.
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  /** A stop that frames `point` from `distance` away, at eye height. */
  static focusStop(point, opts = {}) {
    const {
      distance = 1.5,
      from = new THREE.Vector3(0, 0, 1),
      eyeHeight = 1.55,
      id,
      lift = 0,
    } = opts;
    const dir = from.clone().setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const position = point.clone().addScaledVector(dir, distance);
    position.y = eyeHeight + lift;
    return { id, position: position.toArray(), target: point.toArray() };
  }
}
