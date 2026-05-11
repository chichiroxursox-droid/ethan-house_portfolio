import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Camera proxy — spline-sampled, render loop applies to camera
export const cameraState = {
  x: 0, y: 30, z: 0,
  lookX: 0, lookY: 0, lookZ: 0,
  progress: 0,
};

let trigger = null;

// Position spline: bird's eye → descent → through door → inside room
const cameraPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 30, 0),       // 0.00 — directly above
  new THREE.Vector3(2, 25, 3),       // 0.10 — slight drift
  new THREE.Vector3(3, 18, 5),       // 0.20 — beginning descent
  new THREE.Vector3(2, 12, 6),       // 0.35 — approaching, angling
  new THREE.Vector3(1, 6, 5),        // 0.45 — low approach
  new THREE.Vector3(0.2, 2.5, 4),    // 0.55 — near ground, door opens
  new THREE.Vector3(0, 1.7, 3.5),    // 0.65 — eye level at door
  new THREE.Vector3(0, 1.7, 2.0),    // 0.75 — through doorway
  new THREE.Vector3(0, 1.7, 0.5),    // 0.85 — inside room
  new THREE.Vector3(0, 1.7, -0.5),   // 1.00 — settled inside, facing desk
]);

// LookAt spline: house center → door → turn toward desk
const lookAtPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),        // looking at house center
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 1, 0.5),      // shifting toward front
  new THREE.Vector3(0, 1.2, 0),      // door area
  new THREE.Vector3(0, 1.1, 0),
  new THREE.Vector3(0, 1.1, 0),      // door height
  new THREE.Vector3(0, 1.1, -0.5),   // looking deeper inside
  new THREE.Vector3(-1.0, 1.1, -1.5), // turning toward desk
  new THREE.Vector3(-1.8, 1.0, -1.5), // looking at desk/character
]);

export function initScroll() {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,
      onUpdate: (self) => {
        cameraState.progress = self.progress;

        // Sample position from spline
        const pos = cameraPath.getPointAt(self.progress);
        cameraState.x = pos.x;
        cameraState.y = pos.y;
        cameraState.z = pos.z;

        // Sample lookAt from spline
        const look = lookAtPath.getPointAt(self.progress);
        cameraState.lookX = look.x;
        cameraState.lookY = look.y;
        cameraState.lookZ = look.z;

        // Fade scroll hint
        if (self.progress > 0.01) {
          gsap.to('#scroll-hint', { opacity: 0, duration: 0.5, overwrite: true });
        }
      },
    },
  });

  trigger = tl.scrollTrigger;
}

export function getProgress() {
  return trigger ? trigger.progress : 0;
}

export function refreshScroll() {
  ScrollTrigger.refresh();
}
