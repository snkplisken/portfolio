import * as THREE from 'three';
import { state } from './state.js';
import { CONFIG, LEFT, RIGHT, IDLE, RUN, WALK, WALK_BACK } from './config.js';
import { inputController } from './inputController.js';
import { animationManager } from './animationManager.js';

// Module-scoped temporary variables
const tmpV3 = new THREE.Vector3();
const tmpV3b = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpTargetQuat = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

// Module-scoped raycaster
const raycaster = new THREE.Raycaster();
const rayOriginOffset = new THREE.Vector3(0, 1.0, 0);
const collisionDistance = 0.5;

export const characterController = {
  // Internal state for step-turning
  stepQueue: [],
  currentStep: null,

  // Main update function, called every frame from main.js
  update(delta) {
    if (!state.character) return;

    const isTurningClip = state.activeAction?.getClip().name === LEFT || state.activeAction?.getClip().name === RIGHT;
    const direction = inputController.getDirection();
    const mobileActive = inputController.isMobileActive();

    this.handleContinuousTurning(delta, mobileActive);
    this.handleMovement(delta, direction, isTurningClip, mobileActive);
    this.handleIdle(direction);
    this.handleDiscreteTurning();
    this.processStep(delta);
    this.updateGroundHeight(delta);
    this.handleInteractions();
  },

  handleMovement(delta, direction, isTurningClip, mobileActive) {
    if (state.jumpLocked || state.isActionLocked || (isTurningClip && !mobileActive) || direction === 0) {
      return;
    }

    const isShifting = inputController.isShifting();
    let speed = 0, animation = null;

    if (direction === 1) { // Forward
      speed = isShifting ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.BASE_SPEED;
      animation = isShifting ? RUN : WALK;
    } else { // Backward
      speed = CONFIG.MOVEMENT.WALK_BACK_SPEED;
      animation = WALK_BACK;
    }

    const moveDistance = speed * delta;
    const moveDirection = this.getMovementDirection(direction);
    
    // Perform collision detection
    const canMove = this.checkCollisions(moveDirection, direction);

    if (canMove) {
      state.character.position.addScaledVector(moveDirection, moveDistance);
      if (state.activeAction?.getClip().name !== animation) {
        animationManager.crossFadeTo(animation, CONFIG.FADE_TIME_FAST);
      }
    } else {
      if ([WALK, RUN].includes(state.activeAction?.getClip().name)) {
        animationManager.crossFadeTo(IDLE, CONFIG.FADE_TIME_FAST);
      }
    }
  },

  checkCollisions(moveDirection, direction) {
    const characterCenter = state.character.position.clone().add(rayOriginOffset);
    raycaster.set(characterCenter, moveDirection);
    const intersections = raycaster.intersectObjects(state.collidableObjects, true);

    if (intersections.length > 0 && intersections[0].distance < collisionDistance) {
      if (direction === -1) return false; // Don't climb backwards

      const obstacleHeight = intersections[0].point.y - state.character.position.y;
      if (obstacleHeight > CONFIG.MOVEMENT.STEP_HEIGHT) {
        return false; // Obstacle is a wall
      }

      const higherOrigin = characterCenter.clone().addScaledVector(DOWN, -CONFIG.MOVEMENT.STEP_HEIGHT);
      raycaster.set(higherOrigin, moveDirection);
      const higherIntersections = raycaster.intersectObjects(state.collidableObjects, true);
      return higherIntersections.length === 0 || higherIntersections[0].distance > collisionDistance;
    }
    return true; // No obstacles
  },

  handleIdle(direction) {
    if (direction === 0 && !state.isActionLocked && [WALK, RUN, WALK_BACK].includes(state.activeAction?.getClip().name)) {
      animationManager.crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
    }
  },

  handleContinuousTurning(delta, mobileActive) {
    if (mobileActive && state.mobileInput.turn !== 0) {
      const turnRateRad = THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_SPEED_CONTINUOUS) * delta * (-state.mobileInput.turn);
      state.character.rotation.y += turnRateRad;
    }
  },

  handleDiscreteTurning() {
    if (inputController.isMobileActive() || state.jumpLocked || state.isActionLocked || this.currentStep) return;

    if (inputController.isTurningLeft()) {
      this.queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_DEG) });
      animationManager.playOnceSafe(LEFT, CONFIG.MOVEMENT.STEP_TIME);
    } else if (inputController.isTurningRight()) {
      this.queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(-CONFIG.MOVEMENT.TURN_DEG) });
      animationManager.playOnceSafe(RIGHT, CONFIG.MOVEMENT.STEP_TIME);
    }
  },

  queueTurnStep({ yawDeltaRad = 0, duration = CONFIG.MOVEMENT.STEP_TIME }) {
    const startQuat = state.character.quaternion.clone();
    tmpEuler.setFromQuaternion(startQuat, 'YXZ');
    tmpEuler.y += yawDeltaRad;
    tmpTargetQuat.setFromEuler(tmpEuler);

    const step = {
      startPos: state.character.position.clone(),
      endPos: state.character.position.clone(), // No position change for turn-in-place
      startQuat,
      targetQuat: tmpTargetQuat.clone(),
      elapsed: 0,
      duration
    };
    if (this.stepQueue.length > 8) this.stepQueue.shift();
    this.stepQueue.push(step);
  },

  processStep(dt) {
    if (!this.currentStep && this.stepQueue.length > 0) this.currentStep = this.stepQueue.shift();
    if (!this.currentStep) return;

    this.currentStep.elapsed += dt;
    const t = Math.min(1, this.currentStep.elapsed / this.currentStep.duration);
    const tt = t * t * (3 - 2 * t); // Ease in/out

    state.character.position.lerpVectors(this.currentStep.startPos, this.currentStep.endPos, tt);
    state.character.quaternion.slerpQuaternions(this.currentStep.startQuat, this.currentStep.targetQuat, tt);

    if (t >= 1) {
      this.currentStep = null;
      if (!state.jumpLocked && inputController.getDirection() === 0) {
        animationManager.crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
      }
    }
  },
  
  updateGroundHeight(delta) {
    if (!state.character) return;
    const rayOrigin = state.character.position.clone().add(rayOriginOffset);
    raycaster.set(rayOrigin, DOWN);
    const groundIntersects = raycaster.intersectObjects(state.collidableObjects, true);

    if (groundIntersects.length > 0 && groundIntersects[0].distance < 2.5) {
      const groundY = groundIntersects[0].point.y;
      state.character.position.y = THREE.MathUtils.lerp(state.character.position.y, groundY, 0.35);
    } else {
      const nextY = state.character.position.y - CONFIG.MOVEMENT.GRAVITY * delta;
      state.character.position.y = Math.max(nextY, state.envGroundY + 0.02);
    }
  },

  handleInteractions() {
    if (!state.character) return;

    const DOOR_OPEN_PROXIMITY = 2.5;

    state.interactiveObjects.forEach((doorState, pivot) => {
      const pivotWorldPosition = pivot.getWorldPosition(tmpV3);
      const distance = state.character.position.distanceTo(pivotWorldPosition);
      doorState.state = (distance <= DOOR_OPEN_PROXIMITY) ? 'open' : 'closed';

      let targetRotationZ;
      if (doorState.state === 'open') {
        const toCharacter = tmpV3b.subVectors(state.character.position, pivotWorldPosition);
        const doorMesh = pivot.children[0];
        if (!doorMesh) return;
        
        const doorNormalLocal = doorMesh.position.clone();
        const pivotWorldQuaternion = pivot.getWorldQuaternion(tmpQuat);
        const doorNormalWorld = doorNormalLocal.applyQuaternion(pivotWorldQuaternion);
        doorNormalWorld.y = 0;
        doorNormalWorld.normalize();
        toCharacter.y = 0;
        toCharacter.normalize();
        const dot = toCharacter.dot(doorNormalWorld);
        const openDirection = -Math.sign(dot);
        targetRotationZ = doorState.initialRotationZ + (openDirection * Math.PI / 2);

      } else {
        targetRotationZ = doorState.initialRotationZ;
      }

      pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, targetRotationZ, 0.05);
    });
  },

  getWorldForward: (target = new THREE.Vector3()) => {
    if (!state.character) return target;
    return state.character.getWorldDirection(target).setY(0).normalize();
  },

  getMovementDirection: (direction, target = new THREE.Vector3()) => {
    const fwd = characterController.getWorldForward(target);
    return (direction === 1) ? fwd.clone().negate() : fwd;
  },
};