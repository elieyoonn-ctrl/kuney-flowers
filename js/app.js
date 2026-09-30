/* ==========================================================================
   KUNEY FLOWERS — application

   Owns the renderer, the one Scene, the camera rig, and the routing between
   the three spaces: shop → threshold → garden. Everything visual lives in the
   scene modules; everything persisted lives in store.js. This is the wiring.
   ========================================================================== */

import * as THREE from 'three';
import * as store from './store.js';
import { buildShop, ROOM } from './scene-shop.js';
import { buildCorridor } from './scene-corridor.js';
import { buildGarden, GARDEN } from './scene-garden.js';
import { CameraRig } from './camera-rig.js';
import { BoardTexture, CalendarPanel } from './calendar.js';
import { Order } from './order.js';
import * as invoiceView from './invoice.js';
import { GardenGame } from './garden-game.js';

/* --- tiny DOM helpers --------------------------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const role = (name, root = document) => root.querySelector(`[data-role="${name}"]`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- copy for the stops that are places, not things --------------------- --
   A display carries its own panel copy and a frame carries its caption; the
   rest of the tour is rooms and furniture. They get a line each so the side
   panel can stay in step with Next and Previous wherever they land, instead of
   shutting whenever the visitor steps off a flower. Keyed by stop id, and only
   used in the shop — the garden has its own panel.
   ---------------------------------------------------------------------- */

const STOP_NOTES = {
  entrance: {
    kind: 'The room',
    body: 'Sixteen metres by twenty-two, four and a half to the ceiling, in one lime plaster. The bright ellipse on the stone is a real cast shadow — daylight through a circular hole in the ceiling.',
  },
  island: {
    kind: 'On the long table',
    body: 'A raw-edged banded onyx monolith, lit from a concealed strip under the overhang. Everything happens here: the stems you gather stand in the peach opaline vase, and the invoice prints at the far end.',
  },
  seating: {
    kind: 'The steps',
    body: 'A curved flight of plaster steps, wrapping the bark-clad column that stands up through them. Three vases of stock stand on the upper treads, and the risers face the room — the front of the stairs, not the back of them.',
  },
  calendar: {
    kind: 'On the back wall',
    body: 'The plaster board, drawn from live stock: three bouquets a day, every day, with three days’ notice. A day at zero is sold out and cannot be chosen.',
  },
  portal: {
    kind: 'Through the door',
    body: 'The plaster threshold to the walled garden — gravel paths, raised beds, a long basin and olive trees in terracotta. Sow a seed there and come back tomorrow to water it.',
  },
};

/* --- application ------------------------------------------------------- */

class App {
  constructor(content) {
    this.content = content;
    this.space = 'shop';
    this.stopIndex = 0;
    this.selectedId = null;
    this.detailDisplayId = null;    // the display the detail panel is showing
    this.detailsViewedId = null;    // phone: display whose sheet was read and closed
    this.entered = false;
    this.orderPanelFromTour = false;   // the tour may close what the tour opened
    this.transitioning = false;
    this.pickedStems = new Map();   // displayId → [hidden stem objects]
    this._orderTimers = [];         // wrap → print → invoice, cancellable

    this.order = new Order(content);
    this.scenes = {};
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.dom = {
      host: $('#canvas-host'),
      veil: $('#veil'),
      loader: $('#loader'),
      loaderStatus: role('loader-status'),
      landing: $('#landing'),
      hud: $('#hud'),
      invoice: $('#invoice-overlay'),
      toasts: $('#toasts'),
      live: role('live'),
      panels: {
        detail: $('#panel-detail'),
        order: $('#panel-order'),
        garden: $('#panel-garden'),
      },
    };
  }

  /* --- boot ------------------------------------------------------------ */

  async boot() {
    this.setupRenderer();
    this.renderLanding();
    this.bindGlobalEvents();

    this.status('Cutting stone and plaster');
    await wait(30);

    this.scenes.shop = buildShop(this.content, { renderer: this.renderer });
    this.scenes.shop.applyEnvironment(this.scene);
    this.scene.add(this.scenes.shop.root);

    this.status('Arranging the flowers');
    await wait(30);

    this.board = new BoardTexture(this.scenes.shop.calendarMaterial);
    this.refreshBoard();

    this.rig = new CameraRig(this.camera, this.renderer.domElement, {
      eyeHeight: 1.58,
      onArrive: (stop) => this.onArrive(stop),
      onModeChange: (m, reason) => this.onRigMode(m, reason),
    });
    this.rig.setColliders(this.scenes.shop.colliders);
    this.rig.bounds = this.scenes.shop.bounds;
    this.rig.jumpTo(this.scenes.shop.entranceStop);

    this.buildFloorPlan();
    this.buildOrderPanel();
    this.bindOrder();
    this.updateStepUI();
    this.updateSpaceToggle();

    // The wall board is drawn with the editorial serif; redraw once it lands.
    document.fonts?.ready.then(() => this.refreshBoard());

    // First frame, then a hero still + thumbnails captured from the real room.
    this.renderer.render(this.scene, this.camera);
    this.status('Letting the light in');
    await wait(30);
    this.captureStills();

    this.dom.host.classList.add('is-live');
    this.dom.loader.hidden = true;
    this.clock.start();
    this.loop();

    window.KUNEY_REPORT?.('boot: complete');
    this.applyRoute(location.hash, { initial: true });
    window.addEventListener('hashchange', () => this.applyRoute(location.hash));
  }

  status(text) {
    if (this.dom.loaderStatus) this.dom.loaderStatus.textContent = text;
    window.KUNEY_REPORT?.(`boot: ${text}`);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Cap the pixel ratio: the space is soft and diffuse, so extra samples
    // cost frames without buying much.
    this.renderer.setPixelRatio(this.pixelRatio());
    const { w, h } = this.viewportSize();
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dom.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fovFor(w, h), w / h, 0.05, 140);

