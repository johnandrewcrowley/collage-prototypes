/** Tier assignment for computation scheduling. */
export type MetricTier = 1 | 2 | 3;

/** A single metric value with its definition. */
export interface MetricValue {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  tier: MetricTier;
  category: MetricCategory;
}

export type MetricCategory =
  | 'shape'
  | 'dimension'
  | 'orientation'
  | 'area_statistics'
  | 'coverage'
  | 'spacematrix'
  | 'network_topology'
  | 'block'
  | 'distribution'
  | 'diversity'
  | 'streetscape'
  | 'network_centrality'
  | 'space_syntax'
  | 'morphological'
  | 'classification'
  | 'solar'
  | 'sustainability'
  | 'spatial_statistics';

/** The Standard Fragment Profile — all pre-computed metrics for a fragment. */
export interface StandardFragmentProfile {
  fragment_id: string;
  computed_at: string;
  tier1: MetricValue[];
  tier2: MetricValue[];
  tier3: MetricValue[];
}
