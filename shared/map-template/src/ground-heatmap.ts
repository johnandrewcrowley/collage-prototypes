import type { BBox, ColorRamp } from '@collage/proto-types';
import * as THREE from 'three';
import { bboxCenter, degreesToMeters } from './coordinate-utils';
import { interpolateRamp } from './metric-colorizer';

/**
 * GroundHeatmap — renders a ground-level scalar field as a textured plane.
 *
 * Stub implementation. Task #90 will implement the full version based on
 * C5 spike findings.
 */
export class GroundHeatmap {
  private plane: THREE.Mesh;
  private canvas: OffscreenCanvas;
  private texture: THREE.CanvasTexture;
  private resolution: number;

  /**
   * @param bbox - Geographic extent of the heatmap
   * @param resolution - Pixels per meter (default: 0.5 = 1px per 2m)
   */
  constructor(bbox: BBox, resolution = 0.5) {
    const [west, south, east, north] = bbox;
    const center = bboxCenter(bbox);
    const { dx: width } = degreesToMeters(east - west, 0, center[1]);
    const { dy: height } = degreesToMeters(0, north - south, center[1]);

    this.resolution = resolution;
    const canvasW = Math.ceil(Math.abs(width) * resolution);
    const canvasH = Math.ceil(Math.abs(height) * resolution);

    this.canvas = new OffscreenCanvas(Math.max(canvasW, 1), Math.max(canvasH, 1));
    this.texture = new THREE.CanvasTexture(this.canvas as unknown as HTMLCanvasElement);

    const geometry = new THREE.PlaneGeometry(Math.abs(width), Math.abs(height));
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.plane = new THREE.Mesh(geometry, material);
    this.plane.position.y = 0.1; // Slightly above ground to avoid z-fighting
    this.plane.visible = false;
  }

  /** Update heatmap data from a grid of values. */
  updateData(
    grid: Float32Array,
    gridWidth: number,
    gridHeight: number,
    ramp: ColorRamp,
  ): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(this.canvas.width, this.canvas.height);
    const [min, max] = ramp.domain;
    const range = max - min;

    for (let y = 0; y < gridHeight && y < this.canvas.height; y++) {
      for (let x = 0; x < gridWidth && x < this.canvas.width; x++) {
        const value = grid[y * gridWidth + x];
        const t = range === 0 ? 0.5 : (value - min) / range;
        const color = interpolateRamp(ramp, t);
        const idx = (y * this.canvas.width + x) * 4;
        imageData.data[idx] = Math.round(color.r * 255);
        imageData.data[idx + 1] = Math.round(color.g * 255);
        imageData.data[idx + 2] = Math.round(color.b * 255);
        imageData.data[idx + 3] = Number.isNaN(value) ? 0 : 180;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.texture.needsUpdate = true;
  }

  /** Toggle visibility. */
  setVisible(visible: boolean): void {
    this.plane.visible = visible;
  }

  /** Set opacity. */
  setOpacity(opacity: number): void {
    (this.plane.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  /** Get the Three.js mesh. */
  getObject3D(): THREE.Object3D {
    return this.plane;
  }

  /** Dispose resources. */
  dispose(): void {
    this.texture.dispose();
    this.plane.geometry.dispose();
    (this.plane.material as THREE.Material).dispose();
  }
}
