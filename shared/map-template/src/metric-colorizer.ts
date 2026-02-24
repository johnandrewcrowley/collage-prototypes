import type { ColorRamp } from '@collage/proto-types';
import * as THREE from 'three';

/** Built-in color ramp definitions. */
export const COLOR_RAMPS: Record<string, ColorRamp> = {
  viridis: {
    name: 'viridis',
    stops: [
      { value: 0, color: '#440154' },
      { value: 0.25, color: '#3b528b' },
      { value: 0.5, color: '#21918c' },
      { value: 0.75, color: '#5ec962' },
      { value: 1, color: '#fde725' },
    ],
    domain: [0, 1],
    nullColor: '#808080',
  },
  magma: {
    name: 'magma',
    stops: [
      { value: 0, color: '#000004' },
      { value: 0.25, color: '#51127c' },
      { value: 0.5, color: '#b73779' },
      { value: 0.75, color: '#fb8861' },
      { value: 1, color: '#fcfdbf' },
    ],
    domain: [0, 1],
    nullColor: '#808080',
  },
  rdylgn: {
    name: 'rdylgn',
    stops: [
      { value: 0, color: '#d73027' },
      { value: 0.25, color: '#fc8d59' },
      { value: 0.5, color: '#ffffbf' },
      { value: 0.75, color: '#91cf60' },
      { value: 1, color: '#1a9850' },
    ],
    domain: [0, 1],
    nullColor: '#808080',
  },
  blues: {
    name: 'blues',
    stops: [
      { value: 0, color: '#f7fbff' },
      { value: 0.25, color: '#c6dbef' },
      { value: 0.5, color: '#6baed6' },
      { value: 0.75, color: '#2171b5' },
      { value: 1, color: '#08306b' },
    ],
    domain: [0, 1],
    nullColor: '#808080',
  },
  spectral: {
    name: 'spectral',
    stops: [
      { value: 0, color: '#9e0142' },
      { value: 0.25, color: '#f46d43' },
      { value: 0.5, color: '#ffffbf' },
      { value: 0.75, color: '#66c2a5' },
      { value: 1, color: '#5e4fa2' },
    ],
    domain: [0, 1],
    nullColor: '#808080',
  },
};

/** Interpolate a color from a ramp at a given normalized value (0-1). */
export function interpolateRamp(ramp: ColorRamp, t: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t));
  const { stops } = ramp;

  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].value && clamped <= stops[i + 1].value) {
      const range = stops[i + 1].value - stops[i].value;
      const localT = range === 0 ? 0 : (clamped - stops[i].value) / range;
      const c1 = new THREE.Color(stops[i].color);
      const c2 = new THREE.Color(stops[i + 1].color);
      return c1.lerp(c2, localT);
    }
  }

  return new THREE.Color(stops[stops.length - 1].color);
}

/** Map metric values to Three.js colors using a ramp. */
export function colorize(
  values: Map<string, number>,
  ramp: ColorRamp,
): Map<string, THREE.Color> {
  const result = new Map<string, THREE.Color>();
  const [min, max] = ramp.domain;
  const range = max - min;
  const nullColor = new THREE.Color(ramp.nullColor);

  for (const [id, value] of values) {
    if (value == null || Number.isNaN(value)) {
      result.set(id, nullColor.clone());
    } else {
      const t = range === 0 ? 0.5 : (value - min) / range;
      result.set(id, interpolateRamp(ramp, t));
    }
  }

  return result;
}
