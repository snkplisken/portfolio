import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// =================================================================
// 💰 CONFIG: Character specific
// =================================================================
const CONFIG = {
    MODEL_URL: 'jump2.glb',
    ANIMATION: {
        IDLE: 'idle',
        WALK: 'walk',
        RUN: 'Running',
        WALK_BACK: 'walk backwards',
        JUMP: 'Jump',
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
        TURN_DEG: 90,
        TURN_SPEED_CONTINUOUS: 180,
        STEP_HEIGHT: 0.4,
        STEP_LOOK_AHEAD: 0.1,
        GRAVITY: 9.8,
    },
    FADE_TIME_FAST: 0.12,
    FADE_TIME_TRANSITION: 0.25,
};

const { IDLE, WALK, RUN, WALK_BACK, JUMP, PUNCH, LEFT, RIGHT } = CONFIG.ANIMATION;

// =================================================================
// 🌐 Globals
// =================================================================
let character = null;
let model = null;
let mixer;
const animationsMap = new Map();
let activeAction = null;

let stepQueue = [];
let currentStep = null;
const keysPressed = {};
const mobileInput = { forward: 0, turn: 0, shift: false, punch: false, interact: false };
const INTERACT_KEY = 'KeyE';
let jumpLocked = false;
let jumpUnlockTimer = null;
let isActionLocked = false;
const oneShotFallbacks = new Map();

const tmpV3 = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpTargetQuat = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();
const rayOriginOffset = new THREE.Vector3(0, 0.5, 0);
const rayDirection = new THREE.Vector3();
const collisionDistance = 0.5;

const panel = document.getElementById('animations-panel');

// =================================================================
// 🚀 Initialization
// =================================================================
export function initializeCharacter(scene) {
    loadModel(scene);
    setupInputListeners();
    initializeMobileInput();
    setupControlsToggle();
}

export function getCharacter() {
    return character;
}

// =================================================================
// 🔄 Update Loop (called from main.js)
// =================================================================
export function updateCharacter(delta, collidableObjects) {
    if (mixer) mixer.update(delta);
    if (!character) return;

    const isTurning = activeAction?.getClip().name === LEFT || activeAction?.getClip().name === RIGHT;
    const direction = inputController.getDirection();
    const mobileActive = isMobileInputActive();

    // Rotation
    if (mobileActive && mobileInput.turn !== 0) {
        const turnRateRad = THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_SPEED_CONTINUOUS) * delta * (-mobileInput.turn);
        character.rotation.y += turnRateRad;
        if (isTurning) crossFadeTo(IDLE, CONFIG.FADE_TIME_FAST);
    }

    // Movement
    handleMovement(direction, isTurning, mobileActive, delta, collidableObjects);

    // Stop animation if no input
    if (direction === 0 && !isActionLocked && (activeAction?.getClip().name === WALK || activeAction?.getClip().name === RUN || activeAction?.getClip().name === WALK_BACK)) {
        crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
    }

    handleTurnInput();
    processStep(delta);
    updateGroundHeight(delta, collidableObjects);

    if (character.position.y < 0) {
        character.position.y = 0;
    }
}

// =================================================================
// 🚶‍♂️ Movement Logic
// =================================================================
function handleMovement(direction, isTurning, mobileActive, delta, collidableObjects) {
    if (jumpLocked || isActionLocked || (isTurning && !mobileActive) || direction === 0) return;

    const isShifting = inputController.isShifting();
    let speed = 0;
    let animation = null;

    if (direction === 1) {
        speed = isShifting ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.BASE_SPEED;
        animation = isShifting ? RUN : WALK;
    } else if (direction === -1) {
        speed = CONFIG.MOVEMENT.WALK_BACK_SPEED;
        animation = WALK_BACK;
    }

    const moveDistance = speed * delta;
    const fwd = getWorldForward(tmpV3);
    rayDirection.copy(fwd).negate();

    const characterCenter = character.position.clone().add(rayOriginOffset);
    raycaster.set(characterCenter, rayDirection);
    const intersections = raycaster.intersectObjects(collidableObjects, true);

    let canMove = true;
    if (intersections.length > 0 && intersections[0].distance < collisionDistance) {
        const higherOrigin = characterCenter.clone().add(new THREE.Vector3(0, CONFIG.MOVEMENT.STEP_HEIGHT, 0));
        raycaster.set(higherOrigin, rayDirection);
        const higherIntersections = raycaster.intersectObjects(collidableObjects, true);
        canMove = higherIntersections.length === 0 || higherIntersections[0].distance > collisionDistance;
    }
    
    if (canMove) {
        const moveDirection = direction === 1 ? 1 : -1;
        character.position.addScaledVector(fwd.negate(), moveDistance * moveDirection);
        if (activeAction?.getClip().name !== animation) {
            crossFadeTo(animation, CONFIG.FADE_TIME_FAST);
        }
    } else {
        if (activeAction?.getClip().name === WALK || activeAction?.getClip().name === RUN) {
            crossFadeTo(IDLE, CONFIG.FADE_TIME_FAST);
        }
    }
}


