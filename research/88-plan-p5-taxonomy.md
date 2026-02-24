# §18.6 — Detailed Implementation Plan: P5 Urban Taxonomy of San Francisco

## Abstract

This document provides the complete implementation plan for P5, the urban taxonomy prototype. P5 validates the workflow: load pre-extracted San Francisco citywide data → browse ~30K tessellation cells colored by classification → toggle between three classification systems (Spacematrix, LCZ, morphometric clustering) → explore interactive D3.js diagrams (Spacematrix scatter plot, dendrogram) → zoom to neighborhood level for 3D building detail. The plan specifies the pre-extraction batch pipeline, all three classification systems with their exact algorithms and parameters, the D3.js diagram designs, city-scale rendering strategy, level-of-detail transition, and success criteria. Every performance number and library recommendation traces to a validated spike finding or research document.

## Introduction

P5 is architecturally unique among the five prototypes — it runs almost entirely client-side after loading pre-computed GeoParquet data. No backend calls occur at runtime. Instead, a one-time batch job extracts all of San Francisco, computes morphometric characters, generates tessellation, performs three classifications, and serializes everything to GeoParquet files that the browser loads at startup via DuckDB-WASM or direct fetch.

The prototype serves three research questions:
1. **Can city-scale morphological classification be pre-computed and served to the browser for interactive exploration?** This validates the batch pipeline from research findings #11–13 and spikes K2/K4.
2. **Do the three classification systems (Spacematrix, LCZ, morphometric clustering) produce geographically coherent and distinguishable results on real city data?** This validates whether the taxonomy architecture recommended in findings #11–12 is practically useful.
3. **Can interactive D3.js diagrams (Spacematrix scatter, dendrogram) provide meaningful bidirectional linked views with the map?** This validates the visualization approach for taxonomy exploration.

### Key References

| Reference | Content | Used For |
|-----------|---------|----------|
| Finding #11 | Academic urban typology frameworks | Spacematrix 8-type system, LCZ framework, framework selection |
| Finding #12 | Computational morphological classification | GMM pipeline, contextual aggregation, Ward's dendrogram, SA3 |
| Finding #13 | User-defined taxonomy systems | Interactive classification UI patterns |
| Spike K2 | Morphological fingerprint embedding | 61-metric profiles, normalization, similarity search, clustering validation |
| Spike K4 | LCZ classification | Threshold-based classification, 14.3ms, 7/10 WUDAPT agreement |
| Spike C1 | Enclosed tessellation performance | 18.4s for 2K buildings, 51.9s for 5K |
| Finding #83 | P5 prototype design | User workflow, UI layout, pre-extraction strategy, success criteria |

---

## 1. San Francisco Pre-Extraction Strategy

P5 requires city-scale data that is too large for on-demand extraction. A one-time batch job produces GeoParquet files that the frontend loads at startup.

### 1.1 Bounding Box and Scale Estimate

**San Francisco bounding box:** `[-122.52, 37.71, -122.35, 37.81]`
- Area: ~17.7 km² (land area; excluding bay water)
- Estimated buildings: ~80K–100K (OSMnx download for the full city bounds)
- Estimated streets: ~15K–20K segments
- Estimated tessellation cells: ~30K–50K (enclosed tessellation produces fewer cells than buildings because multiple buildings may share an enclosure, and some buildings are filtered)

### 1.2 Batch Pipeline Steps

The batch job runs as a Python script (`scripts/preextract_sf.py`) that calls the shared backend functions directly (not via HTTP):

| Step | Operation | Tool | Estimated Time | Output |
|------|-----------|------|---------------|--------|
| 1 | Download SF buildings | OSMnx `features_from_bbox()` | 30–60s | GeoDataFrame (~80K rows) |
| 2 | Download SF streets | OSMnx `graph_from_bbox()` | 20–40s | GeoDataFrame (~15K rows) |
| 3 | Project to UTM 10N | GeoPandas `.to_crs(EPSG:32610)` | <1s | Projected GeoDataFrames |
| 4 | Simplify streets | neatnet `simplify_network()` | 30–60s | Cleaned street network |
| 5 | Filter buildings | Remove <10m² and invalid | <1s | ~70K–90K valid buildings |
| 6 | Height assignment | OSM `building:levels` × 3.2m fallback cascade [B2] | <1s | Heights added to buildings |
| 7 | Generate enclosures | `momepy.enclosures(streets, limit)` | 5–10s | ~5K–8K enclosures |
| 8 | Enclosed tessellation | `momepy.enclosed_tessellation(buildings, enclosures)` | 5–15 min (est. for ~80K buildings) | ~30K–50K cells |
| 9 | Build spatial weights | `libpysal.graph.Graph.build_contiguity(tess, rook=False)` | 10–30s | Queen contiguity graph |
| 10 | Compute 74 primary characters | momepy functions (dimension, shape, distribution, intensity, connectivity, diversity) | 3–10 min | 74 columns per cell |
| 11 | Compute contextual characters | Aggregate at k=1, k=3 via spatial weights (IQM, IQR) | 5–15 min | ~296 columns per cell |
| 12 | Spacematrix classification | FSI/GSI/L thresholds → 8 types | <1s | `spacematrix_type` column |
| 13 | LCZ classification | Threshold scoring on BSF, BH, SVF, H/W [K4] | <1s | `lcz_class` column |
| 14 | Morphometric clustering (GMM) | PCA → GMM on contextual characters → Ward's dendrogram | 1–5 min | `cluster_id` column + dendrogram JSON |
| 15 | Serialize to GeoParquet | pyarrow + geoparquet | 10–30s | 4 output files |

**Total estimated time: ~20–45 minutes** (one-time, run once and commit results).

### 1.3 Output Files

| File | Contents | Est. Rows | Est. Size |
|------|----------|-----------|-----------|
| `sf-buildings.parquet` | Building footprints (WGS84) + height + all 74 primary metrics | ~80K | ~15–25 MB |
| `sf-tessellation.parquet` | Tessellation cells (WGS84) + building linkage + Spacematrix type + LCZ class + cluster ID + key contextual metrics | ~30K–50K | ~10–20 MB |
| `sf-streets.parquet` | Street segments (WGS84) + NAIN/NACH at radius 400/800/1600/3200 | ~15K | ~3–5 MB |
| `sf-dendrogram.json` | Ward's linkage matrix + cluster labels + cophenetic distances | 1 | ~50–100 KB |

