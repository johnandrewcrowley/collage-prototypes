import type { BuildingFeature } from '@collage/proto-types';
import * as THREE from 'three';
import { wgs84ToLocal } from './coordinate-utils';

/**
 * BuildingMeshManager — renders 3D buildings using InstancedMesh (context mode)
 * or merged BufferGeometry (focal mode).
 *
 * Context mode: BoxGeometry(1,1,1) scaled per building — fast, 1 draw call.
 * Focal mode: ExtrudeGeometry per building footprint, merged — accurate shapes.
 *
 * RTC coordinate frame: X=East, Y=Up, Z=South (negated).
 */
export class BuildingMeshManager {
  private group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private mergedMesh: THREE.Mesh | null = null;
  private buildingIds: string[] = [];
  private centerLng: number;
  private centerLat: number;

  constructor(centerLng: number, centerLat: number) {
    this.group = new THREE.Group();
    this.centerLng = centerLng;
    this.centerLat = centerLat;
  }

  /** Set buildings from extraction result. */
  setBuildings(buildings: BuildingFeature[], mode: 'context' | 'focal'): void {
    this.dispose();
    if (buildings.length === 0) return;
    this.buildingIds = buildings.map((b) => b.properties.id);

    if (mode === 'context') {
      this.buildContextMesh(buildings);
    } else {
      this.buildFocalMesh(buildings);
    }
  }

  /** Context mode: InstancedMesh with BoxGeometry(1,1,1) scaled per building. */
  private buildContextMesh(buildings: BuildingFeature[]): void {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.85,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, buildings.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color(0xcccccc);

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const coords =
        b.geometry.type === 'Polygon'
          ? b.geometry.coordinates[0]
          : b.geometry.coordinates[0][0];

      const centroid = polygonCentroid(coords);
      const { x, y } = wgs84ToLocal(centroid[0], centroid[1], this.centerLng, this.centerLat);
      const height = b.properties.height_m ?? 9;

      // Approximate footprint size from bounding box of polygon
      const { width, depth } = polygonBBox(coords, this.centerLng, this.centerLat);

      // RTC frame: X=East, Y=Up, Z=South (negated)
      position.set(x, height / 2, -y);
      scale.set(Math.max(width, 2), height, Math.max(depth, 2));
      matrix.compose(position, quaternion, scale);

      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.instancedMesh = mesh;
    this.group.add(mesh);
  }

  /** Focal mode: ExtrudeGeometry per building, merged into single BufferGeometry. */
  private buildFocalMesh(buildings: BuildingFeature[]): void {
    const geometries: THREE.BufferGeometry[] = [];

    for (const b of buildings) {
      const height = b.properties.height_m ?? 9;
      const coords =
        b.geometry.type === 'Polygon'
          ? b.geometry.coordinates
          : b.geometry.coordinates[0];

      const outerRing = coords[0];
      const shape = this.ringToShape(outerRing);

      // Add holes (inner rings)
      for (let h = 1; h < coords.length; h++) {
        shape.holes.push(this.ringToPath(coords[h]));
      }

      try {
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
        });
        // ExtrudeGeometry extrudes along Z; rotate so height is along Y (up in RTC)
        geo.rotateX(-Math.PI / 2);
        geometries.push(geo);
      } catch {
        // Skip buildings with invalid geometry
      }
    }

    if (geometries.length === 0) return;

    const merged = mergeGeometries(geometries);
    if (!merged) return;

    for (const g of geometries) g.dispose();

    const material = new THREE.MeshPhongMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    this.mergedMesh = new THREE.Mesh(merged, material);
    this.group.add(this.mergedMesh);
  }

  /** Convert a GeoJSON polygon ring to a Three.js Shape (in local meters). */
  private ringToShape(ring: number[][]): THREE.Shape {
    const shape = new THREE.Shape();
    for (let i = 0; i < ring.length; i++) {
      const { x, y } = wgs84ToLocal(ring[i][0], ring[i][1], this.centerLng, this.centerLat);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  }

  /** Convert a GeoJSON ring to a Three.js Path (for holes). */
  private ringToPath(ring: number[][]): THREE.Path {
    const path = new THREE.Path();
    for (let i = 0; i < ring.length; i++) {
      const { x, y } = wgs84ToLocal(ring[i][0], ring[i][1], this.centerLng, this.centerLat);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
  }

  /** Color buildings by a metric value map. */
  colorByMetric(
    _metricKey: string,
    values: Map<string, number>,
    colorFn: (value: number) => THREE.Color,
  ): void {
    if (this.instancedMesh) {
      const nullColor = new THREE.Color(0x808080);
      for (let i = 0; i < this.buildingIds.length; i++) {
        const val = values.get(this.buildingIds[i]);
        const c = val != null ? colorFn(val) : nullColor;
        this.instancedMesh.setColorAt(i, c);
      }
      if (this.instancedMesh.instanceColor) {
        this.instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Highlight a single building (InstancedMesh only). */
  highlightBuilding(buildingId: string | null): void {
    if (!this.instancedMesh) return;
    const highlightColor = new THREE.Color(0x00aaff);
    const defaultColor = new THREE.Color(0xcccccc);
    const tempColor = new THREE.Color();

    for (let i = 0; i < this.buildingIds.length; i++) {
      if (buildingId && this.buildingIds[i] === buildingId) {
        this.instancedMesh.setColorAt(i, highlightColor);
      } else {
        this.instancedMesh.getColorAt(i, tempColor);
        if (tempColor.equals(highlightColor)) {
          this.instancedMesh.setColorAt(i, defaultColor);
        }
      }
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /** Get building ID at an InstancedMesh index. */
  getBuildingIdAt(instanceId: number): string | null {
    return this.buildingIds[instanceId] ?? null;
  }

  /** Set building opacity. */
  setOpacity(opacity: number): void {
    if (this.instancedMesh) {
      (this.instancedMesh.material as THREE.MeshPhongMaterial).opacity = opacity;
    }
    if (this.mergedMesh) {
      (this.mergedMesh.material as THREE.MeshPhongMaterial).opacity = opacity;
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

/** Compute bounding box dimensions of a polygon in meters. */
function polygonBBox(
  ring: number[][],
  centerLng: number,
  centerLat: number,
): { width: number; depth: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [lng, lat] of ring) {
    const { x, y } = wgs84ToLocal(lng, lat, centerLng, centerLat);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { width: maxX - minX, depth: maxY - minY };
}

/** Merge multiple BufferGeometries into one. */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 0) return null;

  let totalVertices = 0;
  let totalIndices = 0;
  for (const geo of geometries) {
    totalVertices += geo.attributes.position.count;
    totalIndices += geo.index ? geo.index.count : geo.attributes.position.count;
  }

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const geo of geometries) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;

    for (let i = 0; i < pos.count * 3; i++) {
      positions[vertexOffset * 3 + i] = (pos.array as Float32Array)[i];
    }
    if (norm) {
      for (let i = 0; i < norm.count * 3; i++) {
        normals[vertexOffset * 3 + i] = (norm.array as Float32Array)[i];
      }
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        indices[indexOffset + i] = geo.index.array[i] + vertexOffset;
      }
      indexOffset += geo.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[indexOffset + i] = i + vertexOffset;
      }
      indexOffset += pos.count;
    }
    vertexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}
