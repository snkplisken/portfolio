import { state } from './state.js';
import { CONFIG } from './config.js';
import { animationManager } from './animationManager.js';

const { JUMP, PUNCH } = CONFIG.ANIMATION;

// This function can remain separate or be part of the controller
function isMobileInputActive() {
  return state.mobileInput.forward !== 0 || state.mobileInput.turn !== 0 || state.mobileInput.shift || state.mobileInput.punch || state.mobileInput.interact;
}

// Mobile joystick logic, mostly self-contained
function initializeMobileInput() {
  const joystickRegion = document.getElementById('joystick-region');
  const joystickPad = document.getElementById('joystick-pad');
  if (!joystickRegion || !joystickPad) return;

  const maxDistance = 75;
  let touchIdentifier = null;

  function updateJoystick(clientX, clientY) {
    const rect = joystickRegion.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;

    const dist = Math.min(maxDistance, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);

    const clampedX = Math.cos(ang) * dist;
    const clampedY = Math.sin(ang) * dist;

    joystickPad.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

    const normalizedX = clampedX / maxDistance;
    const normalizedY = -clampedY / maxDistance; // invert Y
    const deadZone = 0.15;

    if (dist > maxDistance * deadZone) {
      state.mobileInput.forward = normalizedY;
      state.mobileInput.turn = Math.abs(normalizedX) > deadZone ? normalizedX : 0;
    } else {
      state.mobileInput.forward = 0;
      state.mobileInput.turn = 0;
    }
  }

  function onTouchStart(e) {
    if (touchIdentifier === null && (e.target === joystickRegion || e.target === joystickPad)) {
      touchIdentifier = e.changedTouches[0].identifier;
      e.preventDefault();
      updateJoystick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  }

  function onTouchMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchIdentifier) {
        e.preventDefault();
        updateJoystick(t.clientX, t.clientY);
        break;
      }
    }
  }

  function onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchIdentifier) {
        joystickPad.style.transform = `translate(0, 0)`;
        state.mobileInput.forward = 0;
        state.mobileInput.turn = 0;
        touchIdentifier = null;
        break;
      }
    }
  }

  joystickRegion.addEventListener('touchstart', onTouchStart, { passive: false });
  joystickRegion.addEventListener('touchmove', onTouchMove, { passive: false });
  joystickRegion.addEventListener('touchend', onTouchEnd);
  joystickRegion.addEventListener('touchcancel', onTouchEnd);
}

export const inputController = {
  // Call this once from main.js to set everything up
  init() {
    window.addEventListener('keydown', this.onKeyDown.bind(this), { passive: false });
    window.addEventListener('keyup', this.onKeyUp.bind(this), { passive: false });
    window.addEventListener('load', initializeMobileInput);
  },

  onKeyDown(e) {
    if (e.repeat) return;
    const code = e.code;
    state.keysPressed[code] = true;

    if (code.startsWith('Arrow') || code === 'Space' || code === 'ShiftLeft' || code === 'KeyP' || code === 'KeyE') e.preventDefault();
    if (!state.character) return;

    if (code === 'KeyP') {
      if (this.isPunching() && !state.isActionLocked) {
        animationManager.playOnceSafe(PUNCH);
      }
      return;
    }

    if (code === 'Space') {
      if (!state.jumpLocked && animationManager.playOnceSafe(JUMP)) {
        animationManager.setJumpLockByClip(JUMP);
      }
      return;
    }
  },

  onKeyUp(e) {
    state.keysPressed[e.code] = false;
    if (e.code === 'ShiftLeft' && state.keysPressed['ArrowUp'] && !state.jumpLocked) {
      animationManager.returnToWalkLoop(CONFIG.FADE_TIME_FAST);
    }
  },

  // Helper methods to read the current input state
  getDirection: () => {
    if (state.keysPressed['ArrowUp'] || state.mobileInput.forward > 0) return 1;
    if (state.keysPressed['ArrowDown'] || state.mobileInput.forward < 0) return -1;
    return 0;
  },
  
  isShifting: () => state.keysPressed['ShiftLeft'] || state.mobileInput.shift,
  isTurningLeft: () => state.keysPressed['ArrowLeft'] || state.mobileInput.turn < 0,
  isTurningRight: () => state.keysPressed['ArrowRight'] || state.mobileInput.turn > 0,
  isPunching: () => state.keysPressed['KeyP'] || state.mobileInput.punch,
  isInteracting: () => state.keysPressed['KeyE'] || state.mobileInput.interact,
  isMobileActive: () => isMobileInputActive(),
};