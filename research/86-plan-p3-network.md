# §18.4 — Detailed Implementation Plan: P3 Network & Space Syntax Analysis

## Abstract

This document provides the complete implementation plan for P3, the network and space syntax analysis prototype. P3 validates the workflow: select an area (max 5 km²) → extract street network → compute space syntax centralities (NAIN/NACH at 4 radii via cityseer) and connectivity metrics → visualize as colored line layers → generate walking isochrones on click. The plan specifies every metric with its computation method, library, display approach, and performance budget; details the maximum area sizing rationale; designs the MapLibre data-driven line visualization and isochrone rendering; covers the neatnet before/after comparison; and defines success criteria with a manual testing plan. Every performance number traces to a validated spike finding (C3 for space syntax, K3 for network merging and isochrones, C4 for client-side metrics, B1 for extraction and neatnet).

## Introduction

P3 is the most network-focused of the five prototypes — it exercises the full space syntax pipeline (cityseer NAIN/NACH at multiple radii) and graph-level connectivity metrics. Unlike P1 (heavy Three.js raycasting) or P2 (breadth of 51 metrics), P3's challenge is large-area extraction (5 km² — 5× bigger than other prototypes), fast multi-radius centrality computation, and clear line-based visualization that makes network structure readable to non-specialists.

The prototype serves two research questions:
1. **Can space syntax centralities computed from OSM data reveal meaningful urban structure?** This validates the cityseer-based NAIN/NACH pipeline from finding #05 and spike C3 — specifically that the pre-computed values correctly identify high-integration streets (main roads, through-routes) versus low-integration backstreets.
2. **Does a radius-toggle + isochrone UX make network analysis intuitive?** This validates whether non-specialists can understand how different radii (400m local, 800m neighborhood, 1600m district, 10000m city) shift emphasis between local shops and highway corridors — the core insight of multi-scale space syntax.

### Key References

| Reference | Content | Used For |
|-----------|---------|----------|
| Finding #05 | Space syntax practical implementation | Library comparison, cityseer recommendation, angular centrality theory |
| Finding #09 | Walkability, connectivity, accessibility | Isochrone methods, network metrics, Frank Walkability Index |
| Spike C3 | Space syntax implementation comparison | cityseer performance (1.7s at 1000 segments, all radii), AGPL mitigation, value ranges |
| Spike K3 | Network merging and isochrones | Isochrone computation (0.011s via Dijkstra), neatnet API (`neatify()`), merge strategies |
| Spike C4 | Metric computation performance | Client-side Graphology metrics (betweenness 43ms, topology 2.9ms) |
| Spike B1 | OSM extraction pipeline | neatnet simplification (58–95% reduction), extraction timing (10–131s) |
| Finding #83 | P3 prototype design | User workflow, UI layout, success criteria |

---

## 1. Complete Metric List

P3 implements 12 metrics organized into three groups: space syntax centralities (server-side via cityseer), graph topology metrics (client-side via Graphology), and walkability/isochrone metrics (server-side via NetworkX Dijkstra). Each metric specifies: computation location, library, input requirements, display approach, and performance budget.

### Metric Tier Definitions

| Tier | Location | Budget | Trigger | UX |
|------|----------|--------|---------|-----|
| 1 | TS client (Graphology) | <100ms total | Instant on data load | Immediate recoloring |
| 2 | TS client (Graphology Worker) | <200ms total | Background compute on data load | Available within seconds |
| 3 | Python backend (cityseer) | <10s | Computed during extraction pipeline | Available when extraction completes |
| On-demand | Python backend (NetworkX) | <1s per click | User click triggers | Isochrone appears after click |

### 1.1 Space Syntax Centralities (Server-Side, cityseer)

These are the core metrics that make P3 distinctive. cityseer computes angular (simplest-path) centralities on the primal graph at all requested radii simultaneously in Rust. Values are pre-computed during extraction and stored as properties on the GeoJSON street features returned to the client.

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| SS1 | **NAIN R400** (Normalized Angular Integration, 400m) | Python backend (cityseer) | 3 | Neatnet-simplified street network, EPSG:UTM | Per-segment line color, 0–1.2 scale, `viridis` ramp | All 4 radii computed simultaneously |
| SS2 | **NAIN R800** (800m radius) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — (included in SS1 call) |
| SS3 | **NAIN R1600** (1600m radius) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — |
| SS4 | **NAIN R10000** (10000m / ~global radius) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — |
| SS5 | **NACH R400** (Normalized Angular Choice, 400m) | Python backend (cityseer) | 3 | Same | Per-segment line color, 0–1.5 scale, `magma` ramp | — |
| SS6 | **NACH R800** (800m radius) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — |
| SS7 | **NACH R1600** (1600m radius) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — |
| SS8 | **NACH R10000** (10000m / ~global) | Python backend (cityseer) | 3 | Same | Per-segment line color, same ramp | — |

**cityseer API call:**
```python
from cityseer.metrics import networks
from cityseer.tools import io, graphs

# Convert neatnet-simplified GeoDataFrame to cityseer graph
G_nx = io.nx_from_generic_geopandas(streets_gdf)
G_nx = graphs.nx_remove_filler_nodes(G_nx)
G_nx = graphs.nx_remove_dangling_nodes(G_nx, despine=15)
nodes_gdf, edges_gdf, network_structure = io.network_structure_from_nx(G_nx)

# Compute all radii simultaneously — ~1.7s for 1000 segments [C3]
nodes_gdf = networks.node_centrality_simplest(
    network_structure,
    nodes_gdf,
    distances=[400, 800, 1600, 10000],
    compute_closeness=True,   # → NAIN (angular farness → integration)
    compute_betweenness=True,  # → NACH (angular choice)
    jitter_scale=0.01,         # Small jitter for rectilinear grids
)
```

**Output columns** (per radius `d`):
- `cc_metric_node_simplest_closeness_{d}` → used as NAIN proxy
- `cc_metric_node_simplest_betweenness_{d}` → used as NACH proxy

**NAIN/NACH derivation from cityseer output:**
- cityseer's closeness output is angular farness-based. The C3 spike confirmed NAIN values in range 0.1–1.1 — within the expected published range. Use cityseer's closeness directly as the NAIN proxy (higher = more integrated).
- cityseer's betweenness output corresponds to angular choice. NACH values in range 0–1.4 [C3]. Use directly as NACH proxy (higher = more through-movement).

**Mapping to segments:** cityseer outputs per-node (intersection) values. To color line segments, each segment is assigned the mean of its two endpoint node values. This is standard practice — the segment inherits the average integration of its junctions.

**Performance budget [C3]:**

| Network Size (input segments) | cityseer Nodes | Time (4 radii simultaneous) |
|-------------------------------|---------------|----------------------------|
| 200 | 71 | 1.16s |
| 500 | 178 | 1.35s |
| 1,000 | 368 | 1.75s |
| 2,000 | ~700 (estimated) | ~3s (estimated, O(V²) Rust) |
| 5,000 | ~1,800 (estimated) | ~8s (estimated) |

