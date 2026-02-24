import type { LayerConfig } from '@collage/proto-types';
import React, { useState } from 'react';

/**
 * LayerPanel — floating panel for controlling layer visibility and metric coloring.
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
  const [collapsed, setCollapsed] = useState(false);

  const defaultLayers: LayerConfig[] = [
    { id: 'buildings-3d', label: 'Buildings 3D', type: 'toggle', defaultVisible: true },
    { id: 'buildings-2d', label: 'Building Footprints', type: 'toggle', defaultVisible: false },
    { id: 'streets', label: 'Street Network', type: 'toggle', defaultVisible: true },
    { id: 'ground-heatmap', label: 'Ground Heatmap', type: 'toggle', defaultVisible: false },
  ];

  const allLayers = [...defaultLayers, ...customLayers];

  if (collapsed) {
    return (
      <div className="layer-panel collapsed">
        <button type="button" className="layer-toggle-btn" onClick={() => setCollapsed(false)}>
          Layers
        </button>
      </div>
    );
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>Layers</h3>
        <button type="button" className="layer-toggle-btn" onClick={() => setCollapsed(true)}>
          &times;
        </button>
      </div>
      {allLayers.map((layer) => (
        <div key={layer.id} className="layer-item">
          {layer.type === 'toggle' && (
            <label>
              <input
                type="checkbox"
                defaultChecked={layer.defaultVisible}
                onChange={(e) => onLayerToggle?.(layer.id, e.target.checked)}
              />
              {layer.label}
            </label>
          )}
          {layer.type === 'metric-select' && layer.metrics && (
            <div className="metric-select">
              <span className="metric-label">{layer.label}</span>
              <select
                onChange={(e) => onMetricSelect?.(e.target.value)}
                defaultValue=""
              >
                <option value="">None</option>
                {layer.metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
