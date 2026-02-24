import type { BBox, FragmentPackage } from '@collage/proto-types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { MapScene, Creator } from '@dvt3d/maplibre-three-plugin';
import { useMapStore } from './use-map-store';
import { BuildingMeshManager } from './building-mesh';
import { AreaSelector } from './area-selector';
import { LayerPanel } from './layer-panel';
import { colorize, COLOR_RAMPS } from './metric-colorizer';
import './styles.css';

export interface MapShellProps {
  /** Initial map center [lng, lat] */
  center?: [number, number];
  /** Initial zoom level (default: 15) */
  zoom?: number;
  /** Initial pitch in degrees (default: 45) */
  pitch?: number;
  /** Maximum selectable area in m² (prototype-specific constraint) */
  maxAreaM2?: number;
  /** Whether to show the area selector tool (default: true) */
  showAreaSelector?: boolean;
  /** Whether to show the layer panel (default: true) */
  showLayerPanel?: boolean;
  /** Callback when area is selected and extraction completes */
  onExtracted?: (data: FragmentPackage) => void;
  /** Callback when a building is clicked */
  onBuildingClick?: (buildingId: string) => void;
  /** Callback when a building is hovered */
  onBuildingHover?: (buildingId: string | null) => void;
  /** Backend URL (default: http://localhost:8000) */
  backendUrl?: string;
  /** React children rendered as map overlays */
  children?: React.ReactNode;
}