    /* Phones and tablets change size in more ways than 'resize' reports on
       time: iOS Safari's toolbar collapsing, a rotation (whose first resize can
       still carry the old dimensions), split view on an iPad. Watch the host
       itself and the visual viewport too, and coalesce into one resize per
       frame so a rotation does not reallocate the drawing buffer five times. */
    const schedule = () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => {
        this._resizeQueued = false;
        this.onResize();
      });
    };
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', () => {
      schedule();
      // iOS settles the new layout a beat after the event.
      setTimeout(schedule, 250);
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(schedule).observe(this.dom.host);
    }
  }

  /** The size of the space on screen, in CSS pixels. */
  viewportSize() {
    const host = this.dom.host;
    const w = host?.clientWidth || window.innerWidth;
    const h = host?.clientHeight || window.innerHeight;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  pixelRatio() {
    const cap = Math.min(window.innerWidth, window.innerHeight) < 900 &&
      Math.max(window.innerWidth, window.innerHeight) < 1400 ? 1.6 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  /**
   * Vertical field of view for a viewport. The stops are framed for a
   * landscape screen; held upright, a phone at the same vertical angle sees a
   * sliver of the room, so the angle opens as the screen narrows — capped
   * before the edges start to stretch.
   */
  fovFor(w, h) {
    const aspect = w / h;
    if (aspect >= 1) return w < 700 ? 62 : 52;
    return Math.min(74, 62 + (1 - aspect) * 22);
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const { w, h } = this.viewportSize();
    const ratio = this.pixelRatio();
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.fovFor(w, h);
    this.camera.updateProjectionMatrix();
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;

    this.rig?.update(dt);
    this.currentScene?.update(dt, elapsed);
    if (this.space === 'corridor') this.scenes.corridor?.update(dt, elapsed);

    /* The pointer can sit still while the room moves past it — walking with
       the keyboard, or riding a guided move — which would otherwise leave the
       last thing hovered lit and the cursor lying about what is under it.
       `hoverAt` throttles itself, so this costs at most a cast every 70 ms. */
    if (this._pointerAt && (this.rig?.isMoving || this.rig?.isWalking)) {
      this.hoverAt(this._pointerAt.x, this._pointerAt.y);
    }

    this.updatePlanMarker();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  get currentScene() {
    return this.scenes[this.space];
  }

  get stops() {
    return this.currentScene?.stops || [];
  }

  /* --- captured stills -------------------------------------------------- */

  /**
   * Render a few frames of the actual room to use as the landing hero and the
   * featured cards. Cheaper and truer than shipping stock photography, and it
   * updates automatically when the interior is re-themed.
   */
  captureStills() {
    const shop = this.scenes.shop;
    const savedSize = new THREE.Vector2();
    this.renderer.getSize(savedSize);
    const savedRatio = this.renderer.getPixelRatio();
    const savedPos = this.camera.position.clone();
    const savedRot = this.camera.rotation.clone();
    const savedFov = this.camera.fov;
    const savedAspect = this.camera.aspect;

    const shoot = (position, target, w, h, fov = 46) => {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
      this.camera.fov = fov;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.camera.position.fromArray(position);
      this.camera.lookAt(new THREE.Vector3().fromArray(target));
      this.renderer.render(this.scene, this.camera);
      // Read synchronously, before the browser composites and clears.
      return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
    };

    try {
      const hero = shoot([2.6, 1.72, 8.2], [-0.6, 1.5, -2.4], 1600, 900, 54);
      const heroEl = role('hero-image');
      if (heroEl) {
        heroEl.style.backgroundImage = `url(${hero})`;
        heroEl.classList.add('is-set');
      }

      /* Only the displays that appear on the landing page. Each of these is a
         full render plus a synchronous toDataURL, and the shop now stands
         twenty-one vases — shooting the seventeen nobody will look at only
         made the loader sit there longer. */
      this.stills = new Map();
      for (const display of this.featuredDisplays) {
        const entry = shop.displays.get(display.id);
        if (!entry) continue;
        this.stills.set(
          display.id,
          shoot(entry.stop.position, entry.stop.target, 480, 600, 40)
        );
      }
    } catch (err) {
      // A capture failure is cosmetic — the placeholders still look fine.
      console.warn('Still capture unavailable:', err);
      this.stills = this.stills || new Map();
    }

    this.renderer.setPixelRatio(savedRatio);
    this.renderer.setSize(savedSize.x, savedSize.y, false);
    this.camera.fov = savedFov;
    this.camera.aspect = savedAspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(savedPos);
    this.camera.rotation.copy(savedRot);

  }

  /** Best available image for a display: owner photo, then captured still. */
  imageFor(display) {
    if (display.photo) return display.photo;
    return this.stills?.get(display.id) || null;
  }

  /* --- landing ---------------------------------------------------------- */

  renderLanding() {
    const c = this.content;
    role('hero-eyebrow').textContent = c.brand.tagline;
    // The hero name is the logo image; the brand text becomes its alt.
    role('hero-name').alt = c.brand.logoText;
    role('hero-mark').textContent = c.brand.logoMark;
    role('hero-season').textContent = [c.brand.seasonLabel, c.brand.seasonName].filter(Boolean).join(' — ');
    role('hero-intro').textContent = c.brand.intro;
    role('enter-btn').textContent = c.brand.enterLabel;
    // The HUD brand is the logo image, so the brand copy names it rather than
    // being written into it — setting textContent here would delete the <img>.
    const logo = role('hud-logo');
    if (logo) logo.alt = `${c.brand.name} — back to the front page`;
    document.title = `${c.brand.name} — A Virtual Flower Shop`;

    // Sizes
    role('sizes-grid').innerHTML = c.sizes.map((s) => `
      <div>
        <h3>${esc(s.label)}</h3>
        <p class="sizes__price">${esc(c.currency)} ${s.price.toLocaleString('en-HK')}</p>
        <p>${esc(s.note || '')}</p>
      </div>
    `).join('');
    role('sizes-note').textContent = c.invoice.note;

    // Footer
    role('foot-order').innerHTML = `
      <li><a href="${esc(c.contact.productUrl)}" target="_blank" rel="noopener">Order online</a></li>
      <li><a href="https://wa.me/${esc(c.contact.whatsappDigits)}" target="_blank" rel="noopener">WhatsApp ${esc(c.contact.whatsapp)}</a></li>
      <li><a href="${esc(c.contact.siteUrl)}" target="_blank" rel="noopener">kuneyflowers.com</a></li>
    `;
    role('foot-contact').innerHTML = `
      <li><a href="${esc(c.contact.instagram)}" target="_blank" rel="noopener">Instagram</a></li>
      <li><a href="${esc(c.contact.threads)}" target="_blank" rel="noopener">Threads</a></li>
    `;
    role('foot-delivery').innerHTML = c.delivery
      .map((d) => `<li>${esc(d.zone)} — ${esc(d.label)}</li>`)
      .join('');
    role('foot-copy').textContent = `© ${new Date().getFullYear()} ${c.brand.name}`;

    if (!reducedMotion()) this.spawnMotes();
  }

  spawnMotes() {
    const host = role('motes');
    if (!host) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 16; i += 1) {
      const el = document.createElement('i');
      el.style.left = `${Math.random() * 100}%`;
      el.style.bottom = `${-10 - Math.random() * 20}%`;
      el.style.animationDuration = `${18 + Math.random() * 22}s`;
      el.style.animationDelay = `${-Math.random() * 30}s`;
      el.style.opacity = String(0.3 + Math.random() * 0.5);
      const scale = 0.5 + Math.random() * 1.1;
      el.style.transform = `scale(${scale})`;
      frag.appendChild(el);
    }
    host.appendChild(frag);
  }

  /** The arrangements shown on the landing page — and the only ones that need
   *  a still captured for them. One list, so the two cannot drift apart. */
  get featuredDisplays() {
    return this.content.displays.slice(0, 4);
  }

  cardHTML(display) {
    const src = this.imageFor(display);
    const art = src
      ? `<div class="card__art"><img src="${esc(src)}" alt="${esc(display.title)}" loading="lazy" /></div>`
      : `<div class="card__art card__art--empty" data-initials="${esc(display.title.slice(0, 2).toUpperCase())}"></div>`;
    return `
      <button class="card" data-action="open-display" data-id="${esc(display.id)}">
        ${art}
        <div>
          <p class="card__title">${esc(display.title)}</p>
          <p class="card__meta">${esc((display.varieties || []).slice(0, 2).join(' · '))}</p>
        </div>
      </button>
    `;
  }

  /* --- entering / leaving ---------------------------------------------- */

  async enter({ space = 'shop', displayId = null } = {}) {
    if (this.transitioning) return;
    this.dom.landing.hidden = true;
    this.entered = true;
    this.dom.hud.hidden = false;

    if (space !== this.space) {
      await this.transitionTo(space, { silent: true });
    } else {
      this.goToStopIndex(0);
    }

    if (displayId) this.focusDisplay(displayId);
    this.hint(
      this.isTouch()
        ? 'Swipe to look · tap the floor to walk · tap a flower to gather it'
        : 'Arrow keys to walk · click the floor to go there · Next for the guided tour'
    );
    this.syncRoute();
  }

  toLanding() {
    this.entered = false;
    this.dom.hud.hidden = true;
    this.closePanels();
    this.dom.landing.hidden = false;
    this.dom.landing.scrollTop = 0;
    history.replaceState(null, '', location.pathname);
  }

  /* --- space transitions ----------------------------------------------- */

  async transitionTo(space, { silent = false } = {}) {
    if (this.transitioning || space === this.space) return;
    this.transitioning = true;
    this.closePanels();
    this.hint('');
    // The threshold walk is a scripted dolly through a space with no colliders,
    // so hand-walking has to be off for the duration of it.
    this.rig.walkEnabled = false;

    const forward = space === 'garden';

    await this.veil(true, 520);

    // Detach the current space, attach the threshold.
    if (this.currentScene) this.scene.remove(this.currentScene.root);
    if (!this.scenes.corridor) this.scenes.corridor = buildCorridor(this.content);
    const corridor = this.scenes.corridor;
    this.scene.add(corridor.root);
    corridor.applyEnvironment(this.scene, this.scenes.shop?.envTexture);

    const path = forward ? corridor.path : [...corridor.path].reverse();
    this.rig.setColliders([]);
    this.rig.bounds = null;
    this.rig.setMode('guided');
    this.rig.jumpTo({ ...path[0], id: 'threshold' });
    this.space = 'corridor';

    await this.veil(false, 620);

    // Walk the dolly. A tap or a key skips ahead.
    this.skipRequested = false;
    const skip = () => { this.skipRequested = true; };
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });

    for (let i = 1; i < path.length; i += 1) {
      if (this.skipRequested) break;
      const duration = reducedMotion() ? 0.4 : 1.5;
      this.rig.goTo({ ...path[i], id: `threshold-${i}` }, { duration });
      await wait(duration * 1000 * 0.86);
    }
    window.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', skip);

    await this.veil(true, 520);
    this.scene.remove(corridor.root);

    // Attach the destination.
    if (space === 'garden' && !this.scenes.garden) {
      this.status('Opening the garden');
      this.scenes.garden = buildGarden(this.content, { renderer: this.renderer });
      this.game = new GardenGame(this.content, this.scenes.garden);
      this.game.subscribe(() => this.renderGardenPanel());
    }

    this.space = space;
    const next = this.currentScene;
    this.scene.add(next.root);
    next.applyEnvironment(this.scene);
    this.rig.setColliders(next.colliders);
    this.rig.bounds = next.bounds;
    this.rig.jumpTo(next.entranceStop);
    this.stopIndex = 0;
    this.selectedId = null;

    this.buildFloorPlan();
    this.updateStepUI();
    this.updateSpaceToggle();
    if (space === 'garden') this.openGardenPanel();

    await this.veil(false, 720);
    this.transitioning = false;
    this.rig.walkEnabled = true;

    if (!silent) {
      this.announce(space === 'garden' ? 'You are in the garden.' : 'You are back in the shop.');
    }
    if (space === 'garden') {
      this.hint('Tap a bed to sow, water and cut · the plaque links to the real shop');
    } else {
      this.hint(this.isTouch() ? 'Tap a flower to gather it' : 'Click a flower to gather it');
    }
    this.syncRoute();
  }

  veil(up, ms) {
    this.dom.veil.classList.toggle('is-up', up);
    return wait(ms);
  }

  /* --- guided navigation ------------------------------------------------ */

  goToStopIndex(index, { announce = true } = {}) {
    const stops = this.stops;
    if (!stops.length) return;
    const wrapped = ((index % stops.length) + stops.length) % stops.length;
    this.stopIndex = wrapped;
    const stop = stops[wrapped];

    this.rig.setMode('guided');
    this.rig.goTo(stop);

    /* The side panel follows the tour rather than standing in the way of it:
       stepping swaps its contents for the new stop, keeps it open, brings it
       back if the visitor had closed it, and never takes the focus off the
       arrow that was just pressed. */
    if (stop.displayId) this.selectDisplay(stop.displayId, { move: false, focus: false });
    else {
      this.clearSelection({ closeDetail: false });
      this.syncStopDetail(stop);
    }

    this.updateStepUI();
    if (announce) this.announce(`${stop.label}. Stop ${wrapped + 1} of ${stops.length}.`);
  }

  step(delta) {
    this.goToStopIndex(this.stopIndex + delta);
  }

  /**
   * A camera move finished. Only a *stop* has anything to open on arrival: a
   * free walk arrives too, with no stop attached, and must not fire the side
   * effects of whichever stop the visitor happened to leave from.
   */
  onArrive(stop) {
    if (!stop) return;
    if (stop.kind === 'calendar') this.openOrderPanel({ focus: 'calendar', fromTour: true });
    if (stop.kind === 'plot') this.openGardenPanel(stop.plotIndex);
  }

  onRigMode(mode, reason) {
    const btn = role('explore-btn');
    if (btn) btn.setAttribute('aria-pressed', String(mode === 'free'));
    if (mode !== 'free') {
      this.hint('');
      return;
    }
    // Walking off the tour is ordinary now, so it is not worth a live-region
    // announcement every time someone touches an arrow key — only when they
    // asked for free exploration by name.
    if (reason === 'button') {
      this.hint('Arrow keys or WASD to walk · drag to look · Esc returns to the tour');
      this.announce('Free exploration on.');
    } else if (reason === 'keys') {
      this.hint('Walking freely · Next returns you to the tour · Esc goes back to this stop');
    }
  }

  toggleExplore() {
    if (this.isTouch()) {
      // Walking is not desktop-only any more — there is just no keyboard to
      // announce, so say what does work here instead.
      this.toast('Tap the floor to walk over to it, or use the arrows for the tour.');
      return;
    }
    this.rig.setMode(this.rig.mode === 'free' ? 'guided' : 'free');
    if (this.rig.mode === 'guided') this.goToStopIndex(this.stopIndex, { announce: false });
  }

  updateStepUI() {
    const stops = this.stops;
    const stop = stops[this.stopIndex];
    role('stop-label').textContent = stop?.label || '—';
    role('stop-index').textContent = `${this.stopIndex + 1} / ${stops.length}`;
    const exit = role('exit-focus');
    if (exit) exit.hidden = !this.selectedId;
    this.updatePlanDots();
  }

  updateSpaceToggle() {
    const btn = role('space-toggle');
    if (!btn) return;
    const toGarden = this.space !== 'garden';
    const label = toGarden ? 'Go to the garden' : 'Go back to the shop';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  /* --- floor plan ------------------------------------------------------- */

  get planRoom() {
    return this.space === 'garden'
      ? { width: GARDEN.width, depth: GARDEN.depth }
      : { width: ROOM.width, depth: ROOM.depth };
  }

  /** World metres → the 100 × 130 plan box, with a margin. */
  planProject(x, z) {
    const { width, depth } = this.planRoom;
    return [
      6 + ((x + width / 2) / width) * 88,
      6 + ((z + depth / 2) / depth) * 118,
    ];
  }

  /**
   * Build the miniature plan with namespaced DOM nodes rather than innerHTML:
   * setting innerHTML on an SVG element relies on the parser picking up the
   * context namespace, which is not somewhere worth being clever.
   */
  svg(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  }

  buildFloorPlan() {
    const shell = role('plan-shell');
    const title = role('plan-title');
    if (!shell) return;

    shell.replaceChildren();
    const { width, depth } = this.planRoom;

    const [x0, z0] = this.planProject(-width / 2, -depth / 2);
    const [x1, z1] = this.planProject(width / 2, depth / 2);
    shell.appendChild(this.svg('rect', {
      class: 'plan__room',
      x: x0.toFixed(1),
      y: z0.toFixed(1),
      width: (x1 - x0).toFixed(1),
      height: (z1 - z0).toFixed(1),
      rx: 2,
    }));

    const feature = (x, z, w, d) => {
      const [px, pz] = this.planProject(x - w / 2, z - d / 2);
      const [qx, qz] = this.planProject(x + w / 2, z + d / 2);
      shell.appendChild(this.svg('rect', {
        class: 'plan__feature',
        x: px.toFixed(1),
        y: pz.toFixed(1),
        width: Math.max(1, qx - px).toFixed(1),
        height: Math.max(1, qz - pz).toFixed(1),
        rx: 1,
      }));
    };

    if (this.space === 'garden') {
      title.textContent = 'Garden plan';
      feature(0, 6.4, 7.4, 1.9);           // basin
      feature(0, -9.6, 2.6, 0.5);          // bench
      for (const [bx, bz] of [[-3.6, 1.2], [0, 1.2], [3.6, 1.2],
        [-3.6, -3.6], [0, -3.6], [3.6, -3.6]]) {
        feature(bx, bz, 2.5, 1.9);         // raised beds
      }
    } else {
      title.textContent = 'Floor plan';
      feature(ROOM.island.x, ROOM.island.z, ROOM.island.width, ROOM.island.depth);
      feature(-4.25, -4.35, 5.4, 5.4);     // the plaster steps
      feature(-3.9, -5.4, 0.72, 0.72);     // concrete column
      feature(0.6, -6.6, 0.9, 0.9);        // olive tree
      feature(5.0, 4.3, 2.9, 0.86);        // low table
      feature(7.7, 0.6, 0.34, 3.3);        // wall shelves
    }

    this.updatePlanDots();
  }

  updatePlanDots() {
    const host = role('plan-dots');
    if (!host) return;
    host.replaceChildren();

    this.stops.forEach((stop, i) => {
      const [x, z] = this.planProject(stop.position[0], stop.position[2]);
      const active = i === this.stopIndex;
      const dot = this.svg('circle', {
        class: `plan__dot${active ? ' is-active' : ''}`,
        cx: x.toFixed(1),
        cy: z.toFixed(1),
        r: active ? 3.1 : 2.2,
        'data-stop': i,
      });
      const label = this.svg('title');
      label.textContent = stop.label;
      dot.appendChild(label);
      host.appendChild(dot);
    });
  }

  updatePlanMarker() {
    const g = role('plan-you');
    if (!g || !this.rig || this.dom.hud.hidden) return;
    const dot = g.querySelector('.plan__you');
    const cone = g.querySelector('.plan__cone');
    const [x, z] = this.planProject(this.rig.position.x, this.rig.position.z);
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', z.toFixed(1));

    // A small view cone, pointing where the camera looks.
    const yaw = this.rig.yaw + (this.rig.mode === 'guided' ? this.rig.lookYaw : 0);
    const dirX = -Math.sin(yaw);
    const dirZ = -Math.cos(yaw);
    const len = 11;
    const spread = 0.42;
    const ax = x + (dirX * Math.cos(spread) - dirZ * Math.sin(spread)) * len;
    const az = z + (dirX * Math.sin(spread) + dirZ * Math.cos(spread)) * len;
    const bx = x + (dirX * Math.cos(-spread) - dirZ * Math.sin(-spread)) * len;
    const bz = z + (dirX * Math.sin(-spread) + dirZ * Math.cos(-spread)) * len;
    cone.setAttribute('d', `M${x.toFixed(1)} ${z.toFixed(1)} L${ax.toFixed(1)} ${az.toFixed(1)} L${bx.toFixed(1)} ${bz.toFixed(1)} Z`);
  }

  /* --- selection + detail ---------------------------------------------- */

  selectDisplay(id, { move = true, focus = true } = {}) {
    const entry = this.scenes.shop?.displays.get(id);
    if (!entry) return;
    this.selectedId = id;
    this.detailsViewedId = null;
    this.scenes.shop.highlight(id);
    if (move) {
      const index = this.stops.findIndex((s) => s.displayId === id);
      if (index >= 0) {
        this.stopIndex = index;
        this.rig.setMode('guided');
        // On a phone the visitor stays zoomed on a display to gather from it,
        // so a swipe looks around freely instead of springing back.
        this.rig.goTo(this.stops[index], { freeLook: this.isTouch() });
      }
    }
    this.openDetail(entry, { focus });
    this.updateStepUI();
    this.syncRoute();
  }

  focusDisplay(id) {
    if (this.space !== 'shop') return;
    this.selectDisplay(id, { move: true });
  }

  /**
   * Drop the selection.
   *
   * `closeDetail` is off while the tour is stepping: the panel is about to be
   * refilled for the stop being arrived at, and closing it first would make it
   * slide out and back in on every press of Next.
   */
  clearSelection({ closeDetail = true } = {}) {
    this.selectedId = null;
    this.detailsViewedId = null;
    this.scenes.shop?.highlight(null);
    if (closeDetail) this.closePanel('detail');
    this.updateStepUI();
    this.syncRoute();
  }

  /**
   * Done looking at something: drop the focus and hand the camera to free
   * roaming where it stands, as on a computer. A parked guided stop springs
   * every swipe back to its framing, which on a phone read as being locked to
   * the tour. Next and Previous still pick the tour up from the same stop.
   */
  releaseToFreeRoam() {
    if (!this.entered || this.transitioning || !this.rig) return;
    if (this.selectedId) this.clearSelection();
    this.rig.setMode('free', 'release');
  }

  /**
   * On a phone, closing the sheet of a display the visitor has just read keeps
   * the camera zoomed on it, so further taps on its flowers gather stems
   * instead of bringing the sheet back. Leaving the view (the back arrow, the
   * tour arrows, walking off) clears the flag and the sheet shows again.
   * Returns whether it applied.
   */
  closeDetailForGathering() {
    const id = this.selectedId;
    if (!this.isTouch() || !id || this.detailDisplayId !== id
        || !this.dom.panels.detail?.classList.contains('is-open')) return false;
    this.closePanels();
    this.detailsViewedId = id;
    return true;
  }

  /**
   * Show, in the side panel, whatever the current stop is — for the stops that
   * are places rather than displays or photographs.
   *
   * Deliberately does nothing while the order or garden panel is open: the
   * visitor is in the middle of something there, and having Next swap it out
   * from under them would lose it. The arrows work either way.
   */
  syncStopDetail(stop) {
    if (!stop || this.space !== 'shop') return;
    const busy = ['order', 'garden'].some((name) => (
      this.dom.panels[name]?.classList.contains('is-open')
      && !(name === 'order' && this.orderPanelFromTour)
    ));
    if (busy) return;

    if (stop.frameId) {
      this.openFrame(stop.frameId, { focus: false });
      return;
    }

    const note = STOP_NOTES[stop.id];
    if (!note) return;
    // On a phone the sheet would cover the whole floor at the door, the one
    // place a visitor most wants to tap and walk from.
    if (stop.kind === 'entrance' && this.isTouch()) {
      this.closePanel('detail');
      return;
    }

    role('detail-kind').textContent = note.kind;
    role('detail-title').textContent = stop.label || note.kind;
    role('detail-body').innerHTML = `
      <div class="section">
        <h3>About</h3>
        <p class="prose">${esc(note.body)}</p>
      </div>
    `;
    role('detail-foot').innerHTML = '';
    this.openPanel('detail', { focus: false });
  }

  openDetail(entry, { focus = true } = {}) {
    const panel = this.dom.panels.detail;
    const d = entry.data;
    const picked = this.pickedStems.get(d.id) || [];
    const remaining = entry.bunch.children.length - picked.length;

    role('detail-kind').textContent = {
      'vase-table': 'On the long table',
      shelf: 'Wall shelf',
      steps: 'On the steps',
      floor: 'Floor arrangement',
    }[d.kind] || 'Display';
    role('detail-title').textContent = d.title;

    // What is actually standing in this vase, colour by colour. Kept as a
    // plain list of swatches so the panel's shape does not change.
    const groups = entry.colours || [];
    const colourList = groups.length > 1
      ? `
        <div class="section">
          <h3>In this vase <em>${groups.length} colours</em></h3>
          <ul class="varieties varieties--swatched">
            ${groups.map((g) => `
              <li><i style="background:${esc(g.hex)}"></i>${esc(g.label)}
                <em>${g.count} stems</em></li>
            `).join('')}
          </ul>
        </div>`
      : '';

    role('detail-body').innerHTML = `
      <div class="section">
        <h3>About</h3>
        <p class="prose">${esc(d.note || '')}</p>
      </div>
      ${colourList}
      <div class="section">
        <h3>Varieties${groups.length > 1
          ? ''
          : ` <em>${esc(groups[0]?.label || entry.colour.label)}</em>`}</h3>
        <ul class="varieties">
          ${(d.varieties || []).map((v) => `<li>${esc(v)}</li>`).join('')}
        </ul>
      </div>
      ${d.pickable === false ? `
        <p class="notice">A standing installation, renewed each season. Available for events and windows by enquiry.</p>
      ` : `
        <div class="section">
          <h3>Gather <em>${remaining} stem${remaining === 1 ? '' : 's'} in the vase</em></h3>
          <p class="prose">Take as many as you like — the stems you gather are a keepsake of your visit and do not set the variety or the count of the bouquet delivered. Choose a colour and an occasion in your order if you would like to guide us.</p>
        </div>
      `}
    `;

    role('detail-foot').innerHTML = `
      ${d.pickable === false ? '' : `
        <button class="btn btn--sage" data-action="pick" data-id="${esc(d.id)}"
                ${remaining <= 0 ? 'aria-disabled="true"' : ''}>
          ${remaining <= 0 ? 'Vase is empty' : 'Gather a stem'}
        </button>`}
      <button class="btn btn--ghost" data-action="share" data-id="${esc(d.id)}">Share this arrangement</button>
    `;

    this.openPanel('detail', { focus });
    this.detailDisplayId = d.id;
  }

  openFrame(frameId, { focus = true } = {}) {
    const frame = this.content.frames.find((f) => f.id === frameId);
    if (!frame) return;
    role('detail-kind').textContent = 'Photograph';
    role('detail-title').textContent = frame.title;
    role('detail-body').innerHTML = `
      <div class="section">
        <h3>Caption</h3>
        <p class="prose">${esc(frame.caption || '')}</p>
      </div>
      ${frame.photo ? `<img src="${esc(frame.photo)}" alt="${esc(frame.title)}" style="width:100%;border-radius:3px" />` : `
        <p class="notice">A photograph will hang here. Add one from the owner panel — drop the file into <code>images/</code> and set the path.</p>
      `}
    `;
    role('detail-foot').innerHTML = `
      <a class="btn btn--ghost" href="${esc(this.content.contact.productUrl)}" target="_blank" rel="noopener">Order a bouquet like this</a>
    `;
    this.openPanel('detail', { focus });
  }

  /* --- picking ---------------------------------------------------------- */

  pickStem(displayId, stemObject = null) {
    const shop = this.scenes.shop;
    const entry = shop?.displays.get(displayId);
    if (!entry) return;
    if (entry.data.pickable === false) {
      this.toast('The branch installation is not cut for bouquets.');
      return;
    }

    const hidden = this.pickedStems.get(displayId) || [];
    // Prefer the exact stem clicked; otherwise take the next visible one.
    let stem = stemObject;
    if (!stem || !stem.visible) {
      stem = entry.bunch.children.find((s) => s.visible);
    }
    if (!stem) {
      this.toast('That vase is empty — we cut more each morning.');
      return;
    }

    // Hide the meshes too, not just the group: three's raycaster tests the
    // objects it is handed, so a mesh under an invisible parent would still
    // swallow clicks.
    stem.traverse((o) => { o.visible = false; });
    hidden.push(stem);
    this.pickedStems.set(displayId, hidden);

    /* The stem's own colour, not the display's. A mixed vase holds several
       colours of one variety, so gathering the orange garden rose out of the
       warm bench has to put an orange garden rose in your vase — reading the
       colour off the display would quietly turn them all red. */
    const hex = stem.userData.hex || entry.colour.hex;
    const colorId = stem.userData.colorId || entry.colour.id;
    const colorLabel = stem.userData.colorLabel || entry.colour.label;

    shop.addPickedStem(entry.data.bloom, hex, this.order.picked.length);
    const total = this.order.addPicked({
      displayId,
      title: entry.data.title,
      recipeId: entry.data.bloom,
      hex,
      colorId,
    });

    this.toast(`${entry.data.title} — ${colorLabel.toLowerCase()} stem gathered. ${total} stem${total === 1 ? '' : 's'} in your vase.`);
    this.announce(`Gathered ${entry.data.title}. A keepsake of your visit — it does not change your order.`);
    if (this.dom.panels.detail.classList.contains('is-open') && this.selectedId === displayId) {
      this.openDetail(entry);
    }
  }

  returnAllStems() {
    for (const stems of this.pickedStems.values()) {
      for (const stem of stems) stem.traverse((o) => { o.visible = true; });
    }
    this.pickedStems.clear();
    this.scenes.shop?.clearVase();
    this.order.clearPicked();
    this.toast('Stems returned to their vases.');
  }

  /* --- order panel ------------------------------------------------------ */

  buildOrderPanel() {
    const body = role('order-body');
    body.innerHTML = `
      <p class="prose" data-role="order-lead"></p>

      <div class="section">
        <h3>Colour <em data-role="colour-count"></em></h3>
        <div class="chips" data-role="colour-chips" role="group"
             aria-label="Colour — choose one, or leave it to the florist"></div>
      </div>

      <div class="section">
        <h3>Occasion <em data-role="occasion-count"></em></h3>
        <div class="chips" data-role="occasion-chips" role="group"
             aria-label="Occasion — choose one, or leave it unspecified"></div>
      </div>

      <div class="section">
        <h3>Size</h3>
        <div class="chips" data-role="size-chips"></div>
      </div>

      <div class="section">
        <h3>Delivery date</h3>
        <div data-role="calendar-mount"></div>
      </div>

      <div class="section">
        <h3>Your order</h3>
        <div class="readout" data-role="order-readout"></div>
      </div>

      <div data-role="order-notices"></div>
    `;

    this.calendarPanel = new CalendarPanel(role('calendar-mount'), {
      onSelect: (key) => {
        this.order.setDate(key);
        this.refreshBoard();
      },
      getContent: () => this.content,
    });

    const first = store.firstAvailableDate();
    if (first) this.calendarPanel.showKey(first, { select: false });

    role('order-foot').innerHTML = `
      <button class="btn" data-action="confirm">Print the invoice</button>
      <button class="btn btn--ghost" data-action="return-stems">Return gathered stems</button>
    `;
  }

  bindOrder() {
    this.order.subscribe(() => {
      this.renderOrderPanel();
      this.renderBasket();
    });
    this.renderOrderPanel();
    this.renderBasket();
  }

  renderOrderPanel() {
    const c = this.content;
    const o = this.order;

    role('order-lead').textContent =
      'Two things guide our florist: one colour and one occasion. Both are optional — leave them to us and you will receive the best of the season.';

    // One choice each, and no stem counts: what a visitor gathered in the shop
    // has no bearing on the bouquet, so showing tallies here would mislead.
    const chosenColour = c.palette.find((p) => p.id === o.colorId);
    role('colour-count').textContent = chosenColour ? chosenColour.label : 'optional — choose one';

    role('colour-chips').innerHTML = c.palette.map((p) => `
      <button class="chip" data-action="colour" data-id="${esc(p.id)}"
              aria-pressed="${o.colorId === p.id}">
        <i style="background:${esc(p.hex)}"></i>
        <span>${esc(p.label)}</span>
      </button>
    `).join('');

    const chosenOccasion = c.occasions.find((x) => x.id === o.occasionId);
    role('occasion-count').textContent = chosenOccasion
      ? chosenOccasion.label
      : 'optional — choose one';

    role('occasion-chips').innerHTML = c.occasions.map((oc) => `
      <button class="chip" data-action="occasion" data-id="${esc(oc.id)}"
              aria-pressed="${o.occasionId === oc.id}">${esc(oc.label)}</button>
    `).join('');

    role('size-chips').innerHTML = c.sizes.map((s) => `
      <button class="chip chip--size" data-action="size" data-id="${esc(s.id)}"
              aria-pressed="${o.sizeId === s.id}">
        <strong>${esc(s.label)}</strong>
        <span>${esc(c.currency)} ${s.price.toLocaleString('en-HK')}</span>
      </button>
    `).join('');

    const size = o.size;
    role('order-readout').innerHTML = `
      <div><span>Bouquet</span><b>${size ? esc(size.label) : 'Not chosen'}</b></div>
      <div><span>Colour</span><b>${chosenColour ? esc(chosenColour.label) : 'Florist’s choice'}</b></div>
      <div><span>Occasion</span><b>${chosenOccasion ? esc(chosenOccasion.label) : 'Not specified'}</b></div>
      <div><span>Delivery</span><b>${o.dateKey ? esc(store.formatLongDate(o.dateKey)) : 'Choose a date'}</b></div>
      <div class="readout--total"><span>Total</span><b>${size ? esc(store.money(size.price)) : '—'}</b></div>
    `;

    const gaps = o.missing();
    role('order-notices').innerHTML = `
      ${gaps.length ? `<p class="notice notice--warn">Still to choose: ${esc(gaps.join(' and '))}.</p>` : ''}
      <p class="notice">${esc(c.invoice.gameNote)}</p>
    `;

    const confirm = $('[data-action="confirm"]', role('order-foot'));
    if (confirm) confirm.setAttribute('aria-disabled', String(!o.isReady));
  }

  renderBasket() {
    const wrap = role('basket');
    if (!wrap) return;
    const n = this.order.picked.length;
    wrap.hidden = n === 0 || this.space !== 'shop';
    role('basket-count').textContent = `${n} stem${n === 1 ? '' : 's'} gathered`;
    const colours = this.order.pickedColors().slice(0, 5);
    role('basket-swatches').innerHTML = colours
      .map((c) => `<i style="background:${esc(c.hex)}" title="${esc(c.label)}"></i>`)
      .join('');
  }

  /**
   * `fromTour` marks a panel the visitor did not ask for: arriving at the
   * calendar stop opens it. The tour is then allowed to swap it back out for
   * the next stop's copy, which one the visitor opened deliberately is not.
   */
  openOrderPanel({ focus = null, fromTour = false } = {}) {
    this.orderPanelFromTour = fromTour;
    this.calendarPanel.render();
    this.openPanel('order');
    if (focus === 'calendar') {
      requestAnimationFrame(() => this.calendarPanel.focusFirst());
    }
  }

  refreshBoard() {
    if (!this.board) return;
    const cursor = this.calendarPanel
      ? { year: this.calendarPanel.year, month: this.calendarPanel.month }
      : { year: new Date().getFullYear(), month: new Date().getMonth() };
    this.board.refresh(this.content, cursor.year, cursor.month, {
      selectedKey: this.order.dateKey,
    });
  }

  /* --- invoice ---------------------------------------------------------- */

  confirmOrder() {
    const gaps = this.order.missing();
    if (gaps.length) {
      this.toast(`Please choose ${gaps.join(' and ')} first.`, 'warn');
      this.openOrderPanel({ focus: gaps.includes('a delivery date') ? 'calendar' : null });
      return;
    }

    this.order.confirm();
    this.closePanel('order');

    if (this.space !== 'shop') {
      // Confirmed from the garden — no bench to wrap on, so go straight to it.
      setTimeout(() => this.showInvoice(), reducedMotion() ? 200 : 500);
      return;
    }

    const shop = this.scenes.shop;
    const quiet = reducedMotion();

    // Beat one: the gathered stems are wrapped and tied on the marble.
    const wrapTime = shop.wrap({ instant: quiet });
    if (wrapTime > 0) {
      // Framed on the wrapping bench: the vase on the right of shot, the clear
      // marble to its left where the finished bouquet is laid down. Pulled
      // back and up so the stems lifting clear of the vase, the paper and the
      // lay-down onto the marble all stay in frame. Held at a customer's eye
      // level in front of the long table, tilted down only ~7°, and stood
      // back ~1.95 m so the whole vase, every stem in it and the wrap fit.
      this.rig.goTo({
        id: 'wrapping',
        position: [0.64, 1.52, 3.40],
        target: [0.63, 1.28, 1.46],
      }, { duration: 1.1 });
      this.announce('Wrapping your bouquet.');
    }

    // Beat two: the printer issues the invoice.
    const toPrinter = () => {
      shop.print();
      this.rig.goTo(this.printingStop(), { duration: quiet ? 0.4 : 1.2 });
      setTimeout(() => this.showInvoice(), quiet ? 400 : 2100);
    };

    this._orderTimers.forEach(clearTimeout);
    this._orderTimers = [];
    if (wrapTime > 0) {
      // Hold a moment on the finished bouquet before turning to the printer.
      this._orderTimers.push(setTimeout(toPrinter, (wrapTime + 0.6) * 1000));
    } else {
      toPrinter();
    }
  }

  /**
   * Framing for the print. The printer is scaled up and its paper runs ~0.5 m
   * toward the customer, so a fixed close shot filled a phone screen with
   * blank paper. Instead look down on the printer and its paper from the
   * front, stood back far enough that ~1.5 m × 1.2 m fits the current
   * field of view — further back on a narrow portrait screen.
   */
  printingStop() {
    const target = new THREE.Vector3(1.78, 1.0, 1.9);
    const dir = new THREE.Vector3(-0.15, 0.55, 1).normalize();
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const distance = Math.max(1.5, 0.6 / Math.tan(vHalf), 0.75 / Math.tan(hHalf));
    return {
      id: 'printing',
      position: target.clone().addScaledVector(dir, distance).toArray(),
      target: target.toArray(),
    };
  }

  showInvoice() {
    const summary = this.order.summary();
    const c = this.content;
    role('invoice-paper').innerHTML = invoiceView.html(summary, c);

    role('invoice-actions').innerHTML = `
      <a class="btn btn--pay" href="${esc(c.contact.productUrl)}" target="_blank" rel="noopener"
         >${esc(c.invoice.payLabel)}</a>
      <button class="btn" data-action="save-invoice">${esc(c.invoice.saveLabel)}</button>
      <a class="btn" href="${esc(invoiceView.whatsappLink(summary, c))}" target="_blank" rel="noopener"
         >${esc(c.invoice.whatsappLabel)}</a>
      <button class="btn" data-action="close-invoice">Keep looking around</button>
    `;

    this.dom.invoice.classList.add('is-open');
    this.lastFocus = document.activeElement;
    requestAnimationFrame(() => this.dom.invoice.focus({ preventScroll: true }));
    this.trapFocus(this.dom.invoice);
    this.announce(`Invoice ${summary.reference} printed. Total ${store.money(summary.total)}.`);
  }

  closeInvoice() {
    this.dom.invoice.classList.remove('is-open');
    this.scenes.shop?.resetPrinter();
    this.releaseFocus();
    this.lastFocus?.focus?.({ preventScroll: true });
  }

  /** Keep Tab inside a true modal. Escape still closes it. */
  trapFocus(container) {
    this.releaseFocus();
    this._trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [...container.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', this._trap);
    this._trapHost = container;
  }

  releaseFocus() {
    if (this._trap && this._trapHost) {
      this._trapHost.removeEventListener('keydown', this._trap);
    }
    this._trap = null;
    this._trapHost = null;
  }

  async saveInvoice() {
    const summary = this.order.summary();
    try {
      const name = await invoiceView.download(summary, this.content);
      this.toast(`Saved ${name}. Send it to us on WhatsApp to pay by transfer.`);
    } catch {
      this.toast('Could not save the image — please screenshot the invoice instead.', 'warn');
    }
  }

  /* --- garden panel ----------------------------------------------------- */

  openGardenPanel(plotIndex = null) {
    if (!this.game) return;
    this.activePlot = plotIndex;
    this.renderGardenPanel();
    this.openPanel('garden');
  }

  renderGardenPanel() {
    if (!this.game) return;
    const g = this.content.garden;
    const s = this.game.summary();

    role('garden-eyebrow').textContent = g.title;
    role('garden-title').textContent = s.canClaim ? 'Welcome back' : 'Tend your beds';

    const streakDots = Array.from({ length: g.rewards.length }, (_, i) =>
      `<i class="${i < ((s.streak - 1) % g.rewards.length) + 1 ? 'is-on' : ''}"></i>`).join('');

    const varieties = this.game.seedVarieties;

    role('garden-body').innerHTML = `
      <p class="prose">${esc(g.intro)}</p>

      <div class="garden-stats">
        <div><b>${s.seeds}</b><span>Seeds</span></div>
        <div><b>${s.water}</b><span>Water</span></div>
        <div><b>${s.streak}</b><span>Day streak</span></div>
        <div><b>${s.bloomed}</b><span>Bloomed</span></div>
      </div>

      ${s.reward ? `
        <div class="reward">
          <div class="reward__streak">${streakDots}</div>
          <p class="eyebrow">Day ${s.streak} reward</p>
          <b>${esc(s.reward.label)}</b>
          <p class="plot__meta">${s.canClaim
            ? `Adds ${s.reward.seeds} seeds to your pouch.`
            : 'Claimed today. Come back tomorrow to keep the streak.'}</p>
          ${s.canClaim ? '<button class="btn btn--sage" data-action="claim">Claim today’s reward</button>' : ''}
        </div>` : ''}

      <div class="section">
        <h3>The beds <em>${s.planted} of ${s.plots.length} planted</em></h3>
        <div class="plot-list">
          ${s.plots.map((p) => this.plotHTML(p, varieties)).join('')}
        </div>
      </div>

      <div class="section">
        <h3>Watering</h3>
        <p class="prose">Each bed can be watered once a day. A bed left dry for more than a day slows to a quarter speed — it will not die, it will just sulk.</p>
        <button class="btn btn--ghost" data-action="water-all" ${s.water <= 0 ? 'aria-disabled="true"' : ''}>
          Water everything (${s.water} left)
        </button>
      </div>
    `;

    role('garden-foot').innerHTML = `
      <a class="btn" href="${esc(this.content.contact.siteUrl)}" target="_blank" rel="noopener">${esc(g.ctaLabel)}</a>
      <button class="btn btn--ghost" data-action="to-shop">Back to the shop</button>
    `;
  }

  plotHTML(p, varieties) {
    const active = this.activePlot === p.index ? ' is-active' : '';
    if (p.empty) {
      return `
        <div class="plot${active}">
          <div class="plot__top">
            <i style="background:rgba(44,42,38,0.12)"></i>
            <b>Bed ${p.index + 1}</b>
            <span>Empty</span>
          </div>
          <p class="plot__meta">${p.canPlant
            ? 'Choose something to sow.'
            : 'No seeds left — claim tomorrow’s reward for more.'}</p>
          ${p.canPlant ? `
            <div class="plot__actions">
              <label class="field" style="flex:1 1 150px">
                <span class="visually-hidden">Variety for bed ${p.index + 1}</span>
                <select data-role="seed-${p.index}">
                  ${varieties.map((v) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}
                </select>
              </label>
              <button class="btn btn--sage" data-action="plant" data-index="${p.index}">Sow</button>
            </div>` : ''}
        </div>`;
    }

    const pct = Math.round(((p.stage + p.progress) / (this.content.garden.stageNames.length - 1)) * 100);
    return `
      <div class="plot${active}">
        <div class="plot__top">
          <i style="background:${esc(p.hex)}"></i>
          <b>${esc(p.label)}</b>
          <span>${esc(p.stageName)}</span>
        </div>
        <div class="plot__bar"><i style="width:${Math.min(100, pct)}%"></i></div>
        <p class="plot__meta">${esc(p.readyIn)} · watered ${p.waterings} time${p.waterings === 1 ? '' : 's'}${p.wateredToday ? ' · watered today' : ''}</p>
        <div class="plot__actions">
          <button class="btn btn--ghost" data-action="visit-plot" data-index="${p.index}">Look</button>
          <button class="btn btn--ghost" data-action="water" data-index="${p.index}"
                  ${p.wateredToday ? 'aria-disabled="true"' : ''}>Water</button>
          ${p.bloomed
            ? `<button class="btn btn--sage" data-action="harvest" data-index="${p.index}">Cut &amp; keep</button>`
            : ''}
        </div>
      </div>`;
  }

  /* --- panels ----------------------------------------------------------- */

  /**
   * Open one panel and close the others.
   *
   * `focus` is off when the panel is being refilled by the guided tour: taking
   * the focus would pull it off the Next button the visitor just pressed, so
   * pressing that button again — or holding Enter on it — would stop working.
   */
  openPanel(name, { focus = true } = {}) {
    this.detailDisplayId = null;
    for (const [key, el] of Object.entries(this.dom.panels)) {
      const open = key === name;
      el.classList.toggle('is-open', open);
      el.setAttribute('aria-hidden', String(!open));
    }
    this.dom.hud.classList.add('is-dimmed');
    const panel = this.dom.panels[name];
    if (focus) requestAnimationFrame(() => panel.focus({ preventScroll: true }));
  }

  closePanel(name) {
    const el = this.dom.panels[name];
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (!Object.values(this.dom.panels).some((p) => p.classList.contains('is-open'))) {
      this.dom.hud.classList.remove('is-dimmed');
    }
  }

  closePanels() {
    for (const name of Object.keys(this.dom.panels)) this.closePanel(name);
    this.dom.hud.classList.remove('is-dimmed');
  }

  /* --- messages --------------------------------------------------------- */

  toast(message, kind = '') {
    const el = document.createElement('div');
    el.className = `toast${kind ? ` toast--${kind}` : ''}`;
    el.textContent = message;
    this.dom.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 340);
    }, 3400);
    this.announce(message);
  }

  announce(message) {
    if (this.dom.live) this.dom.live.textContent = message;
  }

  hint(text) {
    const el = role('hint');
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    if (text) {
      clearTimeout(this._hintTimer);
      this._hintTimer = setTimeout(() => { el.hidden = true; }, 7000);
    }
  }

  isTouch() {
    return window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  }

  /* --- routing ---------------------------------------------------------- */

  syncRoute() {
    let hash = '#/';
    if (this.space === 'garden') hash = '#/garden';
    else if (this.selectedId) hash = `#/shop/${this.selectedId}`;
    else if (this.entered) hash = '#/shop';
    else hash = '';
    if ((location.hash || '') !== hash) {
      history.replaceState(null, '', hash || location.pathname);
    }
  }

  applyRoute(hash, { initial = false } = {}) {
    const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length) {
      if (!initial) this.toLanding();
      return;
    }
    const [head, id] = parts;
    if (head === 'garden') {
      this.enter({ space: 'garden' });
    } else if (head === 'shop') {
      this.enter({ space: 'shop', displayId: id || null });
    }
  }

  /* --- input ------------------------------------------------------------ */

  bindGlobalEvents() {
    document.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKeydown(e));

    // #app clips with overflow:hidden, but iOS still scrolls it to reveal a
    // focused field in a sliding sheet, lifting the canvas and the top of the
    // sheet off-screen. Pin it in place.
    const app = $('#app');
    app?.addEventListener('scroll', () => {
      if (app.scrollTop || app.scrollLeft) app.scrollTo(0, 0);
    }, { passive: true });

    // Selecting things in the 3D space: a tap, not a drag.
    const canvas = this.dom.host;
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      if (this.rig?.wasDrag()) return;
      if (this.transitioning) return;
      this.pickAt(e.clientX, e.clientY);
    });

    // Hover feedback. Mouse only: on a touch screen there is no pointer to
    // hover with, and running the raycast on every touchmove would only cost
    // frames during a swipe.
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this._pointerAt = { x: e.clientX, y: e.clientY };
      if (this.transitioning || this.rig?.isDragging) return;
      this.hoverAt(e.clientX, e.clientY);
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => {
      this._pointerAt = null;
      this.clearHover();
    });

    store.subscribe((next) => {
      this.refreshBoard();
      this.calendarPanel?.render();
      this.renderOrderPanel();
      // Photo paths edited in the owner panel take effect on the wall at once.
      for (const f of next.frames || []) {
        this.scenes.shop?.setFramePhoto(f.id, f.photo || '');
      }
    });
  }

  onClick(e) {
    // Touching anything in the order panel makes it the visitor's, so the tour
    // stops treating it as a panel it may close.
    if (e.target.closest('#panel-order')) this.orderPanelFromTour = false;

    const planDot = e.target.closest('[data-stop]');
    if (planDot) {
      this.goToStopIndex(Number(planDot.dataset.stop));
      return;
    }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const index = el.dataset.index !== undefined ? Number(el.dataset.index) : null;

    // Controls marked aria-disabled are deliberately still clickable: every
    // one of them reports why it is unavailable (missing size, empty watering
    // can, empty vase) rather than silently doing nothing.
    if (el.getAttribute('aria-disabled') === 'true' && el.tagName === 'A') {
      e.preventDefault();
      return;
    }

    switch (action) {
      case 'enter':
        e.preventDefault();
        this.enter({ space: 'shop' });
        break;
      case 'enter-garden':
        e.preventDefault();
        this.enter({ space: 'garden' });
        break;
      case 'to-landing':
        e.preventDefault();
        this.toLanding();
        break;
      case 'toggle-space':
        this.transitionTo(this.space === 'garden' ? 'shop' : 'garden');
        break;
      case 'to-shop':
        this.transitionTo('shop');
        break;
      case 'toggle-explore':
        this.toggleExplore();
        break;
      case 'help':
        this.showHelp();
        break;
      case 'home':
        this.goToStopIndex(0);
        break;
      case 'prev':
        this.step(-1);
        break;
      case 'next':
        this.step(1);
        break;
      case 'close-focus':
        this.clearSelection();
        this.releaseToFreeRoam();
        break;
      case 'close-panel':
        if (this.closeDetailForGathering()) break;
        this.closePanels();
        this.releaseToFreeRoam();
        break;
      case 'open-display':
        this.enter({ space: 'shop', displayId: id });
        break;
      case 'open-order':
        this.openOrderPanel();
        break;
      case 'pick':
        this.pickStem(id);
        break;
      case 'return-stems':
        this.returnAllStems();
        break;
      case 'share':
        this.share(id);
        break;
      case 'colour':
        this.order.selectColor(id);
        break;
      case 'occasion':
        this.order.selectOccasion(id);
        break;
      case 'size':
        this.order.setSize(id);
        break;
      case 'confirm':
        this.confirmOrder();
        break;
      case 'save-invoice':
        this.saveInvoice();
        break;
      case 'close-invoice':
        this.closeInvoice();
        break;
      case 'claim': {
        const reward = this.game?.claimDaily();
        if (reward) this.toast(`${reward.label} — ${reward.seeds} seeds added.`);
        break;
      }
      case 'plant':
      case 'water':
      case 'water-all':
      case 'harvest':
      case 'visit-plot':
        if (!this.game) break;
        this.gardenAction(action, index);
        break;
      default:
        break;
    }
  }

  /** Garden bed actions, all of which report through a toast. */
  gardenAction(action, index) {
    switch (action) {
      case 'plant': {
        const select = role(`seed-${index}`);
        const variety = this.game.seedVarieties.find((v) => v.id === select?.value)
          || this.game.seedVarieties[0];
        const result = this.game.plant(index, variety);
        this.toast(result.ok ? result.message : result.reason, result.ok ? '' : 'warn');
        break;
      }
      case 'water': {
        const result = this.game.water(index);
        this.toast(result.ok ? result.message : result.reason, result.ok ? '' : 'warn');
        break;
      }
      case 'water-all': {
        const done = this.game.waterAll();
        this.toast(done ? `Watered ${done} bed${done === 1 ? '' : 's'}.` : 'The watering can is empty.', done ? '' : 'warn');
        this.renderGardenPanel();
        break;
      }
      case 'harvest': {
        const result = this.game.harvest(index);
        this.toast(result.ok ? result.message : result.reason, result.ok ? '' : 'warn');
        break;
      }
      case 'visit-plot': {
        const stopIndex = this.stops.findIndex((s) => s.plotIndex === index);
        if (stopIndex >= 0) {
          this.activePlot = index;
          this.goToStopIndex(stopIndex);
          this.renderGardenPanel();
        }
        break;
      }
      default:
        break;
    }
  }

  onKeydown(e) {
    if (e.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    if (e.key === 'Escape') {
      if (this.dom.invoice.classList.contains('is-open')) {
        this.closeInvoice();
      } else if (Object.values(this.dom.panels).some((p) => p.classList.contains('is-open'))) {
        this.closePanels();
        this.releaseToFreeRoam();
      } else if (this.rig?.mode === 'free') {
        this.rig.setMode('guided');
        this.goToStopIndex(this.stopIndex, { announce: false });
      } else if (this.selectedId) {
        this.clearSelection();
      }
      return;
    }

    if (!this.entered || this.transitioning) return;

    /* The arrow keys walk — the rig owns them, in guided mode as well as free,
       so they are deliberately not handled here. Stepping the tour from the
       keyboard moves to the bracket and comma keys; the Next and Previous
       buttons, the floor plan and clicking a display are unchanged. */
    if (e.key === '.' || e.key === '>' || e.key === 'PageDown' || e.key === ']') {
      e.preventDefault();
      this.step(1);
    } else if (e.key === ',' || e.key === '<' || e.key === 'PageUp' || e.key === '[') {
      e.preventDefault();
      this.step(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.goToStopIndex(0);
    }
  }

  /* --- raycasting ------------------------------------------------------- */

  /** The first visible interactive thing under a screen point, if any. */
  castAt(clientX, clientY) {
    const scene = this.currentScene;
    if (!scene?.interactive?.length) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(scene.interactive, false);
    return hits.find((h) => h.object.visible) || null;
  }

  /**
   * Light whatever is under the pointer and set the cursor to match.
   *
   * Throttled: a raycast against a few hundred stems on every pointermove is
   * wasted work at 120 Hz, and the glow eases in over a few frames anyway.
   */
  hoverAt(clientX, clientY) {
    const now = performance.now();
    if (now - (this._lastHover || 0) < 70) return;
    this._lastHover = now;

    const hit = this.castAt(clientX, clientY);
    const data = hit?.object?.userData || {};
    // The floor is interactive too, but it is not an *object* — it gets the
    // walk cursor rather than a glow, so the two affordances stay distinct.
    const isThing = !!hit && !data.walkable;
    this.currentScene?.setHover?.(isThing ? hit.object : null);
    this.dom.host.style.cursor = isThing ? 'pointer' : (hit ? 'crosshair' : '');
  }

  clearHover() {
    this.currentScene?.setHover?.(null);
    this.dom.host.style.cursor = '';
  }

  pickAt(clientX, clientY) {
    const found = this.castAt(clientX, clientY);
    if (!found) return;
    const hit = found.object;
    const data = hit.userData || {};

    if (data.walkable) {
      // Clicking the stone walks there, stopping at whatever is in the way.
      const seconds = this.rig.walkTo(found.point);
      if (seconds > 0) {
        this.announce('Walking.');
        // The bottom sheet covers most of the floor on a phone; walking off
        // means the visitor is done with it, and with the display it was on.
        if (this.isTouch() && (this.selectedId
            || this.dom.panels.detail?.classList.contains('is-open'))) {
          this.clearSelection();
        }
      }
      return;
    }

    if (data.portal) {
      this.transitionTo(data.portal === 'garden' ? 'garden' : 'shop');
    } else if (data.link) {
      window.open(data.link, '_blank', 'noopener');
    } else if (data.calendar) {
      const index = this.stops.findIndex((s) => s.kind === 'calendar');
      if (index >= 0) this.goToStopIndex(index);
      else this.openOrderPanel({ focus: 'calendar' });
    } else if (data.printer) {
      this.confirmOrder();
    } else if (data.vase) {
      this.openOrderPanel();
    } else if (data.frameId) {
      const index = this.stops.findIndex((s) => s.frameId === data.frameId);
      if (index >= 0) this.goToStopIndex(index, { announce: false });
      this.openFrame(data.frameId);
    } else if (data.plotIndex !== undefined) {
      const index = this.stops.findIndex((s) => s.plotIndex === data.plotIndex);
      if (index >= 0) this.goToStopIndex(index, { announce: false });
      this.openGardenPanel(data.plotIndex);
    } else if (data.displayId) {
      // Selecting a display moves to it; a second tap gathers a stem. On a
      // phone that holds once its sheet has been read and closed, too.
      const gather = this.selectedId === data.displayId
        || (this.isTouch() && this.detailsViewedId === data.displayId);
      if (gather && data.pickable) {
        let stem = hit;
        while (stem && stem.name !== 'stem') stem = stem.parent;
        this.pickStem(data.displayId, stem);
      } else {
        this.selectDisplay(data.displayId);
      }
    }
  }

  /* --- misc ------------------------------------------------------------- */

  share(displayId) {
    const url = `${location.origin}${location.pathname}#/shop/${displayId}`;
    const display = this.content.displays.find((d) => d.id === displayId);
    const title = `${display?.title || 'An arrangement'} — ${this.content.brand.name}`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).then(
      () => this.toast('Link copied.'),
      () => this.toast(url)
    );
  }

  showHelp() {
    const touch = this.isTouch();
    role('detail-kind').textContent = 'Getting around';
    role('detail-title').textContent = 'How to move';
    role('detail-body').innerHTML = `
      <div class="section">
        <h3>${touch ? 'On a phone' : 'On a computer'}</h3>
        <ul class="varieties">
          ${touch ? `
            <li>Swipe anywhere to look around.</li>
            <li>Tap the floor to walk over to that spot.</li>
            <li>Tap a flower to move to it; tap again to gather a stem.</li>
            <li>Use the large arrows at the bottom to move between stops.</li>
          ` : `
            <li>Drag to look around.</li>
            <li><b>Arrow keys or WASD walk you around</b>, from anywhere — left
              and right turn, up and down walk. Hold Shift to walk faster.</li>
            <li><b>Click the floor</b> to walk over to that spot, or click
              anything to go and look at it closely.</li>
            <li>Click a flower to move to it; click again to gather a stem.</li>
            <li>The <b>Next</b> and <b>Previous</b> arrows follow the guided
              tour of the room, and keep working wherever you have walked to.
              On the keyboard that is <b>,</b> and <b>.</b></li>
            <li>Select points on the floor plan to jump.</li>
          `}
          <li>Escape brings you back to the tour, and closes any panel.</li>
        </ul>
      </div>
      <div class="section">
        <h3>Gathering flowers</h3>
        <p class="prose">Gathering is a game — take as many stems as you like. Your real bouquet is composed by our florist from the best of the season. We only cater for colour and occasion.</p>
      </div>
    `;
    role('detail-foot').innerHTML = `<button class="btn btn--ghost" data-action="close-panel">Got it</button>`;
    this.openPanel('detail');
  }
}

