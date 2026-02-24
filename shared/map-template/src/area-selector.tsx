import type { BBox } from '@collage/proto-types';
import React, { useState } from 'react';
import { bboxAreaM2 } from './coordinate-utils';

/**
 * AreaSelector — interactive rectangle drawing tool with area constraint.
 *
 * Stub implementation. Task #90 will implement the full version with
 * MapLibre draw interaction.
 */
export interface AreaSelectorProps {
  /** Maximum selectable area in m² */
  maxAreaM2: number;
  /** Callback when a valid area is selected */
  onSelect?: (bbox: BBox) => void;
  /** Callback when selection is cleared */
  onClear?: () => void;
}

export function AreaSelector({ maxAreaM2, onSelect, onClear }: AreaSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);

  return (
    <div className="area-selector">
      <button
        type="button"
        className={`area-selector-btn ${isSelecting ? 'active' : ''}`}
        onClick={() => setIsSelecting(!isSelecting)}
      >
        {isSelecting ? 'Cancel Selection' : 'Select Area'}
      </button>
      <span className="area-constraint">
        Max: {(maxAreaM2 / 1_000_000).toFixed(1)} km²
      </span>
    </div>
  );
}
