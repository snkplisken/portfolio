import * as THREE from 'three';

export const state = {
  // Core Three.js components
  scene: null,
  camera: null,
  renderer: null,
  clock: new THREE.Clock(),
  mixer: null,
  controls: null,

  // Character and model
  character: null,
  model: null,
  animationsMap: new Map(),
  activeAction: null,
  
  // Input states
  keysPressed: {},
  mobileInput: { forward: 0, turn: 0, shift: false, punch: false, interact: false, jump: false },
  
  // Game world and physics
  collidableObjects: [],
  interactiveObjects: new Map(), // ADDED FOR DOORS
  envGroundY: 0.0,
  
  // Action locks and state flags
  isActionLocked: false,
  jumpLocked: false,
  userDragging: false,
  lastMouseUpTime: 0,
};