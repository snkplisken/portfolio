import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =================================================================
// 💰 CONFIG: Consolidated and renamed for clarity/organization
// =================================================================
const CONFIG = {
    // Model & Animation Names
    MODEL_URL: 'jump2.glb',
    ENVIRONMENT_URL: 'enviorment.glb',
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
    // Movement & Feel
    MOVEMENT: {
        BASE_SPEED: 2.8,
        RUN_SPEED: 6.0,
        WALK_BACK_SPEED: 1.8,
        STEP_DISTANCE: 0.9,
        STEP_TIME: 0.22,
        TURN_DEG: 90,
        TURN_SPEED_CONTINUOUS: 180, // Degrees per second for mobile turning
        STEP_HEIGHT: 0.4, // Max height the character can step up
        STEP_LOOK_AHEAD: 0.1, // How far ahead to check for the ground on a step
        GRAVITY: 9.8,
    },
    // Animation Transitions
    FADE_TIME_FAST: 0.12,
    FADE_TIME_TRANSITION: 0.25,
    // Camera
    CAMERA: {
        CHASE_OFFSET: new THREE.Vector3(0.7, 2.8, 5.2),
        LOOK_AT_OFFSET: new THREE.Vector3(0, 1.6, 0),
        LERP_FACTOR: 0.15,
        AUTOCENTER_DELAY_MS: 600,
        CONTROLS_TARGET_LERP: 0.18,
    }
};

const { IDLE, WALK, RUN, WALK_BACK, JUMP, PUNCH, LEFT, RIGHT } = CONFIG.ANIMATION;

// =================================================================
// 🌐 Globals
// =================================================================
let scene, camera, renderer, controls, clock, mixer;
let character = null;
let model = null;
const animationsMap = new Map();
let activeAction = null;

// Turn/step queue
let stepQueue = [];
let currentStep = null;

// Key state (Desktop)
const keysPressed = {};

// Mobile/Touch Input State (Must be updated by your UI events)
const mobileInput = {
    forward: 0,
    turn: 0,
    shift: false,
    punch: false,
    interact: false,
};

const INTERACT_KEY = 'KeyE';

// Jump lock
let jumpLocked = false;
let jumpUnlockTimer = null;

// General Action Lock for one-shot animations (Punch, Turn Steps)
let isActionLocked = false;

// Fallback timeouts for one-shots
const oneShotFallbacks = new Map();

// Vectors / Temps: Pre-allocate for performance
const tmpV3 = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpTargetQuat = new THREE.Quaternion();

// Raycasting Globals for Collision
const raycaster = new THREE.Raycaster();
const rayOriginOffset = new THREE.Vector3(0, 0.5, 0);
const rayDirection = new THREE.Vector3();
const collisionDistance = 0.5;
let collidableObjects = [];

// INTERACTION GLOBALS
const interactiveObjects = new Map();
const INTERACT_PROXIMITY = 1.5;

// UI
const panel = document.getElementById('animations-panel');
const errorBanner = document.getElementById('error-banner');

// Camera state
let userDragging = false;
let lastMouseUpTime = 0;


// ⬇️ INPUT CONTROLLER - Combines Desktop and Mobile inputs
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
// ⬆️ END INPUT CONTROLLER


// ⬇️ HELPER: Check if any mobile input is actively moving the stick
function isMobileInputActive() {
    return mobileInput.forward !== 0 || mobileInput.turn !== 0 || mobileInput.shift || mobileInput.punch || mobileInput.interact;
}
// ⬆️ END HELPER


// =================================================================
// 📱 MOBILE INPUT ATTACHMENT FIX (Kept for completeness)
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
        const normalizedY = -clampedY / maxDistance; // Y is inverted on screen
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
            const touch = event.changedTouches[0];
            updateJoystick(touch.clientX, touch.clientY);
        }
    }

    function onTouchMove(event) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === touchIdentifier) {
                event.preventDefault();
                updateJoystick(touch.clientX, touch.clientY);
                break;
            }
        }
    }

    function onTouchEnd(event) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
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

window.addEventListener('load', initializeMobileInput);


