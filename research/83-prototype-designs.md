# §18.1 — Design of All 5 Prototypes and Shared Infrastructure

## Abstract

This document designs the complete `collage-prototypes` repository: naming conventions, directory structure, shared map template architecture, shared Python backend, and detailed per-prototype specifications. Each of the 5 prototypes tests a distinct user workflow using real OSM data, sharing a common MapLibre + Three.js map shell and FastAPI backend. The designs are grounded in validated spike findings — every performance number, library version, and API pattern cited here was empirically tested in the 26 completed spikes.

## Introduction

Phase 17 (Spike Findings Synthesis) confirmed that every core technology component works. Phase 18 transitions from "can we build it?" to "does the workflow work?" — validating that real users can extract, analyze, classify, fragment, and taxonomize urban form through a web interface.

The 5 prototypes cover the platform's complete analytical capability:
- **P1 Sustainability** — environmental metrics (solar, shadow, SVF, BAF, runoff, UTCI screening)
- **P2 Morphology** — momepy morphometric analysis (61 metrics across shape, dimension, distribution, intensity)
- **P3 Network** — space syntax and connectivity (NAIN/NACH, isochrones, centrality)
- **P4 Fragment** — the core fragment workflow (extract → library → navigate → cut → place)
- **P5 Taxonomy** — urban classification at city scale (Spacematrix, LCZ, morphometric clustering)

Each prototype shares a common map template and Python backend but adds its own domain-specific UI, computation, and visualization layers.

### Key Design Principles

1. **OSM data only** — no Google 3D Tiles. All prototypes extract from OpenStreetMap via the shared backend.
2. **Max area constraints** — P1/P2/P4: 1 km², P3: 5 km², P5: pre-extracted citywide.
3. **Shared infrastructure first** — the map template and Python backend are fully functional before any prototype-specific work begins.
4. **Web-only mode** — all prototypes run as Vite + React web apps with a local FastAPI server. No Tauri, no desktop packaging.
5. **Build from spikes** — every component maps to a validated spike. No speculative architecture.

---

## 1. Naming System and Directory Structure

### 1.1 Naming Conventions

| Entity | Pattern | Example |
|--------|---------|---------|
| Prototype directory | `p{N}-{slug}` | `p1-sustainability` |
| Prototype worktree | `collage-proto-p{N}` | `/c/Users/johnc/collage-proto-p1/` |
| Prototype branch | `proto/p{N}-{slug}` | `proto/p1-sustainability` |
| Shared package (TS) | `@collage/{name}` | `@collage/map-template` |
| Shared package (types) | `@collage/proto-types` | workspace dependency |
| Python backend | `collage-backend` | single FastAPI app |
| Prompt files | `proto-prompt-p{N}.txt` | `scripts/proto-prompt-p1.txt` |
| Autorun script | `proto-autorun.sh` | `scripts/proto-autorun.sh` |
| Worktree script | `worktree-create.sh` | `scripts/worktree-create.sh` |

### 1.2 File Naming Rules

- TypeScript files: kebab-case (`map-shell.tsx`, `osm-loader.ts`)
- Python files: snake_case (`extraction_pipeline.py`)
- React components: PascalCase export, kebab-case filename (`map-shell.tsx` exports `MapShell`)
- Test files: co-located (`map-shell.test.tsx`, `test_extraction.py`)
- Config files: standard names (`biome.json`, `ruff.toml`, `tsconfig.json`)

### 1.3 Complete Directory Structure

```
collage-prototypes/
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml             # Workspace member definitions
├── pnpm-lock.yaml                  # Single lockfile
├── tsconfig.base.json              # Shared TS config (extends per prototype)
├── biome.json                      # TS/JS formatting + linting
├── ruff.toml                       # Python formatting + linting
├── turbo.json                      # Turborepo build pipeline
├── .gitignore
├── CLAUDE.md                       # AI agent instructions
├── README.md                       # Project overview
│
├── shared/
│   ├── types/                      # @collage/proto-types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── index.ts                # Re-exports all types
│   │   ├── geo-features.ts         # BuildingFeature, StreetFeature, etc.
│   │   ├── fragment.ts             # FragmentPackage, FragmentMetadata
│   │   ├── metrics.ts              # MetricValue, StandardFragmentProfile
│   │   ├── layers.ts               # LayerConfig, ColorRamp definitions
│   │   └── common.ts               # BBox, ProjectedCoordinate, etc.
│   │
│   ├── map-template/               # @collage/map-template
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts          # Library mode build
│   │   └── src/
│   │       ├── index.ts            # Public API re-exports
│   │       ├── map-shell.tsx        # MapShell component (MapLibre + Three.js)
│   │       ├── osm-loader.ts       # Calls backend /extract, returns BuildingCollection
│   │       ├── building-mesh.ts    # InstancedMesh (context) + merged BufferGeometry (focal)
│   │       ├── metric-colorizer.ts # Applies color ramps to buildings by metric value
│   │       ├── ground-heatmap.ts   # Canvas texture on PlaneGeometry for ground metrics
│   │       ├── layer-panel.tsx     # Toggle layers, select metrics, color ramp controls
│   │       ├── area-selector.tsx   # Rectangle draw tool with area constraint display
│   │       ├── use-map-store.ts    # Zustand store for map state, buildings, metrics
│   │       ├── coordinate-utils.ts # WGS84 ↔ RTC conversions, bbox helpers
│   │       └── styles.css          # Minimal layout styles
│   │
│   └── python-backend/             # FastAPI server
│       ├── pyproject.toml          # uv project with all Python dependencies
│       ├── src/
│       │   └── collage_backend/
│       │       ├── __init__.py
│       │       ├── main.py         # FastAPI app, CORS, mount routers
│       │       ├── config.py       # Constants, CRS definitions, defaults
│       │       ├── routes/
│       │       │   ├── __init__.py
│       │       │   ├── extract.py      # POST /extract
│       │       │   ├── heights.py      # POST /heights
│       │       │   ├── tessellate.py   # POST /tessellate
│       │       │   ├── metrics.py      # POST /metrics/momepy, /metrics/sustainability
│       │       │   ├── space_syntax.py # POST /space-syntax
│       │       │   ├── classify.py     # POST /classify
│       │       │   └── fragment.py     # POST /fragment/save, /load, /relocate
│       │       ├── services/
│       │       │   ├── __init__.py
│       │       │   ├── extraction.py   # OSMnx extraction + neatnet simplification
│       │       │   ├── tessellation.py # momepy.enclosed_tessellation
│       │       │   ├── morphometrics.py# momepy metric computation (61 metrics)
│       │       │   ├── space_syntax.py # cityseer NAIN/NACH
│       │       │   ├── classification.py # Spacematrix, LCZ, GMM clustering
│       │       │   ├── sustainability.py # SVF, ISR, BAF, runoff, canyon H/W
│       │       │   ├── height_cascade.py # Region-adaptive height enrichment
│       │       │   └── fragment_ops.py   # Save, load, relocate, merge
│       │       ├── models/
│       │       │   ├── __init__.py
│       │       │   ├── request.py     # Pydantic request models
│       │       │   └── response.py    # Pydantic response models
│       │       └── utils/
│       │           ├── __init__.py
│       │           ├── crs.py         # Custom tmerc CRS, ensure_projected()
│       │           ├── io.py          # GeoParquet read/write, GeoJSON conversion
│       │           └── geometry.py    # Bbox helpers, polygon construction
│       └── tests/
│           ├── test_extraction.py
│           ├── test_tessellation.py
│           └── conftest.py
│
├── prototypes/
│   ├── p1-sustainability/           # Sustainability metrics scanner
│   │   ├── package.json             # Depends on @collage/map-template, @collage/proto-types
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── FINDINGS.md              # Prototype-specific findings (filled during build)
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── app.tsx              # Layout: map + sidebar
│   │       └── ...                  # Prototype-specific components
│   │
│   ├── p2-morphology/               # Momepy morphological metrics
│   │   └── (same structure)
│   │
│   ├── p3-network/                  # Network & space syntax analysis
│   │   └── (same structure)
│   │
│   ├── p4-fragment/                 # Urban fragment workflow
│   │   └── (same structure)
│   │
│   └── p5-taxonomy/                 # Urban taxonomy of San Francisco
│       └── (same structure)
│
├── scripts/
│   ├── proto-autorun.sh             # Autonomous build loop
│   ├── worktree-create.sh           # Create worktrees for each prototype
│   ├── proto-prompt-p1.txt          # AI agent prompt for P1
│   ├── proto-prompt-p2.txt          # AI agent prompt for P2
│   ├── proto-prompt-p3.txt          # AI agent prompt for P3
│   ├── proto-prompt-p4.txt          # AI agent prompt for P4
│   └── proto-prompt-p5.txt          # AI agent prompt for P5
│
├── research/                        # Copied reference docs from collage-city-research
│   ├── 82-final-spike-synthesis.md
│   ├── 83-prototype-designs.md      # This document
│   ├── 84-plan-p1-sustainability.md
│   ├── 85-plan-p2-morphology.md
│   ├── 86-plan-p3-network.md
│   ├── 87-plan-p4-fragment.md
│   └── 88-plan-p5-taxonomy.md
│
├── data/                            # Runtime data (gitignored except fixtures)
│   ├── .gitkeep
│   └── fixtures/                    # Small test GeoJSON for development
│       └── barcelona-eixample.geojson
│
└── logs/                            # Session logs (gitignored)
    └── .gitkeep
```