**5 km² area estimate:** A 5 km² urban area typically yields 2,000–5,000 raw OSMnx street segments. After neatnet simplification (58–95% reduction [B1]), this drops to ~200–2,000 simplified segments, producing ~80–700 cityseer nodes. This fits well within the <10s budget.

### 1.2 Graph Topology Metrics (Client-Side, Graphology)

These metrics are computed instantly on the client from the street network GeoJSON, using the Graphology library. They describe the overall structure of the network (not per-segment centrality).

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| GT1 | **Intersection density** (per km²) | TS client (Graphology) | 1 | Node coordinates, area | Aggregate badge in sidebar | <3ms [C4] |
| GT2 | **Meshedness coefficient** | TS client (Graphology) | 1 | Edge count (e), node count (v): `(e-v+1)/(2v-5)` | Aggregate badge in sidebar | <3ms [C4] |
| GT3 | **Dead-end ratio** | TS client (Graphology) | 1 | Count degree-1 nodes / total nodes | Aggregate badge in sidebar | <3ms [C4] |
| GT4 | **Four-way intersection proportion** | TS client (Graphology) | 1 | Count degree-4+ nodes / total intersections | Aggregate badge in sidebar | <3ms [C4] |
| GT5 | **Link-node ratio** | TS client (Graphology) | 1 | Edges / nodes | Aggregate badge in sidebar | <1ms |
| GT6 | **Mean segment length** (m) | TS client (Graphology) | 1 | Sum of edge lengths / edge count | Aggregate badge in sidebar | <1ms |

**Graphology construction:** Build a Graphology graph from the street GeoJSON features:
```typescript
import Graph from 'graphology';

const graph = new Graph({ multi: false, type: 'undirected' });
// Each GeoJSON LineString feature → one edge
// Endpoints (rounded to ~1m) → nodes
for (const feature of streetFeatures) {
  const coords = feature.geometry.coordinates;
  const startKey = `${coords[0][0].toFixed(5)},${coords[0][1].toFixed(5)}`;
  const endKey = `${coords[coords.length-1][0].toFixed(5)},${coords[coords.length-1][1].toFixed(5)}`;
  if (!graph.hasNode(startKey)) graph.addNode(startKey, { x: coords[0][0], y: coords[0][1] });
  if (!graph.hasNode(endKey)) graph.addNode(endKey, { x: coords[coords.length-1][0], y: coords[coords.length-1][1] });
  if (!graph.hasEdge(startKey, endKey)) {
    graph.addEdge(startKey, endKey, { length: feature.properties.length_m });
  }
}
```

**Metric computations:**
```typescript
// GT1: Intersection density
const intersections = graph.filterNodes((_, attr) => graph.degree(_) >= 3);
const intersectionDensity = intersections.length / areaSqKm;

// GT2: Meshedness
const e = graph.size;  // edge count
const v = graph.order; // node count
const meshedness = (e - v + 1) / (2 * v - 5);

// GT3: Dead-end ratio
const deadEnds = graph.filterNodes((_, attr) => graph.degree(_) === 1);
const deadEndRatio = deadEnds.length / v;

// GT4: Four-way proportion
const fourWay = graph.filterNodes((_, attr) => graph.degree(_) >= 4);
const fourWayProportion = fourWay.length / intersections.length;

// GT5: Link-node ratio
const linkNodeRatio = e / v;

// GT6: Mean segment length
const totalLength = graph.reduceEdges((acc, _, attr) => acc + attr.length, 0);
const meanSegmentLength = totalLength / e;
```

**Total Tier 1 time: <10ms** for networks up to 5,000 segments [C4: topology metrics at 2.9ms for 849 nodes].

### 1.3 Client-Side Betweenness (Optional, Graphology Worker)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| BW1 | **Betweenness centrality** (shortest-path) | TS Worker (Graphology) | 2 | Graphology graph, edge length weights | Per-segment line color, `blues` ramp | ~43ms at 849 nodes [C4] |

This provides a complementary view to cityseer's angular NAIN/NACH. Shortest-path betweenness captures a different aspect of network importance — segments that lie on the shortest metric paths (not the straightest angular paths).

**Implementation:**
```typescript
import { betweennessCentrality } from 'graphology-metrics/centrality/betweenness';

// Runs in Web Worker to avoid blocking UI
// 50-node sample for approximation [C4]
const centrality = betweennessCentrality(graph, {
  getEdgeWeight: 'length',
  normalized: true,
});
```

**Performance at scale:** C4 spike measured 43ms for Brandes BFS on 849 nodes with 50-node sampling. For a 5 km² area with ~1,800 cityseer nodes (after neatnet), the Graphology graph will have ~1,500–3,000 nodes. At this scale, approximate betweenness (100-node sample) should complete in <200ms. If it exceeds 500ms, reduce sample size or omit entirely — cityseer NACH already provides angular betweenness.

### 1.4 Walking Isochrones (On-Demand, Server-Side)

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| ISO1 | **5-minute walking isochrone** | Python backend (NetworkX) | On-demand | Click point (lat/lng), merged graph, speed=5 km/h | Translucent fill polygon on map | <1s [K3: 0.011s Dijkstra] |
| ISO2 | **10-minute walking isochrone** | Python backend (NetworkX) | On-demand | Same | Translucent fill polygon (larger) | <1s |
| ISO3 | **15-minute walking isochrone** | Python backend (NetworkX) | On-demand | Same | Translucent fill polygon (largest) | <1s |

**Computation approach [K3]:**
1. User clicks a point on the map
2. Frontend sends `POST /network/isochrone` with `{lat, lng, network_id}`
3. Backend snaps click point to nearest network node (KD-tree, <1ms)
4. Dijkstra single-source shortest path from snap node, edge `length` as weight
5. Walking speed = 5 km/h = 83.3 m/min → 5-min threshold = 416m, 10-min = 833m, 15-min = 1249m
6. Collect all nodes reachable within each threshold
7. Generate polygon hull from reachable node coordinates
8. Return 3 GeoJSON polygons to frontend

**Hull generation:** Use `shapely.concave_hull` (Shapely 2.x) with `ratio=0.3` for a tighter, more realistic isochrone shape than convex hull. K3 spike used convex hull which overestimates reachable area; concave hull is more accurate for complex urban networks. Fallback to convex hull if concave hull fails (can happen with very few points at small radii).

```python
from shapely import concave_hull, MultiPoint

def isochrone_polygon(reachable_nodes: list[tuple[float, float]], ratio: float = 0.3):
    """Generate isochrone polygon from reachable node coordinates."""
    points = MultiPoint(reachable_nodes)
    if len(reachable_nodes) < 4:
        return points.convex_hull
    hull = concave_hull(points, ratio=ratio)
    if hull.is_empty:
        return points.convex_hull
    return hull
```

