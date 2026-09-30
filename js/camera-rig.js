/* ==========================================================================
   Camera rig.

   Two modes share one state (position + yaw + pitch), so switching between
   guided stops and free exploration never snaps the view:

   guided  the camera eases to a predefined stop; drag/swipe nudges the look
           direction within a limited cone, then relaxes back to centre.
   free    arrow keys / WASD walk, drag looks freely, AABBs block walls.

   The two coexist rather than being modes you switch between: touching a
   movement key, or clicking the floor, hands over to free walking on the spot,
   and the guided stop list is still there to be stepped through afterwards.
   Nothing about the tour is lost by walking off it.

   Roll is never touched — the horizon stays level in both modes.
   ========================================================================== */

import * as THREE from 'three';

const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TAU = Math.PI * 2;

/* Every key that means "move me", checked as a set so touching any of them can
   hand guided viewing over to free walking. */
const MOVE_KEYS = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
];

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

    /* Cleared while a space transition is playing. The threshold walk is a
       scripted dolly with no colliders and no bounds, so letting a held arrow
       key take the camera over mid-transition would walk it out of the world. */
    this.walkEnabled = true;

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
      // A second finger (an attempted pinch) must not take over the look
      // drag, nor let the gesture end as a tap that walks or picks.
      if (!e.isPrimary && this._pointer.active) {
        this._pointer.moved = Infinity;
        return;
      }
      this._pointer.active = true;
      this._pointer.id = e.pointerId;
      this._pointer.x = e.clientX;
      this._pointer.y = e.clientY;
      this._pointer.moved = 0;
      this._pointer.touch = e.pointerType !== 'mouse';
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
  wasDrag(threshold) {
    // A fingertip wobbles a few pixels even on a deliberate tap, so touch
    // gets more slack before a tap on the floor is read as a look-drag.
    const limit = threshold ?? (this._pointer.touch ? 22 : 8);
    return this._pointer.moved > limit;
  }

  /** True while a pointer is held down — i.e. mid look-around. */
  get isDragging() {
    return this._pointer.active;
  }

  dispose() {
    for (const [target, type, handler, options] of this._listeners) {
      target.removeEventListener(type, handler, options);
    }
    this._listeners.length = 0;
  }

  /* --- modes ----------------------------------------------------------- */

  /** True while any walk or turn key is down and walking is allowed. */
  get isWalking() {
    if (!this.walkEnabled) return false;
    const k = this._keys;
    return MOVE_KEYS.some((code) => k.has(code));
  }

  setMode(mode, reason = 'button') {
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
    this.onModeChange(mode, reason);
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

  /**
   * Walk to a point on the floor.
   *
   * The same eased move as a guided stop, with two differences that matter:
   * the visitor's own look direction is kept — the point was clicked, so they
   * are already looking at it, and turning the camera for them would be
   * disorienting — and the walk ends in free mode rather than parked at a
   * stop's framing. The guided stop list is untouched, so Next still works
   * from wherever they end up.
   *
   * @param {THREE.Vector3} point where on the floor to stand
   * @returns {number} seconds the walk will take, 0 if it is not worth making
   */
  walkTo(point, opts = {}) {
    const destination = this._reachable(point);
    const distance = this.position.distanceTo(destination);
    if (distance < 0.14) return 0;

    let duration = opts.duration
      ?? THREE.MathUtils.clamp(0.32 + distance * 0.2, 0.4, 2.2);
    if (prefersReducedMotion()) duration = Math.min(duration, 0.4);

    // Fold any guided look offset into the absolute orientation now, so the
    // hand-off to free look at the end of the walk does not jump the view.
    const yaw = this.yaw + (this.mode === 'guided' ? this.lookYaw : 0);
    const pitch = this.pitch + (this.mode === 'guided' ? this.lookPitch : 0);
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.stop = null;

    this._tween = {
      t: 0,
      duration,
      fromPos: this.position.clone(),
      toPos: destination,
      fromYaw: yaw,
      toYaw: yaw,
      fromPitch: pitch,
      toPitch: pitch,
      stop: null,
      onArrive: opts.onArrive,
      endFree: true,
    };
    return duration;
  }

  /**
   * The furthest point along the straight line to `point` that can actually be
   * stood on. Walked in short steps rather than solved, because the colliders
   * are a plain list of boxes and the room is small: clicking the floor behind
   * the counter should walk you up to the counter, not through it.
   */
  _reachable(point) {
    const from = this.position;
    const dx = point.x - from.x;
    const dz = point.z - from.z;
    const total = Math.hypot(dx, dz);
    const best = new THREE.Vector3(from.x, this.eyeHeight, from.z);
    if (total < 1e-4) return best;

    const step = 0.15;
    for (let d = step; d <= total; d += step) {
      const t = Math.min(1, d / total);
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      if (this._blocked(x, z)) break;
      if (this.bounds && (
        x < this.bounds.min.x || x > this.bounds.max.x ||
        z < this.bounds.min.z || z > this.bounds.max.z
      )) break;
      best.set(x, this.eyeHeight, z);
    }
    return best;
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
      // A movement key during a move means "let me steer" — abandon the rest
      // of the tween rather than fighting the visitor for the camera.
      if (this.isWalking) {
        this._tween = null;
        this.setMode('free', 'keys');
        this._move(step);
        this.apply();
        return;
      }
      tw.t = Math.min(1, tw.t + step / tw.duration);
      const e = EASE(tw.t);
      this.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.yaw = tw.fromYaw + angleDelta(tw.fromYaw, tw.toYaw) * e;
      this.pitch = tw.fromPitch + (tw.toPitch - tw.fromPitch) * e;
      if (tw.t >= 1) {
        this._tween = null;
        if (tw.endFree) this.setMode('free', 'walk');
        tw.onArrive?.(tw.stop);
        this.onArrive(tw.stop);
      }
    } else if (this.mode === 'free') {
      this._move(step);
    } else if (this.isWalking) {
      // Free walking is always available, not something to be turned on first:
      // pressing an arrow key walks, from a guided stop as readily as anywhere.
      this.setMode('free', 'keys');
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