/* --- start -------------------------------------------------------------- */

/**
 * If the 3D space cannot start — no WebGL, a blocked CDN, an old device — the
 * visitor should still land somewhere useful rather than on a blank screen.
 * The landing page is plain HTML and carries the featured arrangements, the
 * prices, the delivery zones and every way of getting in touch, so that is
 * where they go.
 */
function fallback(reason, err) {
  if (document.body.dataset.fallback) return;
  document.body.dataset.fallback = '1';
  console.error('[KUNEY]', reason, err);
  window.KUNEY_REPORT?.(`FALLBACK ${reason} :: ${err?.stack || err}`);

  const loader = $('#loader');
  if (!loader) return;

  const status = role('loader-status');
  if (status) status.textContent = reason;
  loader.querySelector('.loader__bar')?.remove();

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center';
  actions.innerHTML = `
    <button class="btn" data-fallback="landing">See the flowers</button>
    <a class="btn btn--ghost" href="https://kuneyflowers.com/products/let-us-create-something-unique-florist-choice"
       target="_blank" rel="noopener">Order online</a>
  `;
  actions.querySelector('[data-fallback="landing"]').addEventListener('click', () => {
    loader.hidden = true;
    $('#hud').hidden = true;
    const landing = $('#landing');
    landing.hidden = false;
    landing.scrollTop = 0;
  });
  loader.appendChild(actions);
}

async function main() {
  // A module that fails to load never reaches the try/catch below.
  window.addEventListener('unhandledrejection', (e) => {
    if (!document.body.dataset.booted) {
      fallback('The 3D shop could not load. Check your connection and reload.', e.reason);
    }
  });

  let content;
  try {
    content = await store.load();
  } catch (err) {
    fallback('The shop could not load its content.', err);
    return;
  }

  const app = new App(content);
  window.KUNEY = app;   // handy for the owner panel and for debugging

  try {
    await app.boot();
    document.body.dataset.booted = '1';
  } catch (err) {
    fallback('The 3D shop could not start on this device.', err);
  }
}

main();