**Performance [K3]:**
- Dijkstra on 1,993-node graph: 0.011s
- Estimated on 3,000-node graph: ~0.02s
- Hull generation: ~0.005s
- Network round-trip overhead: ~50ms
- **Total per click: <100ms** (well under 1s budget)

---

## 2. Maximum Area Sizing

P3 has a 5 km² maximum area — 5× larger than P1/P2/P4 — because space syntax analysis requires a larger context to be meaningful. NAIN/NACH at R1600 and R10000 radii need a network that extends well beyond the focal area to avoid boundary roll-off effects.

### 2.1 Sizing Rationale

**cityseer scaling analysis [C3]:**

| Input Segments | After neatnet (est.) | cityseer Nodes | cityseer Time (4 radii) |
|---------------|---------------------|---------------|------------------------|
| 1,000 | ~200–400 | ~80–200 | ~1.2–1.5s |
| 2,000 | ~400–800 | ~150–350 | ~1.5–2.5s |
| 5,000 | ~500–2,000 | ~200–700 | ~2–5s |
| 10,000 | ~1,000–4,000 | ~400–1,500 | ~4–10s |

cityseer scales as O(V²) in the Rust backend. At 1,500 nodes (upper end for 5 km²), estimated time is ~6–8s — comfortably under the 10s budget.

**Extraction scaling [B1]:**

| Area | Est. Raw Segments | neatnet Reduction | Simplified Segments | neatnet Time |
|------|------------------|-------------------|--------------------|----|
| 1 km² | 1,000–3,000 | 60–95% | 100–1,000 | 5–15s |
| 5 km² | 5,000–15,000 | 60–95% | 500–5,000 | 15–60s |
| 10 km² | 10,000–30,000 | 60–95% | 1,000–10,000 | 30–120s |

**At 5 km²:** neatnet time of 15–60s is the bottleneck, not cityseer. Total extraction pipeline (OSMnx + neatnet + cityseer): ~30–120s. This fits within a 3-minute budget with a progress indicator.

### 2.2 Boundary Buffer Strategy

cityseer documentation recommends buffering the network by a distance equal to the maximum distance threshold to avoid boundary roll-off effects [cityseer docs]. For P3 with R10000 as the maximum radius, a full 10 km buffer is impractical.

**Pragmatic approach:**
1. Extract a network 1 km larger than the user's selected bbox on each side (i.e., total area is ~(sqrt(5)+2)² ≈ 16 km² of raw network)
2. Compute cityseer centralities on the full buffered network
3. Return only the segments within the user's original bbox, but with centrality values computed from the wider context
4. This provides ~1 km buffer for R400/R800 (sufficient), partial buffer for R1600 (adequate), and minimal buffer for R10000 (boundary effects visible but tolerable for a prototype)

**Implementation:**
```python
# User selects bbox → extract with buffer
buffer_m = 1000  # 1 km buffer
buffered_bbox = (
    bbox[0] - buffer_m / 111320,  # lon offset (approximate)
    bbox[1] - buffer_m / 110540,  # lat offset (approximate)
    bbox[2] + buffer_m / 111320,
    bbox[3] + buffer_m / 110540,
)
# Extract full network within buffered_bbox
# Compute cityseer on full network
# Filter segments to return only those within original bbox
```

The 1 km buffer increases extraction area from ~5 km² to ~16 km², roughly tripling the raw segment count. After neatnet simplification, this is still manageable (~2,000–6,000 simplified segments → ~800–2,500 cityseer nodes → ~3–8s compute time).

---

## 3. Network Visualization via MapLibre Line Layers

The primary visualization in P3 is colored line segments on the map. Unlike P1/P2 which rely heavily on Three.js for 3D building rendering, P3's core visualization is 2D line layers — a strength of MapLibre's data-driven styling system.

### 3.1 Street Network Source

The street network is loaded as a single GeoJSON source with all metric values as properties on each LineString feature:

```typescript
map.addSource('streets', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: streetFeatures.map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: f.properties.id,
        length_m: f.properties.length_m,
        // cityseer NAIN/NACH at 4 radii (mapped from endpoints)
        nain_400: f.properties.nain_400,
        nain_800: f.properties.nain_800,
        nain_1600: f.properties.nain_1600,
        nain_10000: f.properties.nain_10000,
        nach_400: f.properties.nach_400,
        nach_800: f.properties.nach_800,
        nach_1600: f.properties.nach_1600,
        nach_10000: f.properties.nach_10000,
        // Client-side betweenness (added after Graphology compute)
        betweenness: f.properties.betweenness ?? null,
        // Network classification
        is_raw: false,  // neatnet-simplified
      },
    })),
  },
});
```

### 3.2 Active Metric Line Layer

A single MapLibre line layer renders the network colored by the currently active metric:

```typescript
function updateNetworkLayer(metricKey: string, domain: [number, number], rampName: string) {
  const ramp = COLOR_RAMPS[rampName]; // e.g., viridis stops

  map.setPaintProperty('network-active', 'line-color', [
    'case',
    ['==', ['get', metricKey], null], '#808080',  // grey for missing data
    [
      'interpolate', ['linear'],
      ['get', metricKey],
      domain[0], ramp.stops[0],   // low value → cool color
      domain[0] + (domain[1] - domain[0]) * 0.25, ramp.stops[1],
      domain[0] + (domain[1] - domain[0]) * 0.50, ramp.stops[2],
      domain[0] + (domain[1] - domain[0]) * 0.75, ramp.stops[3],
      domain[1], ramp.stops[4],   // high value → warm color
    ],
  ]);

  // Width scales with zoom for readability
  map.setPaintProperty('network-active', 'line-width', [
    'interpolate', ['linear'], ['zoom'],
    12, 1.5,   // thin at district zoom
    14, 3,     // medium at neighborhood zoom
    16, 5,     // thick at street zoom
  ]);
}
```

**Color ramps by metric type:**

| Metric Group | Color Ramp | Rationale |
|-------------|-----------|-----------|
| NAIN (integration) | `viridis` (blue→yellow→green) | Perceptually uniform, standard for continuous data |
| NACH (choice) | `magma` (black→purple→orange→yellow) | Distinct from NAIN, highlights high-choice corridors |
| Betweenness | `blues` (light→dark blue) | Cool palette, distinguishable from NAIN/NACH |
| Raw OSM / neatnet comparison | `#6699cc` (raw) / `#cc3333` (simplified) | Fixed colors for before/after |

### 3.3 Line Width by Metric Value (Optional Enhancement)

For NACH (choice/through-movement), line width can encode the metric value in addition to color, creating a "desire line" effect where heavily-used routes appear thicker:

```typescript
// Optional: width varies by NACH value
map.setPaintProperty('network-active', 'line-width', [
  'interpolate', ['linear'],
  ['get', activeMetricKey],
  domain[0], 1,    // thin for low values
  domain[1], 6,    // thick for high values
]);
```

This should be a toggle ("Scale width by value") — it's very effective for NACH but less meaningful for NAIN.

### 3.4 Performance Considerations

