import type { BuildingFeature } from '@collage/proto-types';
import * as THREE from 'three';
import { wgs84ToLocal } from './coordinate-utils';

/**
 * BuildingMesh manager — renders 3D buildings using InstancedMesh (context mode)
 * or merged BufferGeometry (focal mode).
 *
 * Stub implementation. Task #90 will implement the full version based on
 * A1/A6 spike code.
 */
export class BuildingMeshManager {
  private group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private mergedMesh: THREE.Mesh | null = null;
  private buildingIds: string[] = [];
  private centerLng = 0;
  private centerLat = 0;

  constructor(centerLng: number, centerLat: number) {
    this.group = new THREE.Group();
    this.centerLng = centerLng;
    this.centerLat = centerLat;
  }

  /** Set buildings from extraction result. */
  setBuildings(buildings: BuildingFeature[], mode: 'context' | 'focal'): void {
    this.dispose();
    this.buildingIds = buildings.map((b) => b.properties.id);

    if (mode === 'context') {
      this.buildContextMesh(buildings);
    } else {
      this.buildFocalMesh(buildings);
    }
  }

  private buildContextMesh(buildings: BuildingFeature[]): void {
    // Stub: InstancedMesh with BoxGeometry(1,1,1) scaled per building
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.85,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, buildings.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color(0xcccccc);

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const coords = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates[0][0];
      const centroid = polygonCentroid(coords);
      const { x, y } = wgs84ToLocal(centroid[0], centroid[1], this.centerLng, this.centerLat);
      const height = b.properties.height_m ?? 9;

      // RTC: X=East, Y=Up, Z=South (negated)
      matrix.makeScale(10, height, 10);
      matrix.setPosition(x, height / 2, -y);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.instancedMesh = mesh;
    this.group.add(mesh);
  }

  private buildFocalMesh(_buildings: BuildingFeature[]): void {
    // Stub: merged BufferGeometry from ExtrudeGeometry per building
    // Full implementation in task #90
  }

  /** Color buildings by a metric value map. */
  colorByMetric(
    _metricKey: string,
    _values: Map<string, number>,
    _colorFn: (value: number) => THREE.Color,
  ): void {
    // Stub: iterate instancedMesh/mergedMesh and apply colors
    // Full implementation in task #90
  }

  /** Highlight a single building. */
  highlightBuilding(_buildingId: string | null): void {
    // Stub: set highlight color on target building
  }

  /** Set building opacity. */
  setOpacity(opacity: number): void {
    if (this.instancedMesh) {
      (this.instancedMesh.material as THREE.MeshPhongMaterial).opacity = opacity;
    }
  }

  /** Get the Three.js group for adding to scene. */
  getObject3D(): THREE.Object3D {
    return this.group;
  }

  /** Dispose geometry and materials. */
  dispose(): void {
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
      this.group.remove(this.instancedMesh);
      this.instancedMesh = null;
    }
    if (this.mergedMesh) {
      this.mergedMesh.geometry.dispose();
      (this.mergedMesh.material as THREE.Material).dispose();
      this.group.remove(this.mergedMesh);
      this.mergedMesh = null;
    }
    this.buildingIds = [];
  }
}

/** Compute centroid of a polygon ring. */
function polygonCentroid(ring: number[][]): [number, number] {
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of ring) {
    sumX += x;
    sumY += y;
  }
  return [sumX / ring.length, sumY / ring.length];
}
