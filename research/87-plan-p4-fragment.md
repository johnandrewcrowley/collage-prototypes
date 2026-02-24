# §18.5 — Detailed Implementation Plan: P4 Urban Fragment Workflow

## Abstract

This document provides the complete implementation plan for P4, the urban fragment workflow prototype. P4 validates the platform's most distinctive capability: extract a fragment of urban fabric → save to a library → navigate to a destination → cut a hole in the existing context → place the fragment and evaluate it in situ. The plan specifies the full 5-step workflow with exact pipeline stages, timings, and library calls; details the fragment library with thumbnails, key metrics, and comparison radar charts; designs the CRS-reassignment relocation (1.79s, zero geometric distortion per spike D1); specifies the hard-clip centroid-inside hole-cutting approach (per spike D3); covers network merging for cross-boundary walkability isochrones (edge-split merge per spike K3); defines dual rendering with fragment in accent color and context in grey; and establishes success criteria with a manual testing plan. Every performance number and approach traces to a validated spike finding.

## Introduction

P4 is the most complex of the five prototypes — it exercises the most backend endpoints (8 distinct calls) and has the most multi-step user workflow (10 sequential actions). It is also the prototype that tests the platform's core differentiator: understanding how a piece of one city would perform if placed in another city. No existing urban analysis platform offers this capability.

The prototype serves three research questions:
1. **Does the extract → save → relocate → compare workflow feel coherent?** This validates whether the fragment concept — treating a neighborhood as a portable, analyzable unit — makes intuitive sense to users and produces useful insights.
2. **Are the relocation and context integration steps fast enough for interactive use?** This validates that the CRS-reassignment relocation (D1), hard-clip context management (D3), and network merging (K3) pipelines are fast enough (<10s total) for real-time interaction.
3. **Do inter-fragment metrics reveal meaningful differences between relocated fragments and their new context?** This validates whether the boundary-analysis approach from D2 produces actionable data — e.g., showing that a Barcelona superblock has dramatically higher walkability than its Houston context.

### Key References

| Reference | Content | Used For |
|-----------|---------|----------|
| Finding #14 | Fragment extraction and definition | Boundary modes, extraction pipeline, fragment package format |
| Finding #15 | Fragment comparison and analysis | Pre-computed metrics, comparison presentation, radar charts |
| Finding #16 | Fragment relocation and context interaction | CRS transformation, context clipping, metric behavior |
| Finding #17 | Fragment collaging | Multi-fragment placement, edge handling, collage-level analysis |
| Spike B1 | OSM-to-fragment extraction | OSMnx pipeline, neatnet, 61 metrics, GeoParquet, 85s average |
| Spike D1 | Fragment relocation | CRS reassignment, 1.79s, 67/73 intrinsic metrics, zero drift |
| Spike D2 | Fragment edge handling | 200m buffer, 79% convergence, inter-fragment metrics, 0.149s incremental re-tessellation |
| Spike D3 | Design-to-context boundary | Hard clip centroid-inside, transition zones, road connection scoring |
| Spike K3 | Network merging | Edge-split merge, isochrone 0.011s, hybrid merge strategy |
| Finding #83 | P4 prototype design | User workflow, UI layout, success criteria |

---

## 1. Complete 5-Step User Workflow

P4's workflow has 5 conceptual stages, each mapped to specific UI actions and backend calls.

### 1.1 Stage 1: Extract a Fragment

**User action:** Navigate to a city (e.g., Barcelona Eixample). Draw a rectangle on the map (max 1 km²). Click "Extract."

**Backend pipeline (single `POST /extract` call):**

| Step | Operation | Library | Time (Barcelona) | Time (max) | Notes |
|------|-----------|---------|-------------------|-----------|-------|
| 1 | Building extraction | OSMnx `features_from_polygon()` | 1.1s | 118s (Tokyo) | Overpass API, cached on repeat |
| 2 | Street extraction | OSMnx `graph_from_bbox()` | 4.9s | 116s (Tokyo) | network_type="all" |
| 3 | neatnet simplification | `neatnet.neatify()` | 4.7s | 37s | 58–95% edge reduction [B1] |
| 4 | Enclosure generation | `momepy.enclosures()` | 0.03s | 0.17s | Street-bounded blocks |
| 5 | Enclosed tessellation | `momepy.enclosed_tessellation()` | 0.6s | 18.2s | segment=1.0, n_jobs=-1 |
| 6 | Height enrichment | Cascade lookup | <0.1s | <0.1s | OSM tags → levels → type default |
| 7 | Metric computation | momepy shape/distribution/density | 2.4s | 17.2s | 61 metrics [B1] |
| 8 | Space syntax | cityseer NAIN/NACH | ~1.7s | ~8s (5 km²) | 4 radii simultaneously [C3] |
| **Total** | | | **~15s** (cached) | **~180s** | Average 85s [B1] |

**Buffer strategy:** The backend always extracts `bbox.buffer(200m)` to ensure 79% of spatial metrics converge [D2]. Metrics are reported for core-area buildings only. The buffer ensures `mean_interbuilding_distance`, `street_alignment`, and `weighted_area` stabilize — the only metric requiring >200m buffer is `mean_interbuilding_distance` (converges at 500m) which is flagged as approximate.

**Frontend response:** Buildings appear as 3D InstancedMesh boxes. Streets render as MapLibre line layer. A summary bar shows key metrics (GSI, FSI, L, building count, LCZ type). Progress indicator shows pipeline stage names during extraction.

### 1.2 Stage 2: Save to Library

**User action:** Click "Save Fragment." Enter a name (e.g., "Barcelona Eixample"). Optionally add tags.

**Backend call:** `POST /fragment/save` — serializes the full `FragmentPackage` to GeoParquet files in a local `fragments/` directory. Includes buildings, streets, tessellation, enclosures, metrics, and metadata.

**Fragment package contents (GeoParquet, per B1 output schema):**

```
fragments/<fragment-id>/
  buildings.parquet          # Projected CRS (local tmerc)
  streets.parquet            # Original extracted streets
  streets_simplified.parquet # neatnet-simplified
  enclosures.parquet         # Street-bounded blocks
  tessellation.parquet       # Enclosed tessellation cells
  metrics.json               # 61 momepy + 8 cityseer metrics
  metadata.json              # Name, source bbox, CRS, counts, timestamp
```

**Frontend response:** Fragment appears in the library sidebar with a static thumbnail (MapLibre `map.getCanvas().toDataURL()` snapshot), name, and key metrics. The thumbnail captures the current camera angle and building colors.

### 1.3 Stage 3: Navigate to Destination

**User action:** Pan/zoom the map to a different location (e.g., Houston, Texas). Optionally extract the context first to see what's there, or let the placement action trigger context extraction automatically.

**Context extraction:** When the user clicks "Place Fragment" and then clicks a destination point, the backend extracts context buildings and streets for a bbox centered on the click point, sized to accommodate the fragment footprint plus a 200m buffer. This uses the same `/extract` endpoint but with `include_metrics=false` and `include_space_syntax=false` for faster processing (only buildings, streets, and neatnet simplification needed for context — ~30–50s).

