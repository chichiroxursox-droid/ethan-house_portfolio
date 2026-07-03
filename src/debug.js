import { Pane } from 'tweakpane';
import { cameraState } from './scroll.js';
import { windParams } from './wind.js';
import { postState } from './postfx.js';

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

  // Render (outdoor values; interior is fixed on state transition)
  const render = pane.addFolder({ title: 'Render' });
  render.addBinding(params.render, 'exposure', { min: 0.2, max: 1.5, step: 0.01 });
  render.addBinding(params.render, 'envIntensity', { min: 0, max: 2, step: 0.05 });

  // Wind
  const wind = pane.addFolder({ title: 'Wind' });
  wind.addBinding(windParams, 'strength', { min: 0, max: 2, step: 0.05 });
  wind.addBinding(windParams, 'speed', { min: 0, max: 3, step: 0.05 });

  // PostFX (bloom + golden-hour grade)
  const post = pane.addFolder({ title: 'PostFX' });
  post.addBinding(postState, 'enabled');
  post.addBinding(postState, 'bloomStrength', { min: 0, max: 1.5, step: 0.01 });
  post.addBinding(postState, 'bloomThreshold', { min: 0, max: 1.5, step: 0.01 });
  post.addBinding(postState, 'bloomRadius', { min: 0, max: 1, step: 0.01 });
  post.addBinding(postState, 'tintStrength', { min: 0, max: 0.5, step: 0.01 });
  post.addBinding(postState, 'saturation', { min: 0.5, max: 1.5, step: 0.01 });
  post.addBinding(postState, 'contrast', { min: 0.8, max: 1.3, step: 0.01 });

  // Perf (read-only — user has no DevTools access)
  const perf = pane.addFolder({ title: 'Perf', expanded: false });
  perf.addBinding(params.perf, 'fps', { readonly: true, format: (v) => v.toFixed(0) });
  perf.addBinding(params.perf, 'calls', { readonly: true, format: (v) => v.toFixed(0) });

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