// =================================================================
// 🛠️ Core Initialization & Loading
// =================================================================
init();

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 6, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 150);
    camera.position.set(0, 2.8, 6);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 3);
    dir.position.set(3, 10, 10);
    scene.add(dir);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    scene.add(ground);

    loadEnvironment();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.enableKeys = false;
    controls.addEventListener('start', () => { userDragging = true; });
    controls.addEventListener('end', () => {
        userDragging = false;
        lastMouseUpTime = performance.now();
    });

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('resize', onResize);

    setupControlsToggle();

    loadModel();
    animate();
}


function loadEnvironment() {
    const loader = new GLTFLoader();
    loader.load(
        CONFIG.ENVIRONMENT_URL,
        (gltf) => {
            const environment = gltf.scene;
            scene.add(environment);
            environment.traverse((child) => {
                if (child.isMesh) {
                    collidableObjects.push(child);
                    if (child.name.startsWith('DOOR_')) {
                        interactiveObjects.set(child, {
                            state: 'closed',
                            initialRotationY: child.rotation.y,
                            parent: child.parent
                        });
                    }
                }
            });
        },
        undefined,
        (err) => {
            console.error('Failed to load environment GLTF:', err);
            showError('Failed to load environment GLTF: ' + CONFIG.ENVIRONMENT_URL);
        }
    );
}


function loadModel() {
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
                    if (clip.name === WALK || clip.name === IDLE || clip.name === RUN || clip.name === WALK_BACK || clip.name === PUNCH) playLoop(clip.name);
                    else playOnceSafe(clip.name);
                });
                panel.appendChild(btn);
            });

            // ArrowHelper points down local -Z
            const arrowLength = 2.0;
            const arrowColor = 0xff0000;
            const dir = new THREE.Vector3(0, 0, -1);
            const origin = new THREE.Vector3(0, 0.01, 0);
            const arrowHelper = new THREE.ArrowHelper(dir, origin, arrowLength, arrowColor, 0.4, 0.2);
            character.add(arrowHelper);


            if (animationsMap.has(IDLE)) playLoop(IDLE);
            else if (animationsMap.has(WALK)) playLoop(WALK);
            else if (gltf.animations[0]) playLoop(gltf.animations[0].name);
        },
        undefined,
        (err) => {
            showError('Failed to load model: ' + CONFIG.MODEL_URL + '. Check the path/file.');
            console.error('GLTF load error:', err);
            addPlaceholderCapsule();
        }
    );
}