export function MapShell({
  center = [2.1686, 41.3874],
  zoom = 15,
  pitch = 45,
  maxAreaM2 = 1_000_000,
  showAreaSelector = true,
  showLayerPanel = true,
  onExtracted,
  onBuildingClick,
  onBuildingHover,
  backendUrl = 'http://localhost:8000',
  children,
}: MapShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const mapSceneRef = useRef<InstanceType<typeof MapScene> | null>(null);
  const rtcGroupRef = useRef<THREE.Group | null>(null);
  const buildingMgrRef = useRef<BuildingMeshManager | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const { isLoading, error, buildings, hoveredBuildingId, metrics, activeMetricKey, activeColorRamp } = useMapStore();
  const storeActions = useMapStore();

  // Initialize MapLibre + Three.js
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center,
      zoom,
      pitch,
      bearing: 0,
      canvasContextAttributes: { antialias: true },
    });

    mapRef.current = map;
    storeActions.setMap(map);

    map.on('load', () => {
      // Create MapScene — the plugin wraps Three.js scene + camera sync
      const mapScene = new MapScene(map as never);
      mapSceneRef.current = mapScene;

      // Lighting: ambient + directional for Phong shading
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      mapScene.addLight(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, 0.8);
      directional.position.set(100, 200, 100);
      mapScene.addLight(directional);

      // Create RTC (Relative-To-Center) group at map center
      // Defaults handle rotation (PI/2, PI, 0) and mercator scale
      const createGroup = Creator.createRTCGroup as (center: [number, number]) => THREE.Group;
      const group = createGroup(center);
      rtcGroupRef.current = group;
      mapScene.addObject(group);

      // Create building mesh manager
      const mgr = new BuildingMeshManager(center[0], center[1]);
      buildingMgrRef.current = mgr;
      group.add(mgr.getObject3D());

      map.triggerRepaint();
    });

    // Click handler — raycast Three.js first, fall back to MapLibre
    map.on('click', (e) => {
      const mapScene = mapSceneRef.current;
      const mgr = buildingMgrRef.current;
      if (!mapScene || !mgr) return;

      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.point.x / rect.width) * 2 - 1;
      mouseRef.current.y = -(e.point.y / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, mapScene.camera);
      const intersects = raycasterRef.current.intersectObject(mgr.getObject3D(), true);

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const buildingId = mgr.getBuildingIdAt(intersects[0].instanceId);
        if (buildingId) {
          useMapStore.getState().selectBuilding(buildingId);
          onBuildingClick?.(buildingId);
        }
      }
    });

    // Hover handler
    map.on('mousemove', (e) => {
      const mapScene = mapSceneRef.current;
      const mgr = buildingMgrRef.current;
      if (!mapScene || !mgr) return;

      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.point.x / rect.width) * 2 - 1;
      mouseRef.current.y = -(e.point.y / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, mapScene.camera);
      const intersects = raycasterRef.current.intersectObject(mgr.getObject3D(), true);

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const buildingId = mgr.getBuildingIdAt(intersects[0].instanceId);
        useMapStore.getState().hoverBuilding(buildingId);
        onBuildingHover?.(buildingId);
        map.getCanvas().style.cursor = 'pointer';
      } else {
        const state = useMapStore.getState();
        if (state.hoveredBuildingId) {
          state.hoverBuilding(null);
          onBuildingHover?.(null);
          map.getCanvas().style.cursor = '';
        }
      }
    });

    return () => {
      buildingMgrRef.current?.dispose();
      buildingMgrRef.current = null;
      mapSceneRef.current = null;
      rtcGroupRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update buildings when store data changes
  useEffect(() => {
    const mgr = buildingMgrRef.current;
    const map = mapRef.current;
    if (!mgr || !map || buildings.length === 0) return;

    mgr.setBuildings(buildings, 'context');
    map.triggerRepaint();
  }, [buildings]);

  // Update metric coloring
  useEffect(() => {
    const mgr = buildingMgrRef.current;
    const map = mapRef.current;
    if (!mgr || !map || !activeMetricKey || !metrics) return;

    const allMetrics = [...(metrics.tier1 ?? []), ...(metrics.tier2 ?? []), ...(metrics.tier3 ?? [])];
    const ramp = COLOR_RAMPS[activeColorRamp] ?? COLOR_RAMPS.viridis;

    // Build per-building values from metrics (per-building values come from backend)
    const values = new Map<string, number>();
    for (const b of buildings) {
      const val = (b.properties as unknown as Record<string, unknown>)[activeMetricKey];
      if (typeof val === 'number') {
        values.set(b.properties.id, val);
      }
    }

    const colors = colorize(values, ramp);
    mgr.colorByMetric(activeMetricKey, values, (v) => {
      const normalized = ramp.domain[1] - ramp.domain[0] === 0
        ? 0.5
        : (v - ramp.domain[0]) / (ramp.domain[1] - ramp.domain[0]);
      return colors.get(String(v)) ?? new THREE.Color(ramp.nullColor);
    });

    map.triggerRepaint();
  }, [activeMetricKey, activeColorRamp, metrics, buildings]);

  // Handle area selection
  const handleAreaSelect = useCallback(
    (bbox: BBox) => {
      storeActions.extract(bbox, backendUrl).then(() => {
        const state = useMapStore.getState();
        if (state.buildings.length > 0 && onExtracted && state.fragmentMetadata) {
          onExtracted({
            metadata: state.fragmentMetadata,
            buildings: { type: 'FeatureCollection', features: state.buildings },
            streets: { type: 'FeatureCollection', features: state.streets },
            tessellation: { type: 'FeatureCollection', features: state.tessellation },
            blocks: { type: 'FeatureCollection', features: [] },
            metrics: state.metrics!,
          });
        }
      });
    },
    [backendUrl, onExtracted, storeActions],
  );

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-container" />
      {showAreaSelector && (
        <AreaSelector
          maxAreaM2={maxAreaM2}
          onSelect={handleAreaSelect}
          onClear={() => storeActions.reset()}
          map={mapRef.current}
        />
      )}
      {showLayerPanel && (
        <LayerPanel onMetricSelect={(key) => storeActions.setActiveMetric(key)} />
      )}
      {isLoading && (
        <div className="map-overlay map-loading">Extracting OSM data...</div>
      )}
      {error && (
        <div className="map-overlay map-error">Error: {error}</div>
      )}
      {children}
    </div>
  );
}