// =================================================================
//  modelu Loading
// =================================================================
function loadModel(scene) {
    const loader = new GLTFLoader();
    loader.load(
        CONFIG.MODEL_URL,
        (gltf) => {
            character = new THREE.Group();
            scene.add(character);
            character.rotation.y = Math.PI;

            model = gltf.scene;
            character.add(model);

            mixer = new THREE.AnimationMixer(model);

            gltf.animations.forEach((clip) => {
                const action = mixer.clipAction(clip);
                animationsMap.set(clip.name, action);
                const btn = document.createElement('button');
                btn.textContent = clip.name;
                btn.addEventListener('click', () => {
                    if ([WALK, IDLE, RUN, WALK_BACK, PUNCH].includes(clip.name)) playLoop(clip.name);
                    else playOnceSafe(clip.name);
                });
                if(panel) panel.appendChild(btn);
            });

            if (animationsMap.has(IDLE)) playLoop(IDLE);
            else if (animationsMap.has(WALK)) playLoop(WALK);
            else if (gltf.animations[0]) playLoop(gltf.animations[0].name);
        },
        undefined,
        (err) => {
            console.error('GLTF load error:', err);
            addPlaceholderCapsule(scene);
        }
    );
}

function addPlaceholderCapsule(scene) {
    character = new THREE.Group();
    scene.add(character);
    character.rotation.y = Math.PI;
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 8, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff8aa0, roughness: 0.75 });
    model = new THREE.Mesh(geo, mat);
    model.position.set(0, 1.0, 0);
    character.add(model);
    mixer = null;
    console.warn('Using placeholder capsule — no animations available.');
}


// =================================================================
// ⌨️ Input Handling
// =================================================================
const inputController = {
    getDirection: () => {
        if (keysPressed['ArrowUp'] || mobileInput.forward > 0) return 1;
        if (keysPressed['ArrowDown'] || mobileInput.forward < 0) return -1;
        return 0;
    },
    isShifting: () => keysPressed['ShiftLeft'] || mobileInput.shift,
    isTurningLeft: () => keysPressed['ArrowLeft'] || mobileInput.turn < 0,
    isTurningRight: () => keysPressed['ArrowRight'] || mobileInput.turn > 0,
    isPunching: () => keysPressed['KeyP'] || mobileInput.punch,
    isInteracting: () => keysPressed[INTERACT_KEY] || mobileInput.interact,
};

function isMobileInputActive() {
    return mobileInput.forward !== 0 || mobileInput.turn !== 0 || mobileInput.shift || mobileInput.punch || mobileInput.interact;
}

function setupInputListeners() {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
}

function onKeyDown(e) {
    if (e.repeat) return;
    keysPressed[e.code] = true;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'KeyP', INTERACT_KEY].includes(e.code)) e.preventDefault();
    if (!character) return;

    if (e.code === 'KeyP' && !isActionLocked) playOnceSafe(PUNCH);
    if (e.code === 'Space' && !jumpLocked) {
        if(playOnceSafe(JUMP)) setJumpLockByClip(JUMP);
    }
}

function onKeyUp(e) {
    keysPressed[e.code] = false;
    if (e.code === 'ShiftLeft' && keysPressed['ArrowUp'] && !jumpLocked) {
        returnToWalkLoop(CONFIG.FADE_TIME_FAST);
    }
}


// =================================================================
// 📐 Helpers & Step System
// =================================================================
function updateGroundHeight(delta, collidableObjects) {
    if(!character) return;
    const rayOrigin = character.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const groundIntersects = raycaster.intersectObjects(collidableObjects, true);
    
    if (groundIntersects.length > 0 && groundIntersects[0].distance < 1.0) {
        const groundY = groundIntersects[0].point.y;
        character.position.y = THREE.MathUtils.lerp(character.position.y, groundY, 0.2);
    } else if (!jumpLocked) {
        character.position.y -= CONFIG.MOVEMENT.GRAVITY * delta;
    }
}