### 1.4 Stage 4: Cut Hole and Place Fragment

**User action:** With a fragment selected from the library, click "Place Fragment." Click the destination on the map. The fragment appears at the destination.

**Backend pipeline (two sequential calls):**

**Call 1: `POST /fragment/relocate`**

| Step | Operation | Time | Notes |
|------|-----------|------|-------|
| 1 | Load fragment GeoParquet | 0.28s | GeoPandas `read_parquet()` |
| 2 | CRS reassignment | <0.01s | `set_crs()` — not transform [D1] |
| 3 | Re-tessellate at destination | 1.18s | Enclosed tessellation with destination enclosures |
| 4 | Recompute metrics | 0.59s | 67/73 identical; 5 orientation metrics change [D1] |
| **Total** | | **1.79s** | [D1] |

**CRS reassignment approach (validated by D1):**

The relocation uses custom Transverse Mercator CRS centered on each location's centroid. The key insight from D1 is that this is not a coordinate transformation — it's a CRS label reassignment:

1. Fragment is stored in `tmerc(source_centroid)` — local meter coordinates
2. Destination CRS is `tmerc(destination_centroid)` — also local meter coordinates
3. `set_crs(destination_tmerc)` replaces the CRS label without modifying coordinate values
4. Project to WGS84 for rendering — buildings now appear at destination

This produces **exactly zero geometric distortion** — D1 measured 0.000000m roundtrip drift. All 67 intrinsic metrics (area, shape, density, street network) are bit-for-bit identical. Only 5 orientation-sensitive metrics change due to meridian convergence (alignment_mean: 6.3%, orientation_mean: 0.27%).

**Call 2: `POST /fragment/place` (context integration)**

| Step | Operation | Time | Notes |
|------|-----------|------|-------|
| 1 | Compute placement polygon | <0.01s | Fragment boundary convex hull + 5m buffer |
| 2 | Hard clip context buildings | <0.01s | Remove buildings with centroid inside polygon [D3] |
| 3 | Hard clip context streets | <0.01s | Remove street segments with midpoint inside polygon |
| 4 | Report clipping stats | <0.01s | Count of removed buildings, affected area |
| **Total** | | **<0.1s** | |

**Hard clip approach (validated by D3):**

Hard clip with centroid-inside rule is the recommended default [D3]. It cleanly separates design and context with no double-counting in metrics. D3 tested this on Barcelona fragment (74 buildings) placed in Prague context (1,264 buildings) and removed 147 context buildings (11.6%). The approach:

1. Compute `placement_polygon = fragment_boundary.buffer(5)` — 5m buffer prevents sliver overlaps
2. For each context building: `if placement_polygon.contains(building.centroid): remove`
3. Zero residual buildings — centroid-inside is unambiguous (no partial-inclusion edge cases)

**Frontend response:** Fragment buildings render in accent color (orange, `#FF6B35`). Context buildings render in grey (`#9E9E9E`, 60% opacity). Removed context buildings disappear. The map flies to center the placement.

### 1.5 Stage 5: Evaluate — Network Merge and Isochrones

**User action:** Click "Merge Networks" to connect fragment streets with context streets. Click anywhere on the merged network to generate a walking isochrone.

**Backend pipeline:**

**Call 3: `POST /network/merge`**

| Step | Operation | Time | Notes |
|------|-----------|------|-------|
| 1 | Identify boundary endpoints | <0.01s | Fragment street endpoints within 5m of boundary |
| 2 | Edge-split merge | 3.66s (unoptimized) | Snap boundary endpoints to nearest context edge [K3] |
| 3 | Connectivity validation | <0.01s | `networkx.is_connected()` on undirected graph |
| **Total** | | **~4s** | Optimizable to <0.5s with STRtree [K3] |

**Merge approach (validated by K3):**

The hybrid merge strategy uses edge-split as the automatic fallback:

1. For each fragment boundary endpoint within 50m of a context edge:
   - Find nearest point on nearest context edge (KD-tree lookup)
   - If distance < 50m: split context edge at that point, create new connecting edge
   - If distance ≥ 50m: skip (genuine gap — railway, park, water body)
2. Validate with `networkx.is_connected()` — K3 achieved 93% connection rate (13/14 endpoints)
3. Report merge quality: connected endpoints, skipped endpoints (with reasons), snap distances

K3 demonstrated that edge-split merge produces the most accurate connections (0.00m accuracy to original edge geometry) vs. nearest-node snap (20m average offset). The merge time of 3.66s is dominated by brute-force nearest-edge search — production should use Shapely STRtree for O(log n) lookup, reducing to <0.5s.

**Call 4: `POST /network/isochrone` (on click)**

| Step | Operation | Time | Notes |
|------|-----------|------|-------|
| 1 | Find nearest node to click | <0.01s | KD-tree lookup |
| 2 | Dijkstra shortest paths | 0.011s | NetworkX, ~2,000 nodes [K3] |
| 3 | Compute isochrone polygon | <0.01s | Shapely `concave_hull(ratio=0.3)` |
| **Total** | | **~0.02s** | Effectively instant [K3] |

**Isochrone parameters:** 5-minute (416m at 5 km/h), 10-minute (833m), and 15-minute (1,249m) walking distance rings. K3 demonstrated that the 15-min isochrone extends 95% beyond the fragment boundary into surrounding context — confirming that network merge is essential for meaningful walkability assessment (design-only isochrone is entirely self-contained and misleading).

**Frontend response:** Walking isochrones render as semi-transparent fill polygons on MapLibre: 5-min (green, 40% opacity), 10-min (yellow, 30% opacity), 15-min (red, 20% opacity). The merge quality panel shows: number of connections made, average snap distance, any skipped endpoints. A success badge shows "Network connected" (green) or "Partially connected" (yellow with count of disconnected endpoints).

---

## 2. Extraction Pipeline Details

### 2.1 OSMnx Configuration

```python
import osmnx as ox

# Buildings — all building types
buildings = ox.features_from_polygon(
    extraction_polygon,  # bbox + 200m buffer
    tags={"building": True}
)

# Streets — all navigable ways (not just driving)
G = ox.graph_from_bbox(
    bbox=(north, south, east, west),
    network_type="all"  # drive + walk + cycle
)
streets = ox.graph_to_gdfs(G, nodes=False, edges=True)
```

### 2.2 neatnet Simplification

neatnet reduces raw OSM street networks by 58–95% [B1] while preserving topology:

```python
import neatnet

# Project to UTM for meter-based operations
streets_proj = streets.to_crs(streets.estimate_utm_crs())
simplified = neatnet.neatify(streets_proj)
```

Barcelona Eixample: 9,820 raw segments → 520 simplified segments (94.7% reduction). The simplification is critical for both cityseer performance (O(V²) scaling) and visual clarity.

### 2.3 Height Enrichment Cascade

Per B1's validated pipeline:

| Priority | Source | Availability |
|----------|--------|-------------|
| 1 | OSM `height` tag | Varies (60.5% Barcelona, 1% Houston) |
| 2 | OSM `building:levels × 3.0m` | Higher coverage than raw height |
| 3 | Type-default lookup table | 20+ building types → default heights |
| 4 | Global fallback | 9m (3 floors) |

**Known limitation:** Non-European cities have <5% OSM height coverage [B1]. The prototype functions correctly with default heights, but height-dependent metrics (FSI, canyon H/W, SVF) will be approximate. The UI should indicate height data quality (e.g., "Heights: 60% real data" vs. "Heights: estimated").

### 2.4 Metric Computation

61 metrics across 10 categories [B1], computed via momepy's function-based API:

| Category | Count | Example Metrics |
|----------|-------|----------------|
| Shape | 18 | elongation, circularity, rectangularity, convexity, squareness, corners, fractal_dimension |
| Dimensional | 9 | area, perimeter, height (mean, std, max), floor_area |
| Orientation | 2 | orientation_mean, alignment_mean |
| Spacematrix | 6 | FSI, GSI, OSR, L (floors), buildings/ha, floor_area/ha |
| Block | 3 | block_area, block_count, block_regularity |
| Network topology | 6 | intersection_density, dead_end_ratio, meshedness, link_node_ratio |
| Distribution | 4 | neighbor_distance, mean_interbuilding_distance |
| Diversity | 3 | land_use_entropy, type_count |
| Streetscape | 6 | street_profile_width, canyon_hw_ratio |
| Centrality | 3 | closeness, betweenness (client-side, via Graphology) |

Plus 8 cityseer metrics (NAIN/NACH at 4 radii) computed via space syntax pipeline.

### 2.5 Metric Behavior Classification

Per D1 and D2, metrics are classified by their behavior under relocation and at boundaries:

| Classification | Count | Behavior | UI Indicator |
|---------------|-------|----------|-------------|
| Fully intrinsic | 67 | Identical after relocation (0.000% change) | Solid confidence dot |
| Orientation-sensitive | 5 | Changes with relocation due to meridian convergence (0.3–6.3%) | Triangle warning icon |
| Buffer-insensitive | 8 | Stable regardless of context size | — |
| Short-range (≤100m) | 13 | Stabilizes with 100m context | — |
| Long-range (≤200m) | 2 | Needs 200m context | "Approximate" label if buffer < 200m |
| Very long-range (≤500m) | 1 | mean_interbuilding_distance | "Approximate" label always |
| Boundary-dependent | 4 | Never fully converges (tessellation edge effects) | "Edge-dependent" label |

---

## 3. Fragment Library

### 3.1 Library Data Model

```typescript
interface LibraryFragment {
  id: string;                    // UUID
  name: string;                  // User-given name (e.g., "Barcelona Eixample")
  tags: string[];                // User tags (e.g., ["grid", "european", "dense"])
  sourceCity: string;            // Reverse-geocoded city name
  sourceBbox: BBox;              // Original extraction bbox (WGS84)
  extractedAt: string;           // ISO timestamp
  thumbnail: string;             // Base64 PNG (256×256 map snapshot)
  buildingCount: number;
  streetSegments: number;        // Post-neatnet simplified count
  areaKm2: number;              // Core area (excluding buffer)
  heightDataQuality: number;     // Fraction of real height data (0–1)

  // Key metrics for card display and sorting
  keyMetrics: {
    gsi: number;                 // Ground Space Index (coverage)
    fsi: number;                 // Floor Space Index (density)
    l: number;                   // Mean number of floors
    buildingsPerHa: number;
    canyonHwRatio: number;       // Mean street canyon H/W
    intersectionDensity: number;
    deadEndRatio: number;
    lczType: string;             // LCZ classification label
  };

  // Full metric profile for comparison
  fullProfile: Record<string, number>;  // All 69 metrics (61 momepy + 8 cityseer)

  // Storage path for GeoParquet files
  storagePath: string;
}
```

### 3.2 Library Sidebar UI

The library occupies a 360px sidebar on the left side of the screen. It has three sections:

**Section 1: Fragment Cards (scrollable list)**

Each card shows:
- Thumbnail image (120×80px, captured from map)
- Fragment name (bold, 14px)
- Source city (grey, 12px)
- Compact metric row: `GSI: 0.71 | FSI: 4.02 | L: 5.7 | 500 bldgs`
- LCZ badge (e.g., "LCZ 2 — Compact midrise")
- Action buttons: [Fly To] [Place] [Delete]

Cards are sorted by extraction date (newest first). Click a card to select it (blue border). Click "Fly To" to animate the map to the fragment's source location.

**Section 2: Comparison Panel (collapsible)**

Visible when 2 fragments are selected (Ctrl+click for multi-select). Shows:
- Side-by-side metric table for key metrics
- Radar chart overlay comparing 8 normalized dimensions:
  - Coverage (GSI), Density (FSI), Height (L), Compactness (buildings/ha), Canyon (H/W), Connectivity (intersection density), Walkability (NAIN R800), Diversity (land_use_entropy)
- Each dimension normalized to 0–1 using min/max across the library

**Section 3: Actions Panel (fixed at bottom)**

| Button | State | Action |
|--------|-------|--------|
| **Extract** | Always enabled | Enters area-selection draw mode |
| **Save** | Enabled after extraction | Saves current extracted area to library |
| **Place Fragment** | Enabled when 1 fragment selected | Enters placement mode (click map to place) |
| **Compare** | Enabled when 2 fragments selected | Shows comparison panel |
| **Merge Networks** | Enabled after placement | Merges fragment + context streets |

### 3.3 Fragment Thumbnail Generation

Thumbnails are captured client-side after extraction completes:

```typescript
function captureFragmentThumbnail(map: maplibregl.Map): string {
  // Ensure buildings are rendered before capture
  map.once('idle', () => {
    const canvas = map.getCanvas();
    // Create 256×256 center crop
    const size = 256;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d')!;
    const sx = (canvas.width - size) / 2;
    const sy = (canvas.height - size) / 2;
    ctx.drawImage(canvas, sx, sy, size, size, 0, 0, size, size);
    return offscreen.toDataURL('image/png');
  });
}
```

### 3.4 Radar Chart Comparison