**Total data budget: ~30–50 MB.** Committed to the repo or downloaded on first run via a fetch script.

### 1.4 Data Delivery Strategy

Two options, recommend Option A:

**Option A — Committed to repo:** GeoParquet files stored in `prototypes/p5-taxonomy/data/`. Simple, no runtime download needed. 50 MB is within Git's comfort zone.

**Option B — Downloaded on first run:** A `scripts/download-sf-data.sh` script fetches from a GitHub Release asset. Keeps the repo smaller but adds setup complexity.

**Recommendation:** Option A. The 50 MB data cost is modest, and having data in the repo eliminates setup friction for the AI agent building P5.

---

## 2. Three Classification Systems

P5 implements three independent classification systems that operate on the same tessellation cells. Each assigns a type/class label to every cell. The user toggles between them to see different "lenses" on the same urban fabric.

### 2.1 Spacematrix Classification (Instant, Deterministic)

**Source:** Berghauser Pont & Haupt (2010), adapted in finding #11 [1].

**Inputs (3 metrics, all from momepy):**
- **FSI** (Floor Space Index) = total floor area / tessellation cell area → `intensity_fsi` or computed as `building_area × floors / cell_area`
- **GSI** (Ground Space Index) = building footprint area / tessellation cell area → `spacematrix_gsi`
- **L** (mean number of floors) = FSI / GSI → derived

**8 Spacematrix Types:**

| Type | FSI Range | GSI Range | L Range | Color | Description |
|------|-----------|-----------|---------|-------|-------------|
| 1 — Low-rise, low-density | 0–0.5 | 0–0.25 | 1–2 | `#E8F5E9` (light green) | Suburban detached |
| 2 — Low-rise, medium-density | 0–0.5 | 0.25–0.5 | 1–2 | `#A5D6A7` (green) | Rowhouses, garden suburbs |
| 3 — Low-rise, high-density | 0.5–1.5 | 0.3–0.6 | 1–3 | `#66BB6A` (dark green) | Dense low-rise, village cores |
| 4 — Mid-rise, low-density | 0.5–1.5 | 0.15–0.3 | 3–6 | `#42A5F5` (blue) | Tower-in-park |
| 5 — Mid-rise, medium-density | 1.0–2.5 | 0.25–0.5 | 3–6 | `#1E88E5` (dark blue) | Perimeter blocks |
| 6 — Mid-rise, high-density | 1.5–3.5 | 0.4–0.7 | 3–8 | `#F57C00` (orange) | Dense urban core |
| 7 — High-rise, low-density | 1.5–4.0 | 0.1–0.3 | 8+ | `#AB47BC` (purple) | High-rise towers |
| 8 — High-rise, high-density | 3.0+ | 0.3+ | 8+ | `#E53935` (red) | Manhattan/Hong Kong core |

