/* ==========================================================================
   The garden game.

   Growth is measured in "growth hours" that accumulate in real time, so a
   plant genuinely takes days to bloom. Neglect is not punished by killing the
   plant — it just slows to a quarter speed once a day has passed without
   water, which is a kinder loop and still rewards coming back.

   Returning on consecutive days builds a streak, and each day's reward can be
   claimed once. Blooms can be cut and kept; the count is shown in the shop.
   ========================================================================== */

import * as store from './store.js';

const HOUR = 1000 * 60 * 60;
const WATER_BOOST_HOURS = 7;
const NEGLECT_FACTOR = 0.25;

export class GardenGame {
  constructor(content, scene) {
    this.content = content;
    this.scene = scene;
    this.state = store.loadGarden();
    this._listeners = new Set();

    this._ensurePlots();
    this._registerVisit();
    this._advance();
    this.syncScene();
    this.save();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(reason) {
    for (const fn of this._listeners) fn(this.state, reason);
  }

  /* --- setup ------------------------------------------------------------ */

  _ensurePlots() {
    const count = Math.max(1, this.content.garden.plotCount);
    while (this.state.plots.length < count) this.state.plots.push(null);
    this.state.plots.length = count;
  }

  /** The varieties a visitor can sow: whatever the shop actually stocks. */
  get seedVarieties() {
    return this.content.displays
      .filter((d) => d.pickable !== false)
      .map((d) => {
        const colour = this.content.palette.find((c) => c.id === d.colorId) || this.content.palette[0];
        return {
          id: d.id,
          label: d.title,
          recipeId: d.bloom,
          hex: colour.hex,
          colorId: colour.id,
          colorLabel: colour.label,
        };
      });
  }

  /* --- daily rhythm ----------------------------------------------------- */

  _registerVisit() {
    const today = store.dateKey();
    const last = this.state.lastVisit;

    if (last === today) {
      // Same day — nothing changes.
    } else {
      const yesterday = store.dateKey(store.addDays(new Date(), -1));
      this.state.streak = last === yesterday ? (this.state.streak || 0) + 1 : 1;
      this.state.lastVisit = today;
      this.state.claimedToday = false;
    }

    // Watering can refills each day.
    if (this.state.waterDate !== today) {
      this.state.water = this.content.garden.waterPerDay;
      this.state.waterDate = today;
    }
  }

  get todaysReward() {
    const rewards = this.content.garden.rewards;
    if (!rewards.length) return null;
    const index = Math.max(0, (this.state.streak || 1) - 1) % rewards.length;
    return rewards[index];
  }

  get canClaim() {
    return !this.state.claimedToday && !!this.todaysReward;
  }

  claimDaily() {
    if (!this.canClaim) return null;
    const reward = this.todaysReward;
    this.state.seeds += reward.seeds;
    this.state.claimedToday = true;
    this.save();
    this._emit('reward');
    return reward;
  }

  /* --- growth ----------------------------------------------------------- */

  /** Roll every plant forward to now. Safe to call as often as you like. */
  _advance() {
    const now = Date.now();
    for (const plot of this.state.plots) {
      if (!plot) continue;
      const last = plot.lastUpdate || plot.plantedAt || now;
      const elapsedHours = Math.max(0, (now - last) / HOUR);
      if (elapsedHours <= 0) continue;

      const sinceWater = (now - (plot.lastWatered || plot.plantedAt || now)) / HOUR;
      const factor = sinceWater > 24 ? NEGLECT_FACTOR : 1;
      plot.growthHours = (plot.growthHours || 0) + elapsedHours * factor;
      plot.lastUpdate = now;
    }
  }

  stageOf(plot) {
    if (!plot) return -1;
    const thresholds = this.content.garden.stageHours;
    let stage = 0;
    for (let i = 0; i < thresholds.length; i += 1) {
      if ((plot.growthHours || 0) >= thresholds[i]) stage = i;
    }
    return stage;
  }

  /** 0 → 1 within the current stage; 1 when fully in bloom. */
  progressOf(plot) {
    const thresholds = this.content.garden.stageHours;
    const stage = this.stageOf(plot);
    if (stage >= thresholds.length - 1) return 1;
    const from = thresholds[stage];
    const to = thresholds[stage + 1];
    return Math.max(0, Math.min(1, ((plot.growthHours || 0) - from) / Math.max(0.001, to - from)));
  }

  hoursToBloom(plot) {
    const thresholds = this.content.garden.stageHours;
    const final = thresholds[thresholds.length - 1];
    const remaining = final - (plot.growthHours || 0);
    if (remaining <= 0) return 0;
    const sinceWater = (Date.now() - (plot.lastWatered || 0)) / HOUR;
    const factor = sinceWater > 24 ? NEGLECT_FACTOR : 1;
    return remaining / factor;
  }

  /* --- actions ---------------------------------------------------------- */

  plant(index, variety) {
    if (this.state.plots[index]) return { ok: false, reason: 'That bed is already planted.' };
    if (this.state.seeds <= 0) return { ok: false, reason: 'No seeds left — come back tomorrow for more.' };

    const now = Date.now();
    this.state.seeds -= 1;
    this.state.plots[index] = {
      recipeId: variety.recipeId,
      hex: variety.hex,
      label: variety.label,
      colorId: variety.colorId,
      plantedAt: now,
      lastWatered: now,
      lastUpdate: now,
      growthHours: 0,
      waterings: 1,
    };
    this.save();
    this.syncScene(index);
    this._emit('plant');
    return { ok: true, message: `${variety.label} sown in bed ${index + 1}.` };
  }

  water(index) {
    const plot = this.state.plots[index];
    if (!plot) return { ok: false, reason: 'Nothing planted in that bed yet.' };
    if (this.state.water <= 0) {
      return { ok: false, reason: 'The watering can is empty. It refills tomorrow.' };
    }
    const today = store.dateKey();
    if (plot.wateredOn === today) {
      return { ok: false, reason: 'Already watered today — let it drink.' };
    }

    this._advance();
    this.state.water -= 1;
    plot.lastWatered = Date.now();
    plot.wateredOn = today;
    plot.waterings = (plot.waterings || 0) + 1;
    plot.growthHours = (plot.growthHours || 0) + WATER_BOOST_HOURS;
    plot.lastUpdate = Date.now();

    this.save();
    this.syncScene(index);
    this._emit('water');
    return { ok: true, message: 'Watered. It will have moved on by tomorrow.' };
  }

  waterAll() {
    let done = 0;
    for (let i = 0; i < this.state.plots.length; i += 1) {
      if (this.state.water <= 0) break;
      if (this.water(i).ok) done += 1;
    }
    return done;
  }

  harvest(index) {
    const plot = this.state.plots[index];
    if (!plot) return { ok: false, reason: 'Nothing to cut there.' };
    this._advance();
    if (this.stageOf(plot) < this.content.garden.stageHours.length - 1) {
      return { ok: false, reason: 'Not in bloom yet. Keep watering.' };
    }

    this.state.plots[index] = null;
    this.state.bloomed = (this.state.bloomed || 0) + 1;
    this.state.seeds += 2;   // a bloom always leaves seed behind
    this.save();
    this.syncScene(index);
    this._emit('harvest');
    return {
      ok: true,
      message: `${plot.label} cut and kept — ${this.content.garden.bloomReward}. Two seeds saved.`,
    };
  }

  clear(index) {
    if (!this.state.plots[index]) return { ok: false, reason: 'That bed is already empty.' };
    this.state.plots[index] = null;
    this.save();
    this.syncScene(index);
    this._emit('clear');
    return { ok: true, message: 'Bed cleared.' };
  }

  /* --- reporting -------------------------------------------------------- */

  info(index) {
    this._advance();
    const plot = this.state.plots[index];
    const names = this.content.garden.stageNames;
    if (!plot) {
      return { index, empty: true, stageName: 'Empty bed', canPlant: this.state.seeds > 0 };
    }
    const stage = this.stageOf(plot);
    const hours = this.hoursToBloom(plot);
    const today = store.dateKey();
    return {
      index,
      empty: false,
      label: plot.label,
      colorId: plot.colorId,
      hex: plot.hex,
      stage,
      stageName: names[stage] || 'Growing',
      progress: this.progressOf(plot),
      bloomed: stage >= names.length - 1,
      wateredToday: plot.wateredOn === today,
      waterings: plot.waterings || 0,
      hoursToBloom: hours,
      readyIn: hours <= 0
        ? 'Ready to cut'
        : hours < 1
          ? 'Blooming within the hour'
          : hours < 24
            ? `About ${Math.round(hours)} hours to bloom`
            : `About ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} to bloom`,
    };
  }

  summary() {
    this._advance();
    const plots = this.state.plots.map((_, i) => this.info(i));
    return {
      seeds: this.state.seeds,
      water: this.state.water,
      streak: this.state.streak || 0,
      bloomed: this.state.bloomed || 0,
      canClaim: this.canClaim,
      reward: this.todaysReward,
      planted: plots.filter((p) => !p.empty).length,
      inBloom: plots.filter((p) => p.bloomed).length,
      plots,
    };
  }

  /* --- scene sync ------------------------------------------------------- */

  /** Push growth state into the 3D beds. Pass an index to update just one. */
  syncScene(only = null) {
    if (!this.scene) return;
    this._advance();
    this.state.plots.forEach((plot, i) => {
      if (only !== null && only !== i) return;
      if (!plot) {
        this.scene.setPlant(i, null);
        return;
      }
      const stage = this.stageOf(plot);
      const within = this.progressOf(plot);
      const shape = [
        { scale: 0.18, openness: 0 },
        { scale: 0.34, openness: 0 },
        { scale: 0.62, openness: 0.12 },
        { scale: 0.86, openness: 0.55 },
        { scale: 1.0, openness: 1 },
      ][stage] || { scale: 1, openness: 1 };

      this.scene.setPlant(i, {
        recipeId: plot.recipeId,
        hex: plot.hex,
        stage,
        // Ease within the stage so a plant visibly creeps up day to day.
        scale: shape.scale * (0.9 + within * 0.14),
        openness: Math.min(1, shape.openness + within * 0.18),
      });
    });
  }

  save() {
    store.saveGarden(this.state);
  }

  reset() {
    this.state = store.resetGarden();
    this._ensurePlots();
    this._registerVisit();
    this.syncScene();
    this.save();
    this._emit('reset');
  }
}
