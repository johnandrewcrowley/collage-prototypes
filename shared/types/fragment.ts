import type {
  BlockCollection,
  BuildingCollection,
  StreetCollection,
  TessellationCellCollection,
} from './geo-features';
import type { StandardFragmentProfile } from './metrics';

/** Metadata describing a fragment's provenance and quality. */
export interface FragmentMetadata {
  id: string;
  name: string;
  city: string;
  country: string;
  extracted_at: string;
  crs: string;
  bbox: [number, number, number, number];
  data_sources: string[];
  building_count: number;
  street_segment_count: number;
  tessellation_cell_count: number;
  quality: FragmentQuality;
}

export interface FragmentQuality {
  building_completeness: number;
  height_coverage: number;
  street_network_connected: boolean;
  tessellation_success: boolean;
}

/** The complete fragment package — all layers + metadata + pre-computed metrics. */
export interface FragmentPackage {
  metadata: FragmentMetadata;
  buildings: BuildingCollection;
  streets: StreetCollection;
  tessellation: TessellationCellCollection;
  blocks: BlockCollection;
  metrics: StandardFragmentProfile;
}