function addPlaceholderCapsule() {
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
// ⌨️ Input Handling (Desktop Keys Only)
// =================================================================
function onKeyDown(e) {
    if (e.repeat) return;
    const code = e.code;
    keysPressed[code] = true;

    if (code.startsWith('Arrow') || code === 'Space' || code === 'ShiftLeft' || code === 'KeyP' || code === INTERACT_KEY) e.preventDefault();
    if (!character) return;

    if (code === 'KeyP') {
        if (inputController.isPunching() && !isActionLocked && playOnceSafe(PUNCH)) { /* lock set inside playOnceSafe */ }
        return;
    }
    if (code === 'Space') {
        if (!jumpLocked && playOnceSafe(JUMP)) setJumpLockByClip(JUMP);
        return;
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
function updateGroundHeight(delta) {
    const rayOrigin = character.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    const downRay = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, downRay);

    const groundIntersects = raycaster.intersectObjects(collidableObjects, true);
    
    // Max distance the character can be from the ground before falling
    const maxGroundDistance = 1.0; 

    if (groundIntersects.length > 0 && groundIntersects[0].distance < maxGroundDistance) {
        const groundY = groundIntersects[0].point.y;
        // Use LERP to smoothly adjust height to the ground
        character.position.y = THREE.MathUtils.lerp(character.position.y, groundY, 0.2);
    } else {
        // No ground detected or it's too far below, apply gravity
        if (!jumpLocked) {
           character.position.y -= CONFIG.MOVEMENT.GRAVITY * delta;
        }
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

    const step = {
        startPos: startPos.clone(),
        endPos: endPos.clone(),
        startQuat,
        targetQuat: tmpTargetQuat.clone(),
        elapsed: 0,
        duration
    };
    if (stepQueue.length > 8) stepQueue.shift();
    stepQueue.push(step);
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

/**
 * Handles instantaneous turn inputs (Left/Right arrow taps) for desktop only.
 */
function handleTurnInput(delta) {
    // ONLY run if NO mobile input is active
    if (isMobileInputActive() || jumpLocked || isActionLocked || currentStep) return;

    if (inputController.isTurningLeft()) {
        queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_DEG), distance: 0, duration: CONFIG.MOVEMENT.STEP_TIME, moveMode: 'forward' });
        playOnceSafe(LEFT, CONFIG.MOVEMENT.STEP_TIME);
    } else if (inputController.isTurningRight()) {
        queueTurnStep({ yawDeltaRad: THREE.MathUtils.degToRad(-CONFIG.MOVEMENT.TURN_DEG), distance: 0, duration: CONFIG.MOVEMENT.STEP_TIME, moveMode: 'forward' });
        playOnceSafe(RIGHT, CONFIG.MOVEMENT.STEP_TIME);
    }
}

// =================================================================
// 🎮 Interaction System
// =================================================================
function handleInteractions() {
    // 1. Smoothly open/close the door mesh (continuous lerp)
    interactiveObjects.forEach((state, mesh) => {
        const targetRotationY = state.state === 'open' ? state.initialRotationY + (Math.PI / 2) : state.initialRotationY;
        if (mesh.rotation.y !== targetRotationY) {
            mesh.rotation.y = THREE.MathUtils.lerp(
                mesh.rotation.y,
                targetRotationY,
                0.05
            );
        }
    });

    // 2. Check for 'E'/'Interact' press only if not locked
    if (inputController.isInteracting() && !isActionLocked) {
        const fwd = getWorldForward(tmpV3).negate();
        raycaster.set(
            character.position.clone().add(rayOriginOffset),
            fwd
        );
        const interactableMeshes = Array.from(interactiveObjects.keys());
        const interactions = raycaster.intersectObjects(interactableMeshes, true);

        if (interactions.length > 0) {
            const closestInteraction = interactions[0];
            const targetMesh = closestInteraction.object;
            const targetState = interactiveObjects.get(targetMesh);

            // 3. Check Proximity
            if (closestInteraction.distance <= INTERACT_PROXIMITY) {
                targetState.state = (targetState.state === 'closed' ? 'open' : 'closed');
                isActionLocked = true;
                setTimeout(() => {
                    isActionLocked = false;
                }, 300);
            }
        }
    }
}


// =================================================================
// 🔄 Loop (animate, updateCameraChase)
// =================================================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (character) {
        const isTurning = activeAction?.getClip().name === LEFT || activeAction?.getClip().name === RIGHT;
        const floorY = 0;
        const direction = inputController.getDirection();
        const isShifting = inputController.isShifting();
        const mobileActive = isMobileInputActive();

        // ------------------------------------------------------------------
        // 1. ROTATION (Continuous for Mobile)
        // ------------------------------------------------------------------
        if (mobileActive && mobileInput.turn !== 0) {
            const turnRateRad = THREE.MathUtils.degToRad(CONFIG.MOVEMENT.TURN_SPEED_CONTINUOUS) * delta * (-mobileInput.turn);
            character.rotation.y += turnRateRad;
            if (isTurning) crossFadeTo(IDLE, CONFIG.FADE_TIME_FAST);
        }

        // ------------------------------------------------------------------
        // 2. MOVEMENT (Forward/Backward Continuous)
        // ------------------------------------------------------------------
        if (!jumpLocked && !isActionLocked && (!isTurning || mobileActive) && direction !== 0) {
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
                // We hit something. Is it a step or a wall?
                const higherOrigin = characterCenter.clone().add(new THREE.Vector3(0, CONFIG.MOVEMENT.STEP_HEIGHT, 0));
                raycaster.set(higherOrigin, rayDirection);
                const higherIntersections = raycaster.intersectObjects(collidableObjects, true);
        
                // If the higher ray is clear, it's a step, so we can move.
                // Otherwise, it's a wall, and we can't.
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

        // ⬇️ Stop animation if direction is zero (release stick/key)
        if (direction === 0 && !isActionLocked &&
            (activeAction?.getClip().name === WALK || activeAction?.getClip().name === RUN || activeAction?.getClip().name === WALK_BACK)) {
            crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
        }

        handleTurnInput(delta);
        processStep(delta);
        handleInteractions();
        updateGroundHeight(delta); // Call the new ground check function
        updateCameraChase();

        // This is now a failsafe for falling through the world
        if (character.position.y < floorY) {
            character.position.y = floorY;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}


function updateCameraChase() {
    const now = performance.now();
    const shouldChase = !userDragging && (now - lastMouseUpTime > CONFIG.CAMERA.AUTOCENTER_DELAY_MS);

    const lookTarget = tmpV3.copy(character.position).add(CONFIG.CAMERA.LOOK_AT_OFFSET);
    controls.target.lerp(lookTarget, CONFIG.CAMERA.CONTROLS_TARGET_LERP);

    if (shouldChase) {
        const desiredPos = lookTarget
            .sub(CONFIG.CAMERA.LOOK_AT_OFFSET)
            .add(CONFIG.CAMERA.CHASE_OFFSET.clone().applyQuaternion(character.quaternion));
        camera.position.lerp(desiredPos, CONFIG.CAMERA.LERP_FACTOR);
        camera.lookAt(lookTarget);
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
    const from = activeAction;
    action.setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .setLoop(THREE.LoopRepeat, Infinity)
        .clampWhenFinished = false;

    action.reset().enabled = true;

    if (from && from !== action) from.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
    action.play();
    activeAction = action;
    highlightButton(name);
    return true;
}


function playOnceSafe(name, durationOverride) {
    if (!animationsMap.has(name)) return false;
    isActionLocked = true; // Set Action Lock

    const action = animationsMap.get(name);
    const from = activeAction;
    const clipDuration = action._clip?.duration ?? CONFIG.MOVEMENT.STEP_TIME;
    const targetDuration = durationOverride || clipDuration;
    const timeScale = clipDuration / targetDuration;

    action.setEffectiveTimeScale(timeScale)
        .setEffectiveWeight(1)
        .setLoop(THREE.LoopOnce, 1)
        .clampWhenFinished = true;

    action.reset().enabled = true;
    if (from && from !== action) from.crossFadeTo(action, CONFIG.FADE_TIME_FAST, false);
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
    const from = activeAction;
    action.setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .setLoop(THREE.LoopRepeat, Infinity)
        .clampWhenFinished = false;

    action.reset().enabled = true;

    if (from && from !== action) {
        from.crossFadeTo(action, fade, false);
    }
    action.play();
    activeAction = action;
    highlightButton(WALK);
    return true;
}

function resolveAfterOneShot() {
    isActionLocked = false; // Unset Action Lock
    if (jumpLocked) return;

    if (inputController.getDirection() === 1) {
        if (inputController.isShifting()) {
            crossFadeTo(RUN, CONFIG.FADE_TIME_TRANSITION);
        } else {
            returnToWalkLoop(CONFIG.FADE_TIME_TRANSITION);
        }
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
        if (inputController.getDirection() === 1) {
            if (inputController.isShifting()) crossFadeTo(RUN, CONFIG.FADE_TIME_TRANSITION);
            else returnToWalkLoop(CONFIG.FADE_TIME_TRANSITION);
        } else if (inputController.getDirection() === -1) {
            crossFadeTo(WALK_BACK, CONFIG.FADE_TIME_TRANSITION);
        } else {
            crossFadeTo(IDLE, CONFIG.FADE_TIME_TRANSITION);
        }
    }, Math.max(80, dur * 1000));
}

function clearOneShotFallback(name) {
    const id = oneShotFallbacks.get(name);
    if (id) {
        clearTimeout(id);
        oneShotFallbacks.delete(id);
    }
}

function clearAllOneShotFallbacks() {
    for (const id of oneShotFallbacks.values()) {
        clearTimeout(id);
    }
    oneShotFallbacks.clear();
}


// =================================================================
// 🎨 UI & Misc
// =================================================================
function setupControlsToggle() {
    const panelElement = document.getElementById('animations-panel');
    const closeButton = document.getElementById('close-panel-btn');

    if (closeButton && panelElement) {
        closeButton.addEventListener('click', () => {
            // Hides the panel by setting display to none
            panelElement.style.display = 'none';
            console.log("Controls Panel Hidden.");
        });
    }
}

function highlightButton(activeName) {
    document.querySelectorAll('#animations-panel button').forEach(btn => {
        btn.classList.toggle('active', btn.innerText === activeName);
    });
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
}