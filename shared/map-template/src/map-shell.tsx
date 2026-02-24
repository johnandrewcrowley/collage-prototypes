import type { BBox, FragmentPackage } from '@collage/proto-types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import React, { useEffect, useRef } from 'react';
import { useMapStore } from './use-map-store';
import './styles.css';

/**
 * MapShell — the central map component that initializes MapLibre GL JS
 * with a Three.js overlay via @dvt3d/maplibre-three-plugin.
 *
 * Stub implementation. Task #90 will implement the full version based on
 * A1 spike code.
 */
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
  center = [2.1686, 41.3874], // Barcelona Eixample default
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
  const { isLoading, error, buildings } = useMapStore();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Stub: MapLibre + Three.js initialization will be implemented in task #90
    // For now, just show a placeholder
    const container = containerRef.current;
    container.style.background = '#e0e0e0';
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:monospace;color:#666;">
        <div style="text-align:center;">
          <p style="font-size:1.5em;">MapShell Stub</p>
          <p>MapLibre GL JS + Three.js</p>
          <p>Center: [${center[0].toFixed(4)}, ${center[1].toFixed(4)}]</p>
          <p>Zoom: ${zoom} | Pitch: ${pitch}°</p>
          <p>Max area: ${(maxAreaM2 / 1_000_000).toFixed(1)} km²</p>
        </div>
      </div>
    `;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, zoom, pitch, maxAreaM2]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-container" />
      {isLoading && (
        <div className="map-overlay map-loading">
          Extracting OSM data...
        </div>
      )}
      {error && (
        <div className="map-overlay map-error">
          Error: {error}
        </div>
      )}
      {children}
    </div>
  );
}