### 1.4 Workspace Configuration

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'shared/types'
  - 'shared/map-template'
  - 'prototypes/*'
```

**Root package.json (key fields):**
```json
{
  "name": "collage-prototypes",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "dev:backend": "cd shared/python-backend && uv run uvicorn collage_backend.main:app --reload --port 8000",
    "dev:p1": "pnpm --filter p1-sustainability dev",
    "dev:p2": "pnpm --filter p2-morphology dev",
    "dev:p3": "pnpm --filter p3-network dev",
    "dev:p4": "pnpm --filter p4-fragment dev",
    "dev:p5": "pnpm --filter p5-taxonomy dev",
    "build": "turbo build",
    "check": "turbo check",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.0",
    "turbo": "^2.0.0",
    "typescript": "^5.9.0"
  }
}
```

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "erasableSyntaxOnly": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### Conclusion

The naming system follows the established collage-spikes conventions (kebab-case files, workspace packages with `@collage/` prefix, worktree-based parallel development). The directory structure cleanly separates shared infrastructure from prototype-specific code, enabling independent worktree development while sharing a single Python backend.

---

## 2. Shared Map Template Architecture

### 2.1 Overview

The `@collage/map-template` package provides a complete, working 3D map environment that every prototype imports and extends. It handles:
- MapLibre GL JS initialization with Three.js overlay
- OSM building extraction via the Python backend
- 3D building rendering (InstancedMesh for context, merged BufferGeometry for focal)
- Per-building color mapping by any numeric metric
- Ground-plane heatmap overlays
- Area selection with constraint enforcement
- Layer visibility management

Prototypes import `MapShell` as their primary view component and access building/metric data through the shared Zustand store.

### 2.2 Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Prototype App (e.g., P1 Sustainability)                │
│  ┌───────────────┐  ┌──────────────────────────────────┐│
│  │ Sidebar Panel  │  │ MapShell                         ││
│  │ (proto-specific│  │ ┌──────────────────────────────┐ ││
│  │  controls,     │  │ │ MapLibre GL JS 5.x           │ ││
│  │  metric lists, │  │ │ ┌──────────────────────────┐ │ ││
│  │  charts)       │  │ │ │ Three.js overlay (plugin) │ │ ││
│  │               │  │ │ │  ├─ BuildingMesh          │ │ ││
│  │               │  │ │ │  ├─ GroundHeatmap         │ │ ││
│  │               │  │ │ │  └─ (proto-specific 3D)   │ │ ││
│  │               │  │ │ └──────────────────────────┘ │ ││
│  │               │  │ │ AreaSelector (draw tool)     │ ││
│  │               │  │ └──────────────────────────────┘ ││
│  │               │  │ LayerPanel (bottom-left overlay)  ││
│  └───────────────┘  └──────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 2.3 MapShell Component

The central component that initializes and manages the map.

**Props:**
```typescript
interface MapShellProps {
  /** Initial map center [lng, lat] */
  center?: [number, number];
  /** Initial zoom level (default: 15) */
  zoom?: number;
  /** Initial pitch in degrees (default: 45) */
  pitch?: number;
  /** Maximum selectable area in m² (prototype-specific constraint) */
  maxAreaM2?: number;
  /** Whether to show the area selector tool (default: true) */
  showAreaSelector?: boolean;
  /** Whether to show the layer panel (default: true) */
  showLayerPanel?: boolean;
  /** Callback when area is selected and extraction completes */
  onExtracted?: (data: FragmentPackage) => void;
  /** Callback when a building is clicked */
  onBuildingClick?: (buildingId: string) => void;
  /** Callback when a building is hovered */
  onBuildingHover?: (buildingId: string | null) => void;
  /** Additional Three.js objects to add to the scene */
  threeChildren?: THREE.Object3D[];
  /** Backend URL (default: http://localhost:8000) */
  backendUrl?: string;
  /** React children rendered as map overlays */
  children?: React.ReactNode;
}
```

**Initialization sequence:**
1. Create MapLibre GL JS map with vector tile basemap (MapTiler or Stadia)
2. On map `load` event, instantiate `@dvt3d/maplibre-three-plugin` v1.3.0
3. Plugin creates shared WebGL2 context, provides `mapScene` with camera sync via `map.transform`
4. Initialize `BuildingMesh` manager (empty, awaits data)
5. Initialize `GroundHeatmap` (hidden by default)
6. Mount `AreaSelector` overlay if enabled
7. Mount `LayerPanel` overlay if enabled

**Camera sync** is handled by the plugin automatically — no manual matrix updates needed. The plugin calls `renderer.resetState()` before each Three.js render frame to prevent WebGL state corruption [A1].

### 2.4 BuildingMesh Manager

Renders 3D buildings using the validated hybrid approach from spikes A1 and A6.

**Two rendering modes:**

| Mode | Geometry | Use Case | Draw Calls |
|------|----------|----------|------------|
| Context (InstancedMesh) | Shared `BoxGeometry(1,1,1)`, per-instance `Matrix4` | Background buildings, large areas | 1 |
| Focal (merged BufferGeometry) | Per-building `ExtrudeGeometry` from polygon footprint | Buildings under analysis | 1 |

**Key implementation details [A6]:**
- InstancedMesh: position at centroid + height/2, scale to bounding box dimensions
- Merged geometry: `Shape` from polygon exterior ring + `Shape.holes` from interior rings, `ExtrudeGeometry` with `depth = height_m`, `rotateX(-Math.PI / 2)` for Y-up
- Per-building color: InstancedMesh uses `setColorAt(i, color)`, merged geometry writes RGB to per-vertex `Float32Array` color attribute
- Raycasting: InstancedMesh returns native `instanceId`, merged geometry uses `faceIndex` + binary search on `faceStart` array
- RTC coordinate system: X = East, Y = Up, Z = South [A1]

**Performance budget [A6]:**
- 5,000 buildings render at single draw call
- Per-building color update: <100ms for either mode
- Geometry construction: <2s for 5,000 buildings

**Public API:**
```typescript
interface BuildingMeshManager {
  /** Set buildings from extraction result. mode='context' for boxes, 'focal' for real footprints */
  setBuildings(buildings: BuildingFeature[], mode: 'context' | 'focal'): void;
  /** Color buildings by a metric. Applies color ramp from MetricColorizer */
  colorByMetric(metricKey: string, values: Map<string, number>, ramp: ColorRamp): void;
  /** Highlight a single building (e.g., on hover) */
  highlightBuilding(buildingId: string | null): void;
  /** Set building opacity (0-1) */
  setOpacity(opacity: number): void;
  /** Get Three.js object for adding to scene */
  getObject3D(): THREE.Object3D;
  /** Dispose geometry and materials */
  dispose(): void;
}
```

### 2.5 MetricColorizer

Maps numeric metric values to colors using configurable ramps.

**Color ramps (built-in):**
- `viridis` — perceptually uniform, default for most metrics
- `magma` — good for solar exposure / heat
- `rdylgn` — red-yellow-green diverging (sustainability pass/fail)
- `blues` — sequential blue for water/connectivity
- `spectral` — wide-range diverging

**API:**
```typescript
interface ColorRamp {
  name: string;
  stops: Array<{ value: number; color: string }>;
  domain: [number, number];
  nullColor: string;  // Default: '#808080' (grey for missing data)
}

