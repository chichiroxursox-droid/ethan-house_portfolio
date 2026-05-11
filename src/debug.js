import { Pane } from 'tweakpane';
import { cameraState } from './scroll.js';

let pane = null;

export function initDebug(params) {
  pane = new Pane({ title: 'Debug', expanded: false });
  pane.hidden = true;

  // Fog
  const fog = pane.addFolder({ title: 'Fog' });
  fog.addBinding(params.fog, 'near', { min: 1, max: 50, step: 1 });
  fog.addBinding(params.fog, 'far', { min: 10, max: 100, step: 1 });

  // Lighting
  const light = pane.addFolder({ title: 'Lighting' });
  light.addBinding(params.light, 'sunIntensity', { min: 0, max: 5, step: 0.1 });
  light.addBinding(params.light, 'hemiIntensity', { min: 0, max: 2, step: 0.05 });

  // Camera (read-only monitoring)
  const cam = pane.addFolder({ title: 'Camera', expanded: false });
  cam.addBinding(cameraState, 'progress', { readonly: true, format: (v) => v.toFixed(3) });
  cam.addBinding(cameraState, 'x', { readonly: true, format: (v) => v.toFixed(1) });
  cam.addBinding(cameraState, 'y', { readonly: true, format: (v) => v.toFixed(1) });
  cam.addBinding(cameraState, 'z', { readonly: true, format: (v) => v.toFixed(1) });

  // D key toggle
  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      pane.hidden = !pane.hidden;
    }
  });
}

export function disposeDebug() {
  if (pane) { pane.dispose(); pane = null; }
}
