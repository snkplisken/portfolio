import * as THREE from 'three';

export const CONFIG = {
  MODEL_URL: 'jump3.glb',
  ENVIRONMENT_URL: 'enviorment2.glb',
  ANIMATION: {
    IDLE: 'idle.001',
    WALK: 'walk',
    RUN: 'Running',
    WALK_BACK: 'walk backwards',
    JUMP: 'jump',
    PUNCH: 'punch',
    LEFT: 'left',
    RIGHT: 'right',
  },
  MOVEMENT: {
    BASE_SPEED: 2.8,
    RUN_SPEED: 6.0,
    WALK_BACK_SPEED: 1.8,
    STEP_DISTANCE: 0.9,
    STEP_TIME: 0.22,
    TURN_DEG: 45,
    TURN_SPEED_CONTINUOUS: 180,
    STEP_HEIGHT: 0.4, // Maximum height the character can step up
    STEP_LOOK_AHEAD: 0.1,
    GRAVITY: 9.8,
  },
  // Animation Transitions
  FADE_TIME_FAST: 0.12,
  FADE_TIME_TRANSITION: 0.25,
  // Camera
  CAMERA: {
    CHASE_OFFSET: new THREE.Vector3(0.0, 2.0, 2.5),
    LOOK_AT_OFFSET: new THREE.Vector3(0, 1.6, 0),
    LERP_FACTOR: 0.15,
    AUTOCENTER_DELAY_MS: 600,
    CONTROLS_TARGET_LERP: 0.18,
  }
};

export const { IDLE, WALK, RUN, WALK_BACK, JUMP, PUNCH, LEFT, RIGHT } = CONFIG.ANIMATION;