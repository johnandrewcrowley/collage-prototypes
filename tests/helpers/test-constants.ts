/** Barcelona Eixample bounding box for extraction-based tests */
export const EIXAMPLE_BBOX = [2.155, 41.383, 2.175, 41.395] as const;

/** Benchmark values from CLAUDE.md and prototype FINDINGS */
export const BENCHMARKS = {
  gsi: { expected: 0.37, tolerance: 0.15 },
  fsi: { expected: 1.89, tolerance: 0.15 },
  meanHeight: { expected: 18, tolerance: 0.20 },
  lcz: { expected: 2 },
};

/** Dev server ports per prototype */
export const PORTS = {
  p1: 5171,
  p2: 5172,
  p3: 5173,
  p4: 5174,
  p5: 5175,
} as const;

export const BACKEND_URL = 'http://localhost:8000';

/** Screenshot output directory */
export const SCREENSHOT_DIR = 'test-results/screenshots';

/** Check if a value is within tolerance of expected */
export function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number,
): boolean {
  const lower = expected * (1 - tolerance);
  const upper = expected * (1 + tolerance);
  return actual >= lower && actual <= upper;
}