function getWorldForward(target = new THREE.Vector3()) {
    return character.getWorldDirection(target).setY(0).normalize();
}

function queueTurnStep({ yawDeltaRad = 0, distance = CONFIG.MOVEMENT.STEP_DISTANCE, duration = CONFIG.MOVEMENT.STEP_TIME, moveMode = 'turnForward' }) {
    const startPos = character.position.clone();
    const startQuat = character.quaternion.clone();

    tmpEuler.setFromQuaternion(startQuat, 'YXZ');
    tmpEuler.y += yawDeltaRad;
    tmpTargetQuat.setFromEuler(tmpEuler);

    let endPos;
    if (moveMode === 'turnForward') {
        tmpQuat.slerpQuaternions(startQuat, tmpTargetQuat, 0.5);
        const avgForward = tmpV3.set(0, 0, -1).applyQuaternion(tmpQuat).setY(0).normalize();
        endPos = startPos.addScaledVector(avgForward.negate(), Math.abs(distance));
    } else {
        const forwardNow = getWorldForward(tmpV3);
        endPos = startPos.addScaledVector(forwardNow.negate(), distance);
    }

    stepQueue.push({ startPos: startPos.clone(), endPos: endPos.clone(), startQuat, targetQuat: tmpTargetQuat.clone(), elapsed: 0, duration });
    if (stepQueue.length > 8) stepQueue.shift();
}

function processStep(dt) {
    if (!currentStep && stepQueue.length > 0) currentStep = stepQueue.shift();
    if (!currentStep) return;

    currentStep.elapsed += dt;
    const t = Math.min(1, currentStep.elapsed / currentStep.duration);
    const tt = t * t * (3 - 2 * t);

    character.position.lerpVectors(currentStep.startPos, currentStep.endPos, tt);
    character.quaternion.slerpQuaternions(currentStep.startQuat, currentStep.targetQuat, tt);

    if (t >= 1) {
        currentStep = null;
        if (!jumpLocked && inputController.getDirection() === 0) {
            crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
        }
    }
}

function handleTurnInput() {
    if (isMobileInputActive() || jumpLocked || isActionLocked || currentStep) return;
    if (inputController.isTurningLeft()) {
        queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_DEG), distance: 0, duration: CONFIG.MOVEMENT.STEP_TIME });
        playOnceSafe(LEFT, CONFIG.MOVEMENT.STEP_TIME);
    } else if (inputController.isTurningRight()) {
        queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(-CONFIG.MOVEMENT.TURN_DEG), distance: 0, duration: CONFIG.MOVEMENT.STEP_TIME });
        playOnceSafe(RIGHT, CONFIG.MOVEMENT.STEP_TIME);
    }
}

// =================================================================
// 🎬 Animation Helpers
// =================================================================
function crossFadeTo(name, fade = CONFIG.FADE_TIME_TRANSITION) {
    if (!animationsMap.has(name)) return false;
    const action = animationsMap.get(name);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset();
    if (activeAction && activeAction !== action) {
        activeAction.crossFadeTo(action, fade, false);
    }
    action.play();
    activeAction = action;
    highlightButton(name);
    return true;
}

function playLoop(name) {
    if (!animationsMap.has(name)) return false;
    clearAllOneShotFallbacks();
    const action = animationsMap.get(name);
    action.setEffectiveTimeScale(1).setEffectiveWeight(1).setLoop(THREE.LoopRepeat, Infinity).clampWhenFinished = false;
    action.reset().enabled = true;
    if (activeAction && activeAction !== action) activeAction.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
    action.play();
    activeAction = action;
    highlightButton(name);
    return true;
}

function playOnceSafe(name, durationOverride) {
    if (!animationsMap.has(name)) return false;
    isActionLocked = true;
    const action = animationsMap.get(name);
    const clipDuration = action._clip?.duration ?? CONFIG.MOVEMENT.STEP_TIME;
    const targetDuration = durationOverride || clipDuration;
    const timeScale = clipDuration / targetDuration;
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    action.reset().enabled = true;
    if (activeAction && activeAction !== action) activeAction.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
    action.play();
    activeAction = action;
    highlightButton(name);
    const onFinish = (e) => {
        if (e.action !== action) return;
        mixer.removeEventListener('finished', onFinish);
        clearOneShotFallback(name);
        resolveAfterOneShot();
    };
    mixer.addEventListener('finished', onFinish);
    const effectiveDuration = targetDuration;
    clearOneShotFallback(name);
    const id = setTimeout(() => {
        mixer?.removeEventListener('finished', onFinish);
        resolveAfterOneShot();
    }, Math.max(60, effectiveDuration * 1000 + 40));
    oneShotFallbacks.set(name, id);
    return true;
}

