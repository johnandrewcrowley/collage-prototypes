import type { BBox } from '@collage/proto-types';

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS = 6371008.8;

/** Convert degrees to meters at a given latitude. */
export function degreesToMeters(
  dlng: number,
  dlat: number,
  refLat: number,
): { dx: number; dy: number } {
  const latRad = refLat * DEG_TO_RAD;
  const dx = dlng * DEG_TO_RAD * EARTH_RADIUS * Math.cos(latRad);
  const dy = dlat * DEG_TO_RAD * EARTH_RADIUS;
  return { dx, dy };
}

/** Convert a WGS84 [lng, lat] to local meters relative to a center point. */
export function wgs84ToLocal(
  lng: number,
  lat: number,
  centerLng: number,
  centerLat: number,
): { x: number; y: number } {
  const { dx, dy } = degreesToMeters(lng - centerLng, lat - centerLat, centerLat);
  return { x: dx, y: dy };
}

/** Compute area of a bbox in square meters (approximate). */
export function bboxAreaM2(bbox: BBox): number {
  const [west, south, east, north] = bbox;
  const { dx } = degreesToMeters(east - west, 0, (south + north) / 2);
  const { dy } = degreesToMeters(0, north - south, (south + north) / 2);
  return Math.abs(dx * dy);
}

/** Get center of a bbox. */
export function bboxCenter(bbox: BBox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}
