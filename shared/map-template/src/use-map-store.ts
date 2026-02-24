import type {
  BBox,
  BuildingFeature,
  FragmentMetadata,
  FragmentPackage,
  StandardFragmentProfile,
  StreetFeature,
  TessellationCellFeature,
} from '@collage/proto-types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { create } from 'zustand';
import { extractArea } from './osm-loader';

export interface MapStore {
  // Map state
  map: MaplibreMap | null;
  isLoading: boolean;
  error: string | null;

  // Data
  buildings: BuildingFeature[];
  streets: StreetFeature[];
  tessellation: TessellationCellFeature[];
  fragmentMetadata: FragmentMetadata | null;
  metrics: StandardFragmentProfile | null;

  // Selection
  selectedBbox: BBox | null;
  selectedBuildingId: string | null;
  hoveredBuildingId: string | null;

  // Visualization
  activeMetricKey: string | null;
  activeColorRamp: string;
  buildingOpacity: number;
  groundHeatmapVisible: boolean;

  // Actions
  setMap(map: MaplibreMap): void;
  extract(bbox: BBox, backendUrl: string): Promise<void>;
  setExtractedData(data: FragmentPackage): void;
  setActiveMetric(key: string, ramp?: string): void;
  selectBuilding(id: string | null): void;
  hoverBuilding(id: string | null): void;
  reset(): void;
}

export const useMapStore = create<MapStore>((set) => ({
  // Initial state
  map: null,
  isLoading: false,
  error: null,
  buildings: [],
  streets: [],
  tessellation: [],
  fragmentMetadata: null,
  metrics: null,
  selectedBbox: null,
  selectedBuildingId: null,
  hoveredBuildingId: null,
  activeMetricKey: null,
  activeColorRamp: 'viridis',
  buildingOpacity: 0.85,
  groundHeatmapVisible: false,

  setMap(map) {
    set({ map });
  },

  async extract(bbox, backendUrl) {
    set({ isLoading: true, error: null, selectedBbox: bbox });
    try {
      const data = await extractArea(bbox, backendUrl);
      set({
        buildings: data.buildings.features as BuildingFeature[],
        streets: data.streets.features as StreetFeature[],
        tessellation: data.tessellation.features as TessellationCellFeature[],
        fragmentMetadata: data.metadata,
        metrics: data.metrics,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Extraction failed',
        isLoading: false,
      });
    }
  },

  setExtractedData(data) {
    set({
      buildings: data.buildings.features as BuildingFeature[],
      streets: data.streets.features as StreetFeature[],
      tessellation: data.tessellation.features as TessellationCellFeature[],
      fragmentMetadata: data.metadata,
      metrics: data.metrics,
      isLoading: false,
      error: null,
    });
  },

  setActiveMetric(key, ramp) {
    set({ activeMetricKey: key, ...(ramp ? { activeColorRamp: ramp } : {}) });
  },

  selectBuilding(id) {
    set({ selectedBuildingId: id });
  },

  hoverBuilding(id) {
    set({ hoveredBuildingId: id });
  },

  reset() {
    set({
      buildings: [],
      streets: [],
      tessellation: [],
      fragmentMetadata: null,
      metrics: null,
      selectedBbox: null,
      selectedBuildingId: null,
      hoveredBuildingId: null,
      activeMetricKey: null,
      isLoading: false,
      error: null,
    });
  },
}));
