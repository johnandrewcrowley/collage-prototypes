import type { BBox, FragmentPackage } from '@collage/proto-types';

const DEFAULT_TIMEOUT_MS = 180_000;

/** Extract OSM data for a bounding box via the Python backend. */
export async function extractArea(
  bbox: BBox,
  backendUrl = 'http://localhost:8000',
  options: {
    buffer_m?: number;
    include_heights?: boolean;
    include_tessellation?: boolean;
    include_metrics?: boolean;
    include_space_syntax?: boolean;
    timeout_ms?: number;
  } = {},
): Promise<FragmentPackage> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout_ms ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${backendUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox,
        buffer_m: options.buffer_m ?? 200,
        include_heights: options.include_heights ?? true,
        include_tessellation: options.include_tessellation ?? true,
        include_metrics: options.include_metrics ?? true,
        include_space_syntax: options.include_space_syntax ?? true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Backend error ${response.status}: ${text}`);
    }

    return (await response.json()) as FragmentPackage;
  } finally {
    clearTimeout(timeout);
  }
}

/** Check backend health. */
export async function checkHealth(
  backendUrl = 'http://localhost:8000',
): Promise<{ status: string; version: string }> {
  const response = await fetch(`${backendUrl}/health`);
  if (!response.ok) {
    throw new Error(`Backend health check failed: ${response.status}`);
  }
  return response.json();
}
