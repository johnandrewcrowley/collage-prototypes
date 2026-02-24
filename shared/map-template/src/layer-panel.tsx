import type { LayerConfig } from '@collage/proto-types';
import React from 'react';

/**
 * LayerPanel — floating panel for controlling layer visibility and metric coloring.
 *
 * Stub implementation. Task #90 will implement the full version.
 */
export interface LayerPanelProps {
  /** Custom layers added by the prototype */
  customLayers?: LayerConfig[];
  /** Callback when a layer's visibility changes */
  onLayerToggle?: (layerId: string, visible: boolean) => void;
  /** Callback when a metric is selected for coloring */
  onMetricSelect?: (metricKey: string) => void;
}

export function LayerPanel({
  customLayers = [],
  onLayerToggle,
  onMetricSelect,
}: LayerPanelProps) {
  const defaultLayers: LayerConfig[] = [
    { id: 'buildings-3d', label: 'Buildings 3D', type: 'toggle', defaultVisible: true },
    { id: 'buildings-2d', label: 'Building Footprints', type: 'toggle', defaultVisible: false },
    { id: 'streets', label: 'Street Network', type: 'toggle', defaultVisible: true },
    { id: 'ground-heatmap', label: 'Ground Heatmap', type: 'toggle', defaultVisible: false },
  ];

  const allLayers = [...defaultLayers, ...customLayers];

  return (
    <div className="layer-panel">
      <h3>Layers</h3>
      {allLayers.map((layer) => (
        <div key={layer.id} className="layer-item">
          <label>
            <input
              type="checkbox"
              defaultChecked={layer.defaultVisible}
              onChange={(e) => onLayerToggle?.(layer.id, e.target.checked)}
            />
            {layer.label}
          </label>
        </div>
      ))}
    </div>
  );
}
