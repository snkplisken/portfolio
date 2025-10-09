import * as THREE from 'three';
import { state } from './state.js';
import { CONFIG } from './config.js';
// We need inputController here for resolveAfterOneShot to check player direction
import { inputController } from './inputController.js';

const { IDLE, WALK, RUN, WALK_BACK } = CONFIG.ANIMATION;

export const animationManager = {
  // Internal state for this manager
  oneShotFallbacks: new Map(),
  jumpUnlockTimer: null,

  crossFadeTo(name, fade = CONFIG.FADE_TIME_TRANSITION) {
    if (!state.animationsMap.has(name)) return false;

    const action = state.animationsMap.get(name);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset();

    if (state.activeAction && state.activeAction !== action) {
      state.activeAction.crossFadeTo(action, fade, false);
    }

    action.play();
    state.activeAction = action;
    this.highlightButton(name);
    return true;
  },

  playLoop(name) {
    if (!state.animationsMap.has(name)) return false;
    this.clearAllOneShotFallbacks();

    const action = state.animationsMap.get(name);
    const from = state.activeAction;
    action.setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset().enabled = true;

    if (from && from !== action) from.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
    action.play();
    state.activeAction = action;
    this.highlightButton(name);
    return true;
  },

  playOnceSafe(name, durationOverride) {
    if (!state.animationsMap.has(name) || !state.mixer) return false;
    state.isActionLocked = true;

    const action = state.animationsMap.get(name);
    const from = state.activeAction;
    const clipDuration = action._clip?.duration ?? CONFIG.MOVEMENT.STEP_TIME;
    const targetDuration = durationOverride || clipDuration;
    const timeScale = clipDuration / targetDuration;

    action.setEffectiveTimeScale(timeScale)
      .setEffectiveWeight(1)
      .setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;

    action.reset().enabled = true;
    if (from && from !== action) from.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
    action.play();

    state.activeAction = action;
    this.highlightButton(name);

    const onFinish = (e) => {
      if (e.action !== action) return;
      state.mixer.removeEventListener('finished', onFinish);
      this.clearOneShotFallback(name);
      this.resolveAfterOneShot();
    };
    state.mixer.addEventListener('finished', onFinish);

    this.clearOneShotFallback(name);
    const id = setTimeout(() => {
      state.mixer?.removeEventListener('finished', onFinish);
      this.resolveAfterOneShot();
    }, Math.max(60, targetDuration * 1000 + 40));
    this.oneShotFallbacks.set(name, id);

    return true;
  },

  returnToWalkLoop(fade = CONFIG.FADE_TIME_TRANSITION) {
    if (!state.animationsMap.has(WALK)) return false;

    const action = state.animationsMap.get(WALK);
    const from = state.activeAction;
    action.setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset().enabled = true;

    if (from && from !== action) from.crossFadeTo(action, fade, false);
    action.play();
    state.activeAction = action;
    this.highlightButton(WALK);
    return true;
  },

  resolveAfterOneShot() {
    state.isActionLocked = false;
    if (state.jumpLocked) return;

    const dir = inputController.getDirection();
    if (dir === 1) {
      this.crossFadeTo(inputController.isShifting() ? RUN : WALK, CONFIG.FADE_TIME_TRANSITION);
    } else if (dir === -1) {
      this.crossFadeTo(WALK_BACK, CONFIG.FADE_TIME_TRANSITION);
    } else {
      this.crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
    }
  },

  setJumpLockByClip(clipName, durationOverride) {
    if (!state.animationsMap.has(clipName)) return;
    const a = state.animationsMap.get(clipName);
    const clipDur = a?._clip?.duration ?? 0.6;
    const dur = durationOverride ?? clipDur;

    if (this.jumpUnlockTimer) clearTimeout(this.jumpUnlockTimer);
    state.jumpLocked = true;
    this.clearAllOneShotFallbacks();

    this.jumpUnlockTimer = setTimeout(() => {
      state.jumpLocked = false;
      this.resolveAfterOneShot(); // Check what state to return to after jump
    }, Math.max(80, dur * 1000));
  },

  clearOneShotFallback(name) {
    const id = this.oneShotFallbacks.get(name);
    if (id) {
      clearTimeout(id);
      this.oneShotFallbacks.delete(name);
    }
  },

  clearAllOneShotFallbacks() {
    for (const id of this.oneShotFallbacks.values()) clearTimeout(id);
    this.oneShotFallbacks.clear();
  },

  highlightButton(activeName) {
    document.querySelectorAll('#animations-panel button').forEach(btn => {
      btn.classList.toggle('active', btn.innerText === activeName);
    });
  }
};