# §18.3 — Detailed Implementation Plan: P2 Morpho-Metrics Scanner

## Abstract

This document provides the complete implementation plan for P2, the momepy morphological metrics scanner prototype. P2 validates the workflow: select an area (max 1 km²) → extract OSM buildings and streets → compute ~51 morphometric metrics across 6 categories → visualize per-building and per-cell metric values with instant choropleth switching → display statistical distributions and Spacematrix classification. The plan specifies every metric with its computation tier, TypeScript or Python implementation, display approach, and performance budget; details the tessellation cell rendering system, building-to-tessellation toggle, metric histogram panel, and Spacematrix summary card; and defines success criteria with a manual testing plan. Every performance number and library recommendation traces to a validated spike finding (C4 for metric performance, C1 for tessellation) or research document (#04, #07).

## Introduction

P2 is the metric computation showcase of the five prototypes — it exercises the full momepy metric catalog across all six morphometric categories (Dimension, Shape, Spatial Distribution, Intensity, Diversity, Streetscape). Unlike P1 (sustainability), which requires heavy raycasting and shadow computation, P2's challenge is breadth: managing ~51 distinct metrics with instant color-switching, per-building and per-cell views, and clear statistical presentation.

The prototype serves two research questions:
1. **Can the full momepy morphometric catalog be computed and visualized from OSM data in a web app?** This validates the tiered computation architecture (Tier 1 instant TypeScript, Tier 2 Web Worker TypeScript, Tier 3 Python backend) established in finding #07 and validated by spike C4.
2. **Does the metric-to-color + histogram UX make morphometric analysis intuitive to non-specialists?** This validates whether a categorized metric browser with instant building recoloring and distribution charts enables understanding of urban form — a core value proposition of Collage Earth.

### Key References

| Reference | Content | Used For |
|-----------|---------|----------|
| Finding #04 | Momepy comprehensive metric catalog (~70 functions) | Full metric list, categories, input requirements |
| Finding #07 | Analysis input requirements mapping (42 metrics → inputs → outputs) | Tier classification, data flow, computation sequence |
| Spike C4 | Metric computation performance (38 TS metrics in 103ms) | Performance budgets, tier boundaries, code patterns |
| Spike C1 | Morphological tessellation (4.75s/500 bldgs, all morphologies) | Tessellation performance, parameter recommendations |
| Finding #83 | P2 prototype design (workflow, UI layout, success criteria) | User workflow, feature list, UI specification |
| Finding #82 | Final spike synthesis and build-readiness | Architecture validation, library versions |

---

## 1. Complete Metric List

P2 implements 51 metrics organized into 6 category groups. Each metric specifies: computation location (TypeScript client or Python backend), computation tier (1 = instant main thread <200ms, 2 = Web Worker <5s, 3 = Python backend), input requirements, display approach (building color, tessellation cell color, street color, or aggregate badge), and performance budget.

### Metric Tier Definitions

| Tier | Location | Budget | Trigger | UX |
|------|----------|--------|---------|-----|
| 1 | TS main thread | <200ms total | Instant on data load | Immediate recoloring |
| 2 | TS Web Worker | <5s total | Instant on data load, computed in background | Available within seconds |
| 3 | Python backend | <60s | Computed during extraction | Available when extraction completes |

### 1.1 Dimension Metrics (8 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| D1 | **Building area** (footprint m²) | TS client | 1 | Building polygon | Per-building color, m² scale | <1ms (turfArea) |
| D2 | **Floor area** (GFA m²) | TS client | 1 | Footprint area × floor count | Per-building color, m² scale | <1ms (arithmetic) |
| D3 | **Perimeter** (m) | TS client | 1 | Building polygon exterior ring | Per-building color, m scale | <1ms |
| D4 | **Height** (m) | TS client | 1 | Building `height_m` property | Per-building color, m scale | <1ms (direct read) |
| D5 | **Volume** (m³) | TS client | 1 | Footprint area × height | Per-building color, m³ scale | <1ms (arithmetic) |
| D6 | **Longest axis length** (m) | TS client | 1 | Minimum bounding rectangle major axis | Per-building color, m scale | <2ms (bbox computation) |
| D7 | **Courtyard area** (m²) | TS client | 1 | Sum of interior ring areas | Per-building color, m² scale | <1ms (ring iteration) |
| D8 | **Coverage ratio** | Python backend | 3 | Building footprint / tessellation cell area | Per-cell color, 0–1 scale | Included in extraction |

### 1.2 Shape Metrics (14 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| S1 | **Elongation** | TS client | 1 | min/max bounding rectangle dimension | Per-building color, 0–1 scale | <1ms [C4: 1.45ms for all shape] |
| S2 | **Circular compactness** | TS client | 1 | 4π × area / perimeter² | Per-building color, 0–1 scale | <1ms |
| S3 | **Convexity** | TS client | 1 | area / turfConvex(polygon).area | Per-building color, 0–1 scale | <2ms (convex hull) |
| S4 | **Rectangularity** | TS client | 1 | area / bbox area | Per-building color, 0–1 scale | <1ms |
| S5 | **Squareness** | TS client | 1 | Mean deviation of angles from 90° | Per-building color, degrees scale | <2ms (vertex iteration) |
| S6 | **Courtyard index** | TS client | 1 | Interior ring area / total area | Per-building color, 0–1 scale | <1ms |
| S7 | **Equivalent rectangular index** | TS client | 1 | Perimeter ratio to equal-area rectangle | Per-building color, 0–1 scale | <1ms |
| S8 | **Facade ratio** | TS client | 1 | perimeter / area | Per-building color, ratio scale | <1ms |
| S9 | **Fractal dimension** | TS client | 1 | 2 × log(perimeter/4) / log(area) | Per-building color, 1.0–2.0 scale | <1ms |
| S10 | **Shape index** | TS client | 1 | sqrt(area) / (0.25 × perimeter) | Per-building color, 0–1 scale | <1ms |
| S11 | **Square compactness** | TS client | 1 | Ratio to equal-perimeter square | Per-building color, 0–1 scale | <1ms |
| S12 | **Form factor** | TS client | 1 | Height-dependent: volume / bbox³ | Per-building color, 0–1 scale | <1ms |
| S13 | **Corners** (vertex count) | TS client | 1 | Number of exterior ring vertices | Per-building color, count scale | <1ms |
| S14 | **Centroid-corner distance** (mean) | TS client | 1 | Mean distance from centroid to vertices | Per-building color, m scale | <1ms |

### 1.3 Spatial Distribution Metrics (9 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| SD1 | **Orientation** (degrees) | TS client | 1 | Longest axis bearing | Per-building color, 0–180° scale | <1ms [C4: 0.42ms] |
| SD2 | **Orientation consistency** | TS client | 1 | Circular variance of all orientations | Aggregate badge | <1ms [C4: 0.42ms] |
| SD3 | **Street alignment** | TS Web Worker | 2 | Building bbox bearing vs nearest street bearing (Flatbush) | Per-building color, 0–90° deviation | <30ms [C4: 25.23ms] |
| SD4 | **Inter-building distance** (mean) | TS Web Worker | 2 | Nearest-neighbor centroid distance (Flatbush) | Per-building color, m scale | <15ms [C4: 13.71ms] |
| SD5 | **Inter-building distance** (min) | TS Web Worker | 2 | Min nearest-neighbor distance | Per-building color, m scale | Included with SD4 |
| SD6 | **Adjacency ratio** | TS Web Worker | 2 | Fraction of buildings within threshold of neighbor (Flatbush) | Aggregate badge, 0–1 scale | <3ms [C4: 2.79ms] |
| SD7 | **Neighbor count** | TS Web Worker | 2 | Buildings within 100m radius (Flatbush) | Per-building color, count scale | <5ms (Flatbush radius query) |
| SD8 | **Shared walls** (length) | Python backend | 3 | Vertex-to-vertex proximity (requires geometry precision) | Per-building color, m scale | ~5s for 500 buildings |
| SD9 | **Cell alignment** | Python backend | 3 | Tessellation cell orientation vs building orientation | Per-cell color, degrees scale | ~2s (requires tessellation) |

### 1.4 Intensity / Spacematrix Metrics (8 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| I1 | **FSI** (Floor Space Index) | TS client | 1 | GFA / site area (bbox) | Summary card + per-cell color | <1ms [C4: 0.36ms group] |
| I2 | **GSI** (Ground Space Index) | TS client | 1 | Footprint area / site area | Summary card + per-cell color | <1ms |
| I3 | **OSR** (Open Space Ratio) | TS client | 1 | (1 − GSI) / FSI | Summary card + per-cell color | <1ms |
| I4 | **L** (Mean floors / Layers) | TS client | 1 | FSI / GSI | Summary card badge | <1ms |
| I5 | **Network density** | TS client | 1 | Street length / site area (m/km²) | Aggregate badge | <1ms [C4: 0.48ms] |
| I6 | **Dwelling units** (estimate) | TS client | 1 | Residential GFA × NFA factor / unit size | Aggregate badge | <1ms [C4: 0.14ms] |
| I7 | **Population** (estimate) | TS client | 1 | DU × household size | Aggregate badge | <1ms |
| I8 | **Land use mix** (Shannon entropy) | TS client | 1 | Shannon of use-type areas, normalized | Aggregate badge, 0–1 scale | <1ms [C4: 0.14ms] |

### 1.5 Diversity Metrics (5 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| Dv1 | **Height Gini** | TS Web Worker | 2 | Gini coefficient of building heights | Aggregate badge, 0–1 scale | <1ms [C4: 0.09ms] |
| Dv2 | **Height std deviation** | TS Web Worker | 2 | Std dev of building heights | Aggregate badge, m | <1ms |
| Dv3 | **Height CV** (coeff. of variation) | TS Web Worker | 2 | std / mean of heights | Aggregate badge, ratio | <1ms |
| Dv4 | **Simpson diversity** | Python backend | 3 | Simpson index across spatial neighborhoods (libpysal) | Per-cell color, 0–1 scale | ~3s (requires spatial weights) |
| Dv5 | **Theil inequality** | Python backend | 3 | Theil index across spatial neighborhoods (libpysal) | Per-cell color, ratio scale | ~3s (requires spatial weights) |

### 1.6 Streetscape / Network Topology Metrics (7 metrics)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| N1 | **Intersection density** | TS client | 1 | Intersections per km² | Aggregate badge | <3ms [C4: 2.93ms] |
| N2 | **Link-node ratio** | TS client | 1 | links / nodes | Aggregate badge | Included with N1 |
| N3 | **Meshedness** | TS client | 1 | (e−v+1) / (2v−5) | Aggregate badge | Included with N1 |
| N4 | **4-way intersection proportion** | TS client | 1 | 4-way / total intersections | Aggregate badge, 0–1 | Included with N1 |
| N5 | **Canyon H/W ratio** (mean) | TS client | 1 | Avg building height / avg street width | Street color, ratio scale | <1ms [C4: 0.02ms] |
| N6 | **Street setback** (mean) | Python backend | 3 | Building-to-street perpendicular distance | Per-street color, m scale | ~5s (momepy street_profile) |
| N7 | **Betweenness centrality** (mean) | TS Web Worker | 2 | Brandes BFS on Graphology graph | Per-street color, 0–1 scale | <50ms [C4: 43.31ms] |

### 1.7 Metric Summary

| Category | Total | Tier 1 (TS instant) | Tier 2 (TS Worker) | Tier 3 (Python) |
|----------|-------|--------------------|--------------------|-----------------|
| Dimension | 8 | 7 | 0 | 1 |
| Shape | 14 | 14 | 0 | 0 |
| Spatial Distribution | 9 | 2 | 5 | 2 |
| Intensity / Spacematrix | 8 | 8 | 0 | 0 |
| Diversity | 5 | 0 | 3 | 2 |
| Streetscape / Network | 7 | 5 | 1 | 1 |
| **Total** | **51** | **36** | **9** | **6** |

**Tier performance summary** (500 buildings, from C4 spike):
- Tier 1 (36 metrics, main thread): ~8ms total — 25× under 200ms budget
- Tier 2 (9 metrics, Web Worker): ~90ms total — 55× under 5s budget
- Tier 3 (6 metrics, Python backend): ~15s total — included in extraction pipeline

---

## 2. TypeScript-Side Computation (Tier 1 & 2)

### 2.1 Tier 1 Instant Metrics (36 metrics, <200ms total)

All Tier 1 metrics compute on the main thread immediately after data arrives from the backend. They use Turf.js 7.x modular imports and basic arithmetic.

#### Dimension Metrics (D1–D7)

```typescript
import { area as turfArea } from '@turf/area';
import { bbox as turfBbox } from '@turf/bbox';
import { distance as turfDistance } from '@turf/distance';

interface DimensionMetrics {
  building_area: number;      // D1: footprint area (m²)
  floor_area: number;         // D2: GFA (m²)
  perimeter: number;          // D3: exterior ring length (m)
  height: number;             // D4: height_m property
  volume: number;             // D5: area × height (m³)
  longest_axis: number;       // D6: bbox major dimension (m)
  courtyard_area: number;     // D7: sum of interior ring areas (m²)
}

function computeDimensionMetrics(feature: GeoJSON.Feature<GeoJSON.Polygon>): DimensionMetrics {
  const props = feature.properties!;
  const height = parseFloat(props.height_m) || 9;
  const floorHeight = 3.0;
  const floors = Math.max(1, Math.round(height / floorHeight));

  const footprintArea = turfArea(feature);
  const gfa = footprintArea * floors;
  const coords = feature.geometry.coordinates;

  // Perimeter: sum of edge lengths (exterior ring)
  const exterior = coords[0];
  let perimeter = 0;
  for (let i = 0; i < exterior.length - 1; i++) {
    perimeter += turfDistance(exterior[i], exterior[i + 1], { units: 'meters' });
  }

  // Longest axis from bbox
  const bb = turfBbox(feature);
  const bbWidth = turfDistance([bb[0], bb[1]], [bb[2], bb[1]], { units: 'meters' });
  const bbHeight = turfDistance([bb[0], bb[1]], [bb[0], bb[3]], { units: 'meters' });
  const longestAxis = Math.max(bbWidth, bbHeight);

  // Courtyard area: sum of interior rings
  let courtyardArea = 0;
  for (let i = 1; i < coords.length; i++) {
    courtyardArea += turfArea({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords[i]] },
      properties: {},
    });
  }

  return {
    building_area: footprintArea,
    floor_area: gfa,
    perimeter,
    height,
    volume: footprintArea * height,
    longest_axis: longestAxis,
    courtyard_area: courtyardArea,
  };
}
```

**Performance**: C4 measured the GFA+FSI group (includes area, floors, height) at 0.36ms for 500 buildings. Adding perimeter, volume, longest axis, courtyard area adds per-vertex distance calls but stays under 3ms total.

#### Shape Metrics (S1–S14)

```typescript
import { convex } from '@turf/convex';
import { centroid } from '@turf/centroid';

interface ShapeMetrics {
  elongation: number;             // S1: min/max bbox dimension, 0–1
  circular_compactness: number;   // S2: 4πA/P², 0–1
  convexity: number;              // S3: area / convex hull area, 0–1
  rectangularity: number;         // S4: area / bbox area, 0–1
  squareness: number;             // S5: mean angle deviation from 90°
  courtyard_index: number;        // S6: courtyard area / total area, 0–1
  eri: number;                    // S7: equivalent rectangular index
  facade_ratio: number;           // S8: perimeter / area
  fractal_dimension: number;      // S9: 2 × log(P/4) / log(A)
  shape_index: number;            // S10: sqrt(A) / (0.25×P)
  square_compactness: number;     // S11: ratio to equal-perimeter square
  form_factor: number;            // S12: volume / bbox³
  corners: number;                // S13: exterior vertex count
  centroid_corner_dist: number;   // S14: mean centroid-to-vertex distance
}

function computeShapeMetrics(
  feature: GeoJSON.Feature<GeoJSON.Polygon>,
  area: number,
  perimeter: number,
  height: number,
  longestAxis: number,
  courtyardArea: number
): ShapeMetrics {
  const coords = feature.geometry.coordinates;
  const exterior = coords[0];
  const bb = turfBbox(feature);
  const bbWidth = turfDistance([bb[0], bb[1]], [bb[2], bb[1]], { units: 'meters' });
  const bbHeight = turfDistance([bb[0], bb[1]], [bb[0], bb[3]], { units: 'meters' });
  const shortAxis = Math.min(bbWidth, bbHeight);

  // S1: Elongation
  const elongation = longestAxis > 0 ? shortAxis / longestAxis : 1;

  // S2: Circular compactness (Schwartzberg)
  const circularCompactness = (4 * Math.PI * area) / (perimeter * perimeter);

  // S3: Convexity
  const hull = convex(feature);
  const hullArea = hull ? turfArea(hull) : area;
  const convexityVal = hullArea > 0 ? area / hullArea : 1;

  // S4: Rectangularity
  const bboxArea = bbWidth * bbHeight;
  const rectangularity = bboxArea > 0 ? area / bboxArea : 0;

  // S5: Squareness — mean deviation of internal angles from 90°
  let angleDevSum = 0;
  const n = exterior.length - 1; // exclude closing vertex
  for (let i = 0; i < n; i++) {
    const prev = exterior[(i - 1 + n) % n];
    const curr = exterior[i];
    const next = exterior[(i + 1) % n];
    const angle = angleBetween(prev, curr, next);
    angleDevSum += Math.abs(angle - 90);
  }
  const squareness = n > 0 ? angleDevSum / n : 0;

  // S6: Courtyard index
  const courtyardIndex = area > 0 ? courtyardArea / (area + courtyardArea) : 0;

  // S7: Equivalent rectangular index
  const rectPerimeter = 2 * (bbWidth + bbHeight);
  const eri = rectPerimeter > 0 ? perimeter / rectPerimeter : 1;

  // S8: Facade ratio
  const facadeRatio = area > 0 ? perimeter / area : 0;

  // S9: Fractal dimension
  const fractal = area > 1 ? (2 * Math.log(perimeter / 4)) / Math.log(area) : 1;

  // S10: Shape index
  const shapeIndex = perimeter > 0 ? Math.sqrt(area) / (0.25 * perimeter) : 0;

  // S11: Square compactness
  const sqSide = perimeter / 4;
  const sqArea = sqSide * sqSide;
  const squareCompactness = sqArea > 0 ? area / sqArea : 0;

  // S12: Form factor (3D)
  const bboxVolume = bbWidth * bbHeight * height;
  const formFactor = bboxVolume > 0 ? (area * height) / bboxVolume : 0;

  // S13: Corners
  const corners = n;

  // S14: Centroid-corner distance
  const c = centroid(feature);
  let distSum = 0;
  for (let i = 0; i < n; i++) {
    distSum += turfDistance(c.geometry.coordinates, exterior[i], { units: 'meters' });
  }
  const centroidCornerDist = n > 0 ? distSum / n : 0;

  return {
    elongation,
    circular_compactness: circularCompactness,
    convexity: convexityVal,
    rectangularity,
    squareness,
    courtyard_index: courtyardIndex,
    eri,
    facade_ratio: facadeRatio,
    fractal_dimension: fractal,
    shape_index: shapeIndex,
    square_compactness: squareCompactness,
    form_factor: formFactor,
    corners,
    centroid_corner_dist: centroidCornerDist,
  };
}

/** Compute angle at vertex `curr` between vectors curr→prev and curr→next, in degrees */
function angleBetween(
  prev: GeoJSON.Position,
  curr: GeoJSON.Position,
  next: GeoJSON.Position
): number {
  const v1 = [prev[0] - curr[0], prev[1] - curr[1]];
  const v2 = [next[0] - curr[0], next[1] - curr[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const cross = v1[0] * v2[1] - v1[1] * v2[0];
  return Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
}
```

**Performance**: C4 measured Shape (compactness + elongation) at 1.45ms for 500 buildings. With all 14 shape metrics, expect ~3ms total — per-building `turfDistance` calls for bbox and centroid-corner dominate.

#### Intensity / Spacematrix Metrics (I1–I8)

```typescript
interface SpacematrixMetrics {
  fsi: number;              // I1: GFA / site area
  gsi: number;              // I2: footprint / site area
  osr: number;              // I3: (1 - GSI) / FSI
  layers: number;           // I4: FSI / GSI
  network_density: number;  // I5: street length (m) / site area (km²)
  dwelling_units: number;   // I6: residential GFA × 0.8 / 80
  population: number;       // I7: DU × 2.5
  land_use_mix: number;     // I8: normalized Shannon entropy
}

function computeSpacematrix(
  buildings: GeoJSON.Feature[],
  streets: GeoJSON.Feature[],
  siteAreaM2: number
): SpacematrixMetrics {
  let totalFootprint = 0;
  let totalGFA = 0;
  const useAreas: Record<string, number> = {};

  for (const b of buildings) {
    const area = turfArea(b);
    const height = parseFloat(b.properties!.height_m) || 9;
    const floors = Math.max(1, Math.round(height / 3.0));
    const gfa = area * floors;
    totalFootprint += area;
    totalGFA += gfa;

    const use = b.properties!.building || 'unknown';
    useAreas[use] = (useAreas[use] || 0) + gfa;
  }

  const gsi = totalFootprint / siteAreaM2;
  const fsi = totalGFA / siteAreaM2;
  const osr = fsi > 0 ? (1 - gsi) / fsi : 0;
  const layers = gsi > 0 ? fsi / gsi : 0;

  // Network density
  let streetLength = 0;
  for (const s of streets) {
    const coords = (s.geometry as GeoJSON.LineString).coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      streetLength += turfDistance(coords[i], coords[i + 1], { units: 'meters' });
    }
  }
  const networkDensity = streetLength / (siteAreaM2 / 1_000_000); // m/km²

  // Dwelling units (residential GFA × NFA factor / unit size)
  const residentialUses = ['apartments', 'residential', 'house', 'detached', 'terrace'];
  let residentialGFA = 0;
  for (const use of residentialUses) {
    residentialGFA += useAreas[use] || 0;
  }
  const dwellingUnits = Math.round((residentialGFA * 0.8) / 80);
  const population = Math.round(dwellingUnits * 2.5);

  // Shannon entropy (land use mix)
  const totalUseArea = Object.values(useAreas).reduce((a, b) => a + b, 0);
  const useCount = Object.keys(useAreas).length;
  let shannon = 0;
  if (useCount > 1 && totalUseArea > 0) {
    for (const a of Object.values(useAreas)) {
      const p = a / totalUseArea;
      if (p > 0) shannon -= p * Math.log(p);
    }
    shannon /= Math.log(useCount); // normalize to 0–1
  }

  return {
    fsi, gsi, osr, layers,
    network_density: networkDensity,
    dwelling_units: dwellingUnits,
    population,
    land_use_mix: shannon,
  };
}
```

**Performance**: C4 measured this entire group at 0.36ms (Spacematrix) + 0.48ms (network density) + 0.14ms (dwelling/population) + 0.14ms (land use mix) = ~1.1ms for 500 buildings.

#### Network Topology Metrics (N1–N5)

```typescript
interface NetworkTopologyMetrics {
  intersection_density: number;   // N1: intersections per km²
  link_node_ratio: number;        // N2: links / nodes
  meshedness: number;             // N3: (e-v+1) / (2v-5)
  four_way_proportion: number;    // N4: 4-way / total
  canyon_hw_ratio: number;        // N5: avg height / avg street width
}

function computeNetworkTopology(
  streets: GeoJSON.Feature[],
  buildings: GeoJSON.Feature[],
  siteAreaM2: number
): NetworkTopologyMetrics {
  // Build node map from street endpoints
  const nodeMap = new Map<string, { degree: number; coord: GeoJSON.Position }>();
  const edges: number = streets.length;

  for (const s of streets) {
    const coords = (s.geometry as GeoJSON.LineString).coordinates;
    const startKey = `${coords[0][0].toFixed(6)},${coords[0][1].toFixed(6)}`;
    const endKey = `${coords[coords.length - 1][0].toFixed(6)},${coords[coords.length - 1][1].toFixed(6)}`;

    if (!nodeMap.has(startKey)) nodeMap.set(startKey, { degree: 0, coord: coords[0] });
    if (!nodeMap.has(endKey)) nodeMap.set(endKey, { degree: 0, coord: coords[coords.length - 1] });
    nodeMap.get(startKey)!.degree++;
    nodeMap.get(endKey)!.degree++;
  }

  const nodes = nodeMap.size;
  const intersections = [...nodeMap.values()].filter(n => n.degree >= 3);
  const fourWay = intersections.filter(n => n.degree >= 4).length;

  const intersectionDensity = intersections.length / (siteAreaM2 / 1_000_000);
  const linkNodeRatio = nodes > 0 ? edges / nodes : 0;
  const meshedness = nodes > 4 ? (edges - nodes + 1) / (2 * nodes - 5) : 0;
  const fourWayProportion = intersections.length > 0 ? fourWay / intersections.length : 0;

  // Canyon H/W ratio (simple aggregate)
  const avgHeight = buildings.reduce((sum, b) =>
    sum + (parseFloat(b.properties!.height_m) || 9), 0) / (buildings.length || 1);
  const avgStreetWidth = 12; // Default; refined if 'width' tag present
  const canyonHW = avgStreetWidth > 0 ? avgHeight / avgStreetWidth : 0;

  return {
    intersection_density: intersectionDensity,
    link_node_ratio: linkNodeRatio,
    meshedness,
    four_way_proportion: fourWayProportion,
    canyon_hw_ratio: canyonHW,
  };
}
```

**Performance**: C4 measured Network Topology at 2.93ms for 500 buildings / 2286 streets. Dominated by string key hashing for node deduplication.

#### Orientation Metrics (SD1–SD2)

```typescript
import { bearing as turfBearing } from '@turf/bearing';

function computeOrientation(feature: GeoJSON.Feature<GeoJSON.Polygon>): number {
  // Orientation: bearing of longest edge, normalized to 0–180°
  const coords = feature.geometry.coordinates[0];
  let maxLen = 0;
  let maxBearing = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const len = turfDistance(coords[i], coords[i + 1], { units: 'meters' });
    if (len > maxLen) {
      maxLen = len;
      maxBearing = turfBearing(coords[i], coords[i + 1]);
    }
  }
  return ((maxBearing % 180) + 180) % 180; // Normalize to 0–180°
}

function computeOrientationConsistency(orientations: number[]): number {
  // Circular variance: 1 - |mean resultant vector| (0 = uniform, 1 = all aligned)
  let sinSum = 0, cosSum = 0;
  for (const theta of orientations) {
    const rad = (theta * Math.PI) / 90; // Double angle for axial data (0–180°)
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const n = orientations.length;
  const R = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / n;
  return R; // 0 = random, 1 = perfectly aligned
}
```

**Performance**: C4 measured Orientation Consistency at 0.42ms for 500 buildings.

### 2.2 Tier 2 Web Worker Metrics (9 metrics, <5s total)

These metrics require spatial indexing (Flatbush) or graph analysis (Graphology) and run in a Web Worker to avoid blocking the UI.

#### Worker Setup

```typescript
// metrics-worker.ts
import Flatbush from 'flatbush';
import Graph from 'graphology';
import { betweennessCentrality } from 'graphology-metrics/centrality/betweenness';

interface Tier2Input {
  buildings: {
    id: string;
    centroidX: number;
    centroidY: number;
    bboxMinX: number;
    bboxMinY: number;
    bboxMaxX: number;
    bboxMaxY: number;
    orientation: number;   // from Tier 1
    height: number;
  }[];
  streets: {
    id: string;
    coordinates: number[][];
    bearing: number;
  }[];
}

interface Tier2Output {
  perBuilding: Map<string, {
    street_alignment: number;
    inter_building_dist_mean: number;
    inter_building_dist_min: number;
    neighbor_count: number;
    height_gini: number;
    height_std: number;
    height_cv: number;
  }>;
  perStreet: Map<string, {
    betweenness: number;
  }>;
  aggregate: {
    adjacency_ratio: number;
  };
}
```

#### Street Alignment (SD3)

```typescript
function computeStreetAlignment(
  buildings: Tier2Input['buildings'],
  streets: Tier2Input['streets']
): Map<string, number> {
  // Build Flatbush index of street segment midpoints
  const streetIndex = new Flatbush(streets.length);
  const streetBearings: number[] = [];
  for (const s of streets) {
    const mid = s.coordinates[Math.floor(s.coordinates.length / 2)];
    streetIndex.add(mid[0] - 0.001, mid[1] - 0.001, mid[0] + 0.001, mid[1] + 0.001);
    streetBearings.push(s.bearing);
  }
  streetIndex.finish();

  const result = new Map<string, number>();
  for (const b of buildings) {
    // Find nearest street
    const neighbors = streetIndex.neighbors(b.centroidX, b.centroidY, 1);
    if (neighbors.length > 0) {
      const streetBearing = streetBearings[neighbors[0]];
      let deviation = Math.abs(b.orientation - (streetBearing % 180));
      if (deviation > 90) deviation = 180 - deviation;
      result.set(b.id, deviation);
    }
  }
  return result;
}
```

**Performance**: C4 measured at 25.23ms for 500 buildings. Dominated by Flatbush index build + per-building bearing comparison.

#### Inter-Building Distance + Neighbor Count (SD4, SD5, SD7)

```typescript
function computeSpatialDistribution(
  buildings: Tier2Input['buildings']
): { distMean: Map<string, number>; distMin: Map<string, number>; neighbors: Map<string, number> } {
  // Build Flatbush index of building centroids
  const index = new Flatbush(buildings.length);
  for (const b of buildings) {
    index.add(b.centroidX, b.centroidY, b.centroidX, b.centroidY);
  }
  index.finish();

  const distMean = new Map<string, number>();
  const distMin = new Map<string, number>();
  const neighborCount = new Map<string, number>();

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    // 5 nearest neighbors
    const nn = index.neighbors(b.centroidX, b.centroidY, 6); // +1 for self
    const distances: number[] = [];
    for (const j of nn) {
      if (j === i) continue;
      const dx = b.centroidX - buildings[j].centroidX;
      const dy = b.centroidY - buildings[j].centroidY;
      distances.push(Math.sqrt(dx * dx + dy * dy));
    }
    if (distances.length > 0) {
      distMean.set(b.id, distances.reduce((a, c) => a + c, 0) / distances.length);
      distMin.set(b.id, Math.min(...distances));
    }

    // Radius query: buildings within 100m (using ~0.001° as proxy)
    const radius = 0.001; // ~100m at mid-latitudes
    const nearby = index.search(
      b.centroidX - radius, b.centroidY - radius,
      b.centroidX + radius, b.centroidY + radius
    );
    neighborCount.set(b.id, nearby.length - 1); // exclude self
  }

  return { distMean, distMin, neighbors: neighborCount };
}
```

**Performance**: C4 measured inter_building_distance at 13.71ms and adjacency_ratio at 2.79ms for 500 buildings. Flatbush nearest-neighbor and radius queries are extremely fast.

#### Adjacency Ratio (SD6)

```typescript
function computeAdjacencyRatio(buildings: Tier2Input['buildings']): number {
  // Use bounding box proximity rather than centroid distance (C4 lesson: centroid threshold too tight)
  const index = new Flatbush(buildings.length);
  for (const b of buildings) {
    index.add(b.bboxMinX, b.bboxMinY, b.bboxMaxX, b.bboxMaxY);
  }
  index.finish();

  let adjacent = 0;
  const bufferDeg = 0.00005; // ~5m buffer around bbox
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const nearby = index.search(
      b.bboxMinX - bufferDeg, b.bboxMinY - bufferDeg,
      b.bboxMaxX + bufferDeg, b.bboxMaxY + bufferDeg
    );
    if (nearby.some(j => j !== i)) adjacent++;
  }
  return adjacent / buildings.length;
}
```

**Note**: C4 discovered that centroid-based 5m threshold produces 0% adjacency for Barcelona Eixample because building centroids are much further apart than 5m. This implementation uses bounding box overlap with a 5m buffer instead, which correctly detects buildings that share walls or are very close.

#### Height Distribution (Dv1–Dv3)

```typescript
function computeHeightDistribution(heights: number[]): {
  gini: number; std: number; cv: number;
} {
  const n = heights.length;
  if (n === 0) return { gini: 0, std: 0, cv: 0 };

  const mean = heights.reduce((a, b) => a + b, 0) / n;
  const variance = heights.reduce((s, h) => s + (h - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  // Gini coefficient
  const sorted = [...heights].sort((a, b) => a - b);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sorted[i];
  }
  const gini = n > 1 ? giniSum / (n * mean * n) : 0;

  return { gini: Math.max(0, gini), std, cv };
}
```

**Performance**: C4 measured height_distribution at 0.09ms for 500 buildings. Pure arithmetic on sorted arrays.

#### Network Betweenness Centrality (N7)

```typescript
function computeBetweenness(streets: Tier2Input['streets']): Map<string, number> {
  // Build Graphology graph from street network
  const graph = new Graph({ type: 'undirected' });

  for (const s of streets) {
    const coords = s.coordinates;
    const startKey = `${coords[0][0].toFixed(6)},${coords[0][1].toFixed(6)}`;
    const endKey = `${coords[coords.length - 1][0].toFixed(6)},${coords[coords.length - 1][1].toFixed(6)}`;

    if (!graph.hasNode(startKey)) graph.addNode(startKey);
    if (!graph.hasNode(endKey)) graph.addNode(endKey);

    // Edge weight = segment length
    let length = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0];
      const dy = coords[i + 1][1] - coords[i][1];
      length += Math.sqrt(dx * dx + dy * dy);
    }

    const edgeKey = `${startKey}-${endKey}`;
    if (!graph.hasEdge(startKey, endKey)) {
      graph.addEdgeWithKey(edgeKey, startKey, endKey, {
        weight: length,
        streetId: s.id,
      });
    }
  }

  // Brandes betweenness centrality
  const centrality = betweennessCentrality(graph, { getEdgeWeight: 'weight' });

  // Map node centrality to edges (average of endpoints)
  const result = new Map<string, number>();
  graph.forEachEdge((edge, attrs, source, target) => {
    const avgCentrality = ((centrality[source] || 0) + (centrality[target] || 0)) / 2;
    result.set(attrs.streetId, avgCentrality);
  });

  return result;
}
```

**Performance**: C4 measured network_centrality at 43.31ms for ~849 nodes from 2286 street segments. Brandes BFS dominates Tier 2 time.

### 2.3 Tier 1 + Tier 2 Combined Pipeline

```typescript
interface AllClientMetrics {
  perBuilding: Map<string, Record<string, number>>;  // buildingId → metric values
  perStreet: Map<string, Record<string, number>>;     // streetId → metric values
  aggregate: Record<string, number>;                   // area-wide values
}

async function computeAllClientMetrics(
  buildings: GeoJSON.Feature[],
  streets: GeoJSON.Feature[],
  siteAreaM2: number
): Promise<AllClientMetrics> {
  // Phase 1: Tier 1 (main thread, instant)
  const perBuilding = new Map<string, Record<string, number>>();
  const orientations: number[] = [];

  for (const b of buildings) {
    const dim = computeDimensionMetrics(b as any);
    const shape = computeShapeMetrics(b as any, dim.building_area, dim.perimeter, dim.height, dim.longest_axis, dim.courtyard_area);
    const orient = computeOrientation(b as any);
    orientations.push(orient);

    perBuilding.set(b.properties!.id, {
      ...dim, ...shape, orientation: orient,
    });
  }

  const spacematrix = computeSpacematrix(buildings, streets, siteAreaM2);
  const network = computeNetworkTopology(streets, buildings, siteAreaM2);
  const orientConsistency = computeOrientationConsistency(orientations);

  // Phase 2: Tier 2 (Web Worker, background)
  const tier2Result = await runTier2Worker({
    buildings: buildings.map(b => ({
      id: b.properties!.id,
      centroidX: centroid(b as any).geometry.coordinates[0],
      centroidY: centroid(b as any).geometry.coordinates[1],
      bboxMinX: turfBbox(b)[0],
      bboxMinY: turfBbox(b)[1],
      bboxMaxX: turfBbox(b)[2],
      bboxMaxY: turfBbox(b)[3],
      orientation: perBuilding.get(b.properties!.id)!.orientation,
      height: parseFloat(b.properties!.height_m) || 9,
    })),
    streets: streets.map(s => ({
      id: s.properties!.id,
      coordinates: (s.geometry as GeoJSON.LineString).coordinates,
      bearing: computeStreetBearing(s),
    })),
  });

  // Merge Tier 2 into per-building results
  for (const [id, t2] of tier2Result.perBuilding) {
    const existing = perBuilding.get(id)!;
    Object.assign(existing, t2);
  }

  return {
    perBuilding,
    perStreet: tier2Result.perStreet,
    aggregate: {
      ...spacematrix,
      ...network,
      orientation_consistency: orientConsistency,
      adjacency_ratio: tier2Result.aggregate.adjacency_ratio,
    },
  };
}
```

**Total pipeline**: ~8ms (Tier 1) + ~11ms (data transfer) + ~90ms (Tier 2) = **~109ms** for 500 buildings [C4: 102.98ms measured]. 29× under the 3s budget.

---

## 3. Python Backend Computation (Tier 3)

### 3.1 Endpoint: POST /metrics/momepy

**Request schema**:
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "streets": { "type": "FeatureCollection", "features": [...] },
  "tessellation": { "type": "FeatureCollection", "features": [...] },
  "metrics": ["all"]
}
```

**Response schema**:
```json
{
  "per_building": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [...] },
        "properties": {
          "id": "bldg_001",
          "shared_walls_m": 24.3,
          "street_setback_m": 3.2
        }
      }
    ]
  },
  "per_cell": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [...] },
        "properties": {
          "cell_id": "cell_001",
          "building_id": "bldg_001",
          "coverage_ratio": 0.62,
          "cell_alignment": 12.3,
          "simpson_diversity": 0.45,
          "theil_inequality": 0.28
        }
      }
    ]
  },
  "aggregate": {
    "mean_shared_walls": 18.7,
    "mean_street_setback": 4.1,
    "mean_coverage_ratio": 0.55,
    "mean_simpson": 0.41,
    "mean_theil": 0.31
  }
}
```

### 3.2 Metric Computation Details (Python)

#### D8: Coverage Ratio

```python
def compute_coverage_ratio(
    buildings: gpd.GeoDataFrame,
    tessellation: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Coverage ratio = building footprint area / tessellation cell area.
    Requires tessellation with building_id linkage (from enclosed_tessellation index).
    """
    tess = tessellation.copy()
    tess['cell_area'] = tess.geometry.area

    # Join building areas
    bldg_areas = buildings.geometry.area.rename('building_area')
    tess = tess.join(bldg_areas, how='left')
    tess['coverage_ratio'] = (tess['building_area'] / tess['cell_area']).clip(0, 1)
    tess['coverage_ratio'] = tess['coverage_ratio'].fillna(0)  # Empty cells
    return tess
```

#### SD8: Shared Walls

```python
def compute_shared_walls(buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Shared wall length between adjacent buildings.
    Uses momepy.shared_walls() which requires spatial weights from libpysal.
    """
    import libpysal
    # Queen contiguity weights (buildings that share edges or vertices)
    w = libpysal.weights.Queen.from_dataframe(buildings, silence_warnings=True)
    buildings['shared_walls_m'] = momepy.shared_walls(buildings, w)
    return buildings
```

**Performance**: Spatial weight construction + shared wall computation ~5s for 500 buildings. This is a genuine Python-only computation because it requires precise geometry intersection via Shapely, which is not feasible in TypeScript with Turf.js (coordinate precision issues).

#### SD9: Cell Alignment

```python
def compute_cell_alignment(
    buildings: gpd.GeoDataFrame,
    tessellation: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Orientation difference between tessellation cell and its building.
    Uses momepy.cell_alignment() which computes the angular deviation.
    """
    tess = tessellation.copy()
    tess['cell_alignment'] = momepy.cell_alignment(buildings, tessellation)
    return tess
```

#### Dv4–Dv5: Spatial Diversity (Simpson, Theil)

```python
def compute_spatial_diversity(
    buildings: gpd.GeoDataFrame,
    tessellation: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Simpson diversity and Theil inequality across spatial neighborhoods.
    Requires spatial weights graph (libpysal) for neighborhood definition.
    """
    import libpysal

    # Build spatial weights on tessellation cells
    w = libpysal.weights.Queen.from_dataframe(tessellation, silence_warnings=True)

    # Simpson diversity of building heights across neighbors
    heights = buildings.reindex(tessellation.index)['height_m'].fillna(9)
    tessellation['simpson_diversity'] = momepy.simpson(heights, w)

    # Theil inequality of building areas across neighbors
    areas = buildings.reindex(tessellation.index).geometry.area.fillna(0)
    tessellation['theil_inequality'] = momepy.theil(areas, w)

    return tessellation
```

**Performance**: ~3s for 500 buildings. Spatial weight construction is the bottleneck; actual diversity computation is fast.

#### N6: Street Setback

```python
def compute_street_setback(
    streets: gpd.GeoDataFrame,
    buildings: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """Mean perpendicular distance from street to adjacent building facades.
    Uses momepy.street_profile() which computes height, width, and setback.
    """
    profile = momepy.street_profile(streets, buildings)
    streets['setback_m'] = profile['width_deviation'].fillna(0)
    return streets
```

**Performance**: ~5s for 500 buildings. momepy.street_profile performs perpendicular sampling along each street segment.

### 3.3 Extraction Pipeline Integration

All 6 Tier 3 metrics are computed during the extraction pipeline (within `/extract` endpoint) and returned alongside the building/street/tessellation data. No separate API call is needed.

```python
# Inside /extract endpoint handler
async def extract_and_compute(bbox: list[float]) -> FragmentPackage:
    # 1. OSM extraction (~30s)
    buildings, streets = extract_osm(bbox, buffer_m=200)

    # 2. Neatnet simplification (~5s)
    streets = neatnet.neatify(streets)

    # 3. Tessellation (~5s with n_jobs=-1)
    enclosures = momepy.enclosures(streets, limit=boundary)
    tessellation = momepy.enclosed_tessellation(
        buildings, enclosures, segment=1.0, simplify=True, n_jobs=-1
    )

    # 4. Height enrichment (~1s)
    buildings = enrich_heights(buildings)

    # 5. Tier 3 metrics (~15s total)
    buildings = compute_shared_walls(buildings)           # ~5s
    tessellation = compute_coverage_ratio(buildings, tessellation)  # <1s
    tessellation = compute_cell_alignment(buildings, tessellation)  # ~2s
    tessellation = compute_spatial_diversity(buildings, tessellation)  # ~3s
    streets = compute_street_setback(streets, buildings)  # ~5s

    # 6. Package and return
    return FragmentPackage(
        buildings=to_geojson(buildings),
        streets=to_geojson(streets),
        tessellation=to_geojson(tessellation),
        metadata=extract_metadata(buildings, streets),
    )
```

**Total extraction pipeline**: ~60s (OSM ~30s, neatnet ~5s, tessellation ~5s, heights ~1s, Tier 3 metrics ~15s, serialization ~4s). This is within the 90s budget from finding #83.

---

## 4. Tessellation Cell Rendering

### 4.1 Architecture

Tessellation cells are rendered as a MapLibre vector layer (not Three.js geometry). This is more efficient because MapLibre handles geo-projection natively, and cells don't need 3D extrusion for P2.

```
Tessellation GeoJSON (from backend)
  → MapLibre GeoJSON source
    → fill layer (2D polygons, colored by metric)
    → fill-extrusion layer (low-height 3D, optional)
      → data-driven coloring by active cell metric
```

### 4.2 MapLibre Layer Setup

```typescript
function addTessellationLayer(
  map: maplibregl.Map,
  tessellation: GeoJSON.FeatureCollection,
  activeMetric: string,
  colorRamp: ColorRamp
): void {
  // Add source
  map.addSource('tessellation', {
    type: 'geojson',
    data: tessellation,
  });

  // 2D fill layer (default view)
  map.addLayer({
    id: 'tessellation-fill',
    type: 'fill',
    source: 'tessellation',
    paint: {
      'fill-color': buildDataDrivenColor(activeMetric, colorRamp),
      'fill-opacity': 0.5,
      'fill-outline-color': 'rgba(0, 0, 0, 0.2)',
    },
  });

  // Optional: low-height fill-extrusion (0.5m) for 3D effect
  map.addLayer({
    id: 'tessellation-extrusion',
    type: 'fill-extrusion',
    source: 'tessellation',
    paint: {
      'fill-extrusion-color': buildDataDrivenColor(activeMetric, colorRamp),
      'fill-extrusion-height': 0.5,
      'fill-extrusion-opacity': 0.6,
    },
    layout: { visibility: 'none' },  // Hidden by default
  });
}

function buildDataDrivenColor(
  metricKey: string,
  ramp: ColorRamp
): maplibregl.StyleSpecification['paint']['fill-color'] {
  return [
    'interpolate', ['linear'],
    ['get', metricKey],
    ramp.domain[0], ramp.stops[0].color,
    (ramp.domain[0] + ramp.domain[1]) / 2, ramp.stops[Math.floor(ramp.stops.length / 2)].color,
    ramp.domain[1], ramp.stops[ramp.stops.length - 1].color,
  ];
}
```

### 4.3 Metric Switching for Tessellation View

When the user selects a different cell-level metric, the layer paint is updated:

```typescript
function updateTessellationMetric(
  map: maplibregl.Map,
  metricKey: string,
  ramp: ColorRamp
): void {
  map.setPaintProperty(
    'tessellation-fill',
    'fill-color',
    buildDataDrivenColor(metricKey, ramp)
  );
  // Also update fill-extrusion if visible
  map.setPaintProperty(
    'tessellation-extrusion',
    'fill-extrusion-color',
    buildDataDrivenColor(metricKey, ramp)
  );
}
```

**Performance**: MapLibre paint property updates are nearly instant (<16ms, within a single render frame). No geometry rebuild needed.

### 4.4 Cell-Level Metrics Available

| Metric | Source | Value Range | Color Ramp |
|--------|--------|-------------|-----------|
| Cell area (m²) | Tessellation geometry | 50–5000 m² | `viridis` |
| Coverage ratio | D8 (Python) | 0–1 | `rdylgn` reversed |
| Cell alignment (°) | SD9 (Python) | 0–90° | `viridis` |
| Simpson diversity | Dv4 (Python) | 0–1 | `spectral` |
| Theil inequality | Dv5 (Python) | 0–2 | `rdylgn` reversed |

---

## 5. Building View vs. Tessellation View Toggle

### 5.1 Toggle Behavior

P2 provides two view modes, toggled by a segmented control at the bottom of the map:

| View | What's Visible | When to Use |
|------|---------------|------------|
| **Building view** (default) | 3D buildings colored by per-building metric | Shape, dimension, spatial distribution metrics |
| **Tessellation view** | 2D tessellation cells colored by per-cell metric | Coverage, alignment, diversity metrics |

```
┌──────────────────────┐
│ [Building] │ [Tess.] │  ← Segmented control
└──────────────────────┘
```

### 5.2 Toggle Implementation

```typescript
type ViewMode = 'building' | 'tessellation';

function setViewMode(
  mode: ViewMode,
  map: maplibregl.Map,
  buildingMesh: BuildingMeshManager,
  tessellationLayerId: string
): void {
  if (mode === 'building') {
    buildingMesh.setOpacity(1.0);
    map.setLayoutProperty(tessellationLayerId, 'visibility', 'none');
  } else {
    buildingMesh.setOpacity(0.15);  // Ghost buildings for context
    map.setLayoutProperty(tessellationLayerId, 'visibility', 'visible');
  }
}
```

**Key design decision**: In tessellation view, buildings are not hidden — they're rendered at 15% opacity to provide context. This lets the user see building outlines while viewing cell-level metrics.

### 5.3 Metric-Driven View Switching

When the user selects a metric, the view mode automatically adjusts if needed:

```typescript
const CELL_METRICS = new Set([
  'coverage_ratio', 'cell_alignment', 'simpson_diversity', 'theil_inequality', 'cell_area',
]);

function onMetricSelect(metricKey: string): void {
  if (CELL_METRICS.has(metricKey)) {
    setViewMode('tessellation', ...);
    updateTessellationMetric(map, metricKey, getColorRamp(metricKey));
  } else {
    setViewMode('building', ...);
    buildingMesh.colorByMetric(metricKey, getMetricValues(metricKey), getColorRamp(metricKey));
  }
}
```

The user can override the automatic switch by manually toggling the segmented control.

---

## 6. Metric Category Panel Design

### 6.1 Sidebar Layout

The left sidebar (320px) contains three sections: Spacematrix summary (always visible), metric browser (6 collapsible groups), and histogram/stats panel.

```
┌──────────────┐
│ SPACEMATRIX  │  ← Always visible summary card
│ GSI: 0.37    │
│ FSI: 1.89    │
│ OSR: 0.33    │
│ L:   5.1     │
│ Type: Mid-   │
│ rise Dense   │
├──────────────┤
│ METRICS      │
│▸ Dimension(8)│  ← Collapsible category groups
│▾ Shape   (14)│     Expanded shows metric names as radio buttons
│  ● elongation│     ● = active metric (colored on map)
│  ○ compact.  │     ○ = available metric
│  ○ convexity │
│  ○ rectangul.│
│  ○ squareness│
│  ○ courtyard │
│  ○ ERI       │
│  ○ facade r. │
│  ○ fractal d.│
│  ○ shape idx │
│  ○ sq. comp. │
│  ○ form fact.│
│  ○ corners   │
│  ○ ctr-corner│
│▸ Spatial  (9)│
│▸ Intensity(8)│
│▸ Diversity(5)│
│▸ Street.  (7)│
├──────────────┤
│ HISTOGRAM    │  ← Distribution of active metric
│  ▓▓█▓▓▁▁▁   │
│ mean: 0.42   │
│ median: 0.39 │
│ std:  0.18   │
│ min:  0.08   │
│ max:  0.91   │
│ n: 500       │
└──────────────┘
```

### 6.2 Metric Category Configuration

```typescript
interface MetricCategory {
  id: string;
  label: string;
  metrics: MetricDefinition[];
  defaultExpanded: boolean;
}

interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  domain: [number, number];     // Expected value range
  colorRamp: string;            // Ramp name
  target: 'building' | 'cell' | 'street' | 'aggregate';
  description: string;          // Tooltip text
}

const METRIC_CATEGORIES: MetricCategory[] = [
  {
    id: 'dimension',
    label: 'Dimension',
    defaultExpanded: false,
    metrics: [
      { key: 'building_area', label: 'Area', unit: 'm²', domain: [0, 5000], colorRamp: 'viridis', target: 'building', description: 'Building footprint area' },
      { key: 'floor_area', label: 'Floor Area', unit: 'm²', domain: [0, 50000], colorRamp: 'viridis', target: 'building', description: 'Gross floor area (footprint × floors)' },
      { key: 'perimeter', label: 'Perimeter', unit: 'm', domain: [0, 500], colorRamp: 'viridis', target: 'building', description: 'Building footprint perimeter' },
      { key: 'height', label: 'Height', unit: 'm', domain: [0, 60], colorRamp: 'viridis', target: 'building', description: 'Building height' },
      { key: 'volume', label: 'Volume', unit: 'm³', domain: [0, 200000], colorRamp: 'viridis', target: 'building', description: 'Building volume (area × height)' },
      { key: 'longest_axis', label: 'Longest Axis', unit: 'm', domain: [0, 200], colorRamp: 'viridis', target: 'building', description: 'Length of longest bounding rectangle axis' },
      { key: 'courtyard_area', label: 'Courtyard Area', unit: 'm²', domain: [0, 2000], colorRamp: 'magma', target: 'building', description: 'Total area of interior courtyards' },
      { key: 'coverage_ratio', label: 'Coverage Ratio', unit: '', domain: [0, 1], colorRamp: 'rdylgn_r', target: 'cell', description: 'Building footprint / tessellation cell area' },
    ],
  },
  {
    id: 'shape',
    label: 'Shape',
    defaultExpanded: false,
    metrics: [
      { key: 'elongation', label: 'Elongation', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'min/max bbox dimension (0=elongated, 1=square)' },
      { key: 'circular_compactness', label: 'Compactness', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: '4πA/P² (1=circle, 0=complex)' },
      { key: 'convexity', label: 'Convexity', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'Area / convex hull area (1=fully convex)' },
      { key: 'rectangularity', label: 'Rectangularity', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'Area / bounding box area' },
      { key: 'squareness', label: 'Squareness', unit: '°', domain: [0, 45], colorRamp: 'viridis', target: 'building', description: 'Mean angle deviation from 90° (0=perfectly square)' },
      { key: 'courtyard_index', label: 'Courtyard Index', unit: '', domain: [0, 1], colorRamp: 'magma', target: 'building', description: 'Courtyard area / total area' },
      { key: 'eri', label: 'ERI', unit: '', domain: [0.5, 2], colorRamp: 'viridis', target: 'building', description: 'Equivalent rectangular index' },
      { key: 'facade_ratio', label: 'Facade Ratio', unit: '1/m', domain: [0, 0.5], colorRamp: 'viridis', target: 'building', description: 'Perimeter / area ratio' },
      { key: 'fractal_dimension', label: 'Fractal Dim.', unit: '', domain: [1, 2], colorRamp: 'spectral', target: 'building', description: 'Shape complexity (1=simple, 2=complex)' },
      { key: 'shape_index', label: 'Shape Index', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'sqrt(A) / (0.25×P)' },
      { key: 'square_compactness', label: 'Sq. Compactness', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'Ratio to equal-perimeter square' },
      { key: 'form_factor', label: 'Form Factor', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'building', description: 'Volume / bounding box volume' },
      { key: 'corners', label: 'Corners', unit: '', domain: [4, 50], colorRamp: 'viridis', target: 'building', description: 'Number of exterior vertices' },
      { key: 'centroid_corner_dist', label: 'Ctr-Corner Dist', unit: 'm', domain: [0, 100], colorRamp: 'viridis', target: 'building', description: 'Mean centroid-to-vertex distance' },
    ],
  },
  {
    id: 'spatial',
    label: 'Spatial Distribution',
    defaultExpanded: false,
    metrics: [
      { key: 'orientation', label: 'Orientation', unit: '°', domain: [0, 180], colorRamp: 'spectral', target: 'building', description: 'Building orientation (°, longest edge bearing)' },
      { key: 'street_alignment', label: 'Street Alignment', unit: '°', domain: [0, 90], colorRamp: 'rdylgn_r', target: 'building', description: 'Angular deviation from nearest street' },
      { key: 'inter_building_dist_mean', label: 'Inter-Bldg Dist', unit: 'm', domain: [0, 100], colorRamp: 'viridis', target: 'building', description: 'Mean distance to 5 nearest neighbors' },
      { key: 'inter_building_dist_min', label: 'Min Bldg Dist', unit: 'm', domain: [0, 50], colorRamp: 'viridis', target: 'building', description: 'Distance to nearest neighbor' },
      { key: 'neighbor_count', label: 'Neighbors', unit: '', domain: [0, 30], colorRamp: 'viridis', target: 'building', description: 'Buildings within 100m' },
      { key: 'shared_walls_m', label: 'Shared Walls', unit: 'm', domain: [0, 100], colorRamp: 'magma', target: 'building', description: 'Length of shared walls (momepy)' },
      { key: 'cell_alignment', label: 'Cell Alignment', unit: '°', domain: [0, 90], colorRamp: 'viridis', target: 'cell', description: 'Orientation diff: cell vs building' },
    ],
  },
  {
    id: 'intensity',
    label: 'Intensity / Spacematrix',
    defaultExpanded: true,
    metrics: [
      { key: 'fsi', label: 'FSI (FAR)', unit: '', domain: [0, 8], colorRamp: 'viridis', target: 'aggregate', description: 'Floor Space Index (GFA / site area)' },
      { key: 'gsi', label: 'GSI', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'aggregate', description: 'Ground Space Index (footprint / site area)' },
      { key: 'osr', label: 'OSR', unit: '', domain: [0, 2], colorRamp: 'viridis', target: 'aggregate', description: 'Open Space Ratio ((1-GSI)/FSI)' },
      { key: 'layers', label: 'Mean Floors', unit: '', domain: [1, 15], colorRamp: 'viridis', target: 'aggregate', description: 'FSI / GSI' },
      { key: 'network_density', label: 'Network Density', unit: 'm/km²', domain: [0, 30000], colorRamp: 'viridis', target: 'aggregate', description: 'Street length per km²' },
      { key: 'dwelling_units', label: 'Dwelling Units', unit: '', domain: [0, 20000], colorRamp: 'viridis', target: 'aggregate', description: 'Estimated from residential GFA' },
      { key: 'population', label: 'Population', unit: '', domain: [0, 50000], colorRamp: 'viridis', target: 'aggregate', description: 'Estimated from dwelling units' },
      { key: 'land_use_mix', label: 'Use Mix', unit: '', domain: [0, 1], colorRamp: 'spectral', target: 'aggregate', description: 'Shannon entropy (0=mono, 1=diverse)' },
    ],
  },
  {
    id: 'diversity',
    label: 'Diversity',
    defaultExpanded: false,
    metrics: [
      { key: 'height_gini', label: 'Height Gini', unit: '', domain: [0, 1], colorRamp: 'spectral', target: 'aggregate', description: 'Height inequality (0=equal, 1=unequal)' },
      { key: 'height_std', label: 'Height Std Dev', unit: 'm', domain: [0, 20], colorRamp: 'viridis', target: 'aggregate', description: 'Height standard deviation' },
      { key: 'height_cv', label: 'Height CV', unit: '', domain: [0, 2], colorRamp: 'viridis', target: 'aggregate', description: 'Height coefficient of variation' },
      { key: 'simpson_diversity', label: 'Simpson', unit: '', domain: [0, 1], colorRamp: 'spectral', target: 'cell', description: 'Simpson diversity in neighborhood' },
      { key: 'theil_inequality', label: 'Theil', unit: '', domain: [0, 2], colorRamp: 'rdylgn_r', target: 'cell', description: 'Theil inequality in neighborhood' },
    ],
  },
  {
    id: 'streetscape',
    label: 'Streetscape / Network',
    defaultExpanded: false,
    metrics: [
      { key: 'intersection_density', label: 'Intersection Density', unit: '/km²', domain: [0, 1500], colorRamp: 'viridis', target: 'aggregate', description: 'Intersections per km²' },
      { key: 'meshedness', label: 'Meshedness', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'aggregate', description: 'Network loop completeness' },
      { key: 'four_way_proportion', label: '4-Way Proportion', unit: '', domain: [0, 1], colorRamp: 'viridis', target: 'aggregate', description: 'Fraction of 4-way intersections' },
      { key: 'canyon_hw_ratio', label: 'Canyon H/W', unit: '', domain: [0, 4], colorRamp: 'rdylgn_r', target: 'street', description: 'Avg building height / street width' },
      { key: 'setback_m', label: 'Street Setback', unit: 'm', domain: [0, 20], colorRamp: 'viridis', target: 'street', description: 'Building-to-street distance (momepy)' },
      { key: 'betweenness', label: 'Betweenness', unit: '', domain: [0, 0.1], colorRamp: 'magma', target: 'street', description: 'Network betweenness centrality' },
      { key: 'link_node_ratio', label: 'Link-Node Ratio', unit: '', domain: [1, 3], colorRamp: 'viridis', target: 'aggregate', description: 'Edges / nodes' },
    ],
  },
];
```

### 6.3 Metric Selection Behavior

When a metric is selected:

1. **Building-targeted metric**: Buildings recolor instantly via `MetricColorizer`. Tessellation layer hidden (or at 0 opacity).
2. **Cell-targeted metric**: Tessellation layer becomes visible with metric-driven coloring. Buildings drop to 15% opacity.
3. **Street-targeted metric**: Street network line layer recolors via MapLibre data-driven styling. Buildings remain at full opacity.
4. **Aggregate metric**: No map coloring change. Value highlighted in Spacematrix card or shown in a dedicated badge.

**Color switching performance**: Building recoloring via per-vertex `Float32Array` writes takes <10ms for 500 buildings [C4 architecture]. MapLibre `setPaintProperty` takes <16ms (one render frame).

---

## 7. Histogram / Statistics Panel

### 7.1 Architecture

The histogram displays the distribution of the currently active per-building or per-cell metric. It updates instantly when the user selects a different metric.

```
Metric values array (from perBuilding or perCell Map)
  → bin into 20 histogram bins
    → render as SVG bar chart
      → compute summary statistics
```

### 7.2 Implementation

```typescript
interface HistogramData {
  bins: { min: number; max: number; count: number }[];
  stats: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    count: number;
    p25: number;
    p75: number;
  };
}

function computeHistogram(values: number[], binCount: number = 20): HistogramData {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { bins: [], stats: { mean: 0, median: 0, std: 0, min: 0, max: 0, count: 0, p25: 0, p75: 0 } };

  const min = sorted[0];
  const max = sorted[n - 1];
  const binWidth = (max - min) / binCount || 1;

  const bins: { min: number; max: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
    });
  }

  for (const v of sorted) {
    const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    bins[idx].count++;
  }

  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  return {
    bins,
    stats: {
      mean,
      median: sorted[Math.floor(n / 2)],
      std: Math.sqrt(variance),
      min,
      max,
      count: n,
      p25: sorted[Math.floor(n * 0.25)],
      p75: sorted[Math.floor(n * 0.75)],
    },
  };
}
```

### 7.3 SVG Histogram Rendering

```typescript
function HistogramChart({ data, colorRamp, width = 280, height = 120 }: {
  data: HistogramData;
  colorRamp: string;
  width?: number;
  height?: number;
}) {
  const maxCount = Math.max(...data.bins.map(b => b.count));
  const barWidth = width / data.bins.length;

  return (
    <svg width={width} height={height} className="histogram">
      {data.bins.map((bin, i) => {
        const barHeight = maxCount > 0 ? (bin.count / maxCount) * (height - 20) : 0;
        const color = interpolateColor(
          (bin.min + bin.max) / 2,
          data.stats.min,
          data.stats.max,
          COLOR_RAMPS[colorRamp]
        );
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={height - 20 - barHeight}
            width={barWidth - 1}
            height={barHeight}
            fill={`rgb(${color.join(',')})`}
          />
        );
      })}
      {/* X-axis labels */}
      <text x={0} y={height - 4} fontSize={10}>{data.stats.min.toFixed(1)}</text>
      <text x={width} y={height - 4} fontSize={10} textAnchor="end">{data.stats.max.toFixed(1)}</text>
    </svg>
  );
}
```

**Performance**: Histogram computation for 500 values takes <1ms. SVG rendering with 20 bars is trivially fast. The entire stats panel updates within a single frame when switching metrics.

### 7.4 Stats Display

Below the histogram, display key statistics:

```
mean: 0.42    median: 0.39
std:  0.18    IQR: 0.28–0.56
min:  0.08    max: 0.91
n: 500 buildings
```

For aggregate metrics (FSI, GSI, etc.), the histogram is replaced with the single value displayed prominently.

---

## 8. Spacematrix Summary Card

### 8.1 Design

The Spacematrix card is always visible at the top of the sidebar, regardless of which metric category is expanded. It displays the four canonical Spacematrix indicators plus an inferred typological classification.

```
┌──────────────────────────┐
│     SPACEMATRIX          │
│                          │
│  GSI:  0.37   FSI: 1.89  │
│  OSR:  0.33   L:   5.1   │
│                          │
│  ┌─────────────────────┐ │
│  │ Mid-rise Dense      │ │
│  │ Berghauser Pont &   │ │
│  │ Haupt type 5        │ │
│  └─────────────────────┘ │
│                          │
│  Pop: ~28,200            │
│  DU:  ~11,280            │
│  Mix:  0.42 (moderate)   │
└──────────────────────────┘
```

### 8.2 Spacematrix Type Classification

```typescript
interface SpacematrixType {
  name: string;
  description: string;
  fsi_range: [number, number];
  gsi_range: [number, number];
}