function colorize(
  values: Map<string, number>,
  ramp: ColorRamp,
): Map<string, THREE.Color>;
```

### 2.6 GroundHeatmap

Renders ground-level scalar fields as a textured plane below buildings.

**Implementation [C5]:**
- `PlaneGeometry` at Y=0.1 (slightly above ground to avoid z-fighting)
- `CanvasTexture` from offscreen `<canvas>` rasterization
- `MeshBasicMaterial` with `transparent: true`, `opacity: 0.6`
- Canvas resolution: 1 pixel per 2m (500m × 500m = 250×250 texture)
- Updates by redrawing the canvas and setting `texture.needsUpdate = true`

**Use cases by prototype:**
- P1: solar hours on ground, shadow coverage percentage, SVF values
- P2: tessellation cell metrics (area, shape index)
- P3: not used (networks are lines, not surfaces)
- P4: inter-fragment boundary zone visualization
- P5: not used at city scale (too many cells → use MapLibre fill-extrusion instead)

### 2.7 AreaSelector

Interactive rectangle drawing tool with area constraint display.

**Behavior:**
1. User clicks a toolbar button to enter selection mode
2. Click to set first corner, drag to set second corner
3. During drag: display current area in m² with red/green indicator vs max constraint
4. On release: if area ≤ max, emit bbox; if area > max, show warning and reset
5. Double-click to clear selection

**Area calculation:** `turf.area(turf.bboxPolygon(bbox))` for WGS84-accurate area.

**Constraints by prototype:**

| Prototype | Max Area | Approx. Dimension |
|-----------|----------|-------------------|
| P1 Sustainability | 1 km² | ~1000m × 1000m |
| P2 Morphology | 1 km² | ~1000m × 1000m |
| P3 Network | 5 km² | ~2240m × 2240m |
| P4 Fragment | 1 km² | ~1000m × 1000m |
| P5 Taxonomy | N/A (pre-extracted) | Citywide |

### 2.8 LayerPanel

Floating panel (bottom-left) for controlling layer visibility and metric coloring.

**Standard layers (all prototypes):**
- Buildings 3D (toggle, opacity slider)
- Building footprints 2D (MapLibre fill layer)
- Street network (MapLibre line layer)
- Ground heatmap (toggle, opacity slider)
- Basemap style selector (light / dark / satellite)

**Prototype-specific layers** are added via a `customLayers` prop:
```typescript
interface LayerConfig {
  id: string;
  label: string;
  type: 'toggle' | 'metric-select' | 'slider';
  defaultVisible?: boolean;
  metrics?: Array<{ key: string; label: string; ramp: string }>;
}
```

### 2.9 Zustand Store (useMapStore)

Shared state management for map, buildings, and metrics.

```typescript
interface MapStore {
  // Map state
  map: maplibregl.Map | null;
  mapScene: MapScene | null;  // from plugin
  isLoading: boolean;
  error: string | null;

  // Data
  buildings: BuildingFeature[];
  streets: StreetFeature[];
  tessellation: TessellationCellFeature[];
  fragmentMetadata: FragmentMetadata | null;
  metrics: StandardFragmentProfile | null;

  // Selection
  selectedBbox: BBox | null;
  selectedBuildingId: string | null;
  hoveredBuildingId: string | null;

  // Visualization
  activeMetricKey: string | null;
  activeColorRamp: string;
  buildingOpacity: number;
  groundHeatmapVisible: boolean;

  // Actions
  setMap(map: maplibregl.Map, scene: MapScene): void;
  extractArea(bbox: BBox): Promise<void>;
  setActiveMetric(key: string, ramp?: string): void;
  selectBuilding(id: string | null): void;
  hoverBuilding(id: string | null): void;
  reset(): void;
}
```

### 2.10 OsmLoader

Connects the frontend to the Python backend for data extraction.

**Flow:**
1. `AreaSelector` emits a `BBox`
2. `useMapStore.extractArea(bbox)` calls `OsmLoader.extract(bbox)`
3. `OsmLoader` sends `POST /extract` to backend with the bbox
4. Backend returns `FragmentPackage` (buildings, streets, tessellation, metrics)
5. Store updates, `BuildingMesh` renders, `LayerPanel` populates metric list

**Error handling:** Timeout after 180s (extraction can take up to ~130s for large cities [B1]). Display progress indicator during extraction. Show backend errors as user-facing messages.

### Conclusion

The shared map template provides a complete 3D urban visualization environment. Prototypes extend it by adding domain-specific sidebar panels, custom Three.js objects, and additional backend calls. The hybrid InstancedMesh/merged-geometry approach validated in spikes A1/A6 ensures single-draw-call rendering at 5,000+ buildings.

---

## 3. Shared Python Backend Design

### 3.1 Overview

A single FastAPI application serves all 5 prototypes. It wraps the Python libraries validated across spikes B1, B2, C1, C3, C4, K2, K3, and K4 behind a REST API. Each prototype calls the endpoints it needs — no prototype requires all endpoints.

### 3.2 Endpoint Summary

| Endpoint | Method | Purpose | Source Spike | Avg. Time |
|----------|--------|---------|-------------|-----------|
| `/extract` | POST | OSM extraction + neatnet + height enrichment | B1, B2 | ~85s |
| `/heights` | POST | Height cascade enrichment only | B2 | ~1s |
| `/tessellate` | POST | Enclosed tessellation from buildings + streets | C1 | ~5s (500 bldgs) |
| `/metrics/momepy` | POST | All 61 momepy morphometric metrics | B1, C4 | ~9s |
| `/metrics/sustainability` | POST | ISR, BAF, runoff, canyon H/W, SVF | C5, research #08/#10 | ~5-30s |
| `/space-syntax` | POST | cityseer NAIN/NACH at 4 radii | C3 | ~2s |
| `/classify` | POST | Spacematrix + LCZ + GMM clustering | K2, K4 | <1s |
| `/fragment/save` | POST | Save fragment as GeoParquet | B1 | <1s |
| `/fragment/load` | POST | Load fragment from GeoParquet | B1 | <1s |
| `/fragment/relocate` | POST | CRS-reassignment relocation | D1 | ~2s |
| `/network/merge` | POST | Merge design + context networks | K3 | ~4s |
| `/network/isochrone` | POST | Dijkstra isochrone from click point | K3 | ~0.01s |
| `/health` | GET | Status + version + library availability | — | <10ms |

### 3.3 Endpoint Specifications

#### POST /extract

**Request:**
```json
{
  "bbox": [west, south, east, north],
  "buffer_m": 200,
  "include_heights": true,
  "include_tessellation": true,
  "include_metrics": true,
  "include_space_syntax": true
}
```

**Response:** `FragmentPackage` (GeoJSON FeatureCollections + metrics JSON)

**Pipeline [B1]:**
1. `osmnx.features_from_polygon(polygon, tags={"building": True})` — buildings
2. `osmnx.graph_from_bbox(bbox, network_type="all")` — streets
3. `neatnet.neatify(streets_gdf)` — simplify streets (58-95% edge reduction)
4. `momepy.enclosures(streets, limit=boundary)` — street blocks
5. `momepy.enclosed_tessellation(buildings, enclosures, segment=1.0, simplify=True, n_jobs=-1)` — morphological tessellation
6. Height cascade: OSM tags → OSM levels → Overture → GBA → default 9m [B2]
7. Metric computation: 61 momepy metrics [B1]
8. Space syntax: cityseer NAIN/NACH at [400, 800, 1600, 10000]m radii [C3]
9. Package as `FragmentPackage` and return

**Notes:**
- First call triggers joblib parallel pool warm-up (~9s one-time penalty) [C1]
- Buffer extends extraction area 200m beyond requested bbox [D2]
- Returns buildings/streets for full buffered area; metrics reported for core area only
- neatnet simplification: always use `neatify()` not `simplify()` [K3]

#### POST /heights

**Request:**
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "region": "europe" | "us" | "other"
}
```

**Response:** Same FeatureCollection with enriched `height_m`, `height_source`, `height_confidence` properties.

**Region-adaptive cascade [B2]:**
- US: Overture → OSM → GBA → default
- Europe: GBA → OSM levels → Overture → default
- Other: GBA → Overture → OSM → default

#### POST /tessellate

**Request:**
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "streets": { "type": "FeatureCollection", "features": [...] },
  "segment": 1.0,
  "simplify": true,
  "n_jobs": -1
}
```

**Response:** `TessellationCellCollection` + `BlockCollection`

**Performance [C1]:** 500 buildings = ~1.5s (parallel), 2000 buildings = ~5s (parallel)

#### POST /metrics/momepy

**Request:**
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "streets": { "type": "FeatureCollection", "features": [...] },
  "tessellation": { "type": "FeatureCollection", "features": [...] },
  "metrics": ["all"] | ["elongation", "squareness", ...]
}
```

**Response:** `StandardFragmentProfile` with all requested metrics.

**Metric categories and counts [B1, C4]:**

