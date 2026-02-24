import type { BBox } from '@collage/proto-types';
import type { Map as MaplibreMap, MapMouseEvent, LngLat } from 'maplibre-gl';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { bboxAreaM2 } from './coordinate-utils';

/**
 * AreaSelector — interactive rectangle drawing tool with area constraint.
 *
 * Click-and-drag to draw a bounding box on the MapLibre map.
 * Area is validated against maxAreaM2 in real-time.
 */
export interface AreaSelectorProps {
  /** Maximum selectable area in m² */
  maxAreaM2: number;
  /** Callback when a valid area is selected */
  onSelect?: (bbox: BBox) => void;
  /** Callback when selection is cleared */
  onClear?: () => void;
  /** MapLibre map instance (may be null during initialization) */
  map?: MaplibreMap | null;
}

export function AreaSelector({ maxAreaM2, onSelect, onClear, map }: AreaSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentBbox, setCurrentBbox] = useState<BBox | null>(null);
  const [areaExceeded, setAreaExceeded] = useState(false);
  const startRef = useRef<LngLat | null>(null);

  // Manage MapLibre draw interaction
  useEffect(() => {
    if (!map || !isSelecting) return;

    const SOURCE_ID = 'area-selector-source';
    const LAYER_ID = 'area-selector-layer';
    const LAYER_OUTLINE_ID = 'area-selector-outline';

    // Add GeoJSON source for selection rectangle
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#0066cc',
          'fill-opacity': 0.15,
        },
      });
      map.addLayer({
        id: LAYER_OUTLINE_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#0066cc',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    }

    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';

    const onMouseDown = (e: MapMouseEvent) => {
      e.preventDefault();
      startRef.current = e.lngLat;
      setIsDragging(true);
      // Disable map drag while selecting
      map.dragPan.disable();
    };

    const onMouseMove = (e: MapMouseEvent) => {
      if (!startRef.current) return;
      const start = startRef.current;
      const end = e.lngLat;

      const bbox: BBox = [
        Math.min(start.lng, end.lng),
        Math.min(start.lat, end.lat),
        Math.max(start.lng, end.lng),
        Math.max(start.lat, end.lat),
      ];

      const area = bboxAreaM2(bbox);
      const exceeded = area > maxAreaM2;
      setAreaExceeded(exceeded);
      setCurrentBbox(bbox);

      // Update the rectangle on the map
      const source = map.getSource(SOURCE_ID);
      if (source && 'setData' in source) {
        (source as { setData: (data: GeoJSON.GeoJSON) => void }).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]],
                [bbox[0], bbox[1]],
              ],
            ],
          },
        });
      }

      // Color the rectangle red if area exceeded
      map.setPaintProperty(LAYER_ID, 'fill-color', exceeded ? '#cc0000' : '#0066cc');
      map.setPaintProperty(LAYER_OUTLINE_ID, 'line-color', exceeded ? '#cc0000' : '#0066cc');
    };

    const onMouseUp = () => {
      map.dragPan.enable();
      setIsDragging(false);

      if (startRef.current && currentBbox && !areaExceeded) {
        onSelect?.(currentBbox);
        setIsSelecting(false);
      }

      startRef.current = null;
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      canvas.style.cursor = '';
      map.dragPan.enable();

      // Clean up layers and source
      if (map.getLayer(LAYER_OUTLINE_ID)) map.removeLayer(LAYER_OUTLINE_ID);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, isSelecting, maxAreaM2, onSelect, currentBbox, areaExceeded]);

  const handleClear = useCallback(() => {
    setCurrentBbox(null);
    setAreaExceeded(false);
    onClear?.();
  }, [onClear]);

  const areaKm2 = currentBbox ? (bboxAreaM2(currentBbox) / 1_000_000).toFixed(3) : null;

  return (
    <div className="area-selector">
      <button
        type="button"
        className={`area-selector-btn ${isSelecting ? 'active' : ''}`}
        onClick={() => {
          if (isSelecting) {
            setIsSelecting(false);
            handleClear();
          } else {
            setIsSelecting(true);
          }
        }}
      >
        {isSelecting ? 'Cancel' : 'Select Area'}
      </button>
      {currentBbox && (
        <button type="button" className="area-selector-btn" onClick={handleClear}>
          Clear
        </button>
      )}
      <span className={`area-constraint ${areaExceeded ? 'exceeded' : ''}`}>
        {areaKm2 ? `${areaKm2} km²` : `Max: ${(maxAreaM2 / 1_000_000).toFixed(1)} km²`}
      </span>
    </div>
  );
}
