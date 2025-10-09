import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';
import { CONFIG, IDLE, WALK } from './config.js';
import { animationManager } from './animationManager.js';

// Module-scoped variables
const loader = new GLTFLoader();
const tmpV3 = new THREE.Vector3(); // Used for temp calculations
let fogParticles = [];

function showError(msg) {
  const errorBanner = document.getElementById('error-banner');
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
}

export const world = {
  // Main initialization function, called once from main.js
  init() {
    state.scene = new THREE.Scene();

    const fogColor = new THREE.Color(0x1a1a1a);
    state.scene.background = fogColor;
    state.scene.fog = new THREE.Fog(fogColor, 5, 18);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(state.renderer.domElement);

    state.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 150);
    state.camera.position.set(0, 2.8, 6);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enablePan = false;
    state.controls.enableDamping = true;
    state.controls.enableKeys = false;
    state.controls.addEventListener('start', () => { state.userDragging = true; });
    state.controls.addEventListener('end', () => { state.userDragging = false; state.lastMouseUpTime = performance.now(); });
    
    this.setupLights();
    this.createGroundPlane();
    this.createFogParticles();
    
    window.addEventListener('resize', this.onResize);
  },

  // Update function for world elements, called every frame
  update(delta) {
    this.updateFogParticles(delta);
  },

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemi.position.set(0, 20, 0);
    state.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 3);
    dir.position.set(3, 10, 10);
    state.scene.add(dir);
  },

  createGroundPlane() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    state.scene.add(ground);
  },

  loadEnvironment() {
    loader.load(
      CONFIG.ENVIRONMENT_URL,
      (gltf) => {
        const environment = gltf.scene;
        state.scene.add(environment);
        environment.updateMatrixWorld(true);

        state.collidableObjects.length = 0;
        environment.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            state.collidableObjects.push(child);
            
            // --- UPDATED SECTION FOR DOORS ---
            if (child.name && child.name.toLowerCase().includes('door')) {
              const box = new THREE.Box3().setFromObject(child);
              const size = box.getSize(tmpV3);
              const pivot = new THREE.Group();
              pivot.position.copy(child.position);
              child.parent.add(pivot);
              pivot.position.x -= size.x / 2;
              pivot.add(child);
              child.position.x = size.x / 2;
              state.interactiveObjects.set(pivot, { state: 'closed', initialRotationZ: child.rotation.z });
              child.rotation.z = 0;
            }
            // --- END UPDATED SECTION ---
          }
        });

        const bbox = new THREE.Box3().setFromObject(environment);
        state.envGroundY = Number.isFinite(bbox.min.y) ? bbox.min.y : 0.0;
      },
      undefined,
      (err) => showError('Failed to load environment GLTF: ' + err)
    );
  },

  loadCharacter() {
    loader.load(
      CONFIG.MODEL_URL,
      (gltf) => {
        state.character = new THREE.Group();
        state.scene.add(state.character);
        state.character.rotation.y = Math.PI;
        state.character.position.y = state.envGroundY + 0.2;

        state.model = gltf.scene;
        state.character.add(state.model);

        state.mixer = new THREE.AnimationMixer(state.model);
        
        gltf.animations.forEach((clip) => {
          const action = state.mixer.clipAction(clip);
          state.animationsMap.set(clip.name, action);
        });

        if (state.animationsMap.has(IDLE)) animationManager.playLoop(IDLE);
        else if (state.animationsMap.has(WALK)) animationManager.playLoop(WALK);
        else if (gltf.animations[0]) animationManager.playLoop(gltf.animations[0].name);
      },
      undefined,
      (err) => showError('Failed to load character model: ' + err)
    );
  },

  createFogParticles() {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('smoke.png', (texture) => {
      const fogGeo = new THREE.PlaneGeometry(25, 25);
      const fogMaterial = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending
      });
      for (let i = 0; i < 75; i++) {
        const fogMesh = new THREE.Mesh(fogGeo, fogMaterial);
        fogMesh.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 60);
        fogMesh.rotation.z = Math.random() * Math.PI * 2;
        fogMesh.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
        state.scene.add(fogMesh);
        fogParticles.push(fogMesh);
      }
    }, undefined, (err) => showError('Could not load fog texture.'));
  },

  updateFogParticles(delta) {
    for (const p of fogParticles) {
      p.position.addScaledVector(p.userData.velocity, delta);
      const B = 30;
      if (p.position.x > B) p.position.x = -B;
      if (p.position.x < -B) p.position.x = B;
      if (p.position.z > B) p.position.z = -B;
      if (p.position.z < -B) p.position.z = B;
      p.rotation.z += delta * 0.05;
      p.lookAt(state.camera.position);
    }
  },

  onResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }
};