| Category | Count | Examples |
|----------|-------|---------|
| Dimension | 8 | area, perimeter, height_mean, volume_mean, longest_axis, floor_area |
| Shape | 8 | elongation, squareness, convexity, courtyard_index, fractal_dimension, rectangularity, compactness, corners |
| Orientation | 3 | orientation_mean, orientation_std, cell_orientation |
| Spatial distribution | 6 | alignment, street_alignment, building_adjacency, interbuilding_dist, neighbor_distance, coverage_ratio |
| Coverage / Spacematrix | 5 | GSI, FSI, OSR, L (mean floors), MXI |
| Intensity | 4 | buildings_per_ha, floor_area_per_ha, covered_area_ratio, open_space_ratio |
| Diversity | 3 | height_gini, area_gini, use_shannon |
| Streetscape | 4 | hw_ratio, setback, facade_continuity, street_openness |
| Network topology | 5 | meshedness, intersection_3way, intersection_4way, intersection_dead, node_density |
| Block | 5 | block_area, block_perimeter, block_compactness, block_enclosure, block_labyrinthiness |
| Space syntax | 8 | nain_r400, nain_r800, nain_r1600, nain_r10000, nach_r400, nach_r800, nach_r1600, nach_r10000 |
| Novel | 2 | lcz_class, canyon_flow_regime |
| **Total** | **61** | |

#### POST /metrics/sustainability

