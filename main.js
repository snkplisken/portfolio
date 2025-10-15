import * as THREE from 'three';
import { state } from './state.js';
import { CONFIG } from './config.js';
import { world } from './world.js';
import { inputController } from './inputController.js';
import { characterController } from './characterController.js';

// --- Module-Scoped Variables ---
const tmpV3 = new THREE.Vector3();
const playlist = ['A$AP Rocky - Palace.mp3', 'Unkown - What I Wouldnt Give.mp3', 'song3.mp3'];
let currentSongIndex = 0;

// --- Main Application Setup and Loop ---

init();

function init() {
  // Initialize the world, assets, and input listeners
  world.init();
  world.loadEnvironment();
  world.loadCharacter();
  inputController.init();
  
  // Set up UI components
  setupControlsToggle();
  setupMusicPlayer();

  // Start the animation loop
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = state.clock.getDelta();

  // Update core systems each frame
  if (state.mixer) state.mixer.update(delta);
  
  world.update(delta);
  characterController.update(delta);
  updateCameraChase();

  if (state.controls) state.controls.update();

  // Render the scene
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
}

// --- Camera Logic ---

function updateCameraChase() {
  if (!state.character) return;

  const now = performance.now();
  const shouldChase = !state.userDragging && (now - state.lastMouseUpTime > CONFIG.CAMERA.AUTOCENTER_DELAY_MS);

  // Smoothly move the controls' target to follow the character
  const lookTarget = tmpV3.copy(state.character.position).add(CONFIG.CAMERA.LOOK_AT_OFFSET);
  state.controls.target.lerp(lookTarget, CONFIG.CAMERA.CONTROLS_TARGET_LERP);

  if (shouldChase) {
    // Calculate the desired camera position based on character's rotation
    const desiredPos = lookTarget
      .clone()
      .sub(CONFIG.CAMERA.LOOK_AT_OFFSET)
      .add(CONFIG.CAMERA.CHASE_OFFSET.clone().applyQuaternion(state.character.quaternion));
    
    // Smoothly move the camera to the desired position
    state.camera.position.lerp(desiredPos, CONFIG.CAMERA.LERP_FACTOR);
    state.camera.lookAt(lookTarget); // Ensure camera keeps looking at the target
  }
}

// --- UI Logic ---

function setupControlsToggle() {
  const panelElement = document.getElementById('animations-panel');
  const closeButton = document.getElementById('close-panel-btn');
  if (closeButton && panelElement) {
    closeButton.addEventListener('click', () => {
      panelElement.style.display = 'none';
    });
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function loadSong(songIndex, autoplay = true) {
  const music = document.getElementById('background-music');
  const songNameEl = document.getElementById('song-name');
  let displayName = playlist[songIndex].replace('.mp3', '').replace(/_/g, ' ').replace(/-/g, ' ');
  if (songNameEl) songNameEl.textContent = displayName;
  music.src = playlist[songIndex];
  music.load();

  if (autoplay) {
    const playPromise = music.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Autoplay was prevented by the browser. Music will start after user interaction.', err);
        const resumePlayback = () => {
          const resumedPromise = music.play();
          if (resumedPromise !== undefined) {
            resumedPromise.catch((error) => console.warn('Playback failed after user interaction.', error));
          }
          document.removeEventListener('pointerdown', resumePlayback);
          document.removeEventListener('keydown', resumePlayback);
        };
        document.addEventListener('pointerdown', resumePlayback);
        document.addEventListener('keydown', resumePlayback);
      });
    }
  }
}

function setupMusicPlayer() {
  const music = document.getElementById('background-music');
  const timeline = document.getElementById('timeline');
  const currentTimeEl = document.getElementById('current-time');
  const totalDurationEl = document.getElementById('total-duration');
  const musicControls = document.getElementById('music-controls');
  const toggleBtn = document.getElementById('toggle-music-btn');
  const muteBtn = document.getElementById('mute-btn');

  if (!music || !timeline || !currentTimeEl || !totalDurationEl || !musicControls || !toggleBtn || !muteBtn) {
    console.warn("Music player HTML missing elements.");
    return;
  }

  music.volume = 0.3;
  muteBtn.textContent = music.muted ? 'Unmute' : 'Mute';

  toggleBtn.addEventListener('click', () => {
    musicControls.classList.toggle('hidden');
    toggleBtn.textContent = musicControls.classList.contains('hidden') ? 'Show' : 'Hide';
  });

  muteBtn.addEventListener('click', () => {
    music.muted = !music.muted;
    muteBtn.textContent = music.muted ? 'Unmute' : 'Mute';
  });

  music.addEventListener('volumechange', () => {
    muteBtn.textContent = music.muted ? 'Unmute' : 'Mute';
  });

  music.addEventListener('loadedmetadata', () => {
    totalDurationEl.textContent = formatTime(music.duration);
    timeline.max = music.duration;
  });

  music.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = formatTime(music.currentTime);
    timeline.value = music.currentTime;
  });

  timeline.addEventListener('click', (e) => {
    const timelineWidth = timeline.offsetWidth;
    const clickPosition = e.offsetX;
    const pct = clickPosition / timelineWidth;
    music.currentTime = music.duration * pct;
  });

  music.addEventListener('ended', () => {
    currentSongIndex = (currentSongIndex + 1) % playlist.length;
    loadSong(currentSongIndex);
  });

  loadSong(currentSongIndex);
}