**Classification algorithm:** For each tessellation cell, compute FSI, GSI, L. Find the type whose ranges best match (minimum normalized distance to range centers, same approach as K4's LCZ scoring). Cells with FSI=0 (no building) are classified as Type 0 — "Open space" (`#F5F5F5`, light grey).

**Expected San Francisco distribution:**
- Types 1–2 dominant in the Sunset, Richmond, Outer Mission (single-family homes)
- Type 3 in the Inner Sunset, Noe Valley (dense low-rise)
- Types 4–5 in SoMa, Tenderloin, Western Addition (mid-rise mixed)
- Types 6–7 in Financial District, Rincon Hill (dense high-rise)
- Type 8 rare (few hyper-dense blocks)

### 2.2 LCZ Classification (Instant, Threshold-Based)

**Source:** Stewart & Oke (2012), implemented and validated in spike K4 [2].

**Inputs (4 metrics from momepy, 1 proxy):**
- **BSF** (Building Surface Fraction) = `spacematrix_gsi` — direct match
- **BH** (Building Height) = `dim_height_mean` — direct match
- **SVF** (Sky View Factor) = `streetscape_openness_mean` — proxy, not hemispherical SVF
- **H/W** (Height-to-Width ratio) = `streetscape_hw_ratio_mean` — direct match
- **PSF** (Pervious Surface Fraction) = `1 - BSF` — approximation (no land cover data)

**10 Built-Type LCZ Classes (LCZ 1–10):**

| LCZ | Type Name | BSF | BH (m) | SVF | H/W | Color |
|-----|-----------|-----|--------|-----|-----|-------|
| 1 | Compact high-rise | >0.40 | >25 | <0.4 | >2.0 | `#8C0000` |
| 2 | Compact midrise | >0.40 | 10–25 | 0.3–0.6 | 0.75–2.0 | `#D10000` |
| 3 | Compact low-rise | >0.40 | 3–10 | 0.2–0.6 | 0.75–1.5 | `#FF0000` |
| 4 | Open high-rise | 0.20–0.40 | >25 | 0.5–0.7 | 0.75–1.25 | `#BCA9D1` |
| 5 | Open midrise | 0.20–0.40 | 10–25 | 0.5–0.8 | 0.3–0.75 | `#F29696` |
| 6 | Open low-rise | 0.20–0.40 | 3–10 | 0.6–0.9 | 0.1–0.5 | `#FDB863` |
| 7 | Lightweight low-rise | 0.60–0.90 | 2–4 | 0.2–0.5 | 1.0–2.0 | `#FEE08B` |
| 8 | Large low-rise | 0.30–0.50 | 3–10 | 0.7–1.0 | 0.1–0.3 | `#BCBDBD` |
| 9 | Sparsely built | 0.10–0.20 | 3–10 | 0.8–1.0 | 0.0–0.25 | `#FFCB92` |
| 10 | Heavy industry | 0.20–0.30 | 5–15 | 0.6–0.9 | 0.1–0.5 | `#575757` |

**Classification algorithm:** Score each cell against all 10 LCZ types using sum of squared normalized distances to threshold ranges (same as K4 spike). Primary LCZ = lowest score. Secondary LCZ = second-lowest. Confidence = 1 - (primary_score / secondary_score). Cells with no buildings receive LCZ class "Unclassified" (`#FFFFFF`).

**Performance:** 14.3ms for 10 cities in K4; city-scale (~30K cells) estimated at <500ms.

**Expected San Francisco distribution:**
- LCZ 6 (Open low-rise) dominant across residential neighborhoods
- LCZ 2–3 (Compact mid/low-rise) in denser areas (Mission, Chinatown, North Beach)
- LCZ 4–5 (Open high-rise/midrise) in SoMa, Financial District edges
- LCZ 1 (Compact high-rise) in Financial District core
- LCZ 8 (Large low-rise) in industrial zones (Bayview, Dogpatch warehouses)

### 2.3 Morphometric Clustering (GMM + Ward's Dendrogram)

**Source:** Fleischmann et al. (2022) numerical taxonomy methodology, validated conceptually in spike K2 [3], detailed pipeline from finding #12 [4], and the urbantaxonomy.org/HiMoC methodology [5].

**Pipeline (during batch pre-extraction):**

**Step 1 — Feature preparation:**
- Start with the ~296 contextual characters (74 primary × 4 aggregation levels at k=0, k=1, k=3 orders of queen contiguity)
- Contextual aggregation uses two summary statistics per character per k-level:
  - **IQM** (interquartile mean) — robust central tendency
  - **IQR** (interquartile range) — spread/dispersion
- This produces: 74 primary + (74 × 2 × 3 k-levels) = 74 + 444 = ~518 features
- **Practical simplification for P5:** Use a reduced feature set. Compute primary + k=1 contextual (74 + 148 = 222 features). This is sufficient for city-scale classification and avoids the computational cost of k=3/k=5 for ~30K cells. Finding #12 notes that k=1 captures the most important local context.

**Step 2 — Standardization:**
- z-score normalize all features (subtract mean, divide by std)
- Use `sklearn.preprocessing.StandardScaler`

**Step 3 — Dimensionality reduction:**
- PCA to reduce from ~222 dimensions to ~20–30 principal components capturing ≥90% of variance
- K2 spike found PC1 captures 83.9% of variance (dimension/scale metrics dominate), so log-transforming dimension metrics before PCA is recommended [K2]
- `sklearn.decomposition.PCA(n_components=0.90)` — auto-select number of components for 90% variance

**Step 4 — GMM clustering:**
- `sklearn.mixture.GaussianMixture` with BIC-based model selection
- Fit models for k=5, 6, 7, ..., 20 clusters
- Select k with lowest BIC score (BIC penalizes model complexity, prevents overfitting)
- Expected result for San Francisco: ~8–12 clusters representing distinct urban form types
- Use `covariance_type='full'` for elliptical clusters (different shapes per cluster)
- Set `n_init=5` for multiple random restarts to avoid local optima

**Step 5 — Ward's hierarchical clustering on cluster centroids:**
- Compute the centroid (mean profile) of each GMM cluster
- Apply Ward's minimum-variance linkage: `scipy.cluster.hierarchy.linkage(centroids, method='ward')`
- This produces the dendrogram linkage matrix encoding morphological (dis)similarity between types
- Cut the dendrogram at multiple levels to provide coarse→fine type resolution

**Step 6 — Serialize results:**
- Per-cell: `cluster_id` (integer), `cluster_probability` (float, from GMM soft assignment)
- Dendrogram: linkage matrix as JSON array, cluster labels, cophenetic distances
- Cluster centroids: mean profile per cluster (for the Spacematrix diagram overlay)

**Performance estimate for ~30K cells, ~222 features:**
- PCA: <5s
- GMM (k=5..20, 16 models × 5 restarts): ~2–5 min
- Ward's linkage on ~10 centroids: <1s
- Total clustering: ~3–6 min (one-time, during batch extraction)

### 2.4 Classification Data Schema

Each tessellation cell carries all three classifications simultaneously:

```typescript
interface ClassifiedCell {
  // Geometry
  cell_id: string;
  geometry: Polygon;           // WGS84 coordinates
  building_id: string | null;  // linked building (null for empty cells)

  // Primary metrics (subset, for hover tooltip)
  building_area: number;
  building_height: number;
  fsi: number;
  gsi: number;
  floors: number;

  // Spacematrix classification
  spacematrix_type: number;    // 0–8
  spacematrix_label: string;   // "Mid-rise, medium-density"

  // LCZ classification
  lcz_class: number;           // 1–10
  lcz_label: string;           // "Compact midrise"
  lcz_score: number;           // confidence (lower = better fit)
  lcz_secondary: number;       // second-best LCZ class

  // Morphometric clustering
  cluster_id: number;          // 0–N
  cluster_probability: number; // GMM soft assignment probability
  cluster_label: string;       // human-readable label (assigned during review)
}
```

---

## 3. City-Scale Rendering Strategy

### 3.1 The Problem

Rendering ~30K–50K tessellation cells at ≥30 FPS requires careful engineering. Three.js InstancedMesh is optimized for identical geometries (buildings as boxes), but tessellation cells are all unique polygons.

### 3.2 Approach: MapLibre `fill-extrusion` for Cells

**Use MapLibre GL JS native `fill-extrusion` layer**, not Three.js, for tessellation cell rendering. Reasons:
- MapLibre's WebGL renderer is optimized for arbitrary polygon fills with data-driven styling
- `fill-extrusion` supports flat polygons (extrusion height = 0) with per-feature color — exactly what tessellation cells need
- No Three.js geometry construction overhead for ~30K unique polygons
- MapLibre handles frustum culling, level-of-detail, and tile-based rendering natively

**Implementation:**
```typescript
// Add tessellation cells as a GeoJSON source
map.addSource('tessellation', {
  type: 'geojson',
  data: tessellationGeoJSON // loaded from GeoParquet → converted to GeoJSON
});

// Render as flat colored polygons
map.addLayer({
  id: 'tess-cells',
  type: 'fill-extrusion',
  source: 'tessellation',
  paint: {
    'fill-extrusion-color': ['get', 'color'],  // set per classification
    'fill-extrusion-height': 0.5,               // slight extrusion for visibility
    'fill-extrusion-opacity': 0.85
  }
});
```

**Performance expectation:** MapLibre handles 100K+ features for `fill` layers routinely. At 30K features with simple styling, ≥30 FPS is expected even on modest hardware. Finding #83 targets ≥30 FPS [6].

### 3.3 Classification Toggle — Instant Recoloring

When the user switches between Spacematrix → LCZ → Cluster, recolor all cells without re-fetching data:

```typescript
function setClassification(mode: 'spacematrix' | 'lcz' | 'cluster') {
  const colorProperty = {
    spacematrix: 'spacematrix_color',
    lcz: 'lcz_color',
    cluster: 'cluster_color'
  }[mode];

  map.setPaintProperty('tess-cells', 'fill-extrusion-color', ['get', colorProperty]);
}
```

Each cell carries pre-computed color strings for all three classifications in its GeoJSON properties. Toggle is a single `setPaintProperty` call — effectively instant (<16ms).

**Performance target:** <500ms for classification toggle (finding #83 criterion #2). Actual expectation: <50ms.

### 3.4 Level-of-Detail Transition (z<15 → z≥15)

At city scale (zoom <15), show only tessellation cells (flat colored polygons). When the user zooms to neighborhood level (zoom ≥15), add 3D buildings via the shared BuildingMesh (InstancedMesh from A6 spike).

**Implementation:**
- Listen for `map.on('zoom', ...)` events
- At zoom ≥15: load buildings within the current viewport from the pre-computed buildings GeoParquet, construct InstancedMesh, add to Three.js scene
- At zoom <15: remove InstancedMesh from scene
- Use a debounce (200ms) to prevent thrashing during zoom animation

**Building count at z≥15:** A viewport at zoom 15 covers ~1 km². At San Francisco density, this is ~2K–5K buildings — well within InstancedMesh's 60 FPS budget (A6 spike validated 60K instances at 58 FPS [A6]).

**Transition smoothness:** Fade buildings in/out over 300ms using opacity animation on the InstancedMesh material.

### 3.5 GeoParquet to GeoJSON Conversion

The browser needs to convert GeoParquet to GeoJSON for MapLibre. Two approaches:

**Option A — DuckDB-WASM (recommended):**
- Load GeoParquet directly in the browser via `@duckdb/duckdb-wasm`
- Query: `SELECT ST_AsGeoJSON(geometry) as geom, * FROM 'sf-tessellation.parquet'`
- Converts ~30K cells in ~2–5s
- Advantage: Can also do SQL queries for filtering

**Option B — Pre-converted GeoJSON:**
- Convert GeoParquet to GeoJSON during batch extraction
- Store as `sf-tessellation.geojson` (~50–100 MB uncompressed, ~10–20 MB gzipped)
- Simpler but larger download

**Recommendation:** Option A (DuckDB-WASM). It keeps the data compact on disk and allows SQL filtering. If DuckDB-WASM proves too complex for the prototype timeline, fall back to Option B.

**Alternative — geoarrow/geoparquet-wasm:**
- The `geoarrow-wasm` or `parquet-wasm` npm packages can read GeoParquet directly
- Lighter than DuckDB-WASM (~500KB vs ~10MB)
- `parquet-wasm` + manual GeoJSON construction is a viable middle ground

**Practical recommendation for prototype:** Start with Option B (pre-converted GeoJSON) for simplicity. The AI agent building P5 can upgrade to DuckDB-WASM or parquet-wasm if load times are problematic.

---

## 4. Interactive Spacematrix Diagram (D3.js)

### 4.1 Diagram Design

The Spacematrix diagram is a scatter plot of FSI (y-axis) vs. GSI (x-axis), divided into 8 zones corresponding to the 8 Spacematrix types. Each tessellation cell appears as a dot positioned by its FSI/GSI values.

**Axes:**
- X-axis: GSI (Ground Space Index), range 0–1.0
- Y-axis: FSI (Floor Space Index), range 0–6.0 (or auto-scaled to data max)
- Both axes linear scale

**Zone boundaries:** Drawn as semi-transparent colored rectangles matching the 8 Spacematrix type colors. Zone boundaries from Section 2.1.

**Data points:**
- Each dot = one tessellation cell with a building
- Dot color = current Spacematrix type color
- Dot size = 2px (small, to handle 30K points)
- Dot opacity = 0.3 (to handle overlap)

**Rendering 30K dots:** D3.js SVG will struggle with 30K circle elements. Use **Canvas rendering** instead:
- D3.js for axes, labels, zone rectangles (SVG overlay)
- HTML Canvas for the 30K data points
- Canvas can render 30K dots at 60 FPS

### 4.2 Bidirectional Interaction

**Diagram → Map (click zone):**
- User clicks a Spacematrix zone rectangle in the diagram
- All cells of that type are highlighted on the map (full opacity), others dimmed (20% opacity)
- Zone rectangle gets a selection border

**Diagram → Map (brush selection):**
- User drags a rectangle on the scatter plot to select a FSI/GSI range
- Cells within that range are highlighted on the map
- Uses D3.js brush: `d3.brush().on('brush', highlightCells)`

**Map → Diagram (click cell):**
- User clicks a tessellation cell on the map
- The corresponding dot in the scatter plot gets highlighted (larger, outlined)
- The cell's FSI/GSI position is shown with crosshair lines

**Map → Diagram (hover cell):**
- User hovers a cell on the map
- The corresponding dot in the diagram pulses briefly

### 4.3 Implementation

```typescript
// Spacematrix diagram component
interface SpacematrixDiagramProps {
  cells: ClassifiedCell[];          // All tessellation cells
  selectedType: number | null;      // Currently selected Spacematrix type
  highlightedCellId: string | null; // Cell highlighted from map click
  onTypeSelect: (type: number | null) => void;
  onBrushSelect: (fsiRange: [number, number], gsiRange: [number, number]) => void;
}
```

**D3.js libraries needed:**
- `d3-scale` — linear scales for axes
- `d3-axis` — axis rendering
- `d3-brush` — rectangular brush selection
- `d3-selection` — SVG element manipulation

**Canvas strategy:**
- Create an offscreen Canvas element sized to match the diagram area
- On data load or classification change, redraw all points to canvas
- Layer: Canvas (points) underneath SVG (axes, zones, interactions)
- On brush/click, redraw canvas with highlighted points in full opacity, others dimmed

---

## 5. Dendrogram Visualization (D3.js)

### 5.1 Diagram Design

The dendrogram shows the hierarchical relationship between morphometric cluster types. It is displayed when the user is in "Cluster" classification mode.

**Structure:**
- Leaf nodes = GMM cluster types (expected ~8–12 for San Francisco)
- Internal nodes = merge points from Ward's hierarchical clustering
- Vertical axis = cophenetic distance (morphological dissimilarity) — higher merge = more different
- Horizontal axis = cluster arrangement (optimized leaf ordering for minimum crossing)

**Visual encoding:**
- Each leaf node colored by cluster color
- Branch lines in neutral grey
- Node labels show cluster ID and optional human-readable name
- Merge height annotations at key bifurcation points

**Cut-level indicator:**
- A horizontal draggable line across the dendrogram
- Moving it up/down changes the number of active types (higher = fewer, coarser types; lower = more, finer types)
- Default: cut at the level that preserves the GMM-determined number of clusters
- Dragging the cut line recolors the map in real-time: clusters below the cut that merge above it get the same color

### 5.2 Bidirectional Interaction

**Dendrogram → Map (click leaf):**
- Clicking a leaf node highlights all cells of that cluster on the map
- Other cells dimmed to 20% opacity

**Dendrogram → Map (drag cut level):**
- Dragging the cut line up merges clusters and recolors the map
- Example: 10 clusters → cut higher → 5 mega-clusters
- Each mega-cluster gets a blended color from its constituent clusters

**Map → Dendrogram (click cell):**
- Clicking a cell on the map highlights its cluster's leaf node in the dendrogram
- The path from leaf to root is highlighted

### 5.3 Implementation

```typescript
interface DendrogramProps {
  linkageMatrix: number[][];        // scipy linkage matrix format: [idx1, idx2, dist, count]
  clusterLabels: string[];          // Human-readable labels per cluster
  clusterColors: string[];          // Color per cluster
  selectedCluster: number | null;   // Currently selected cluster
  cutLevel: number;                 // Current dendrogram cut height
  onClusterSelect: (id: number | null) => void;
  onCutLevelChange: (level: number) => void;
}
```

**D3.js implementation approach:**
- `d3-hierarchy`: Convert scipy linkage matrix to D3 hierarchy using `d3.cluster()` layout
- `d3-shape`: `d3.linkVertical()` for elbow-style branch connections (standard dendrogram rendering)
- `d3-drag`: For the cut-level horizontal line
- `d3-transition`: For smooth recoloring when cut level changes

**Linkage matrix format (from scipy):**
```json
// Each row: [cluster_a, cluster_b, merge_distance, new_cluster_size]
[
  [0, 3, 1.23, 2],    // Clusters 0 and 3 merge at distance 1.23
  [1, 5, 1.89, 2],    // Clusters 1 and 5 merge at distance 1.89
  [10, 2, 3.45, 3],   // Merged cluster (0,3) merges with 2 at distance 3.45
  // ...
]
```

**Converting to D3 hierarchy:**
```typescript
function linkageToHierarchy(linkage: number[][], labels: string[]) {
  const n = labels.length;
  const nodes = labels.map((label, i) => ({ id: i, label, children: [] }));

  linkage.forEach(([a, b, dist, size], i) => {
    const newNode = {
      id: n + i,
      distance: dist,
      children: [nodes[a], nodes[b]]
    };
    nodes.push(newNode);
  });

  return d3.hierarchy(nodes[nodes.length - 1]);
}
```

### 5.4 Cut-Level Recoloring Algorithm

When the user drags the cut level to height `h`:

1. Walk the dendrogram tree. Any merge that occurs at distance > `h` is "above the cut" — its children are separate clusters.
2. Any merge at distance ≤ `h` is "below the cut" — its subtree is one mega-cluster.
3. Collect the mega-clusters (subtrees below the cut line).
4. Assign each mega-cluster a color (use the color of its largest constituent leaf cluster).
5. Update the `cluster_id` → `mega_cluster_id` mapping.
6. Recolor all cells on the map using the mega-cluster colors.

This recoloring should be instant since it only changes a color property mapping, not the geometry.

---

## 6. Hover and Click Detail Panel

### 6.1 Hover Tooltip

On cell hover, display a floating tooltip near the cursor:

```
┌─────────────────────────┐
│ Cell #12847              │
│ ─────────────────────── │
│ Area: 342 m²            │
│ Height: 12.4 m          │
│ Floors: 4               │
│ FSI: 1.82  GSI: 0.45    │
│ ─────────────────────── │
│ Spacematrix: Mid-rise    │
│   medium-density (Type 5)│
│ LCZ: Compact midrise (2) │
│ Cluster: #4              │
└─────────────────────────┘
```

**Implementation:** MapLibre `mouseenter`/`mouseleave` events on the `tess-cells` layer. Render tooltip as an absolutely-positioned React component.

### 6.2 Click Detail Panel

On cell click, display a detail panel in the sidebar below the diagram:

```
┌─────────────────────────────┐
│ Cell #12847 — Detail         │
│ ─────────────────────────── │
│ Building: 1423 Mission St    │
│ Area: 342 m²                │
│ Height: 12.4 m (4 floors)   │
│ ─────────────────────────── │
│ SPACEMATRIX                  │
│  FSI: 1.82 │ GSI: 0.45      │
│  Type: Mid-rise medium (5)   │
│                              │
│ LCZ                          │
│  BSF: 0.45 │ BH: 12.4m      │
│  H/W: 0.92 │ SVF: 0.54      │
│  Class: Compact midrise (2)  │
│  Confidence: 0.89            │
│  Secondary: LCZ 3 (0.12)    │
│                              │
│ CLUSTER                      │
│  Cluster: #4                 │
│  Probability: 0.78           │
│  Nearest: #7 (distance 2.3)  │
│                              │
│ KEY METRICS                  │
│  Compactness: 0.72           │
│  Elongation: 0.35            │
│  Orientation: 127°           │
│  Adjacency: 0.83             │
└─────────────────────────────┘
```

### 6.3 Map → Diagram Link on Click

When a cell is clicked:
1. In Spacematrix mode: highlight the cell's dot in the scatter plot with a larger circle + crosshair lines
2. In Cluster mode: highlight the cell's cluster leaf in the dendrogram with a pulsing indicator
3. In LCZ mode: highlight the cell's LCZ class in the legend with a border

---

## 7. Type Filtering

### 7.1 Legend Click to Filter

Each classification mode displays a legend on the map. Clicking a legend entry filters the map:

**Spacematrix legend:** 8 colored swatches with type names. Click one → show only cells of that type (full opacity), dim all others (opacity 0.15).

**LCZ legend:** 10 colored swatches with LCZ class names. Same click-to-filter behavior.

**Cluster legend:** N colored swatches with cluster IDs. Same behavior.

**Implementation:**
```typescript
function filterByType(activeTypes: Set<number>) {
  map.setPaintProperty('tess-cells', 'fill-extrusion-opacity', [
    'case',
    ['in', ['get', currentClassProperty], ['literal', [...activeTypes]]],
    0.85,   // active types: full opacity
    0.15    // inactive types: dimmed
  ]);
}
```

### 7.2 Multi-Select

Hold Shift + click to select multiple types. Click a selected type again to deselect. Click "Show All" button to reset.

---

## 8. UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (380px)     │ │                                          ││
│ │              │ │  [~30K tessellation cells colored by     ││
│ │ ┌──────────┐ │ │   active classification]                  ││
│ │ │[Space]   │ │ │                                          ││
│ │ │[LCZ]     │ │ │  At z≥15: 3D buildings visible           ││
│ │ │[Cluster] │ │ │                                          ││
│ │ ├──────────┤ │ │       ┌───────────────────────┐          ││
│ │ │          │ │ │       │ Classification Legend  │          ││
│ │ │ DIAGRAM  │ │ │       │ (type colors + names) │          ││
│ │ │ AREA     │ │ │       │ Click to filter       │          ││
│ │ │          │ │ │       └───────────────────────┘          ││
│ │ │(Spacemtx │ │ │                                          ││
│ │ │ scatter  │ │ │                                          ││
│ │ │  OR      │ │ │                                          ││
│ │ │Dendrogm) │ │ │                                          ││
│ │ │          │ │ │                                          ││
│ │ ├──────────┤ │ │                                          ││
│ │ │ DETAIL   │ │ │                                          ││
│ │ │ PANEL    │ │ │  ┌──────────────────────────────────┐    ││
│ │ │(on cell  │ │ │  │ Status bar: "30,247 cells |      │    ││
│ │ │ click)   │ │ │  │  Spacematrix | 8 types shown"    │    ││
│ │ └──────────┘ │ │  └──────────────────────────────────┘    ││
│ └──────────────┘ └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Sidebar sections (top to bottom):**
1. **Classification toggle** — three buttons: [Spacematrix] [LCZ] [Cluster]. Active button highlighted.
2. **Diagram area** — Spacematrix scatter (when Spacematrix or LCZ active) or Dendrogram (when Cluster active). Height: ~300px.
3. **Detail panel** — appears on cell click. Shows full metric breakdown for selected cell. Height: ~250px, scrollable.

**Map overlays:**
- **Classification legend** — top-right corner. Shows current classification's type colors and names. Click to filter.
- **Status bar** — bottom of map. Shows: cell count, active classification name, number of visible types.

---

## 9. Zustand State Management

```typescript
interface TaxonomyStore {
  // Data (loaded once at startup)
  cells: ClassifiedCell[];
  buildings: BuildingFeature[];     // for z≥15 3D rendering
  streets: StreetFeature[];
  dendrogramLinkage: number[][];
  clusterLabels: string[];
  clusterColors: string[];

  // Classification state
  activeClassification: 'spacematrix' | 'lcz' | 'cluster';
  setClassification: (mode: 'spacematrix' | 'lcz' | 'cluster') => void;

  // Filter state
  activeTypes: Set<number>;         // which types are currently shown
  toggleType: (typeId: number) => void;
  showAllTypes: () => void;

  // Selection state
  selectedCellId: string | null;
  hoveredCellId: string | null;
  selectCell: (id: string | null) => void;
  hoverCell: (id: string | null) => void;

  // Dendrogram state
  cutLevel: number;                 // dendrogram cut height
  setCutLevel: (level: number) => void;
  megaClusterMapping: Map<number, number>;  // cluster_id → mega_cluster_id

  // Diagram state
  brushedRange: { fsi: [number, number]; gsi: [number, number] } | null;
  setBrushedRange: (range: { fsi: [number, number]; gsi: [number, number] } | null) => void;

  // LOD state
  currentZoom: number;
  showBuildings3D: boolean;         // true when zoom ≥ 15

  // Loading state
  dataLoaded: boolean;
  loadingProgress: number;          // 0–1
}
```

---

## 10. Backend Endpoints Used

P5 is unique in that **no backend endpoints are called at runtime**. All data is pre-computed.

| Endpoint | When Called | Purpose |
|----------|-----------|---------|
| `POST /extract` | Batch pre-extraction only | Download SF buildings + streets from OSM |
| `POST /tessellate` | Batch pre-extraction only | Generate enclosed tessellation |
| `POST /metrics/momepy` | Batch pre-extraction only | Compute 74 primary characters |
| `POST /classify` | Batch pre-extraction only | Run all 3 classifications |
| `POST /space-syntax` | Batch pre-extraction only | Compute NAIN/NACH (optional, for future use) |
| None | Runtime | All data from pre-computed GeoParquet |

The batch pre-extraction script (`scripts/preextract_sf.py`) calls backend functions directly via Python imports, not via HTTP. The FastAPI server is not needed at runtime for P5.

---

## 11. File Structure (P5-Specific)

```
prototypes/p5-taxonomy/
├── package.json                 # workspace dep on @collage/map-template
├── tsconfig.json
├── vite.config.ts
├── index.html
├── data/
│   ├── sf-buildings.parquet     # Pre-extracted building data
│   ├── sf-tessellation.parquet  # Pre-extracted tessellation + classifications
│   ├── sf-streets.parquet       # Pre-extracted streets (optional)
│   └── sf-dendrogram.json       # Ward's linkage matrix
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component — imports MapShell, adds P5 panels
│   ├── taxonomy-store.ts        # Zustand store (TaxonomyStore)
│   ├── data-loader.ts           # Load GeoParquet → GeoJSON conversion
│   ├── classification-toggle.tsx # 3-button classification switcher
│   ├── spacematrix-diagram.tsx  # D3.js FSI vs GSI scatter (Canvas + SVG)
│   ├── dendrogram.tsx           # D3.js hierarchical tree with cut-level
│   ├── cell-detail-panel.tsx    # Sidebar detail panel for clicked cell
│   ├── classification-legend.tsx # Map overlay legend with click-to-filter
│   ├── status-bar.tsx           # Bottom bar with cell count and mode
│   ├── lod-controller.ts        # Zoom-based 3D building toggle
│   └── constants.ts             # Spacematrix types, LCZ classes, colors
├── scripts/
│   └── preextract_sf.py         # One-time batch extraction script
└── FINDINGS.md                  # Prototype findings template
```

---

## 12. Implementation Sessions

### Session 1: Pre-Extraction + Data Pipeline (estimated ~2 hours for AI agent)

**Deliverables:**
- `scripts/preextract_sf.py` — complete batch extraction pipeline
- All 4 GeoParquet output files + `sf-dendrogram.json`
- `data-loader.ts` — load and convert GeoParquet to GeoJSON in browser
- `taxonomy-store.ts` — Zustand store with data loaded
- `App.tsx` — loads data, shows MapShell with tessellation cells colored by Spacematrix type

**Verification:** App starts, ~30K cells appear on the San Francisco map colored by Spacematrix type.

### Session 2: Classification Toggle + Spacematrix Diagram

**Deliverables:**
- `classification-toggle.tsx` — 3-button switcher
- `constants.ts` — type definitions, colors, thresholds
- Classification toggle recoloring (instant via `setPaintProperty`)
- `spacematrix-diagram.tsx` — D3.js Canvas scatter plot with zone overlays
- Bidirectional interaction: click zone → highlight map, click cell → highlight dot

**Verification:** Toggle between Spacematrix/LCZ/Cluster recolors cells. Scatter plot shows SF data distribution. Clicking zones highlights corresponding cells.

### Session 3: Dendrogram + Detail Panel + Interactions

**Deliverables:**
- `dendrogram.tsx` — D3.js hierarchical tree with cut-level drag
- Cut-level recoloring (drag line → merge clusters → recolor map)
- `cell-detail-panel.tsx` — full metric display on cell click
- `classification-legend.tsx` — map overlay legend with click-to-filter
- Hover tooltip
- `status-bar.tsx`

**Verification:** Dendrogram renders with correct cluster hierarchy. Dragging cut level merges/splits clusters visually. Cell click shows detail panel. Legend filtering works.

### Session 4: Level-of-Detail + Polish

**Deliverables:**
- `lod-controller.ts` — zoom-based 3D building toggle at z≥15
- Building InstancedMesh rendering from pre-computed data
- Smooth LOD transition animation
- Performance optimization (if needed): virtual GeoJSON for MapLibre, Canvas point rendering optimization for scatter plot
- Cross-mode consistency (selected cell stays selected across classification toggles)
- Edge cases: empty cells, cells with missing height, cells at city boundary

**Verification:** Zoom in to neighborhood → 3D buildings appear. All success criteria pass.

---

## 13. Python Dependencies for Pre-Extraction

The batch script needs these additional dependencies beyond the shared backend:

```python
# Already in shared backend:
# osmnx >= 2.1, momepy >= 0.11, geopandas >= 1.1, neatnet, cityseer

# Additional for P5 classification:
scikit-learn >= 1.6        # GMM, PCA, StandardScaler
scipy >= 1.14              # Ward's linkage, dendrogram
libpysal >= 4.12           # Graph.build_contiguity for spatial weights
pyarrow >= 19.0            # GeoParquet serialization
```

All of these should already be available in the shared backend's Python environment.

---

## 14. Success Criteria

| # | Criterion | Target | How to Measure |
|---|-----------|--------|---------------|
| 1 | Cell rendering performance | ≥30 FPS with ~30K cells visible | Chrome DevTools FPS meter, pan/zoom at city scale |
| 2 | Classification toggle speed | <500ms to recolor all cells | `performance.now()` around `setPaintProperty` call |
| 3 | Spacematrix diagram correctness | SF types match expected distribution (mostly low-rise suburban) | Visual inspection: Sunset/Richmond are Type 1–2, Financial District is Type 7–8 |
| 4 | LCZ geographic coherence | Distinct zones visible (downtown ≠ residential) | Visual inspection: Financial District ≠ Sunset neighborhoods |
| 5 | Dendrogram meaningful hierarchy | ≥3 clearly distinct branches | Visual inspection of dendrogram structure |
| 6 | LOD transition smoothness | No visible pop-in or flicker at z=15 | Visual inspection during zoom in/out |
| 7 | Diagram ↔ Map bidirectional link | Click zone → highlight map, click cell → highlight diagram | Manual test: click Spacematrix zone, verify map highlights |
| 8 | Cell hover tooltip | Correct metric values displayed | Click 5 random cells, verify FSI/GSI/height match expectations |
| 9 | Dendrogram cut-level interaction | Dragging cut line recolors map in real-time | Drag cut line up → fewer colors on map, down → more colors |
| 10 | Data load time | <10s from app start to fully rendered map | Stopwatch from page load to map visible |

---

## Implications for Collage Earth

### Classification Architecture Validated

P5 validates the three-tier classification system recommended in findings #11–12:
- **Tier 1 (instant):** Spacematrix is computable from 3 metrics, deterministic, globally applicable
- **Tier 1.5 (instant):** LCZ is threshold-based, <15ms, environmentally interpretable
- **Tier 2 (batch):** GMM morphometric clustering requires the full 74-character pipeline but produces richer, data-driven types

The three systems are complementary, not redundant. Spacematrix classifies by density-form. LCZ classifies by climate-relevant physical structure. GMM classifies by overall morphometric similarity. A neighborhood can be "Spacematrix Type 5 (mid-rise, medium-density) + LCZ 2 (compact midrise) + Cluster #4 (European perimeter block)" — each label adds different information.

### Pre-Computation is Essential for City Scale

The batch pipeline (20–45 minutes) is acceptable as a one-time cost but prohibitive for on-demand use. This confirms finding #12's recommendation: pre-compute reference libraries for large areas, use profile-matching for new/small areas.

For the full Collage Earth platform, this means:
- **Pre-computed city data** for 50–100 reference cities (stored as GeoParquet)
- **On-demand classification** for user-selected fragments (profile matching against reference library, not full clustering)
- **Background batch jobs** for new city requests (queue-based, notify when ready)

### D3.js Diagrams are the Key Differentiator

The Spacematrix scatter plot and dendrogram are what make P5 more than just a colored map. They provide analytical insight that MapLibre alone cannot. The bidirectional interaction (click diagram ↔ highlight map) is the core UX pattern that Collage Earth should carry across all analytical views.

### urbantaxonomy.org Alignment

The GMM + Ward's approach in P5 closely mirrors Fleischmann's numerical taxonomy methodology [3]. If P5 produces sensible results for San Francisco, it validates that the same pipeline can be applied to any city. Future integration with urbantaxonomy.org's pre-computed European data [5] would extend the reference library without additional computation.

---

## Open Questions

1. **How many buildings will OSMnx return for the SF bounding box?** The estimate of ~80K–100K is based on OSM coverage, but SF's building data completeness in OSM is uncertain. If coverage is poor, consider supplementing with Overture Maps data.

2. **How many GMM clusters will BIC select for San Francisco?** The 8–12 estimate is based on Prague/Amsterdam (10 each). SF may need more (it has unusually diverse housing stock) or fewer.

3. **Will the 50 MB GeoParquet data commit cause issues?** Git handles 50 MB fine, but if the data grows (more metrics, higher resolution), Git LFS may be needed.

4. **Should the dendrogram support user-defined labels?** The GMM clusters are numbered by default. Allowing users to label clusters (e.g., "Victorian rowhouse" or "Marina stucco") would make the taxonomy more meaningful, but adds UI complexity.

5. **Is DuckDB-WASM worth the complexity for the prototype?** It adds ~10 MB to the bundle. Pre-converted GeoJSON is simpler but larger on disk. The decision should be made by the AI agent building P5 based on load time testing.

6. **How should cells at the city boundary be handled?** Tessellation cells at the edge of the extraction area have incomplete context (no neighbors on one side). Their contextual characters will be biased. Options: exclude them, flag them, or accept the bias.

---

## Overall Conclusion

P5 is a technically ambitious prototype that validates city-scale urban classification and interactive taxonomy exploration. The key architectural insight is that **all heavy computation happens once during pre-extraction** — the runtime experience is purely client-side rendering and interaction. This makes the user experience fast and responsive despite the computational complexity of the underlying classification pipeline.

The three classification systems (Spacematrix, LCZ, GMM clustering) are complementary and independently validated: Spacematrix from finding #11, LCZ from spike K4, and GMM from finding #12 and the urbantaxonomy.org methodology. The D3.js diagrams (Spacematrix scatter + dendrogram with cut-level interaction) provide the analytical depth that distinguishes P5 from a simple colored map.

The estimated 3–4 implementation sessions are justified by the scope: (1) batch extraction pipeline + data loading, (2) classification toggle + Spacematrix diagram, (3) dendrogram + interactions, (4) LOD + polish. Each session has clear deliverables and verification criteria.

For the broader Collage Earth platform, P5 validates that pre-computed city-scale taxonomy data can be served to the browser for interactive exploration with bidirectional diagram–map linking — the core interaction pattern for the platform's "explore and compare" workflow.

## Sources

[1] Berghauser Pont, M. & Haupt, P. (2010). Spacematrix: Space, Density and Urban Form. NAi Publishers. As detailed in finding #11.

[2] Stewart, I.D. & Oke, T.R. (2012). "Local Climate Zones for Urban Temperature Studies." Bulletin of the American Meteorological Society, 93(12), 1879–1900. Implemented in spike K4.

[3] Fleischmann, M., Feliciotti, A., Romice, O. & Porta, S. (2022). "Methodological foundation of a numerical taxonomy of urban form." Environment and Planning B, 49(4), 1283–1299. DOI: 10.1177/23998083211059835.

[4] Finding #12 — Computational Morphological Classification (this project).

[5] Fleischmann, M., Samardzhiev, K., Brazdova, A., Dancejova, D. & Winkler, L. (2025). "The Hierarchical Morphotope Classification." arXiv:2509.10083. Underlying methodology for urbantaxonomy.org.

[6] Finding #83 — Design of All 5 Prototypes and Shared Infrastructure (this project). P5 success criteria.

[7] Demuzere, M. et al. (2022). "A global map of Local Climate Zones." Earth System Science Data, 14(8), 3835–3873.

[8] urbantaxonomy.org — Interactive taxonomy explorer for Central European urban form. Operated by USCUNI, Charles University.

[9] uscuni/urban_taxonomy — GitHub repository (github.com/uscuni/urban_taxonomy). 14-step pipeline for morphometric taxonomy of Central Europe.

[10] momepy documentation — docs.momepy.org. Morphological Measuring in Python, part of PySAL ecosystem.

[11] Spike K2 — Morphological Fingerprint Embedding for Similarity Search. FINDINGS.md.

[12] Spike K4 — LCZ Classification from Morphometric Profile. FINDINGS.md.