The radar chart uses 8 axes representing the morphological dimensions most useful for quick comparison [finding #15]:

| Axis | Metric | Normalization | Why This Metric |
|------|--------|--------------|----------------|
| Coverage | GSI | 0–1 (natural range) | Ground occupation — most basic morphological indicator |
| Density | FSI | 0–max(library) | Built volume — the core density measure |
| Height | L (floors) | 0–max(library) | Vertical character |
| Grain | buildings/ha | 0–max(library) | Fine-grained (many small) vs. coarse-grained (few large) |
| Canyon | canyon_hw_ratio | 0–3 (clamped) | Street enclosure — strong spatial quality indicator |
| Connectivity | intersection_density | 0–max(library) | Network permeability |
| Integration | NAIN R800 | 0–1.5 (cityseer range) | Neighborhood-scale accessibility |
| Diversity | land_use_entropy | 0–1 (natural range) | Mix of uses |

Radar chart implementation: SVG polygon overlay. Each fragment is a colored polygon (semi-transparent fill, solid stroke). When comparing 2 fragments, overlap areas are visible. D3.js handles the axis scaling and polygon generation.

---

## 4. CRS-Reassignment Relocation

### 4.1 Algorithm

The relocation algorithm, validated by D1, uses CRS reassignment rather than coordinate transformation:

```python
from pyproj import CRS
import geopandas as gpd

def relocate_fragment(
    fragment_gdf: gpd.GeoDataFrame,
    source_centroid: tuple[float, float],  # (lng, lat) WGS84
    dest_centroid: tuple[float, float],    # (lng, lat) WGS84
) -> gpd.GeoDataFrame:
    """Relocate fragment via CRS reassignment. Zero geometric distortion."""

    # 1. Create custom Transverse Mercator CRS at source
    source_tmerc = CRS.from_proj4(
        f"+proj=tmerc +lat_0={source_centroid[1]} "
        f"+lon_0={source_centroid[0]} +k=1 +x_0=0 +y_0=0 "
        f"+datum=WGS84 +units=m +no_defs"
    )

    # 2. Project fragment to source tmerc (local meter coordinates)
    fragment_local = fragment_gdf.to_crs(source_tmerc)

    # 3. Create custom Transverse Mercator CRS at destination
    dest_tmerc = CRS.from_proj4(
        f"+proj=tmerc +lat_0={dest_centroid[1]} "
        f"+lon_0={dest_centroid[0]} +k=1 +x_0=0 +y_0=0 "
        f"+datum=WGS84 +units=m +no_defs"
    )

    # 4. Reassign CRS label WITHOUT transforming coordinates
    #    This is the key: set_crs() replaces the label, not the values
    fragment_relocated = fragment_local.set_crs(dest_tmerc, allow_override=True)

    # 5. Project back to WGS84 — buildings now appear at destination
    return fragment_relocated.to_crs("EPSG:4326")
```

### 4.2 Performance Budget

| Step | Time | Notes |
|------|------|-------|
| Load GeoParquet (500 buildings) | 0.28s | GeoPandas `read_parquet()` |
| CRS reassignment | <0.01s | Label swap, no coordinate math |
| Re-tessellate at destination | 1.18s | Enclosed tessellation (new enclosures from destination context streets) |
| Recompute metrics | 0.59s | 67 intrinsic identical; 5 orientation metrics recalculated |
| **Total** | **1.79s** | [D1 measurement] |

### 4.3 Metric Integrity After Relocation

D1 validated that 67 of 73 metrics (91.8%) show exactly 0.000% change after relocation from Barcelona to Singapore (40° latitude difference, 102° longitude difference). The 5 orientation-sensitive metrics and their maximum changes:

| Metric | Change | Reason |
|--------|--------|--------|
| alignment_mean | 6.31% | Meridian convergence shifts grid-north reference |
| alignment_std | 3.65% | Boundary effect on orientation distribution |
| orientation_std | 3.36% | Same as alignment_std |
| elongation_std | 0.27% | Minor boundary sensitivity |
| orientation_mean | 0.27% | Meridian convergence (small at macro scale) |

The UI should mark these 5 metrics with an orientation-sensitivity indicator and show their pre/post values in the comparison view.

---

## 5. Hole Cutting — Hard Clip with Centroid-Inside

### 5.1 Algorithm

Per D3's recommendation, hard clip with centroid-inside is the default boundary strategy:

```python
from shapely.geometry import Point
from shapely.ops import unary_union

def hard_clip_context(
    context_buildings: gpd.GeoDataFrame,
    context_streets: gpd.GeoDataFrame,
    fragment_boundary: Polygon,
    buffer_m: float = 5.0,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, dict]:
    """Remove context elements whose centroid falls inside the placement polygon."""

    # 1. Buffer fragment boundary to prevent sliver overlaps
    placement_polygon = fragment_boundary.buffer(buffer_m)

    # 2. Clip buildings — centroid-inside rule
    centroids = context_buildings.geometry.centroid
    inside_mask = centroids.apply(placement_polygon.contains)
    clipped_buildings = context_buildings[~inside_mask].copy()
    removed_count = inside_mask.sum()

    # 3. Clip streets — midpoint-inside rule
    midpoints = context_streets.geometry.interpolate(0.5, normalized=True)
    street_mask = midpoints.apply(placement_polygon.contains)
    clipped_streets = context_streets[~street_mask].copy()

    # 4. Report
    stats = {
        "buildings_removed": int(removed_count),
        "buildings_remaining": len(clipped_buildings),
        "streets_removed": int(street_mask.sum()),
        "removal_fraction": float(removed_count / len(context_buildings)),
    }

    return clipped_buildings, clipped_streets, stats
```

### 5.2 Performance

D3 tested hard clip on Barcelona fragment (74 buildings) in Prague context (1,264 buildings):
- Removed 147 buildings (11.6% of context)
- Computation time: <0.01s (Shapely `contains()` is O(n) with point-in-polygon)
- Zero residual buildings — centroid-inside is unambiguous

### 5.3 Visual Approach

After clipping, the context has a "hole" where the fragment sits:

| Element | Color | Opacity | Rendering |
|---------|-------|---------|-----------|
| Fragment buildings | Accent orange (`#FF6B35`) | 100% | InstancedMesh, focal mode |
| Context buildings (remaining) | Grey (`#9E9E9E`) | 60% | InstancedMesh, context mode |
| Fragment streets | Orange lines | 80% | MapLibre line layer |
| Context streets | Grey lines | 40% | MapLibre line layer |
| Placement boundary | Dashed white line | 80% | MapLibre line layer |

The accent/grey distinction makes it immediately visible which buildings belong to the fragment vs. the context.

---

## 6. Placement and Rotation UX

### 6.1 Placement Mode

When "Place Fragment" is clicked with a library fragment selected:

1. **Enter placement mode** — cursor changes to crosshair, map click behavior changes
2. **Click map** — places fragment center at click point
3. **Preview appears** — fragment buildings shown in semi-transparent orange (40% opacity) at click location
4. **Confirm/Cancel** — "Confirm Placement" button appears in toolbar; "Cancel" returns to normal mode
5. **On confirm** — triggers `/fragment/relocate` then `/fragment/place` (hard clip)

### 6.2 Rotation Handle

After placement preview appears (before confirm):

- A circular rotation handle appears around the fragment boundary
- Drag the handle to rotate the fragment in 5° increments (Shift for free rotation)
- Rotation angle displayed as text overlay (e.g., "Rotation: 15°")
- Rotation is applied to the fragment's local coordinates before CRS reassignment — since the relocation works in local meter space, rotation is a simple affine transform

```python
from shapely.affinity import rotate

def rotate_fragment(
    fragment_gdf: gpd.GeoDataFrame,
    angle_degrees: float,
    origin: str = "centroid",
) -> gpd.GeoDataFrame:
    """Rotate fragment geometry around its centroid."""
    centroid = unary_union(fragment_gdf.geometry).centroid
    rotated = fragment_gdf.copy()
    rotated.geometry = fragment_gdf.geometry.apply(
        lambda geom: rotate(geom, angle_degrees, origin=centroid)
    )
    return rotated
```

### 6.3 Post-Placement Adjustment

After confirmation, the fragment can be:
- **Nudged** — arrow keys move fragment ±10m (±1m with Shift)
- **Re-rotated** — click "Rotate" to re-enter rotation mode
- **Removed** — click "Remove Fragment" to undo placement and restore context

Each adjustment triggers a lightweight recompute: re-clip context, re-merge networks. The fragment's intrinsic metrics don't change (they're stored from extraction). Only context-dependent operations (clipping, merging) need recomputation (<5s total).

---

## 7. Context Loading at Destination

### 7.1 Automatic Context Extraction

When a fragment is placed, the backend needs context data at the destination. The extraction bbox is computed as:

```python
def compute_context_bbox(
    fragment_bounds: tuple[float, float, float, float],  # (minx, miny, maxx, maxy) WGS84
    buffer_m: float = 200.0,
) -> tuple[float, float, float, float]:
    """Compute context extraction bbox around relocated fragment."""
    from pyproj import Transformer

    # Fragment extent + 200m buffer for metric convergence
    center_lat = (fragment_bounds[1] + fragment_bounds[3]) / 2
    # Approximate: 1° lat ≈ 111,320m, 1° lng ≈ 111,320m × cos(lat)
    lat_buffer = buffer_m / 111320
    lng_buffer = buffer_m / (111320 * cos(radians(center_lat)))

    return (
        fragment_bounds[0] - lng_buffer,
        fragment_bounds[1] - lat_buffer,
        fragment_bounds[2] + lng_buffer,
        fragment_bounds[3] + lat_buffer,
    )
```

### 7.2 Context Extraction Options

| Option | Endpoint Call | Time | What's Included |
|--------|-------------|------|----------------|
| Minimal (for clip + render only) | `/extract` with metrics=false | ~30–50s | Buildings, streets, neatnet, heights |
| Full (for comparison metrics) | `/extract` with all options | ~85s avg | + tessellation, metrics, space syntax |

The prototype should use **minimal extraction by default** (fastest response), with a "Compute Context Metrics" button to trigger full extraction if the user wants to compare fragment metrics against context metrics.

### 7.3 Context Caching

The Python backend caches extracted contexts in memory (LRU, 5-entry limit keyed by bbox hash). If the user places multiple fragments in the same city, the context is extracted once. The LRU cache uses `functools.lru_cache` on a function that takes the bbox tuple as argument (hashable).

---

## 8. Network Merging for Walkability

### 8.1 Edge-Split Merge Pipeline

Per K3's validated approach:

```python
import networkx as nx
from shapely.geometry import Point, LineString
from shapely import STRtree

def merge_networks(
    fragment_streets: gpd.GeoDataFrame,
    context_streets: gpd.GeoDataFrame,
    max_snap_distance: float = 50.0,  # meters
    min_split_distance: float = 2.0,   # meters — prevent degenerate splits
) -> tuple[nx.Graph, dict]:
    """Merge fragment and context street networks via edge-split."""

    # 1. Build combined graph
    G = nx.Graph()
    # Add context edges (with geometry attribute)
    for idx, row in context_streets.iterrows():
        coords = list(row.geometry.coords)
        G.add_edge(f"ctx_{idx}_a", f"ctx_{idx}_b",
                   geometry=row.geometry,
                   length=row.geometry.length,
                   source="context")

    # Add fragment edges
    for idx, row in fragment_streets.iterrows():
        G.add_edge(f"frag_{idx}_a", f"frag_{idx}_b",
                   geometry=row.geometry,
                   length=row.geometry.length,
                   source="fragment")

    # 2. Find fragment boundary endpoints (within 5m of fragment boundary)
    # ... (identify endpoints that need connection)

    # 3. For each boundary endpoint, find nearest context edge via STRtree
    context_geoms = context_streets.geometry.values
    tree = STRtree(context_geoms)

    connections = []
    for endpoint in boundary_endpoints:
        nearest_idx = tree.nearest(endpoint)
        nearest_edge = context_geoms[nearest_idx]
        snap_point = nearest_edge.interpolate(nearest_edge.project(endpoint))
        distance = endpoint.distance(snap_point)

        if distance > max_snap_distance:
            continue  # Genuine gap (railway, park, water)

        # Check for degenerate split (too close to existing node)
        if distance < min_split_distance:
            # Snap to nearest existing node instead
            connections.append({"type": "node_snap", "distance": distance})
        else:
            # Split context edge and create connection
            connections.append({"type": "edge_split", "distance": distance})

    # 4. Validate connectivity
    is_connected = nx.is_connected(G.to_undirected())

    merge_stats = {
        "connections_made": len([c for c in connections if c]),
        "connections_skipped": len(boundary_endpoints) - len(connections),
        "mean_snap_distance": mean([c["distance"] for c in connections]),
        "is_connected": is_connected,
    }

    return G, merge_stats
```

### 8.2 Performance Optimization

K3 measured edge-split merge at 3.66s due to brute-force nearest-edge search. With STRtree (O(log n) per query instead of O(n)):

| Operation | Unoptimized | With STRtree | Notes |
|-----------|-------------|-------------|-------|
| Build STRtree | — | ~0.05s | One-time for ~2,000 edges |
| Edge-split merge | 3.66s | ~0.3s | 14 boundary endpoint lookups |
| Connectivity check | <0.01s | <0.01s | `nx.is_connected()` |
| **Total** | **3.66s** | **~0.35s** | 10× improvement |

### 8.3 Isochrone Generation

Per K3, NetworkX Dijkstra is sufficient for interactive isochrones:

```python
def compute_isochrone(
    G: nx.Graph,
    origin: tuple[float, float],  # (x, y) in projected CRS
    walk_speed_ms: float = 1.39,  # 5 km/h
    durations_s: list[float] = [300, 600, 900],  # 5, 10, 15 min
) -> list[Polygon]:
    """Compute walking isochrone polygons."""
    from shapely.ops import concave_hull

    # Find nearest node
    nearest_node = min(G.nodes, key=lambda n:
        Point(G.nodes[n]['x'], G.nodes[n]['y']).distance(Point(origin)))

    # Dijkstra — returns {node: distance} for all reachable nodes
    distances = nx.single_source_dijkstra_path_length(
        G, nearest_node, weight='length'
    )

    isochrones = []
    for max_time in durations_s:
        max_distance = walk_speed_ms * max_time
        reachable = [n for n, d in distances.items() if d <= max_distance]
        points = [Point(G.nodes[n]['x'], G.nodes[n]['y']) for n in reachable]
        hull = concave_hull(MultiPoint(points), ratio=0.3)
        isochrones.append(hull)

    return isochrones
```

K3 measurement: 0.011s for ~2,000 nodes — effectively instant. The concave_hull with ratio=0.3 produces more realistic shapes than convex hull (follows street network curvature rather than producing a simple convex blob).

### 8.4 Walkability Insight

K3's most striking result: a 15-minute walking isochrone from a design fragment center covers 231 ha when merged with context (1,811 reachable nodes), versus only 12 ha when evaluated in isolation (23 nodes). This 1,821% increase confirms that evaluating a fragment's walkability without its context is meaningless — the network merge step is not optional for P4.

---

## 9. Inter-Fragment Metrics

### 9.1 Boundary-Zone Metrics

Per D2, when a fragment is placed in context, metrics can be computed for three zones:

| Zone | Definition | Purpose |
|------|-----------|---------|
| **Fragment interior** | Buildings with centroid ≥100m inside fragment boundary | Pure fragment character — unaffected by boundary |
| **Boundary band** (100m) | Buildings within 100m of fragment boundary (both sides) | Transition quality — how well fragment integrates |
| **Context exterior** | Buildings with centroid ≥100m outside fragment boundary | Context character — what the fragment is displacing |

D3 validated this approach: fragment interior coverage = 0.461, context exterior = 0.388, boundary band = 0.386. The boundary band naturally interpolates between the two, confirming smooth spatial transition.

### 9.2 Cross-Boundary Spatial Weights

Per D2, KNN spatial weights bridge the fragment-context boundary:

```python
from libpysal import Graph as W

# Combine fragment + context buildings
all_buildings = pd.concat([fragment_buildings, context_buildings])

# Build KNN graph from centroids (not polygons — libpysal requirement)
centroids = all_buildings.geometry.centroid
knn_graph = W.build_knn(centroids, k=5, coplanar='clique')

# Count cross-boundary edges
cross_boundary = sum(
    1 for i, j in knn_graph.adjacency
    if (i in fragment_ids and j in context_ids) or
       (i in context_ids and j in fragment_ids)
)
```

D2 measured 77 cross-boundary edges out of 1,990 total (3.9%) for Barcelona+Prague — enough to compute meaningful spatial lag metrics across the boundary.

### 9.3 Metrics to Display in Comparison

When a fragment is placed in context, the comparison panel shows:

| Metric | Fragment Value | Context Value | Delta | Interpretation |
|--------|---------------|---------------|-------|---------------|
| GSI | (from extraction) | (from context extraction) | ±% | Coverage comparison |
| FSI | (from extraction) | (from context extraction) | ±% | Density comparison |
| L (floors) | " | " | ±% | Height comparison |
| buildings/ha | " | " | ±% | Grain comparison |
| Canyon H/W | " | " | ±% | Street enclosure comparison |
| Intersection density | " | " | ±% | Network comparison |
| NAIN R800 | " | " | ±% | Walkability comparison |
| Dead-end ratio | " | " | ±% | Permeability comparison |
| LCZ type | Type label | Type label | Match/mismatch | Typological compatibility |
| 15-min walk area | (from merged isochrone) | — | ha | Walkability reach |

The delta column uses color coding: green if fragment is "better" (higher FSI for density, lower dead-end ratio for permeability), red if "worse," grey if within 10% (similar).

---

## 10. Dual Rendering System

### 10.1 Building Rendering Modes

The shared `BuildingMesh` from `@collage/map-template` supports two concurrent InstancedMesh groups:

```typescript
interface DualBuildingRenderer {
  // Fragment buildings — accent color, full opacity
  setFragmentBuildings(buildings: BuildingFeature[]): void;

  // Context buildings — grey, reduced opacity
  setContextBuildings(buildings: BuildingFeature[]): void;

  // Color a specific metric on fragment buildings only
  colorFragmentByMetric(
    metricKey: string,
    values: Map<string, number>,
    ramp: ColorRamp
  ): void;

  // Highlight on hover (either group)
  highlightBuilding(buildingId: string | null): void;

  // Show/hide each group
  setFragmentVisible(visible: boolean): void;
  setContextVisible(visible: boolean): void;
}
```

### 10.2 Rendering Specification

| Property | Fragment Buildings | Context Buildings |
|----------|-------------------|-------------------|
| Geometry | InstancedMesh `BoxGeometry(1,1,1)` | InstancedMesh `BoxGeometry(1,1,1)` |
| Base color | `#FF6B35` (warm orange) | `#9E9E9E` (medium grey) |
| Opacity | 1.0 | 0.6 |
| Material | `MeshLambertMaterial` | `MeshLambertMaterial({ transparent: true })` |
| Metric coloring | Yes (overrides base color) | No (always grey) |
| Hover highlight | Yellow emissive glow | Light grey emissive glow |
| Click select | Blue outline | Grey outline |
| Shadows | Cast + receive | Cast only (no receive, for performance) |

### 10.3 Street Rendering

Streets use MapLibre line layers (not Three.js), following the same dual-color approach:

```typescript
// Fragment streets layer
map.addLayer({
  id: 'fragment-streets',
  type: 'line',
  source: 'fragment-streets-source',
  paint: {
    'line-color': '#FF6B35',
    'line-width': 3,
    'line-opacity': 0.8,
  },
});

// Context streets layer
map.addLayer({
  id: 'context-streets',
  type: 'line',
  source: 'context-streets-source',
  paint: {
    'line-color': '#9E9E9E',
    'line-width': 2,
    'line-opacity': 0.4,
  },
});

// Isochrone layers (added after merge)
map.addLayer({
  id: 'isochrone-5min',
  type: 'fill',
  source: 'isochrone-source',
  filter: ['==', ['get', 'duration'], 5],
  paint: {
    'fill-color': '#4CAF50',
    'fill-opacity': 0.4,
    'fill-outline-color': '#388E3C',
  },
});
```

### 10.4 Placement Boundary Visualization

The fragment boundary renders as a dashed line on MapLibre:

```typescript
map.addLayer({
  id: 'placement-boundary',
  type: 'line',
  source: 'placement-boundary-source',
  paint: {
    'line-color': '#FFFFFF',
    'line-width': 2,
    'line-opacity': 0.8,
    'line-dasharray': [4, 4],
  },
});
```

---

## 11. Backend Endpoints Summary

P4 calls 8 distinct backend endpoints:

| # | Endpoint | Method | Trigger | Avg. Time | Response |
|---|----------|--------|---------|-----------|----------|
| 1 | `/extract` | POST | Area selection (source) | ~85s | Full FragmentPackage |
| 2 | `/fragment/save` | POST | "Save Fragment" click | <1s | Fragment ID |
| 3 | `/fragment/load` | POST | Library card click | <1s | FragmentPackage |
| 4 | `/fragment/relocate` | POST | Placement confirmed | ~2s | Relocated FragmentPackage |
| 5 | `/fragment/place` | POST | After relocation | <0.1s | Clipped context + stats |
| 6 | `/extract` | POST | Destination context load | ~30–50s | Minimal context (no metrics) |
| 7 | `/network/merge` | POST | "Merge Networks" click | ~0.5s (optimized) | Merged graph + stats |
| 8 | `/network/isochrone` | POST | Map click after merge | ~0.02s | Isochrone polygons |

**Total time for full workflow (extract → save → navigate → place → merge → isochrone):**
- Source extraction: ~85s (one-time)
- Save: <1s
- Destination context: ~30–50s (one-time per city)
- Relocation + placement: ~2.1s
- Network merge: ~0.5s
- Isochrone: ~0.02s
- **Interactive operations (relocation through isochrone): ~2.6s** — well within interactive thresholds

---

## 12. Zustand State Management

### 12.1 Fragment Store

P4 extends the shared `useMapStore` with fragment-specific state:

```typescript
interface FragmentStore {
  // Library
  library: LibraryFragment[];
  selectedFragmentIds: string[];  // Multi-select for comparison

  // Placement state
  placementMode: 'idle' | 'selecting' | 'previewing' | 'placed';
  placedFragment: {
    fragmentId: string;
    destinationCenter: [number, number];
    rotationDeg: number;
    relocatedBuildings: BuildingFeature[];
    relocatedStreets: StreetFeature[];
  } | null;

  // Context state
  contextBuildings: BuildingFeature[];
  contextStreets: StreetFeature[];
  clipStats: { buildings_removed: number; removal_fraction: number } | null;

  // Network merge state
  mergeState: 'idle' | 'merging' | 'merged';
  mergeStats: {
    connections_made: number;
    connections_skipped: number;
    mean_snap_distance: number;
    is_connected: boolean;
  } | null;

  // Isochrone state
  isochrones: Array<{
    duration_min: number;
    polygon: GeoJSON.Feature<GeoJSON.Polygon>;
    area_ha: number;
    reachable_nodes: number;
  }>;

  // Comparison
  comparisonData: {
    fragment: Record<string, number>;
    context: Record<string, number>;
    deltas: Record<string, number>;
  } | null;

  // Actions
  extractFragment(bbox: BBox): Promise<void>;
  saveToLibrary(name: string, tags: string[]): Promise<void>;
  loadFragment(id: string): Promise<void>;
  selectFragment(id: string, multiSelect?: boolean): void;
  placeFragment(destination: [number, number]): Promise<void>;
  rotateFragment(degrees: number): void;
  confirmPlacement(): Promise<void>;
  cancelPlacement(): void;
  mergeNetworks(): Promise<void>;
  computeIsochrone(origin: [number, number]): Promise<void>;
  removeFragment(): void;
}
```

### 12.2 State Machine

```
                         ┌──────────────────────────────────────────┐
                         │                                          │
  [Extract] ──→ EXTRACTING ──→ EXTRACTED ──→ [Save] ──→ IN_LIBRARY │
                                                                    │
                                    ┌───────────────────────────────┘
                                    │
  [Place] ──→ SELECTING_DEST ──→ PREVIEWING ──┬──→ [Confirm] ──→ PLACING
                                    ↑          │                     │
                                    │   [Rotate/Nudge]               │
                                    │          │                     ↓
                                [Cancel]       └─────────────→ PLACED
                                                                     │
                                              [Merge] ──→ MERGING ──→ MERGED
                                                                     │
                                              [Click map] ──→ ISOCHRONE
```

---

## 13. Implementation Sessions

P4 is estimated at 3–4 AI agent sessions due to its complexity.

### Session 1: Extraction + Library Foundation

**Goal:** Extract fragments and manage a library.

| Task | Implementation | Test |
|------|---------------|------|
| Wire up `/extract` endpoint call | Fetch with progress updates | Select Barcelona Eixample bbox → buildings appear in 3D |
| Fragment save/load round-trip | Save to file system, load from file system | Save Barcelona → reload from library → buildings identical |
| Library sidebar with cards | React component with thumbnail, metrics, actions | Multiple fragments appear in library with correct metrics |
| Fragment thumbnail capture | Canvas snapshot on extraction complete | Thumbnails visually match the extracted area |

### Session 2: Relocation + Context Integration

**Goal:** Relocate fragments and integrate with destination context.

| Task | Implementation | Test |
|------|---------------|------|
| Context extraction at destination | `/extract` with metrics=false on placement | Navigate to Houston → context buildings appear in grey |
| CRS-reassignment relocation | `/fragment/relocate` endpoint | Barcelona fragment appears at Houston location |
| Hard clip hole-cutting | `/fragment/place` endpoint | Houston buildings inside fragment boundary disappear |
| Dual rendering (accent/grey) | Two InstancedMesh groups | Fragment clearly distinguishable from context |
| Placement boundary visualization | MapLibre dashed line layer | White dashed boundary visible around fragment |

### Session 3: Network Merge + Isochrones

**Goal:** Merge networks and generate walkability isochrones.

| Task | Implementation | Test |
|------|---------------|------|
| Edge-split network merge | `/network/merge` with STRtree | "Network connected" badge appears after merge |
| Isochrone on click | `/network/isochrone` endpoint | Click → 3 colored rings appear extending into context |
| Merge quality panel | Connection count, snap distances, connectivity status | Panel shows merge statistics |
| Isochrone area comparison | Fragment-only vs. merged area display | 15-min area dramatically larger with merge |

### Session 4 (if needed): Comparison + Polish

**Goal:** Fragment comparison, radar charts, and workflow polish.

| Task | Implementation | Test |
|------|---------------|------|
| Radar chart comparison | D3.js 8-axis radar with 2 polygons | Select Barcelona + Amsterdam → overlapping radar shapes |
| Side-by-side metric table | Comparison panel in sidebar | All key metrics with delta percentages |
| Rotation handle | SVG overlay with drag-to-rotate | Rotate fragment, buildings rotate on map |
| Nudge controls | Arrow key handlers with ±10m offset | Fragment moves, context re-clips |
| Metric sensitivity labels | UI indicators for orientation/boundary metrics | 5 orientation metrics show warning icon |

---

## 14. Success Criteria

### 14.1 Functional Criteria

| # | Criterion | Validation Method | Source |
|---|-----------|-------------------|--------|
| F1 | Extract → Save → Load round-trip preserves all data | Diff buildings GeoJSON: identical field values | B1 |
| F2 | Fragment relocation completes in <5s | Console timer from click to render | D1 (1.79s measured) |
| F3 | Buildings appear at correct destination location | Visual check: Barcelona buildings in Houston | D1 |
| F4 | Hard clip removes all context buildings inside boundary | Count residual buildings inside boundary: 0 | D3 |
| F5 | Fragment renders in accent color, context in grey | Visual distinction without labels | — |
| F6 | Network merge produces connected graph | `is_connected()` returns True | K3 |
| F7 | Isochrone extends beyond fragment boundary into context | 15-min isochrone area > fragment area | K3 (1,821% increase) |
| F8 | Library displays correct metrics for each fragment | Cross-check GSI/FSI/L with extraction output | B1 |
| F9 | Radar chart comparison shows morphological differences | Barcelona vs. Houston: visually different shapes | #15 |
| F10 | At least 3 fragments extractable from different cities | Test: Barcelona, Amsterdam, Houston | B1 (10/10 cities) |

### 14.2 Performance Criteria

| # | Criterion | Target | Spike Basis |
|---|-----------|--------|-------------|
| P1 | Source extraction time | <3 minutes | B1 (85s average, 180s max) |
| P2 | Fragment relocation + re-tessellation | <5s | D1 (1.79s) |
| P3 | Context extraction (minimal) | <90s | B1 minus metrics |
| P4 | Hard clip computation | <1s | D3 (<0.01s) |
| P5 | Network merge (with STRtree) | <2s | K3 (0.35s optimized) |
| P6 | Isochrone computation | <1s per click | K3 (0.011s) |
| P7 | Library load (10 fragments) | <2s | GeoParquet load 0.28s × 10 |
| P8 | Dual render (500 fragment + 1000 context buildings) | ≥30 FPS | A6 (10K instances) |

### 14.3 Manual Testing Plan

| # | Test | Steps | Expected Result | Priority |
|---|------|-------|-----------------|----------|
| T1 | Barcelona extraction | Select Eixample bbox → Extract | ~500 buildings appear, GSI ≈ 0.71, FSI ≈ 4.0 | High |
| T2 | Save and reload | Save Barcelona → close/reopen → load from library | Identical buildings and metrics | High |
| T3 | Place in Houston | Save Barcelona → navigate to Houston → Place Fragment | Barcelona buildings appear in Houston, context clipped | High |
| T4 | Visual distinction | Observe placed fragment | Orange buildings clearly distinguishable from grey context | High |
| T5 | Network merge | Click "Merge Networks" after placement | "Connected" badge, connection count > 0 | High |
| T6 | Isochrone | Click fragment center after merge | 3 colored rings, 15-min ring extends well beyond fragment | High |
| T7 | Amsterdam extraction | Extract Jordaan neighborhood | Different metrics from Barcelona (lower FSI) | Medium |
| T8 | Radar comparison | Select Barcelona + Amsterdam in library → Compare | Two distinct polygon shapes on radar chart | Medium |
| T9 | Rotation | Place fragment → drag rotation handle to 45° | Buildings rotate, context re-clips correctly | Medium |
| T10 | Multiple placements | Place Barcelona, then place Amsterdam nearby | Both fragments visible, both contexts clipped | Low |
| T11 | Height data quality | Extract Houston (low OSM coverage) | "Heights: estimated" indicator shows | Low |
| T12 | Large extraction | Select max 1 km² in dense area (Tokyo) | Completes within 3 minutes, renders smoothly | Low |

---

## Implications for Collage Earth

P4 is the prototype that most directly tests Collage Earth's unique value proposition. The findings from this prototype will determine:

1. **Whether the fragment concept resonates** — does extracting and relocating a neighborhood feel natural, or does it feel arbitrary?
2. **Whether the metrics tell a useful story** — when Barcelona Eixample is placed in Houston, do the comparative metrics reveal insights about what makes each place work?
3. **Whether the workflow is fast enough** — the total interactive time (relocation through isochrone) targets ~2.6s. If this exceeds 10s, the workflow will feel like a batch process, not an interactive tool.
4. **Whether dual rendering is legible** — the accent/grey distinction must be immediately understood without explanation.
5. **Whether network merge adds genuine value** — the 1,821% increase in 15-minute walk area should be visually dramatic and intuitively meaningful.

The fragment workflow is also the foundation for P5 (taxonomy) — the pre-extracted San Francisco fragments for P5 use the same extraction pipeline validated here.

## Open Questions

1. **Multi-fragment placement** — P4 focuses on single fragment placement. Finding #17 describes multi-fragment collaging (placing multiple fragments adjacently with edge handling). Should P4 demonstrate this, or is single-fragment sufficient for validation? Recommendation: single-fragment only for P4. Multi-fragment collaging is a separate prototype-level feature.

2. **Fragment versioning** — if the user extracts Barcelona twice (different dates, different OSM data), should the library track versions? For the prototype, no — each extraction is a new fragment with a unique ID. Versioning is a production concern.

3. **Orientation normalization** — D1 identified 5 orientation-sensitive metrics. Should the prototype normalize orientation to the fragment's primary street axis before comparison? This would make the metrics truly location-independent. Recommendation: show raw values with a sensitivity warning for the prototype; investigate normalization for production.

4. **Context metric computation** — should the prototype compute full metrics for the destination context? This adds ~85s but enables rich fragment-vs-context comparison. Recommendation: offer as opt-in "Compute Context Metrics" button.

5. **Pre-seeded library** — should the prototype ship with a pre-extracted library of ~5 fragments from diverse cities (Barcelona, Amsterdam, Houston, Tokyo, Lagos)? This would let users immediately start comparing without waiting for 5 extractions. Recommendation: yes, include a seed library.

## Overall Conclusion

P4's implementation plan is grounded in validated spike measurements: CRS-reassignment relocation at 1.79s with zero geometric distortion (D1), hard-clip context management with centroid-inside rule (D3), edge-split network merging with 93% connection rate and 0.011s isochrone computation (K3), and 200m buffer ensuring 79% metric convergence (D2). The complete workflow from relocation through isochrone generation targets ~2.6s of interactive computation — fast enough for real-time exploration.

The estimated 3–4 implementation sessions reflect P4's position as the most complex prototype: 8 backend endpoints, a 10-step user workflow, dual rendering, a persistent fragment library, and cross-boundary analysis. The session breakdown separates concerns cleanly: extraction + library (session 1), relocation + context (session 2), network merge + isochrones (session 3), and comparison + polish (session 4).

## Sources

[1] Spike B1 FINDINGS.md — OSM-to-Fragment Extraction Pipeline. 10/10 cities, 85s average, 61 metrics.
[2] Spike D1 FINDINGS.md — Fragment Relocation and Metric Behavior. 67/73 intrinsic, 1.79s, zero drift.
[3] Spike D2 FINDINGS.md — Fragment Edge Handling and Buffer Analysis. 200m buffer, 79% convergence, 0.149s incremental re-tessellation.
[4] Spike D3 FINDINGS.md — Design-to-Context Boundary Behavior. Hard clip centroid-inside, 147 buildings removed (11.6%).
[5] Spike K3 FINDINGS.md — Fragment-Aware Walkability Network Merging. Edge-split merge, 0.011s isochrone, 1,821% walk area increase.
[6] Finding #14 — Fragment Extraction and Definition. Boundary modes, extraction pipeline, fragment package format.
[7] Finding #15 — Fragment Comparison and Analysis. Pre-computed metrics, radar charts, similarity search.
[8] Finding #16 — Fragment Relocation and Context Interaction. CRS transformation theory, context clipping approaches.
[9] Finding #17 — Fragment Collaging. Multi-fragment placement, edge handling, collage-level analysis.
[10] Finding #83 — Prototype Designs. P4 workflow, UI layout, shared infrastructure.