**Request:**
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "streets": { "type": "FeatureCollection", "features": [...] },
  "tessellation": { "type": "FeatureCollection", "features": [...] },
  "metrics": ["isr", "baf", "runoff", "canyon_hw", "svf", "solar_hours"],
  "latitude": 41.39,
  "date": "2026-06-21"
}
```

**Response:** Per-building and per-ground-cell metric values + aggregate statistics.

**Sustainability metrics [research #08, #10, #40]:**

| Metric | Type | Computation | Performance |
|--------|------|-------------|------------|
| ISR (Impervious Surface Ratio) | Per-tessellation-cell | `1 - green_fraction` from OSM land use | Instant |
| BAF (Biotope Area Factor) | Per-tessellation-cell | Weighted surface type score | Instant |
| Runoff coefficient | Per-tessellation-cell | Rational method from surface permeability | Instant |
| Canyon H/W ratio | Per-street-segment | `building_height / street_width` from momepy | Instant |
| SVF (Sky View Factor) | Per-ground-point | Fibonacci hemisphere raycasting [C5] | ~5-15s |
| Solar hours (annual) | Per-ground-point | SunCalc positions + BVH raycasting [C5] | ~10-30s |
| VSC (Vertical Sky Component) | Per-facade-point | CIE overcast hemisphere sampling [C5] | ~5-15s |

#### POST /space-syntax

**Request:**
```json
{
  "streets": { "type": "FeatureCollection", "features": [...] },
  "radii": [400, 800, 1600, 10000]
}
```

**Response:** Per-edge NAIN and NACH values at each radius.

**Implementation [C3]:** cityseer pipeline: `io.nx_from_generic_geopandas()` → `graphs.nx_remove_filler_nodes()` → `graphs.nx_remove_dangling_nodes()` → `io.network_structure_from_nx()` → `metrics.networks.node_centrality_simplest()`. Derive NAIN/NACH from normalized closeness/choice.

**Performance [C3]:** 1,000 segments, 4 radii = 1.7s.

#### POST /classify

**Request:**
```json
{
  "metrics": { "gsi": 0.71, "fsi": 4.02, "l": 5.7, "height_mean": 17.1, "hw_ratio": 1.07, ... },
  "method": "spacematrix" | "lcz" | "gmm" | "all"
}
```

**Response:**
```json
{
  "spacematrix": { "type": "Mid-rise Dense", "fsi_zone": "high", "gsi_zone": "high" },
  "lcz": { "primary": "LCZ 2", "secondary": "LCZ 5", "confidence": 0.82 },
  "gmm": { "cluster_id": 3, "cluster_label": "European Dense Grid", "probability": 0.91 }
}
```

**Performance [K4]:** 14.3ms for all 3 methods.

#### POST /fragment/relocate

**Request:**
```json
{
  "fragment_path": "/path/to/fragment.parquet",
  "destination_center": [lng, lat]
}
```

**Response:** Relocated `FragmentPackage` with re-tessellated and re-metricated data.

**Implementation [D1]:** Custom Transverse Mercator CRS reassignment — project to local tmerc at source centroid, `set_crs()` to tmerc at destination centroid, project back to WGS84. Zero geometric distortion. Full pipeline (relocate + tessellate + 73 metrics) = 1.79s.

#### POST /network/merge

**Request:**
```json
{
  "design_streets": { "type": "FeatureCollection", "features": [...] },
  "context_streets": { "type": "FeatureCollection", "features": [...] },
  "connections": [{ "design_node": "n1", "context_edge": "e5" }]
}
```

**Response:** Merged network + connection quality report.

**Implementation [K3]:** Hybrid merge — explicit designer connections first, then edge-split fallback for remaining boundary endpoints. Post-merge `networkx.is_connected()` validation.

#### POST /network/isochrone

**Request:**
```json
{
  "network": { "type": "FeatureCollection", "features": [...] },
  "origin": [lng, lat],
  "walk_speed_kmh": 4.5,
  "durations_min": [5, 10, 15]
}
```

**Response:** Isochrone polygons for each duration.

**Implementation [K3]:** NetworkX Dijkstra on projected network. 0.011s per isochrone for ~2,000 nodes.

### 3.4 CORS and Startup Configuration

```python
app = FastAPI(title="Collage Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
                   "http://localhost:5176", "http://localhost:5177"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Each prototype runs on a different Vite port (5173-5177). The backend runs on port 8000.

### 3.5 Python Dependencies

```toml
[project]
name = "collage-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
    "momepy>=0.11.0",
    "geopandas>=1.1.0",
    "osmnx>=2.1.0",
    "neatnet>=0.1.5",
    "cityseer>=4.0.0",
    "scikit-learn>=1.0",
    "shapely>=2.1.0",
    "libpysal>=4.14.0",
    "networkx>=3.6.0",
    "pyproj>=3.6.0",
    "duckdb>=1.4.4",
    "pyarrow>=15.0.0",
    "suncalc>=0.1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### Conclusion

The Python backend wraps all validated spike libraries behind 12 REST endpoints. Each prototype calls only the subset it needs. The full extraction pipeline averages 85s per city — well within the 3-minute target. Classification and isochrone endpoints respond in under 1 second.

---

## 4. Prototype P1 — Sustainability Metrics Scanner

### 4.1 User Workflow (Step by Step)

1. **Navigate** — User opens app, sees a 3D MapLibre map. Default view: Barcelona Eixample.
2. **Select area** — Click "Scan Area" button, draw a rectangle (max 1 km²). Area display shows m² in real-time.
3. **Extract** — Backend extracts buildings, streets, heights. Progress bar shows stages. ~30-60s.
4. **View buildings** — 3D buildings appear (InstancedMesh boxes, colored by height). Sidebar shows extraction summary.
5. **Select metric category** — Sidebar has 3 tabs: Solar, Environmental, Climate Risk.
6. **Solar tab** — Time slider (hour of day + month) animates sun position. DirectionalLight shadow sweeps across model. Toggle: shadow map mode vs. sun-hours heatmap (pre-computed ground overlay).
7. **Environmental tab** — Select: ISR, BAF, Runoff, Canyon H/W, SVF, VSC. Buildings or ground cells colored by selected metric. Color ramp legend in corner.
8. **Climate Risk tab** — UTCI screening zone (qualitative), wind canyon risk (H/W > 2.0 flagged), heat island risk (ISR > 0.7 flagged).
9. **Hover building** — Tooltip shows building metrics: height, floor count, height source, per-building ISR and H/W contribution.
10. **Summary panel** — Bottom bar shows area-wide aggregates: mean ISR, mean BAF, % buildings in shadow at noon, total sun-hours range.

### 4.2 Key Features

| Feature | Implementation | Source |
|---------|---------------|--------|
| Real-time shadow animation | DirectionalLight + SunCalc + PCFSoftShadowMap (2048px) | C5 |
| Sun-hours ground heatmap | three-mesh-bvh raycasting, ~120 annual positions, 10m grid | C5 |
| SVF ground heatmap | Fibonacci hemisphere sampling (100 rays × 500 points) | C5 |
| VSC facade coloring | Hemisphere sampling at facade sample points, per-face color | C5 |
| ISR / BAF per cell | Tessellation cells colored by surface permeability | C1, research #10 |
| Canyon H/W per street | Street segments colored by height-to-width ratio | B1, research #08 |
| UTCI screening | Qualitative thermal comfort zone from shade/wind/humidity | Research #40 |
| Shadow ground plane | ShadowMaterial (transparent except shadows) on PlaneGeometry | C5 |

### 4.3 UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (300px)     │ │                                          ││
│ │              │ │  [3D buildings with shadows]              ││
│ │ ┌──────────┐ │ │                                          ││
│ │ │Solar     │ │ │                                          ││
│ │ │Environ.  │ │ │                                          ││
│ │ │Climate   │ │ │                                          ││
│ │ ├──────────┤ │ │       ┌─────────────────┐                ││
│ │ │ Time     │ │ │       │ Color ramp      │                ││
│ │ │ slider   │ │ │       │ legend          │                ││
│ │ │ [──●───] │ │ │       └─────────────────┘                ││
│ │ │          │ │ │                                          ││
│ │ │ Month    │ │ │  ┌────────────────────────────────────┐  ││
│ │ │ selector │ │ │  │ Layer panel (bottom-left)          │  ││
│ │ │          │ │ │  └────────────────────────────────────┘  ││
│ │ │ Metric   │ │ └──────────────────────────────────────────┘│
│ │ │ list     │ │ ┌──────────────────────────────────────────┐│
│ │ │ [ISR]    │ │ │ Summary bar: Mean ISR: 0.72 │ BAF: 0.31 ││
│ │ │ [BAF]    │ │ │ Shadow@noon: 34% │ Annual sun-hrs: 1840  ││
│ │ │ [SVF]    │ │ └──────────────────────────────────────────┘│
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 Backend Endpoints Used

| Endpoint | When Called | Data Returned |
|----------|-----------|--------------|
| `POST /extract` | Area selection | Buildings, streets, tessellation, heights |
| `POST /metrics/sustainability` | After extraction | ISR, BAF, runoff, H/W, SVF, solar hours, VSC |
| `POST /metrics/momepy` | After extraction (subset) | Spacematrix for summary |

### 4.5 Success Criteria

1. Shadow animation runs at ≥30 FPS for 500 buildings
2. Time slider sweeps shadow smoothly across 24 hours
3. Sun-hours heatmap completes in <30s for 500 buildings on 10m grid
4. SVF heatmap completes in <15s for 500 sample points
5. ISR/BAF correctly differentiates Barcelona (high ISR) from Amsterdam (lower ISR, more green)
6. Canyon H/W ratio visually identifies narrow streets (Venice H/W ~2.4) vs wide boulevards
7. All metrics have working color ramps with legends
8. Building hover shows per-building metric values

### 4.6 Estimated Complexity

**High.** This prototype has the most custom Three.js work: shadow mapping, BVH raycasting, ground heatmaps, facade coloring. It requires the deepest integration with the shared map template's Three.js layer. Estimated 3-4 AI agent sessions.

---

## 5. Prototype P2 — Momepy Morphological Metrics

### 5.1 User Workflow (Step by Step)

1. **Navigate** — Open app, see 3D map. Default: Barcelona.
2. **Select area** — Draw rectangle (max 1 km²). Extract buildings + streets + tessellation + full momepy metrics. ~60-90s.
3. **View buildings** — 3D buildings appear (merged BufferGeometry for real footprints). Default coloring: figure-ground (white buildings, dark ground).
4. **Select metric category** — Sidebar organizes metrics into 6 groups: Dimension, Shape, Spatial Distribution, Intensity/Coverage, Diversity, Streetscape.
5. **Select metric** — Click a metric name. Buildings instantly recolor by that metric's value (e.g., elongation: blue=compact, red=elongated). Color ramp legend updates.
6. **Toggle tessellation view** — Switch from building view to tessellation cell view. Cells colored by cell-level metrics (cell area, compactness, building-to-cell ratio). Rendered as MapLibre `fill-extrusion` at 0.5m height or Three.js flat polygons.
7. **View statistics** — Sidebar shows histogram of selected metric distribution + summary stats (mean, median, std, min, max, count).
8. **Spacematrix summary** — Always-visible card shows GSI, FSI, OSR, L with Spacematrix type classification.
9. **Hover building** — Tooltip shows all metrics for that building. Pin a building to keep its metrics visible while selecting another for comparison.
10. **Compare** — Pin two buildings, sidebar shows side-by-side metric comparison table.

### 5.2 Key Features

| Feature | Implementation | Source |
|---------|---------------|--------|
| 61 momepy metrics | Full B1 pipeline via backend | B1, C4 |
| Building choropleth | MetricColorizer on merged BufferGeometry | A6, C4 |
| Tessellation view | MapLibre fill-extrusion or Three.js flat polygons | C1 |
| Metric histogram | Lightweight chart (Recharts or SVG) in sidebar | — |
| Spacematrix card | GSI/FSI/OSR/L in always-visible summary | K4 |
| Building comparison | Side-by-side table for 2 pinned buildings | — |
| 6-category metric browser | Collapsible groups in sidebar | C4 |

### 5.3 UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (320px)     │ │                                          ││
│ │              │ │  [3D buildings colored by metric]         ││
│ │ ┌──────────┐ │ │                                          ││
│ │ │Spacematrix│ │ │  OR                                     ││
│ │ │GSI: 0.71 │ │ │                                          ││
│ │ │FSI: 4.02 │ │ │  [Tessellation cells colored by metric]  ││
│ │ │L:   5.7  │ │ │                                          ││
│ │ │Type: Dense│ │ │                                          ││
│ │ ├──────────┤ │ │       ┌───────────────┐                  ││
│ │ │▸ Dimension│ │ │       │ Color ramp    │                  ││
│ │ │▸ Shape    │ │ │       └───────────────┘                  ││
│ │ │▾ Spatial  │ │ │                                          ││
│ │ │  ● align. │ │ │  ┌──────────────────────┐               ││
│ │ │  ○ street │ │ │  │ [Building] │ [Tess.] │ (toggle)      ││
│ │ │  ○ adjac. │ │ │  └──────────────────────┘               ││
│ │ │▸ Intensity│ │ │  ┌────────────────────────────────────┐  ││
│ │ │▸ Diversity│ │ │  │ Layer panel                        │  ││
│ │ │▸ Street.  │ │ │  └────────────────────────────────────┘  ││
│ │ ├──────────┤ │ └──────────────────────────────────────────┘│
│ │ │Histogram │ │                                             │
│ │ │ ▓▓█▓▓▁▁  │ │                                             │
│ │ │mean:0.42 │ │                                             │
│ │ │std: 0.18 │ │                                             │
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Backend Endpoints Used

| Endpoint | When Called | Data Returned |
|----------|-----------|--------------|
| `POST /extract` | Area selection | Full pipeline with all metrics |
| `POST /tessellate` | If re-tessellation needed | Updated tessellation cells |
| `POST /metrics/momepy` | After extraction | All 61 metrics |
| `POST /classify` | After metrics computed | Spacematrix type |

### 5.5 Success Criteria

1. All 61 momepy metrics compute and display correctly for Barcelona Eixample
2. Building coloring updates instantly (<200ms) when selecting a different metric
3. Tessellation view renders cells correctly with per-cell coloring
4. Building-to-tessellation toggle is seamless (no re-extraction)
5. Histogram accurately reflects the metric value distribution
6. Spacematrix values match B1 reference: Barcelona GSI ≈ 0.71, FSI ≈ 4.02
7. Side-by-side building comparison works for any two pinned buildings
8. Works across 3+ cities with different morphologies

### 5.6 Estimated Complexity

**Medium.** Most visualization is straightforward metric-to-color mapping. The tessellation view toggle and histogram are the main custom components. Estimated 2-3 AI agent sessions.

---

## 6. Prototype P3 — Network & Space Syntax Analysis

### 6.1 User Workflow (Step by Step)

1. **Navigate** — Open app, see 2D/3D map. Default: Barcelona. Buildings are translucent context.
2. **Select area** — Draw rectangle (max 5 km² — larger to capture meaningful network structure). Extract streets + space syntax. ~30-60s.
3. **View network** — Street network appears as colored lines (MapLibre line layer). Default: NAIN R800 coloring. Buildings shown as translucent 3D context.
4. **Select radius** — Toggle between NAIN/NACH at 4 radii: 400m (local), 800m (neighborhood), 1600m (district), 10000m (city). Network recolors instantly.
5. **Toggle metric** — Switch between NAIN (integration/accessibility) and NACH (choice/through-movement). Color ramp changes.
6. **Toggle additional metrics** — betweenness centrality (Graphology), intersection density, meshedness, route directness.
7. **Click for isochrone** — Click any point on the map. Backend computes 5/10/15-minute walking isochrones. Rendered as translucent polygons overlaid on map.
8. **neatnet comparison** — Toggle to show raw OSM network vs. neatnet-simplified network side by side (or overlay with different colors).
9. **View statistics** — Sidebar shows network summary: total length, intersection count, meshedness, dead-end ratio, mean NAIN/NACH at each radius.
10. **Building context toggle** — Optional: show/hide 3D buildings as translucent context (buildings are secondary in this prototype).

### 6.2 Key Features

| Feature | Implementation | Source |
|---------|---------------|--------|
| NAIN/NACH at 4 radii | cityseer via backend, pre-computed per segment | C3 |
| Radius toggle | Re-color MapLibre line layer from cached data | C3 |
| Betweenness centrality | Graphology (client-side) via Brandes BFS | C4 |
| Walking isochrones | NetworkX Dijkstra via backend, 0.011s per query | K3 |
| neatnet before/after | Two line layers, toggle visibility | B1 |
| Network statistics | Computed from Graphology graph client-side | C4 |
| Intersection density | Count nodes by degree (3-way, 4-way, dead-end) | B1, C4 |
| Meshedness coefficient | `(e - v + 1) / (2v - 5)` from Graphology | C4 |

### 6.3 UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (300px)     │ │                                          ││
│ │              │ │  [Colored street network lines]           ││
│ │ ┌──────────┐ │ │  [Translucent 3D buildings optional]     ││
│ │ │ Metric   │ │ │  [Isochrone polygons if clicked]         ││
│ │ │ ○ NAIN   │ │ │                                          ││
│ │ │ ○ NACH   │ │ │                                          ││
│ │ │ ○ Betw.  │ │ │                                          ││
│ │ │ ○ Meshed.│ │ │                                          ││
│ │ ├──────────┤ │ │       ┌───────────────┐                  ││
│ │ │ Radius   │ │ │       │ Color ramp    │                  ││
│ │ │ [400 ]   │ │ │       │ + values      │                  ││
│ │ │ [800 ]   │ │ │       └───────────────┘                  ││
│ │ │ [1600]   │ │ │                                          ││
│ │ │ [10K ]   │ │ │  ┌──────────────────────┐               ││
│ │ ├──────────┤ │ │  │ Click for isochrone   │ (hint)        ││
│ │ │ Network  │ │ │  └──────────────────────┘               ││
│ │ │ Stats    │ │ │                                          ││
│ │ │ Edges:517│ │ │  ┌────────────────────────────────────┐  ││
│ │ │ Nodes:289│ │ │  │ Layer panel                        │  ││
│ │ │ Mesh:0.34│ │ │  └────────────────────────────────────┘  ││
│ │ │ Dead:12% │ │ │                                          ││
│ │ ├──────────┤ │ └──────────────────────────────────────────┘│
│ │ │ ☐ Raw OSM│ │                                             │
│ │ │ ☑ neatnet│ │                                             │
│ │ │ ☐ Bldgs  │ │                                             │
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 Backend Endpoints Used

| Endpoint | When Called | Data Returned |
|----------|-----------|--------------|
| `POST /extract` | Area selection | Streets (raw + simplified), buildings (optional) |
| `POST /space-syntax` | After extraction | NAIN/NACH at 4 radii per segment |
| `POST /network/isochrone` | User clicks on map | 5/10/15-min isochrone polygons |

### 6.5 Success Criteria

1. NAIN/NACH values correctly identify high-integration streets (main roads) vs. low-integration (backstreets)
2. Radius toggle visually shifts emphasis (R400 = local shops, R10000 = highway corridors)
3. Barcelona Eixample: NAIN highlights Passeig de Gràcia and Diagonal as highest integration
4. Isochrone generation completes in <1s and renders correctly
5. 5 km² extraction completes within 3 minutes
6. neatnet before/after shows 58-95% edge reduction while preserving network topology
7. Network statistics are mathematically correct (meshedness, dead-end ratio)
8. Works across 3+ cities with different network topologies (grid, organic, radial)

### 6.6 Estimated Complexity

**Medium.** Most visualization is MapLibre line layers with data-driven coloring — no complex Three.js work needed. The isochrone generation requires a backend round-trip but is fast. Estimated 2-3 AI agent sessions.

---

## 7. Prototype P4 — Urban Fragment Workflow

### 7.1 User Workflow (Step by Step)

1. **Navigate** — Open app. Default view: zoomed out to show multiple cities.
2. **Extract a fragment** — Navigate to a city (e.g., Barcelona). Draw a rectangle (max 1 km²). Backend extracts full fragment (buildings, streets, tessellation, metrics, space syntax). ~60-90s. Fragment appears as 3D buildings.
3. **Save to library** — Click "Save Fragment." Enter name (e.g., "Barcelona Eixample"). Fragment saved to library with full profile.
4. **Browse library** — Sidebar shows library panel with thumbnail + key metrics (GSI, FSI, L, building count) for each saved fragment. Click a fragment to fly to it on the map.
5. **Extract second fragment** — Navigate to another city (e.g., Amsterdam Jordaan). Extract, save. Now library has 2 fragments.
6. **Compare fragments** — Select two fragments in library. Side-by-side metric comparison table appears. Radar chart overlay shows profile shape difference.
7. **Start relocation** — Select a fragment and click "Place Fragment." Click a destination on the map. Backend relocates fragment to destination via CRS reassignment. ~2s. Fragment appears at destination in accent color.
8. **Cut hole** — Backend hard-clips context buildings at destination (centroid-inside rule). Context buildings removed within fragment boundary.
9. **View in context** — Fragment buildings in accent color (orange), context buildings in grey. Network from both visible.
10. **Merge networks** — Backend merges fragment streets with context streets. Isochrone from fragment center shows walkability into surrounding context.

### 7.2 Key Features

| Feature | Implementation | Source |
|---------|---------------|--------|
| Full extraction pipeline | /extract endpoint with all options | B1 |
| Fragment library | Zustand store + GeoParquet via backend | B1, K2 |
| Fragment comparison table | Side-by-side metrics, radar chart | K2 |
| CRS-reassignment relocation | /fragment/relocate endpoint, 1.79s | D1 |
| Hard clip with centroid-inside | /fragment context management | D2, D3 |
| Dual rendering | Fragment (accent) vs context (grey) InstancedMesh | A6, D3 |
| Network merging | /network/merge with edge-split fallback | K3 |
| Isochrone at destination | /network/isochrone on merged graph | K3 |
| Fragment thumbnail | Static map snapshot for library card | — |

### 7.3 UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (360px)     │ │                                          ││
│ │              │ │  [Fragment in orange + context in grey]   ││
│ │ ┌──────────┐ │ │                                          ││
│ │ │ LIBRARY  │ │ │  [Isochrone overlay]                     ││
│ │ │┌────────┐│ │ │                                          ││
│ │ ││BCN     ││ │ │                                          ││
│ │ ││GSI:0.71││ │ │                                          ││
│ │ ││FSI:4.02││ │ │                                          ││
│ │ │├────────┤│ │ │                                          ││
│ │ ││AMS     ││ │ │                                          ││
│ │ ││GSI:0.54││ │ │       ┌───────────────┐                  ││
│ │ ││FSI:2.81││ │ │       │ Fragment:orange│                  ││
│ │ │└────────┘│ │ │       │ Context: grey  │                  ││
│ │ ├──────────┤ │ │       └───────────────┘                  ││
│ │ │COMPARISON│ │ │                                          ││
│ │ │[radar   ]│ │ │  ┌────────────────────────────────────┐  ││
│ │ │[chart   ]│ │ │  │ [Extract] [Save] [Place] [Compare] │  ││
│ │ │[overlay ]│ │ │  └────────────────────────────────────┘  ││
│ │ ├──────────┤ │ └──────────────────────────────────────────┘│
│ │ │ Actions  │ │                                             │
│ │ │[Extract ]│ │                                             │
│ │ │[Save    ]│ │                                             │
│ │ │[Place   ]│ │                                             │
│ │ │[Compare ]│ │                                             │
│ │ │[Merge   ]│ │                                             │
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 7.4 Backend Endpoints Used

| Endpoint | When Called | Data Returned |
|----------|-----------|--------------|
| `POST /extract` | Area selection | Full FragmentPackage |
| `POST /fragment/save` | Save to library | Confirmation + ID |
| `POST /fragment/load` | Load from library | FragmentPackage |
| `POST /fragment/relocate` | Place at destination | Relocated FragmentPackage |
| `POST /classify` | After extraction | Spacematrix + LCZ type |
| `POST /network/merge` | After placement | Merged network |
| `POST /network/isochrone` | After merge | Walking isochrones |
| `POST /metrics/momepy` | After relocation (recompute) | Updated metrics |

### 7.5 Success Criteria

1. Extract → Save → Load round-trip preserves all data (diff buildings GeoJSON: identical)
2. Fragment relocation completes in <5s and buildings appear at correct destination location
3. Hard clip removes all context buildings inside fragment boundary (0 residual)
4. Fragment renders in accent color, context in grey — visually distinguishable
5. Network merge produces connected graph (validated by `is_connected()`)
6. Isochrone extends beyond fragment boundary into surrounding context
7. Library displays correct metrics for each saved fragment
8. Radar chart comparison correctly shows morphological differences (Barcelona denser than Houston)

### 7.6 Estimated Complexity

**High.** This prototype exercises the most backend endpoints and has the most complex multi-step workflow. The dual-rendering (fragment vs context) and network merging add UI complexity. Estimated 3-4 AI agent sessions.

---

## 8. Prototype P5 — Urban Taxonomy of San Francisco

### 8.1 User Workflow (Step by Step)

1. **Load** — Open app. San Francisco pre-extracted data loads automatically (no area selection needed). ~30K tessellation cells covering the city.
2. **Default view** — City shown as tessellation cells at ground level, colored by Spacematrix type (8 types, categorical colors). Buildings not rendered at city scale (too many — use cells only).
3. **Spacematrix view** — Default. Cells colored by Spacematrix type. Interactive Spacematrix diagram in sidebar (D3.js scatter: FSI vs GSI, 8 zones, click zone → highlight cells on map).
4. **LCZ view** — Toggle to Local Climate Zone classification. Cells colored by LCZ class (17 standard classes). Sidebar shows LCZ legend with class descriptions.
5. **Morphometric clustering view** — Toggle to unsupervised clustering (scikit-learn GMM on ~300 morphometric characters). Cells colored by cluster ID. Sidebar shows dendrogram (D3.js hierarchical tree showing cluster relationships).
6. **Three-way toggle** — Buttons: [Spacematrix] [LCZ] [Cluster]. Switching recolors all cells instantly from cached classification results.
7. **Hover cell** — Tooltip shows: tessellation cell area, building height, Spacematrix type, LCZ class, cluster ID, key metrics.
8. **Click cell** — Sidebar detail panel shows full metric profile for that cell's building. Highlight the cell's position on the Spacematrix diagram.
9. **Zoom to neighborhood** — As user zooms in past threshold (z≥15), switch from tessellation cells to 3D buildings (InstancedMesh). Metrics still available via click/hover.
10. **Filter by type** — Click a type in legend to filter: only show cells of that type, grey out others.

### 8.2 Key Features

| Feature | Implementation | Source |
|---------|---------------|--------|
| Pre-extracted city data | GeoParquet loaded at startup | B1 |
| 3 classification systems | Spacematrix + LCZ + GMM via backend | K2, K4 |
| Spacematrix diagram | D3.js FSI vs GSI scatter, 8 zones | research #11 |
| LCZ classification | Threshold-based, 14.3ms per city | K4 |
| Morphometric clustering | scikit-learn GMM on ~300 characters | K2, research #12 |
| Dendrogram | D3.js hierarchical tree | research #12 |
| City-scale cell rendering | MapLibre fill-extrusion (not Three.js) | C1 |
| Level-of-detail transition | Cells at z<15, 3D buildings at z≥15 | A6 |
| Type filtering | Click legend to highlight/dim cells | — |

### 8.3 UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  SIDEBAR     │ │  MAP                                     ││
│ │  (380px)     │ │                                          ││
│ │              │ │  [~30K tessellation cells colored by     ││
│ │ [Space][LCZ] │ │   classification — MapLibre fill-extr.]  ││
│ │ [Cluster]    │ │                                          ││
│ │              │ │  OR (zoomed in)                          ││
│ │ ┌──────────┐ │ │                                          ││
│ │ │Spacematrix│ │ │  [3D buildings + cells]                  ││
│ │ │ Diagram  │ │ │                                          ││
│ │ │  FSI     │ │ │                                          ││
│ │ │  ↑ ·  ·  │ │ │       ┌───────────────┐                  ││
│ │ │  │· ·· · │ │ │       │ Classification │                  ││
│ │ │  │ ·  ·  │ │ │       │ legend         │                  ││
│ │ │  └──→GSI │ │ │       └───────────────┘                  ││
│ │ ├──────────┤ │ │                                          ││
│ │ │ OR       │ │ │                                          ││
│ │ │Dendrogram│ │ │                                          ││
│ │ │  ┌─┬─┐  │ │ │                                          ││
│ │ │  │ └┐│  │ │ │                                          ││
│ │ │  └──┴┘  │ │ │                                          ││
│ │ ├──────────┤ │ │                                          ││
│ │ │ Cell     │ │ │  ┌────────────────────────────────────┐  ││
│ │ │ Details  │ │ │  │ Layer panel                        │  ││
│ │ │ (on click│ │ │  └────────────────────────────────────┘  ││
│ │ │  panel)  │ │ └──────────────────────────────────────────┘│
│ │ └──────────┘ │                                             │
│ └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

### 8.4 Pre-Extraction Strategy

San Francisco must be pre-extracted because the city-scale data (~30K+ buildings) is too large for on-demand extraction.

**One-time batch job:**
1. Define San Francisco bounding box: approximately [-122.52, 37.71, -122.35, 37.81]
2. Extract all buildings via OSMnx (expect ~80K-100K buildings for the full city)
3. Extract all streets, simplify with neatnet
4. Generate enclosed tessellation (~30K-50K cells depending on coverage)
5. Compute all momepy metrics per building
6. Compute space syntax at 4 radii
7. Classify: Spacematrix types, LCZ classes, GMM clusters
8. Store as GeoParquet files:
   - `sf-buildings.parquet` (~100K rows, ~50 metric columns)
   - `sf-tessellation.parquet` (~30K rows with building linkage)
   - `sf-streets.parquet` (~10K rows with NAIN/NACH)
   - `sf-classification.parquet` (per-cell: spacematrix_type, lcz_class, cluster_id)
9. Estimated total extraction time: ~10-30 minutes (one-time)

**Delivery:** GeoParquet files committed to the repo (or downloaded on first run). Frontend loads via DuckDB-WASM in the browser — no backend calls needed for browsing.

### 8.5 Backend Endpoints Used

| Endpoint | When Called | Data Returned |
|----------|-----------|--------------|
| `POST /classify` | Pre-extraction batch job only | All 3 classification results |
| `POST /extract` | Pre-extraction batch job only | Full city data |
| None at runtime | All data loaded from pre-computed GeoParquet | — |

**Note:** P5 is unique in that it runs almost entirely client-side after the initial data load. The backend is only needed for the pre-extraction batch job.

### 8.6 Success Criteria

1. ~30K tessellation cells render at ≥30 FPS (MapLibre fill-extrusion)
2. Classification toggle (Spacematrix → LCZ → Cluster) recolors all cells in <500ms
3. Spacematrix diagram correctly positions San Francisco types (expect mix of low-rise suburban + mid-rise downtown)
4. LCZ classification produces geographically coherent zones (downtown ≠ residential)
5. Dendrogram shows meaningful cluster hierarchy (≥3 clearly distinct branches)
6. Level-of-detail transition at z=15 is smooth (cells → 3D buildings)
7. Click-on-diagram → highlight-on-map interaction works bidirectionally
8. Cell hover shows correct metric values from the pre-computed dataset

### 8.7 Estimated Complexity

**High.** City-scale rendering, D3.js interactive diagrams (Spacematrix scatter + dendrogram), three classification toggles, level-of-detail, and the pre-extraction batch job all add complexity. Estimated 3-4 AI agent sessions.

---

## 9. Cross-Prototype Comparison

### 9.1 Feature Matrix

| Feature | P1 | P2 | P3 | P4 | P5 |
|---------|----|----|----|----|-----|
| Area selector | ✓ | ✓ | ✓ | ✓ | — |
| Max area | 1 km² | 1 km² | 5 km² | 1 km² | City |
| 3D buildings (InstancedMesh) | ✓ | — | Optional | ✓ (context) | z≥15 |
| 3D buildings (merged geom) | — | ✓ | — | ✓ (fragment) | — |
| Tessellation view | — | ✓ | — | — | ✓ |
| Ground heatmap | ✓ | — | — | — | — |
| Shadow rendering | ✓ | — | — | — | — |
| Network line coloring | — | — | ✓ | ✓ | — |
| Isochrone polygons | — | — | ✓ | ✓ | — |
| D3.js diagrams | — | — | — | — | ✓ |
| Fragment library | — | — | — | ✓ | — |
| Pre-extracted data | — | — | — | — | ✓ |
| Backend calls at runtime | ✓ | ✓ | ✓ | ✓ | — |

### 9.2 Backend Endpoint Usage Matrix

| Endpoint | P1 | P2 | P3 | P4 | P5 |
|----------|----|----|----|----|-----|
| `/extract` | ✓ | ✓ | ✓ | ✓ | Pre |
| `/heights` | — | — | — | — | — |
| `/tessellate` | — | ✓ | — | — | Pre |
| `/metrics/momepy` | Partial | ✓ | — | ✓ | Pre |
| `/metrics/sustainability` | ✓ | — | — | — | — |
| `/space-syntax` | — | — | ✓ | — | Pre |
| `/classify` | — | ✓ | — | ✓ | Pre |
| `/fragment/save` | — | — | — | ✓ | — |
| `/fragment/load` | — | — | — | ✓ | — |
| `/fragment/relocate` | — | — | — | ✓ | — |
| `/network/merge` | — | — | — | ✓ | — |
| `/network/isochrone` | — | — | ✓ | ✓ | — |
| `/health` | ✓ | ✓ | ✓ | ✓ | ✓ |

("Pre" = used during pre-extraction only, not at runtime)

### 9.3 Shared Component Usage

| Shared Component | P1 | P2 | P3 | P4 | P5 |
|-----------------|----|----|----|----|-----|
| MapShell | ✓ | ✓ | ✓ | ✓ | ✓ |
| BuildingMesh (context) | ✓ | — | Optional | ✓ | z≥15 |
| BuildingMesh (focal) | — | ✓ | — | ✓ | — |
| MetricColorizer | ✓ | ✓ | — | — | — |
| GroundHeatmap | ✓ | — | — | — | — |
| AreaSelector | ✓ | ✓ | ✓ | ✓ | — |
| LayerPanel | ✓ | ✓ | ✓ | ✓ | ✓ |
| useMapStore | ✓ | ✓ | ✓ | ✓ | ✓ |
| OsmLoader | ✓ | ✓ | ✓ | ✓ | — |

### 9.4 Complexity Assessment

| Prototype | Complexity | Key Challenge | Sessions |
|-----------|-----------|---------------|----------|
| P1 Sustainability | High | Shadow mapping, BVH raycasting, ground heatmaps | 3-4 |
| P2 Morphology | Medium | Tessellation view, metric histogram | 2-3 |
| P3 Network | Medium | MapLibre data-driven line styling, isochrones | 2-3 |
| P4 Fragment | High | Multi-step workflow, dual rendering, network merge | 3-4 |
| P5 Taxonomy | High | City-scale rendering, D3 diagrams, pre-extraction | 3-4 |

### 9.5 Recommended Build Order

1. **P2 Morphology** — Simplest backend integration, exercises all shared components, validates the core metric pipeline.
2. **P3 Network** — Minimal Three.js, mostly MapLibre layers, validates space syntax integration.
3. **P1 Sustainability** — Requires shadow and ground heatmap infrastructure built on top of shared template.
4. **P4 Fragment** — Most backend endpoints, multi-step workflow, depends on all shared infrastructure working.
5. **P5 Taxonomy** — Requires pre-extracted data and D3 diagrams. Most standalone — can proceed in parallel with P4.

This order ensures each prototype builds on the tested foundation of the previous one.

---

## Implications for Collage Earth

### Build-Readiness Validation

These 5 prototypes will validate every major platform capability before the full product build begins:
- **P1** validates the rendering pipeline (shadow mapping, ground heatmaps, facade coloring)
- **P2** validates the analytical core (metric computation, tessellation, choropleth)
- **P3** validates the network analysis system (space syntax, isochrones, data-driven line styling)
- **P4** validates the fragment system (extraction, library, relocation, context management, network merging)
- **P5** validates the taxonomy system (classification, city-scale rendering, interactive diagrams)

### Prototype-to-Product Translation

Each prototype maps directly to a product feature set:
- P1 → Phase 4 features (F39-F40: environmental screening, solar/shadow)
- P2 → Phase 1 features (F6-F8: metrics, profile) + Phase 2 (F24: building choropleth)
- P3 → Phase 1 features (F7: Tier 3 metrics) + potential P3 features (walkability)
- P4 → Phase 1 features (F3, F10-F11: extraction, library, comparison) + Phase 3 (F28-F30: proposals)
- P5 → Phase 2 features (F21-F23: classification systems) + Phase 2 (F19: library browser)

### Risk Reduction

The prototypes specifically target the highest-risk integration points:
1. **MapLibre + Three.js plugin stability** — tested across all 5 prototypes
2. **Python backend reliability** — tested with real OSM data for diverse cities
3. **City-scale rendering** — P5 tests ~30K cells, validating MapLibre fill-extrusion at scale
4. **Multi-step user workflows** — P4 tests the full extract-save-relocate-merge pipeline
5. **Data pipeline end-to-end** — every prototype exercises the full extraction → analysis → visualization chain

---

## Open Questions

1. **Basemap provider** — MapTiler vs. Stadia Maps for the vector tile basemap? MapTiler has a generous free tier but requires an API key. Stadia also requires a key. Consider a neutral option like self-hosted OpenFreeMap tiles.
2. **P5 San Francisco building count** — the actual number of buildings in SF may be 80K-100K, which could exceed comfortable GeoParquet browser loading. May need to subsample or tile.
3. **Shared Python backend concurrency** — if multiple prototypes run simultaneously calling the backend, FastAPI's single-process uvicorn may bottleneck. Consider `--workers 4` or prototype-specific ports.
4. **Three.js version pinning** — the plugin requires Three.js 0.172.x, but the latest is 0.178+. Should we pin to 0.172 for stability or use the latest with `as never` casts?
5. **P5 dendrogram library** — D3.js can render dendrograms but the API is verbose. Consider @visx/hierarchy as a React-friendly alternative.

---

## Overall Conclusion

The 5 prototypes form a comprehensive validation suite for the Collage Earth platform. The shared infrastructure — a `@collage/map-template` package providing MapLibre + Three.js + InstancedMesh/merged-geometry rendering, and a FastAPI backend wrapping OSMnx + momepy + cityseer + scikit-learn — enables each prototype to focus on its domain-specific workflow rather than boilerplate setup.

Every technology choice in this design is grounded in spike-validated evidence: Three.js InstancedMesh achieves single-draw-call rendering for 5,000 buildings [A6], the full extraction pipeline averages 85s [B1], 38 TypeScript metrics compute in 103ms [C4], cityseer space syntax runs 30-120x faster than momepy [C3], and fragment relocation completes in 1.79s [D1]. The prototypes are designed to exercise these validated components in real user workflows, confirming that the architecture works end-to-end before the full product build begins.

---

## Sources

[1] Finding #82 — Final spike synthesis and build-readiness assessment
[2] Finding #81 — Cross-cutting themes and architecture decisions
[3] Finding #38 — Architecture and feature synthesis
[4] Finding #39 — Final scope and development plan
[5] Spike A1 FINDINGS.md — MapLibre + Three.js synchronized viewport
[6] Spike A6 FINDINGS.md — InstancedMesh / merged geometry for building scale
[7] Spike B1 FINDINGS.md — OSM-to-fragment extraction pipeline
[8] Spike B2 FINDINGS.md — Height data cascade accuracy + GBA integration
[9] Spike C1 FINDINGS.md — Morphological tessellation performance & robustness
[10] Spike C3 FINDINGS.md — Space syntax implementation comparison
[11] Spike C4 FINDINGS.md — Metric computation performance budget
[12] Spike C5 FINDINGS.md — Solar and shadow analysis in the browser
[13] Spike D1 FINDINGS.md — Fragment relocation and metric behavior
[14] Spike D2 FINDINGS.md — Fragment edge handling and buffer analysis
[15] Spike D3 FINDINGS.md — Design-to-context boundary behavior
[16] Spike K2 FINDINGS.md — Morphological fingerprint embedding
[17] Spike K3 FINDINGS.md — Fragment-aware walkability: network merging
[18] Spike K4 FINDINGS.md — LCZ classification from morphometric profile
[19] SHARED_FOUNDATION.md — Shared infrastructure for collage-spikes
[20] STACK_DECISION.md — Technology stack decisions
[21] DECISION_LOG.md — Post-spike architecture decision log