MapLibre's data-driven line styling performs well with GeoJSON sources up to ~10,000 features. For P3 at 5 km²:

| Scenario | Estimated Features | Expected Performance |
|----------|-------------------|---------------------|
| Dense urban (Barcelona) | 500–2,000 simplified segments | Smooth (60 FPS) |
| Medium urban (London) | 1,000–4,000 simplified segments | Smooth (60 FPS) |
| Sparse suburban (Houston) | 200–500 simplified segments | Smooth (60 FPS) |
| Raw OSM layer (before neatnet) | 5,000–15,000 segments | Potentially 30-40 FPS at high zoom |

The raw OSM layer (for before/after comparison) may have 10,000+ features. To handle this:
- Load raw OSM as a separate GeoJSON source
- Default to hidden; toggle on for comparison
- Use `line-simplification` at low zoom to reduce vertex count
- If needed, convert to vector tiles via the `promoteId` approach, but GeoJSON should be sufficient for prototype

### 3.5 Segment Hover and Click

```typescript
// Hover: highlight segment + show tooltip
map.on('mousemove', 'network-active', (e) => {
  if (e.features?.length) {
    const f = e.features[0];
    // Highlight: set a feature-state for the hovered segment
    map.setFeatureState({ source: 'streets', id: f.id }, { hover: true });
    // Tooltip: show metric values
    showTooltip(e.lngLat, {
      length: f.properties.length_m,
      [activeMetric]: f.properties[activeMetricKey],
      nain_800: f.properties.nain_800,
      nach_800: f.properties.nach_800,
    });
  }
});

// Click: trigger isochrone from nearest node
map.on('click', 'network-active', (e) => {
  const lngLat = e.lngLat;
  generateIsochrone(lngLat.lng, lngLat.lat);
});
```

**Hover highlight:** Use MapLibre feature-state with a paint expression:
```typescript
'line-color': [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  '#ffffff',  // white highlight on hover
  // ... normal color expression
],
'line-width': [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  6,  // thicker on hover
  // ... normal width expression
],
```

---

## 4. Isochrone Rendering

### 4.1 Isochrone Polygons on Map

Isochrones are rendered as translucent fill layers on the map, using MapLibre fill layers (not Three.js — isochrones are 2D).

```typescript
// Three concentric isochrone polygons
const ISOCHRONE_COLORS = {
  5: { fill: 'rgba(46, 204, 113, 0.15)', stroke: '#2ecc71' },   // green (5 min)
  10: { fill: 'rgba(52, 152, 219, 0.12)', stroke: '#3498db' },  // blue (10 min)
  15: { fill: 'rgba(155, 89, 182, 0.10)', stroke: '#9b59b6' },  // purple (15 min)
};

function renderIsochrones(polygons: Record<number, GeoJSON.Feature>) {
  for (const [minutes, feature] of Object.entries(polygons)) {
    const colors = ISOCHRONE_COLORS[minutes];
    map.addSource(`isochrone-${minutes}`, { type: 'geojson', data: feature });
    map.addLayer({
      id: `isochrone-fill-${minutes}`,
      type: 'fill',
      source: `isochrone-${minutes}`,
      paint: { 'fill-color': colors.fill },
    });
    map.addLayer({
      id: `isochrone-outline-${minutes}`,
      type: 'line',
      source: `isochrone-${minutes}`,
      paint: {
        'line-color': colors.stroke,
        'line-width': 2,
        'line-dasharray': [4, 2],
      },
    });
  }
}
```

### 4.2 Isochrone Pin Marker

Place a pin at the click point showing the origin:
```typescript
// Marker at click point with label
const marker = new maplibregl.Marker({ color: '#e74c3c' })
  .setLngLat([lng, lat])
  .setPopup(new maplibregl.Popup().setHTML(
    `<strong>Walking isochrone</strong><br>
     5 min: ${stats[5].nodes} reachable nodes<br>
     10 min: ${stats[10].nodes} reachable nodes<br>
     15 min: ${stats[15].nodes} reachable nodes`
  ))
  .addTo(map);
```

### 4.3 Clearing Isochrones

Only one set of isochrones visible at a time. Clicking a new point replaces the previous isochrone. A "Clear isochrone" button in the sidebar removes the current one.

---

## 5. neatnet Before/After Comparison

### 5.1 Purpose

The neatnet simplification step (B1 spike) reduces raw OSMnx networks by 58–95% while preserving topology. P3 should visualize this to validate that simplification doesn't destroy important network structure — and to demonstrate the necessity of simplification for space syntax (cityseer operates on simplified networks).

### 5.2 Implementation

Two separate GeoJSON sources and line layers:

```typescript
// Raw OSM network (hidden by default)
map.addSource('streets-raw', { type: 'geojson', data: rawStreetFeatures });
map.addLayer({
  id: 'network-raw',
  type: 'line',
  source: 'streets-raw',
  paint: {
    'line-color': '#6699cc',  // steel blue
    'line-width': 1.5,
    'line-opacity': 0.6,
  },
  layout: { visibility: 'none' },  // hidden by default
});

// Simplified network (visible, colored by active metric)
map.addSource('streets', { type: 'geojson', data: simplifiedStreetFeatures });
map.addLayer({
  id: 'network-active',
  type: 'line',
  source: 'streets',
  paint: { /* data-driven color from §3.2 */ },
});
```

### 5.3 Comparison Statistics

When the raw OSM layer is toggled on, the sidebar shows comparison statistics:

| Statistic | Raw OSM | Simplified | Reduction |
|-----------|---------|-----------|-----------|
| Edges | e.g., 9,820 | e.g., 517 | 94.7% |
| Total length (km) | e.g., 142 | e.g., 38 | 73.2% |
| Intersections | e.g., 4,200 | e.g., 289 | 93.1% |
| Connected components | e.g., 1 | e.g., 17* | — |

*Note: neatnet-simplified networks may have multiple connected components (B1 found 2–20 components across test cities). This is expected — disconnected components represent street segments separated by barriers (railways, rivers, parks).

### 5.4 neatnet API Call

```python
import neatnet

# neatnet v0.1.5 API: use neatify(), not simplify() [K3]
simplified = neatnet.neatify(raw_streets_gdf)
```

**Performance [B1]:** 5–37s depending on edge count. Barcelona (9,820 edges): 32s. Lagos (1,347 edges): 5s.

---

## 6. 3D Buildings as Optional Context

### 6.1 Design Decision

P3 is a network prototype — streets are the primary visualization. 3D buildings are **optional context** that can be toggled on/off via the layer panel. The recommendation from finding #83: "include as optional context but network lines are primary."

### 6.2 Implementation

When buildings are toggled on, render using the shared `BuildingMeshManager` in `context` mode (InstancedMesh boxes — fast, low-detail):

```typescript
// Only if user toggles "Show buildings" in layer panel
if (showBuildings) {
  buildingMesh.setBuildings(buildings, 'context');
  buildingMesh.setOpacity(0.3);  // translucent so network lines are visible through them
}
```

