import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// ── Module-level state ──
let sunPosition = new THREE.Vector3();

// No-op — kept so render loop call doesn't break
export function updateSky() {}

// ── Main init ──
export function initSky(scene, renderer) {
  // Fixed golden-hour sky
  const sky = new Sky();
  sky.scale.setScalar(450000);

  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value       = 4;
  uniforms['rayleigh'].value        = 2;
  uniforms['mieCoefficient'].value  = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;

  const phiRad   = THREE.MathUtils.degToRad(90 - 80);
  const thetaRad = THREE.MathUtils.degToRad(220);
  sunPosition.setFromSphericalCoords(1, phiRad, thetaRad);
  uniforms['sunPosition'].value.copy(sunPosition);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky);
  const renderTarget = pmremGenerator.fromScene(skyScene);
  scene.background  = renderTarget.texture;
  scene.environment = renderTarget.texture;
  skyScene.clear();
  pmremGenerator.dispose();

  return { sunPosition };
}

export function getSunPosition() {
  return sunPosition;
}
