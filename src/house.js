import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let doorMesh = null;
let lampGroup = null;
let lampPointLight = null;
let houseGroupRef = null;
const clonedMaterials = [];

export async function initHouse(scene) {
  const loader = new GLTFLoader();

  try {
    const gltf = await loader.loadAsync('/models/house.glb');
    const houseGroup = gltf.scene;
    houseGroupRef = houseGroup;

    // Rotate 180° so front door faces +Z (toward camera)
    houseGroup.rotation.y = Math.PI;
    // Lift slightly above terrain to prevent z-fighting on the floor
    houseGroup.position.y = 0.02;

    // Materials that sit flush on another surface and need depth bias to avoid z-fighting.
    // NOTE: the renderer uses `logarithmicDepthBuffer: true`, which writes gl_FragDepth
    // in the fragment shader and silently bypasses gl.polygonOffset — so the bias below
    // is effectively a no-op for these materials. It's kept because it's harmless and
    // documents intent, but the real separation for these items comes from the modeller
    // baking a small offset into the mesh itself. Where that isn't true (see `Coffee`
    // below), we physically nudge the mesh in local space instead.
    const flushMaterials = new Set([
      // Inset surfaces (art, glass, screens)
      'PosterArt1', 'PosterArt2', 'Glass', 'MonitorScreen',
      // Objects resting on bookshelf / desk surfaces
      'BookRed', 'BookBlue', 'BookGreen', 'BookYellow', 'BookPurple',
      'Trophy', 'Ceramic', 'PlantGreen',
      // Desk items that sit flush
      'Keyboard', 'MousePad', 'Headphones',
    ]);

    houseGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Bias surfaces that sit flush on shelves/desks/frames (see note above).
        const matName = child.material?.name || '';
        if (flushMaterials.has(matName)) {
          child.material = child.material.clone();
          clonedMaterials.push(child.material);
          child.material.polygonOffset = true;
          child.material.polygonOffsetFactor = -1;
          child.material.polygonOffsetUnits = -1;
        }

        // The Coffee liquid disk shares its top Y (0.86) with the Ceramic cup rim —
        // they are literally coplanar. polygonOffset can't save this case under log
        // depth, so nudge the disk up by half a millimetre in local space. Invisible
        // to the eye, enough for the depth test to stop flickering.
        if (matName === 'Coffee') {
          child.position.y += 0.0005;
          child.updateMatrix();
        }

        // The PosterArt1 "mirror" on the bookshelf is a solid box nested inside the
        // MonitorFrame box, and both share their viewer-facing face at local z=2.07.
        // (The house is rotated 180° around Y, so local +Z points away from the
        // viewer — making local z=2.07 the front of both boxes.) Nudge the art
        // toward the viewer in local −Z so it wins the depth test against the frame.
        if (matName === 'PosterArt1') {
          child.position.z -= 0.0005;
          child.updateMatrix();
        }
      }
      if (child.name === 'Door') {
        doorMesh = child;
      }
      // Hide original basketball — replaced by improved model in roomObjects
      if (child.name === 'Basketball') {
        child.visible = false;
      }
      if (child.name === 'FloorLamp') {
        lampGroup = child;
      }
      // The bookshelf's inner lower shelf (where books sit) is at world Y ≈ 0.05,
      // exactly coplanar with the floor's top face (also Y 0.05, since the floor
      // mesh has local y min −0.01, max 0.03 + houseGroup y 0.02). Lift the whole
      // shelf assembly by half a millimetre so the floor stops poking through the
      // bottom compartment.
      if (child.name === 'Bookshelf') {
        child.position.y += 0.0005;
        child.updateMatrix();
      }
    });

    // Add a point light at the lamp shade position for toggleable room lighting
    if (lampGroup) {
      const worldPos = new THREE.Vector3();
      lampGroup.getWorldPosition(worldPos);
      lampPointLight = new THREE.PointLight(0xFFE0AA, 1.0, 5, 2);
      lampPointLight.position.set(worldPos.x, worldPos.y + 1.0, worldPos.z);
      scene.add(lampPointLight);
    }

    scene.add(houseGroup);
  } catch (err) {
    console.error('Failed to load house model:', err);
  }

  return { update };
}

export function getLampRefs() {
  return { lampPointLight, lampGroup };
}

// World-space bounding box of the loaded house (includes roof overhang).
// Used by grass scatter so blades never poke through the floor.
export function getHouseBounds() {
  if (!houseGroupRef) return null;
  return new THREE.Box3().setFromObject(houseGroupRef);
}

export function update(progress) {
  // Door opens between progress 0.72 and 0.80 (right at the doorstep)
  if (doorMesh) {
    if (progress >= 0.72) {
      const doorProgress = Math.min((progress - 0.72) / 0.08, 1.0);
      doorMesh.rotation.y = (-Math.PI / 2) * doorProgress;
    } else {
      doorMesh.rotation.y = 0;
    }
  }
}