**Performance:** InstancedMesh context mode renders 5,000 buildings in a single draw call [A6]. At 30% opacity, buildings provide spatial context without obscuring the network.

### 6.3 Building-Network Relationship

When a building metric is selected (not applicable in P3's core workflow), buildings remain grey and translucent. The building toggle exists solely for spatial orientation — "where are the buildings relative to the high-integration streets?"

---

## 7. Backend Endpoints

### 7.1 POST /extract (Modified for P3)

P3 requires a larger extraction area (5 km² + 1 km buffer) and different output than P1/P2. The `/extract` endpoint accepts a `mode` parameter:

```python
@router.post("/extract")
async def extract(request: ExtractionRequest):
    """
    request.bbox: [west, south, east, north]
    request.mode: "full" | "network_only"
    request.buffer_m: 1000  (default for P3)
    """
    if request.mode == "network_only":
        # P3 mode: extract streets only (optional buildings)
        # Step 1: Buffer bbox
        buffered_bbox = buffer_bbox(request.bbox, request.buffer_m)
        # Step 2: Extract street network via OSMnx
        G = ox.graph_from_bbox(bbox=buffered_bbox, network_type="walk")
        streets_raw = ox.graph_to_gdfs(G, nodes=False)
        # Step 3: neatnet simplification
        streets_simplified = neatnet.neatify(streets_raw)
        # Step 4: cityseer NAIN/NACH
        nain_nach = compute_space_syntax(streets_simplified, [400, 800, 1600, 10000])
        # Step 5: Assign cityseer node values to segments
        streets_with_metrics = assign_node_values_to_segments(streets_simplified, nain_nach)
        # Step 6: Filter to original bbox
        streets_in_bbox = filter_to_bbox(streets_with_metrics, request.bbox)
        raw_in_bbox = filter_to_bbox(streets_raw, request.bbox)
        # Step 7: Optional buildings
        buildings = extract_buildings(request.bbox) if request.include_buildings else None
        return {
            "streets": streets_in_bbox.to_json(),
            "streets_raw": raw_in_bbox.to_json(),
            "buildings": buildings.to_json() if buildings else None,
            "network_stats": compute_network_stats(streets_in_bbox),
        }
```

### 7.2 POST /space-syntax

Standalone endpoint for re-computing space syntax on a modified network (e.g., after adding/removing streets in a future editing mode):

```python
@router.post("/space-syntax")
async def space_syntax(request: SpaceSyntaxRequest):
    """
    request.streets_geojson: GeoJSON FeatureCollection of LineStrings
    request.radii: list[int] (default [400, 800, 1600, 10000])
    """
    streets_gdf = gpd.GeoDataFrame.from_features(request.streets_geojson)
    streets_gdf = streets_gdf.set_crs("EPSG:4326").to_crs(streets_gdf.estimate_utm_crs())

    nain_nach = compute_space_syntax(streets_gdf, request.radii)
    streets_with_metrics = assign_node_values_to_segments(streets_gdf, nain_nach)

    return {"streets": streets_with_metrics.to_crs("EPSG:4326").to_json()}
```

### 7.3 POST /network/isochrone

```python
@router.post("/network/isochrone")
async def isochrone(request: IsochroneRequest):
    """
    request.lat: float
    request.lng: float
    request.network_id: str  (cached network from extraction)
    request.minutes: list[int] (default [5, 10, 15])
    request.speed_kmh: float (default 5.0)
    """
    # Retrieve cached NetworkX graph
    G = get_cached_network(request.network_id)

    # Snap click point to nearest node (KD-tree)
    snap_node = snap_to_nearest_node(G, request.lat, request.lng)

    # Compute isochrones
    speed_m_per_min = request.speed_kmh * 1000 / 60  # 83.3 m/min
    results = {}

    for minutes in request.minutes:
        max_dist = speed_m_per_min * minutes
        # Dijkstra single-source shortest path
        distances = nx.single_source_dijkstra_path_length(G, snap_node, cutoff=max_dist, weight='length')
        reachable_coords = [(G.nodes[n]['x'], G.nodes[n]['y']) for n in distances.keys()]
        # Generate polygon
        polygon = isochrone_polygon(reachable_coords, ratio=0.3)
        results[minutes] = {
            "polygon": mapping(polygon),  # GeoJSON geometry
            "reachable_nodes": len(reachable_coords),
            "max_distance_m": max(distances.values()) if distances else 0,
        }

    return results
```

### 7.4 Network Caching

The extracted and simplified network graph is cached in memory (keyed by extraction bbox hash) so that isochrone requests don't re-extract. Cache eviction: LRU with 5-network limit.

```python
from functools import lru_cache
import hashlib

_network_cache: dict[str, nx.Graph] = {}

def cache_network(bbox: list[float], G: nx.Graph) -> str:
    """Cache network and return ID."""
    network_id = hashlib.md5(str(bbox).encode()).hexdigest()[:12]
    _network_cache[network_id] = G
    # Evict oldest if cache exceeds 5 entries
    if len(_network_cache) > 5:
        oldest_key = next(iter(_network_cache))
        del _network_cache[oldest_key]
    return network_id

def get_cached_network(network_id: str) -> nx.Graph:
    """Retrieve cached network."""
    if network_id not in _network_cache:
        raise HTTPException(404, "Network not found. Please re-extract.")
    return _network_cache[network_id]
```

---

## 8. UI Layout and Sidebar Design

### 8.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (300px)     │ │                                          ││
│ │              │ │  [Colored street network lines]           ││
│ │ ┌──────────┐ │ │  [Translucent 3D buildings if toggled]   ││
│ │ │ Metric   │ │ │  [Isochrone polygons if clicked]         ││
│ │ │ ○ NAIN   │ │ │                                          ││
│ │ │ ○ NACH   │ │ │                                          ││
│ │ │ ○ Betw.  │ │ │                                          ││
│ │ ├──────────┤ │ │       ┌───────────────┐                  ││
│ │ │ Radius   │ │ │       │ Color ramp    │                  ││
│ │ │ [400 ]   │ │ │       │ legend        │                  ││
│ │ │ [800 ]   │ │ │       │ min ──── max  │                  ││
│ │ │ [1600]   │ │ │       └───────────────┘                  ││
│ │ │ [10K ]   │ │ │                                          ││
│ │ ├──────────┤ │ │  ┌──────────────────────┐               ││
│ │ │ Network  │ │ │  │ Click map for        │ (hint)        ││
│ │ │ Stats    │ │ │  │ walking isochrone     │               ││
│ │ │ Edges:517│ │ │  └──────────────────────┘               ││
│ │ │ Nodes:289│ │ │                                          ││
│ │ │ Mesh:0.34│ │ │  ┌────────────────────────────────────┐  ││
│ │ │ Dead:12% │ │ │  │ Layer panel (bottom-left)          │  ││
│ │ │ Len:82m  │ │ │  └────────────────────────────────────┘  ││
│ │ │ IntDen:87│ │ │                                          ││
│ │ ├──────────┤ │ └──────────────────────────────────────────┘│
│ │ │ Layers   │ │                                             │
│ │ │ ☑ neatnet│ │                                             │
│ │ │ ☐ Raw OSM│ │                                             │
│ │ │ ☐ Bldgs  │ │                                             │
│ │ │ ☐ Width  │ │                                             │
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Sidebar Components

**1. Metric Selector (top section)**

Radio button group to select the active metric. Switching metrics instantly recolors the network layer via `map.setPaintProperty()`.

| Radio | Label | Key | Default |
|-------|-------|-----|---------|
| ○ | NAIN (Integration) | `nain_{radius}` | ● selected |
| ○ | NACH (Choice) | `nach_{radius}` | |
| ○ | Betweenness | `betweenness` | |

When NAIN or NACH is selected, the radius selector below is active. When Betweenness is selected, the radius selector is disabled (betweenness from Graphology is global only).

**2. Radius Selector**

Four toggle buttons, one active at a time. Switching radius updates the `metricKey` used in the MapLibre paint expression:

| Button | Label | Radius | Description |
|--------|-------|--------|-------------|
| [400] | R400 | 400m | Local: pedestrian-scale movement (shops, cafes) |
| [800] | R800 | 800m | Neighborhood: walking-distance structure |
| [1600] | R1600 | 1,600m | District: cycling/transit-scale connectivity |
| [10K] | R10000 | 10,000m | City: vehicle-scale through-movement |

**Default:** R800 (neighborhood scale, most relevant for urban design).

Each radius button has a tooltip explaining its spatial interpretation. The active radius also updates the color ramp legend domain (different radii have different value ranges).

**3. Network Statistics Panel**

Always-visible card showing aggregate network metrics computed by Graphology on the client:

```
┌─────────────────────────┐
│ NETWORK STATISTICS      │
│                         │
│ Edges:          517     │
│ Nodes:          289     │
│ Intersections:  198     │
│ Dead ends:      34 (12%)│
│ 4-way:          61 (31%)│
│ Meshedness:     0.34    │
│ Link-node:      1.79    │
│ Mean length:    82m     │
│ Total length:   42.3 km │
│                         │
│ NAIN R800 (mean): 0.72  │
│ NACH R800 (mean): 0.84  │
└─────────────────────────┘
```

The NAIN/NACH mean values at the bottom update when the radius changes. These provide a single-number summary of the area's integration and choice characteristics.

**4. Layer Toggles**

| Toggle | Default | Description |
|--------|---------|-------------|
| ☑ Simplified network | On | neatnet-simplified, colored by active metric |
| ☐ Raw OSM network | Off | Original OSMnx extraction, fixed steel-blue color |
| ☐ 3D Buildings | Off | Translucent InstancedMesh boxes |
| ☐ Scale width by value | Off | Line width proportional to metric value (useful for NACH) |

**5. Isochrone Panel (appears on click)**

When the user clicks the map for an isochrone, a panel appears below the layer toggles:

```
┌─────────────────────────┐
│ WALKING ISOCHRONE       │
│ from: 41.3891, 2.1650   │
│                         │
│ 5 min:  279 nodes  ●    │
│ 10 min: 891 nodes  ●    │
│ 15 min: 1811 nodes ●    │
│                         │
│ [Clear isochrone]       │
└─────────────────────────┘
```

The colored dots (●) match the isochrone polygon colors on the map (green, blue, purple).

### 8.3 Color Ramp Legend

Positioned in the map viewport (top-right or bottom-right corner). Shows:
- Metric name and radius (e.g., "NAIN R800")
- Gradient bar with tick marks
- Min and max values from the current data

```
┌─────────────────┐
│ NAIN R800       │
│ ░░▒▒▓▓██        │
│ 0.14     1.11   │
└─────────────────┘
```

The legend updates when the metric or radius changes.

---

## 9. Zustand Store Extensions

P3 extends the shared `useMapStore` with network-specific state:

```typescript
interface NetworkStore {
  // Network data
  streetsSimplified: StreetFeature[];
  streetsRaw: StreetFeature[];
  networkGraph: Graph | null;  // Graphology instance
  networkStats: NetworkStats | null;

  // Space syntax state
  activeMetric: 'nain' | 'nach' | 'betweenness';
  activeRadius: 400 | 800 | 1600 | 10000;

  // Computed metric key (e.g., 'nain_800')
  get activeMetricKey(): string;

  // Isochrone state
  isochroneOrigin: [number, number] | null;
  isochronePolygons: Record<number, GeoJSON.Feature> | null;

  // Layer visibility
  showRawOsm: boolean;
  showBuildings: boolean;
  scaleWidthByValue: boolean;

  // Network ID for cached backend graph
  networkId: string | null;

  // Actions
  setActiveMetric(metric: 'nain' | 'nach' | 'betweenness'): void;
  setActiveRadius(radius: 400 | 800 | 1600 | 10000): void;
  extractNetwork(bbox: BBox): Promise<void>;
  generateIsochrone(lng: number, lat: number): Promise<void>;
  clearIsochrone(): void;
  toggleRawOsm(): void;
  toggleBuildings(): void;
  toggleScaleWidth(): void;
}
```

---

## 10. User Workflow (Step by Step, Detailed)

1. **Open app** — User sees a MapLibre map (dark basemap). Default view centers on Barcelona at zoom 13. A hint banner says "Draw a rectangle to analyze the street network (max 5 km²)."

2. **Draw selection** — User clicks the "Analyze Area" button in the toolbar, then draws a rectangle on the map. During drawing, the area display shows current area in m² with a green/red indicator vs the 5 km² maximum. The AreaSelector component (shared) handles this.

3. **Extraction begins** — On release (if area ≤ 5 km²), the app shows a progress indicator: "Extracting street network..." → "Simplifying with neatnet..." → "Computing space syntax centralities..." → "Building network graph...". Total time: 30–120s depending on area and city.

4. **Network appears** — The simplified street network renders as colored lines (NAIN R800 by default — neighborhood-scale integration). High-integration streets appear in warm colors (yellow/green), low-integration in cool colors (dark blue/purple). The color ramp legend appears in the map corner.

5. **Explore metrics** — User clicks radio buttons in the sidebar to switch between NAIN (where are the most accessible streets?), NACH (where are the most-used through-routes?), and Betweenness (which streets connect different parts of the network?). Each switch instantly recolors the network.

6. **Change radius** — User clicks [400], [800], [1600], or [10K] buttons. The network recolors to show integration/choice at that scale. R400 highlights local pedestrian corridors. R10000 highlights city-scale arterials. The sidebar's NAIN/NACH mean values update.

7. **Hover segment** — Moving the cursor over a street segment highlights it in white and shows a tooltip with the segment's metric values at the current radius, plus its length.

8. **Generate isochrone** — User clicks any point on the map. A red pin appears, and three concentric isochrone polygons (5/10/15 min walking) appear as translucent overlays. The isochrone panel in the sidebar shows reachable node counts. Clicking a new point replaces the previous isochrone.

9. **Compare networks** — User toggles "Raw OSM" in the layer panel. Steel-blue lines show the original OSMnx network overlaid on the colored simplified network. The comparison statistics in the sidebar show the reduction (e.g., "94.7% edge reduction"). This demonstrates why simplification is necessary.

10. **Toggle buildings** — User toggles "3D Buildings" in the layer panel. Translucent grey buildings appear, providing spatial context for the network analysis. Buildings are at 30% opacity so network lines remain clearly visible.

11. **Try another city** — User clicks "New Analysis", draws a rectangle in Prague. The workflow repeats. Prague's organic medieval network shows dramatically different NAIN/NACH patterns than Barcelona's grid.

---

## 11. Implementation Sessions

### Session 1: Network Extraction and Space Syntax Pipeline

**Goal:** Backend endpoints for street extraction with neatnet simplification and cityseer NAIN/NACH computation; frontend receives and renders network.

**Tasks:**
1. Implement `POST /extract` with `mode="network_only"` and 1 km buffer
2. Wire up OSMnx → neatnet → cityseer pipeline
3. Implement node-to-segment value assignment (mean of endpoint values)
4. Return both raw and simplified street GeoJSON with NAIN/NACH properties
5. Frontend: add `streets` GeoJSON source and `network-active` line layer
6. Frontend: data-driven `line-color` expression for NAIN R800 (default)
7. Frontend: loading states and progress indicator during extraction
8. Test with Barcelona Eixample — verify NAIN highlights Passeig de Gràcia and Diagonal

**Success criteria:**
- Extraction + simplification + cityseer completes in <120s for 5 km² Barcelona
- NAIN/NACH values appear as properties on street features
- Network renders with colored lines on the map
- NAIN R800 correctly identifies high-integration streets (visual inspection)

### Session 2: Metric Controls, Radius Toggle, Client-Side Metrics

**Goal:** Full sidebar with metric selector, radius toggle, network statistics, client-side Graphology metrics, and segment hover/click.

**Tasks:**
1. Build sidebar with metric radio buttons (NAIN / NACH / Betweenness)
2. Build radius toggle buttons (400 / 800 / 1600 / 10K)
3. Implement `updateNetworkLayer()` to switch paint properties on metric/radius change
4. Construct Graphology graph from street features
5. Compute all 6 topology metrics (GT1–GT6) and display in Network Statistics panel
6. Compute betweenness centrality (BW1) in Web Worker, add as segment property
7. Implement segment hover (highlight + tooltip) and click (for isochrone trigger)
8. Implement color ramp legend component (updates on metric/radius change)
9. Test radius switching — verify R400 emphasizes different streets than R10000

**Success criteria:**
- Switching metrics/radii recolors network in <100ms (no re-extraction)
- Network statistics show correct values (meshedness, dead-end ratio, etc.)
- Betweenness centrality computes in <500ms and renders as line colors
- Hover shows per-segment metric values, click is wired to isochrone trigger

### Session 3: Isochrones, neatnet Comparison, Multi-City Testing

**Goal:** Walking isochrone generation, neatnet before/after comparison, and testing across multiple city morphologies.

**Tasks:**
1. Implement `POST /network/isochrone` endpoint with NetworkX Dijkstra
2. Implement concave hull polygon generation (Shapely 2.x `concave_hull`)
3. Frontend: render isochrone polygons as MapLibre fill layers
4. Frontend: isochrone panel in sidebar with node counts and clear button
5. Implement neatnet comparison: raw OSM layer toggle with comparison statistics
6. Implement "Scale width by value" toggle for NACH desire-line effect
7. Optional: implement 3D buildings toggle (shared BuildingMeshManager)
8. Test across 3+ cities:
   - Barcelona Eixample (regular grid — high meshedness, uniform NAIN)
   - Prague Staré Město (organic medieval — low meshedness, concentrated NAIN on main routes)
   - London King's Cross (mixed — grid + organic + railway barriers)
   - Houston downtown (car-oriented grid — high link-node ratio, low betweenness variance)
9. Manual testing of all success criteria

**Success criteria:**
- Isochrone generates in <1s after click
- Concave hull produces realistic (non-convex) isochrone shapes
- neatnet comparison shows 58–95% edge reduction while preserving topology
- All 8 success criteria from §12 pass across 3+ cities

---

## 12. Success Criteria

These criteria directly extend finding #83's P3 success criteria with additional specifics from the spike findings:

| # | Criterion | Measurement | Pass Threshold | Source |
|---|-----------|-------------|----------------|--------|
| 1 | NAIN correctly identifies high-integration streets | Visual: main roads are warmest colors | Barcelona: Passeig de Gràcia and Diagonal highest; Prague: Charles Bridge approach streets highest | C3 |
| 2 | Radius toggle visually shifts emphasis | Compare R400 vs R10000 coloring | R400 highlights local shop streets; R10000 highlights highway corridors — visibly different patterns | C3 |
| 3 | Barcelona NAIN at R800 highlights Passeig de Gràcia | NAIN R800 value for PdG vs area mean | PdG segment NAIN > area mean NAIN | C3 |
| 4 | Isochrone generation completes in <1s | Measured from click to polygon render | <1s end-to-end | K3 (0.011s Dijkstra) |
| 5 | 5 km² extraction completes within 3 minutes | Measured from "Analyze" click to network render | <180s for Barcelona 5 km² | B1 (85s avg pipeline) |
| 6 | neatnet shows 58–95% edge reduction | Comparison statistics panel | Reduction % within expected range per city | B1 |
| 7 | Network statistics mathematically correct | Verify meshedness, dead-end ratio manually | Values match hand-calculation for small test network | C4 |
| 8 | Works across 3+ city morphologies | Test Barcelona (grid), Prague (organic), London (mixed) | All render, all show distinct NAIN/NACH patterns | C3 |
| 9 | NAIN/NACH value ranges match expected | Check ranges against C3 spike | NAIN: 0.1–1.2, NACH: 0–1.5 | C3 |
| 10 | Metric/radius switching is instant | Time from click to recolor | <100ms (no backend call, just MapLibre paint update) | — |

---

## 13. Manual Testing Plan

### 13.1 Pre-Test Setup

1. Start Python backend: `cd shared/python-backend && uvicorn app:app --port 8000`
2. Start P3 frontend: `cd prototypes/p3-network && pnpm dev` (port 5175)
3. Verify backend health: `curl http://localhost:8000/health`
4. Verify cityseer is installed: `python -c "import cityseer; print(cityseer.__version__)"`

### 13.2 Test Scenarios

**Test 1: Barcelona Eixample (Grid Network)**
1. Navigate to Barcelona (41.39, 2.17)
2. Draw a ~2 km² rectangle covering the Eixample district
3. Wait for extraction (~60s)
4. Verify: network lines appear colored by NAIN R800
5. Verify: Passeig de Gràcia and Diagonal appear as warm-colored (high integration)
6. Switch to R400 → verify local shops streets (interior grid) become more prominent
7. Switch to R10000 → verify Diagonal and Gran Via become dominant
8. Switch to NACH → verify major through-routes (Diagonal, Gran Via) are brightest
9. Click for isochrone at a grid intersection → verify 3 concentric polygons appear
10. Toggle Raw OSM → verify 94%+ edge reduction

**Test 2: Prague Old Town (Organic Network)**
1. Navigate to Prague (50.087, 14.42)
2. Draw a ~1.5 km² rectangle covering Staré Město
3. Wait for extraction
4. Verify: organic street pattern with concentrated high-NAIN on Karlova (route to Charles Bridge)
5. Verify: meshedness is lower than Barcelona (more dead ends, less regular grid)
6. Click for isochrone → verify isochrone extends unevenly (following major routes)

**Test 3: London King's Cross (Mixed Network)**
1. Navigate to London (51.535, -0.124)
2. Draw a ~3 km² rectangle
3. Wait for extraction
4. Verify: railway barriers create network disconnections visible in NAIN (low-integration zones near tracks)
5. Toggle neatnet comparison → note how simplification preserves major routes but removes service roads

**Test 4: Edge Cases**
1. Try to select >5 km² → verify area constraint prevents it (red indicator, reset)
2. Zoom to a rural area with sparse network → verify it handles <50 segments gracefully
3. Click for isochrone on a dead-end street → verify small isochrone (low connectivity)
4. Rapid-fire: switch metrics/radii quickly → verify no rendering glitches

### 13.3 Performance Benchmarks

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Extraction + cityseer (5 km²) | <180s | Browser devtools network tab |
| Metric/radius switch | <100ms | Browser devtools performance profiler |
| Isochrone generation | <1s | Measure from click to polygon render |
| Graphology topology metrics | <10ms | Console.time() in code |
| Graphology betweenness | <500ms | Console.time() in code |
| MapLibre rendering (2000 lines) | ≥30 FPS | Browser devtools FPS meter |

---

## 14. Estimated Complexity

**Medium.** P3 has less custom Three.js work than P1 (no raycasting, no shadow mapping) and less metric breadth than P2 (12 metrics vs 51). The core visualization is MapLibre line layers — straightforward with data-driven styling. The main complexity sources are:

1. **Backend pipeline** — chaining OSMnx → neatnet → cityseer → node-to-segment assignment requires careful coordinate system management (WGS84 ↔ UTM) and error handling for edge cases (disconnected components, empty networks)
2. **Buffer strategy** — extracting a larger area and filtering results adds complexity but is essential for meaningful R1600/R10000 values
3. **Isochrone endpoint** — simple algorithm (Dijkstra + concave hull) but requires network caching for fast response

**Estimated: 2–3 AI agent sessions** (aligned with finding #83's estimate).

---

## Implications for Collage Earth

P3 validates the cityseer-based space syntax pipeline that will be central to Collage Earth's network analysis capabilities. Key implications:

1. **cityseer is viable for production use** — 1.7s for 1000 segments at 4 radii simultaneously is fast enough for on-demand computation, not just pre-computation. This opens the possibility of live re-analysis when users modify networks.
2. **The radius toggle is the killer UX feature** — multi-scale analysis (R400 local ↔ R10000 city) is space syntax's unique value proposition, and instant switching makes it tangible. No competitor offers this in a web browser.
3. **MapLibre line layers are sufficient** — no custom WebGL rendering needed for network visualization. Data-driven styling handles the coloring, and line width can encode additional dimensions (NACH through-movement).
4. **neatnet simplification is essential** — without it, raw OSMnx networks are too noisy for space syntax (disconnected components, redundant segments). The 58–95% reduction also keeps computation times manageable.
5. **Isochrones are trivially fast** — NetworkX Dijkstra at 0.011s means isochrones can be generated on every click with no perceptible delay. This is a strong interactive feature.
6. **AGPL mitigation works** — pre-computing cityseer values at extraction time and storing them as GeoJSON properties avoids AGPL licensing issues for distribution. The prototype validates this pattern.

## Open Questions

1. **Segment vs. node NAIN/NACH display:** cityseer outputs per-node values. Assigning the mean of endpoint values to segments is standard but loses some information at junctions. Should P3 also offer a node-centric view (colored dots at intersections)?
2. **Boundary roll-off at R10000:** The 1 km buffer is insufficient for R10000 (10 km radius). Edge segments near the boundary will show artificially low integration at R10000. Should the UI warn users about this, or is it acceptable for a prototype?
3. **Route directness metric:** Finding #09 describes route directness (actual vs Euclidean distance ratio) as a useful walkability metric. This wasn't included in the current metric list because it requires origin-destination pairs. Should it be added as a future enhancement?
4. **Segment-level NAIN vs. area-wide NAIN:** The Network Statistics panel shows area-wide mean NAIN/NACH. Should P3 also show a histogram of segment-level values (like P2's histogram for building metrics)?

## Overall Conclusion

P3 is a well-scoped prototype that exercises the validated cityseer pipeline (C3 spike: 1.7s for 4-radius NAIN/NACH), fast client-side Graphology topology metrics (C4 spike: <10ms), and NetworkX Dijkstra isochrones (K3 spike: 0.011s). The primary visualization — MapLibre data-driven line coloring — is straightforward and performant for up to 5,000 features. The 5 km² maximum area provides enough network context for meaningful multi-radius analysis while keeping extraction times under 3 minutes. The three-session implementation plan covers: (1) backend pipeline + basic rendering, (2) metric controls + client-side metrics, (3) isochrones + neatnet comparison + multi-city testing. At medium complexity and 2–3 sessions, P3 is the most "MapLibre-native" of the five prototypes.

## Sources

[1] Finding #05 — Space syntax practical implementation (collage-city-research findings)
[2] Finding #09 — Walkability, connectivity, and accessibility (collage-city-research findings)
[3] Spike C3 — Space syntax implementation comparison (FINDINGS.md)
[4] Spike K3 — Fragment-aware walkability: design-to-context network merging (FINDINGS.md)
[5] Spike C4 — Metric computation performance budget (FINDINGS.md)
[6] Spike B1 — OSM-to-fragment extraction pipeline (FINDINGS.md)
[7] Finding #83 — Design of all 5 prototypes and shared infrastructure (collage-city-research findings)
[8] cityseer API documentation — metrics/networks, https://cityseer.benchmarkurbanism.com/metrics/networks
[9] Graphology metrics library — https://graphology.github.io/standard-library/metrics.html
[10] MapLibre GL JS documentation — Expressions & data-driven styling, https://maplibre.org/maplibre-gl-js/docs/
[11] Shapely concave_hull — https://shapely.readthedocs.io/en/stable/reference/shapely.concave_hull.html