function returnToWalkLoop(fade = CONFIG.FADE_TIME_TRANSITION) {
    if (!animationsMap.has(WALK)) return false;
    const action = animationsMap.get(WALK);
    action.setEffectiveTimeScale(1).setEffectiveWeight(1).setLoop(THREE.LoopRepeat, Infinity).clampWhenFinished = false;
    action.reset().enabled = true;
    if (activeAction && activeAction !== action) {
        activeAction.crossFadeTo(action, fade, false);
    }
    action.play();
    activeAction = action;
    highlightButton(WALK);
    return true;
}

function resolveAfterOneShot() {
    isActionLocked = false;
    if (jumpLocked) return;
    if (inputController.getDirection() === 1) {
        if (inputController.isShifting()) crossFadeTo(RUN, CONFIG.FADE_TIME_TRANSITION);
        else returnToWalkLoop(CONFIG.FADE_TIME_TRANSITION);
    } else if (inputController.getDirection() === -1) {
        crossFadeTo(WALK_BACK, CONFIG.FADE_TIME_TRANSITION);
    } else {
        crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
    }
}

function setJumpLockByClip(clipName, durationOverride) {
    if (!animationsMap.has(clipName)) return;
    const a = animationsMap.get(clipName);
    const clipDur = a?._clip?.duration ?? 0.6;
    const dur = durationOverride ?? clipDur;
    if (jumpUnlockTimer) clearTimeout(jumpUnlockTimer);
    jumpLocked = true;
    clearAllOneShotFallbacks();
    jumpUnlockTimer = setTimeout(() => {
        jumpLocked = false;
        resolveAfterOneShot();
    }, Math.max(80, dur * 1000));
}

function clearOneShotFallback(name) {
    const id = oneShotFallbacks.get(name);
    if (id) {
        clearTimeout(id);
        oneShotFallbacks.delete(name);
    }
}

function clearAllOneShotFallbacks() {
    for (const id of oneShotFallbacks.values()) clearTimeout(id);
    oneShotFallbacks.clear();
}


// =================================================================
// 🎨 UI & Mobile
// =================================================================
function initializeMobileInput() {
    const joystickRegion = document.getElementById('joystick-region');
    const joystickPad = document.getElementById('joystick-pad');
    if (!joystickRegion || !joystickPad) {
        console.warn("Joystick elements not found. Mobile controls disabled.");
        return;
    }
    const maxDistance = 75;
    let touchIdentifier = null;
    function updateJoystick(clientX, clientY) {
        const rect = joystickRegion.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let deltaX = clientX - centerX;
        let deltaY = clientY - centerY;
        const distance = Math.min(maxDistance, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
        const angle = Math.atan2(deltaY, deltaX);
        const clampedX = Math.cos(angle) * distance;
        const clampedY = Math.sin(angle) * distance;
        joystickPad.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
        const normalizedX = clampedX / maxDistance;
        const normalizedY = -clampedY / maxDistance;
        const deadZone = 0.15;
        if (distance > maxDistance * deadZone) {
            mobileInput.forward = normalizedY;
            mobileInput.turn = Math.abs(normalizedX) > deadZone ? normalizedX : 0;
        } else {
            mobileInput.forward = 0;
            mobileInput.turn = 0;
        }
    }
    function onTouchStart(event) {
        if (touchIdentifier === null && (event.target === joystickRegion || event.target === joystickPad)) {
            touchIdentifier = event.changedTouches[0].identifier;
            event.preventDefault();
            updateJoystick(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
        }
    }
    function onTouchMove(event) {
        for (let touch of event.changedTouches) {
            if (touch.identifier === touchIdentifier) {
                event.preventDefault();
                updateJoystick(touch.clientX, touch.clientY);
                break;
            }
        }
    }
    function onTouchEnd(event) {
        for (let touch of event.changedTouches) {
            if (touch.identifier === touchIdentifier) {
                joystickPad.style.transform = `translate(0, 0)`;
                mobileInput.forward = 0;
                mobileInput.turn = 0;
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

function setupControlsToggle() {
    const closeButton = document.getElementById('close-panel-btn');
    if (closeButton && panel) {
        closeButton.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
}

function highlightButton(activeName) {
    document.querySelectorAll('#animations-panel button').forEach(btn => {
        btn.classList.toggle('active', btn.innerText === activeName);
    });
}
