/** Bounding box in [west, south, east, north] order (WGS84). */
export type BBox = [number, number, number, number];

/** Projected coordinates in metres. */
export interface ProjectedCoordinate {
  x: number;
  y: number;
  crs: string;
}

/** Timer result for benchmarking. */
export interface BenchmarkResult {
  name: string;
  iterations: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
  p95_ms: number;
}

/** Fragment size category for benchmark comparisons. */
export type FragmentSize = 'small' | 'medium' | 'large' | 'stress';
export const FRAGMENT_SIZE_BUILDINGS: Record<FragmentSize, number> = {
  small: 100,
  medium: 500,
  large: 2000,
  stress: 5000,
} as const;