const SPACEMATRIX_TYPES: SpacematrixType[] = [
  { name: 'Low-rise Sprawl', description: 'Suburban, auto-dependent', fsi_range: [0, 0.5], gsi_range: [0, 0.2] },
  { name: 'Low-rise Compact', description: 'Village or row housing', fsi_range: [0.5, 1.0], gsi_range: [0.2, 0.5] },
  { name: 'Mid-rise Open', description: 'Towers in a park', fsi_range: [0.5, 2.0], gsi_range: [0, 0.2] },
  { name: 'Mid-rise Dense', description: 'Perimeter block', fsi_range: [1.0, 3.0], gsi_range: [0.3, 0.6] },
  { name: 'High-rise Open', description: 'Tower clusters', fsi_range: [2.0, 5.0], gsi_range: [0, 0.3] },
  { name: 'High-rise Dense', description: 'Hong Kong-style', fsi_range: [3.0, 10.0], gsi_range: [0.3, 0.7] },
  { name: 'Hyper-dense', description: 'Extreme built-up', fsi_range: [5.0, 20.0], gsi_range: [0.5, 1.0] },
  { name: 'Ultra Low-rise', description: 'Rural / agricultural', fsi_range: [0, 0.3], gsi_range: [0, 0.1] },
];

function classifySpacematrix(fsi: number, gsi: number): SpacematrixType {
  // Find closest type by Euclidean distance to type center in FSI-GSI space
  let best = SPACEMATRIX_TYPES[0];
  let bestDist = Infinity;
  for (const t of SPACEMATRIX_TYPES) {
    const fsiCenter = (t.fsi_range[0] + t.fsi_range[1]) / 2;
    const gsiCenter = (t.gsi_range[0] + t.gsi_range[1]) / 2;
    // Normalize: FSI range is ~0–10, GSI is ~0–1, scale to comparable ranges
    const dist = ((fsi - fsiCenter) / 5) ** 2 + ((gsi - gsiCenter) / 0.5) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}
```

**Validation**: Barcelona Eixample should classify as "Mid-rise Dense" with GSI ≈ 0.37, FSI ≈ 1.89 — matching the B1 reference values [finding #83 success criterion 6].

---

## 9. Building Comparison (Pin & Compare)

### 9.1 Interaction Model

1. **Click** a building → it becomes "pinned" (highlighted border, metrics shown in sidebar)
2. **Click** a second building → both are pinned, side-by-side comparison appears
3. **Click** a pinned building again → unpin it
4. Maximum 2 pinned buildings at a time

### 9.2 Comparison Table

```
┌──────────────────────────────────┐
│       COMPARE BUILDINGS          │
├────────────┬──────────┬──────────┤
│ Metric     │ Bldg A   │ Bldg B   │
├────────────┼──────────┼──────────┤
│ Area       │ 412 m²   │ 89 m²    │
│ Height     │ 18.0 m   │ 9.0 m    │
│ Volume     │ 7,416 m³ │ 801 m³   │
│ Elongation │ 0.42     │ 0.78     │
│ Compact.   │ 0.58     │ 0.82     │
│ Courtyard  │ 0.23     │ 0.00     │
│ Orientation│ 45°      │ 122°     │
│ Street Alg.│ 3°       │ 12°      │
│ Neighbors  │ 8        │ 4        │
│ ... (all)  │          │          │
├────────────┴──────────┴──────────┤
│      [ Clear Selection ]         │
└──────────────────────────────────┘
```

### 9.3 Implementation

```typescript
interface ComparisonStore {
  pinnedBuildings: [string | null, string | null];
  pinBuilding(id: string): void;
  unpinBuilding(id: string): void;
  clearPins(): void;
}

function ComparisonPanel({ pinnedIds, metrics }: {
  pinnedIds: [string | null, string | null];
  metrics: Map<string, Record<string, number>>;
}) {
  if (!pinnedIds[0]) return null;

  const metricsA = metrics.get(pinnedIds[0]!);
  const metricsB = pinnedIds[1] ? metrics.get(pinnedIds[1]!) : null;

  const allKeys = Object.keys(metricsA || {});

  return (
    <div className="comparison-panel">
      <h3>Compare Buildings</h3>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Bldg A</th>
            {metricsB && <th>Bldg B</th>}
          </tr>
        </thead>
        <tbody>
          {allKeys.map(key => (
            <tr key={key}>
              <td>{getMetricLabel(key)}</td>
              <td>{formatMetric(key, metricsA?.[key])}</td>
              {metricsB && <td>{formatMetric(key, metricsB[key])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 10. Data Flow and State Management

### 10.1 Complete Data Flow

```
User draws rectangle (AreaSelector, max 1 km²)
  │
  ▼
POST /extract (bbox, include_tessellation=true, include_metrics=true)
  │  ~60s (OSM + neatnet + tessellation + heights + Tier 3 metrics)
  ▼
FragmentPackage returned:
  ├── buildings (GeoJSON + per-building Tier 3 metrics: shared_walls)
  ├── streets (GeoJSON + per-street Tier 3 metrics: setback)
  ├── tessellation (GeoJSON + per-cell Tier 3 metrics: coverage, alignment, diversity)
  └── metadata (bbox, building count, height source stats)
  │
  ├──► Zustand store: setBuildings(), setStreets(), setTessellation()
  ├──► BuildingMesh: construct merged BufferGeometry (focal mode)
  ├──► MapLibre: add street + tessellation sources
  │
  ▼
TS Tier 1 computation (main thread, ~8ms)
  ├── 36 per-building metrics (dimension, shape, orientation, spacematrix, network)
  ├── Aggregate metrics (FSI, GSI, OSR, L, etc.)
  └──► Zustand store: setTier1Metrics()
  │
  ▼
TS Tier 2 computation (Web Worker, ~90ms)
  ├── 9 metrics (street alignment, inter-bldg distance, adjacency, height dist, betweenness)
  └──► Zustand store: setTier2Metrics()
  │
  ▼
All 51 metrics available
  ├──► Spacematrix card: FSI, GSI, OSR, L, type classification
  ├──► Metric browser: all 6 categories populated
  ├──► Default coloring: height (D4)
  └──► Histogram: active metric distribution
```

### 10.2 Zustand Store Extension for P2

```typescript
interface MorphologyStore {
  // Data (from extraction)
  buildings: GeoJSON.FeatureCollection | null;
  streets: GeoJSON.FeatureCollection | null;
  tessellation: GeoJSON.FeatureCollection | null;

  // Computed metrics
  perBuildingMetrics: Map<string, Record<string, number>>;
  perCellMetrics: Map<string, Record<string, number>>;
  perStreetMetrics: Map<string, Record<string, number>>;
  aggregateMetrics: Record<string, number>;

  // Computation state
  tier1Ready: boolean;
  tier2Ready: boolean;
  tier3Ready: boolean;  // Included in extraction

  // View state
  activeMetricKey: string;          // Currently displayed metric
  activeCategory: string;           // Expanded category
  viewMode: 'building' | 'tessellation';
  histogram: HistogramData | null;

  // Selection / comparison
  pinnedBuildings: [string | null, string | null];
  hoveredBuildingId: string | null;

  // Actions
  setActiveMetric(key: string): void;
  setViewMode(mode: 'building' | 'tessellation'): void;
  pinBuilding(id: string): void;
  unpinBuilding(id: string): void;
  hoverBuilding(id: string | null): void;
}
```

---

## 11. UI Component Hierarchy

```
<App>
  <MapShell maxAreaM2={1_000_000} center={[2.17, 41.39]} zoom={15}>
    {/* Three.js objects */}
  </MapShell>

  <Sidebar>
    <ExtractionSummary />           {/* Building count, area, height stats */}
    <SpacematrixCard />             {/* Always visible: GSI, FSI, OSR, L, type */}
    <MetricBrowser>                 {/* 6 collapsible categories */}
      <MetricCategory id="dimension" />
      <MetricCategory id="shape" />
      <MetricCategory id="spatial" />
      <MetricCategory id="intensity" />
      <MetricCategory id="diversity" />
      <MetricCategory id="streetscape" />
    </MetricBrowser>
    <HistogramPanel />              {/* Distribution + stats for active metric */}
    <ComparisonPanel />             {/* Side-by-side when 2 buildings pinned */}
  </Sidebar>

  <ViewModeToggle />                {/* Building / Tessellation segmented control */}
  <ColorRampLegend />               {/* Bottom-right, active metric legend */}
  <BuildingTooltip />               {/* Hover tooltip with key metrics */}
</App>
```

---

## 12. Dependency List

### 12.1 TypeScript (npm packages)

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `maplibre-gl` | 5.x | Base map | BSD-3-Clause |
| `@dvt3d/maplibre-three-plugin` | 1.3.x | Three.js overlay | MIT |
| `three` | 0.172.x | 3D building rendering | MIT |
| `@turf/area` | 7.x | Polygon area | MIT |
| `@turf/bbox` | 7.x | Bounding box | MIT |
| `@turf/bearing` | 7.x | Bearing computation | MIT |
| `@turf/centroid` | 7.x | Polygon centroid | MIT |
| `@turf/convex` | 7.x | Convex hull | MIT |
| `@turf/distance` | 7.x | Point distance | MIT |
| `flatbush` | 4.x | Spatial indexing for Tier 2 | ISC |
| `graphology` | 0.26.x | Network graph analysis | MIT |
| `graphology-metrics` | 2.x | Betweenness centrality | MIT |
| `react` | 19.2.x | UI framework | MIT |
| `zustand` | 5.x | State management | MIT |

### 12.2 Python (pip/uv packages)

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `fastapi` | 0.115.x | HTTP API framework | MIT |
| `uvicorn` | 0.34.x | ASGI server | BSD-3 |
| `geopandas` | 1.1.x | GeoDataFrame operations | BSD-3 |
| `momepy` | 0.11.x | Morphometric analysis | BSD-3 |
| `libpysal` | 4.14.x | Spatial weights for diversity | BSD-3 |
| `osmnx` | 2.1.x | OSM data extraction | MIT |
| `neatnet` | 0.2.x | Street network simplification | BSD-3 |
| `shapely` | 2.1.x | Geometry operations | BSD-3 |

---

## 13. Implementation Phases

### Phase 1: Metric Computation Engine (Session 1)

**Goal**: All 51 metrics compute correctly for Barcelona Eixample.

1. Import MapShell from `@collage/map-template`
2. Implement Tier 1 metric functions (dimension, shape, orientation, spacematrix, network topology)
3. Implement Tier 2 Web Worker (street alignment, inter-building distance, adjacency, height distribution, betweenness)
4. Wire extraction result → Tier 1 (main thread) → Tier 2 (worker) → store
5. Verify: extract Barcelona Eixample, check all 51 metric values are plausible
6. Build Spacematrix card with GSI/FSI/OSR/L and type classification
7. Verify: Barcelona classifies as "Mid-rise Dense" with GSI ≈ 0.37, FSI ≈ 1.89

**Exit criteria**: All 51 metrics compute without errors. Spacematrix values match B1 reference.

### Phase 2: Metric Visualization (Session 2)

**Goal**: Building choropleth, tessellation view, and metric switching work.

1. Implement building-to-color mapping via `MetricColorizer` + `BuildingMesh.colorByMetric()`
2. Add tessellation layer to MapLibre with data-driven fill coloring
3. Build view mode toggle (Building / Tessellation)
4. Implement metric selection → automatic view switching (building metrics → building view, cell metrics → tessellation view)
5. Build metric browser sidebar with 6 collapsible categories
6. Wire metric selection to map coloring — verify instant switching (<200ms)
7. Add color ramp legend (bottom-right)
8. Add street coloring for N5 (canyon H/W), N6 (setback), N7 (betweenness)

**Exit criteria**: Selecting any metric instantly recolors the map. Tessellation view works.

### Phase 3: Statistics and Comparison (Session 3)

**Goal**: Histogram, building tooltip, pin-and-compare.

1. Build histogram component (20-bin SVG bar chart + summary stats)
2. Wire to active metric — histogram updates on metric switch
3. Build building hover tooltip showing top 8 metrics
4. Implement building pin/unpin on click
5. Build comparison panel (side-by-side table for 2 pinned buildings)
6. Polish Spacematrix card: add population, dwelling units, land use mix
7. Test across 3 cities: Barcelona, Prague, Phoenix

**Exit criteria**: Histogram and comparison panel work. Metrics plausible across 3+ cities.

---

## 14. Success Criteria and Manual Testing Plan

### 14.1 Success Criteria

| # | Criterion | Target | How to Verify |
|---|-----------|--------|--------------|
| SC1 | All 51 metrics compute | No NaN/undefined values | Console: check all metrics for all buildings |
| SC2 | Tier 1 total time | <200ms for 500 buildings | Console timer log |
| SC3 | Tier 2 total time | <5s for 500 buildings | Console timer log |
| SC4 | Building color switching | <200ms between metrics | Visual: no perceptible lag on click |
| SC5 | Tessellation view renders | Cells visible with metric coloring | Visual: toggle to tessellation view |
| SC6 | Spacematrix Barcelona | GSI ≈ 0.37, FSI ≈ 1.89 (±20%) | Check Spacematrix card values |
| SC7 | Spacematrix type | Barcelona = "Mid-rise Dense" | Check type label |
| SC8 | Histogram accuracy | Reflects actual value distribution | Compare histogram shape to raw values |
| SC9 | Building comparison | Two pinned buildings show all metrics | Pin two buildings, check table |
| SC10 | Multi-city validity | Works for Barcelona, Prague, Phoenix | Extract 3 different cities |
| SC11 | Color ramp legends | All displayed metrics have legend | Visual inspection per metric |
| SC12 | Building hover tooltip | Shows key metrics on hover | Hover 5 buildings, check values |

### 14.2 Manual Testing Procedure

**Test Location**: Barcelona Eixample (lat: 41.39, lng: 2.17) — dense grid with consistent building heights, well-studied morphology with known Spacematrix values.

**Pre-requisites**: Python backend running (`uvicorn main:app --port 8000`), prototype dev server running (`pnpm dev`).

#### Test 1: Extraction and Default View
1. Open prototype at `http://localhost:5174` (P2 port)
2. Verify default map shows Barcelona area in 3D
3. Click "Scan Area", draw rectangle ~500m × 500m in Eixample grid
4. Verify progress bar appears during extraction (~60s)
5. Verify buildings appear as 3D colored by height (default metric)
6. Verify Spacematrix card shows GSI ≈ 0.37, FSI ≈ 1.89, L ≈ 5.1
7. Verify type classification shows "Mid-rise Dense"
8. Check console for metric computation times: Tier 1 <200ms, Tier 2 <5s

#### Test 2: Metric Browsing
1. Expand "Shape" category in sidebar
2. Click "Elongation" — buildings should recolor instantly
3. Verify: Barcelona's rectangular grid buildings should show low elongation (blue = near 1.0)
4. Click "Courtyard Index" — buildings with interior courtyards should light up (Barcelona Eixample has many)
5. Expand "Spatial Distribution", click "Street Alignment"
6. Verify: grid-aligned buildings show low deviation (green), irregular buildings show high (red)
7. Click through all 6 categories, selecting at least one metric per category
8. Verify: no metric produces errors or all-grey buildings

#### Test 3: Tessellation View
1. Click "Coverage Ratio" under Dimension category
2. Verify: view switches to tessellation, buildings become ghost (15% opacity)
3. Verify: tessellation cells show color variation (some cells more built-up than others)
4. Click "Cell Alignment" — tessellation recolors
5. Toggle back to Building view manually — buildings return to full opacity
6. Click a building metric (e.g., "Height") — view auto-switches to building view

#### Test 4: Histogram and Statistics
1. Select "Compactness" metric
2. Verify: histogram appears in sidebar showing bell-curve-like distribution
3. Check stats: mean ≈ 0.5–0.7, std > 0, count = 500
4. Select "Height" — histogram should show different distribution
5. Select "Corners" — histogram should be right-skewed (most buildings have 4+ corners)
6. Verify mean/median/std values are plausible for each metric

#### Test 5: Building Comparison
1. Click building A — sidebar shows its metrics, building highlighted
2. Click building B — comparison table appears with both buildings
3. Verify: all computed metrics shown for both buildings
4. Values should differ between buildings (area, height, shape, etc.)
5. Click building A again — unpins, comparison panel disappears
6. Click "Clear Selection" — both unpinned

#### Test 6: Multi-City Validation
1. Navigate to Prague Old Town (lat: 50.087, lng: 14.421)
2. Extract ~500m × 500m area
3. Verify: buildings render, metrics compute, Spacematrix shows different values (likely "Mid-rise Compact" or similar)
4. Check metric distributions differ from Barcelona (more irregular shapes, lower GSI)
5. Navigate to Phoenix (lat: 33.45, lng: -112.07), extract suburban area
6. Verify: "Low-rise Sprawl" or similar classification, much lower FSI/GSI

---

## Implications for Collage Earth

1. **P2 validates the full morphometric analysis pipeline.** If 51 metrics compute and display correctly from OSM data alone, the platform's core analytical capability is confirmed. The tiered architecture (36 instant + 9 worker + 6 server) enables reactive editing — changing a building triggers all metrics to recompute in ~109ms.

2. **The metric browser UX determines platform accessibility.** A 51-metric catalog is overwhelming without clear organization. The 6-category grouping with collapsible panels, instant color switching, and histogram distributions makes this manageable. If the prototype feels intuitive, this UX pattern scales to 100+ metrics in the full platform.

3. **Tessellation is the enabling layer.** Coverage ratio, cell alignment, and spatial diversity metrics all require morphological tessellation. The C1 spike validated performance (~5s for 500 buildings with parallelization), and the enclosure-local incremental update approach (~211ms) enables near-interactive re-tessellation on building edit.

4. **Building comparison is critical for the fragment workflow.** P4 (fragment prototype) relies on the ability to compare metric profiles between different areas. P2's pin-and-compare UX validates this interaction pattern before P4 adds the complexity of extraction and relocation.

5. **Performance headroom supports scaling.** At ~109ms for 500 buildings (29× under budget), the architecture can handle 2000+ buildings before hitting any performance ceiling. The main scaling bottleneck will be the Python extraction pipeline (~60s), not the client-side metric computation.

## Open Questions

1. **Adjacency detection accuracy.** C4 discovered that centroid-based proximity fails for Barcelona Eixample. This plan uses bounding-box buffer overlap as a proxy, but accurate shared-wall detection requires Shapely-level geometry intersection (Tier 3 via momepy.shared_walls). The Tier 2 `adjacency_ratio` may be a coarse approximation.

2. **Histogram for aggregate metrics.** Intensity/Spacematrix metrics (FSI, GSI) are area-wide aggregates with a single value, not a per-building distribution. The histogram panel needs a graceful fallback for these — either showing the scalar value prominently or computing per-tessellation-cell variants of these metrics.

3. **Tessellation cell vs. building count mismatch.** C1 showed that enclosed_tessellation produces more cells than buildings (3,299 cells for 500 buildings in Barcelona) because empty enclosures get cells. Per-cell metric distributions will include these empty cells, which may skew histograms. Consider filtering to cells with buildings for per-cell histograms.

4. **Metric normalization for cross-city comparison.** Many metrics (area, volume, perimeter) are absolute values that differ dramatically between cities. For meaningful comparison, relative metrics (shape ratios, densities) are more useful. The metric browser should indicate which metrics are "comparable" across cities and which are "absolute."

5. **Vertex count and Turf.js precision.** GeoJSON coordinates use WGS84 (degrees), and distance calculations via `turfDistance` use the Haversine formula. For sub-meter-precision metrics (squareness, centroid-corner distance), this is adequate, but for vertex-level operations (shared walls), the coordinate precision may introduce errors. Tier 3 Python metrics use projected CRS (UTM) which avoids this issue.

## Overall Conclusion

P2 is implementable in approximately 3 AI agent sessions, building on the shared map template and Python backend. The 51 metrics span three computation tiers: 36 instant Tier 1 metrics (~8ms, main thread), 9 interactive Tier 2 metrics (~90ms, Web Worker), and 6 extraction-time Tier 3 metrics (~15s, Python). The total client-side pipeline of ~109ms for 500 buildings (validated by C4 spike at 102.98ms) enables "recompute everything on every change" as the default strategy, eliminating the need for dirty-tracking infrastructure. The main UI challenges are managing 51 metrics in a comprehensible interface (solved by the 6-category browser with histogram) and the building-to-tessellation view toggle (which auto-switches based on metric type). The key risk is minimal — C4 validated every Tier 1 and Tier 2 metric, C1 validated tessellation performance, and the remaining Tier 3 metrics use well-tested momepy functions.

## Sources

[1] Finding #04 — Momepy Comprehensive Metric Catalog. `findings/04-momepy-comprehensive-metric-catalog.md`

[2] Finding #07 — Analysis Input Requirements Mapping. `findings/07-analysis-input-requirements-mapping.md`

[3] Spike C4 — Metric Computation Performance Budget. `collage-spike-c4/spikes/c4-metric-performance/FINDINGS.md`

[4] Spike C1 — Morphological Tessellation Performance & Robustness. `collage-spike-c1/spikes/c1-tessellation/FINDINGS.md`

[5] Finding #83 — Design of All 5 Prototypes and Shared Infrastructure. `findings/83-prototype-designs.md`

[6] Finding #82 — Final Spike Synthesis and Build-Readiness Assessment. `findings/82-final-spike-synthesis.md`

[7] momepy API reference. http://docs.momepy.org/en/stable/api.html

[8] Turf.js documentation. https://turfjs.org/

[9] Flatbush — Fast static spatial index. https://github.com/mourner/flatbush

[10] Graphology — JavaScript graph library. https://graphology.github.io/

[11] Berghauser Pont, M. and Haupt, P. (2010). *Spacematrix: Space, Density and Urban Form.* NAi Publishers.

[12] Fleischmann, M., Feliciotti, A., Romice, O., and Porta, S. (2020). "Morphological tessellation as a way of partitioning space." *Computers, Environment and Urban Systems*, 80, 101441.

[13] momepy 0.11 documentation — enclosed_tessellation. http://docs.momepy.org/en/latest/api/momepy.enclosed_tessellation.html
