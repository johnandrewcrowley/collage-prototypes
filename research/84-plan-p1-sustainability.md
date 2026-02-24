# §18.2 — Detailed Implementation Plan: P1 Sustainability Scanner

## Abstract

This document provides the complete implementation plan for P1, the sustainability metrics scanner prototype. P1 validates the workflow: select an area (max 1 km²) → extract OSM buildings and streets → compute and visualize environmental screening metrics across three domains (solar/shadow, environmental surface, and climate risk). The plan specifies every metric with its computation method, input data, display approach, and performance budget; details the TypeScript-side instant computations and Python-side heavier analyses; designs the shadow animation system, ground heatmap rendering, and facade coloring pipeline; and defines success criteria with a manual testing plan. Every performance number and library recommendation traces to a validated spike finding or research document.

## Introduction

P1 is the most computationally intensive of the five prototypes — it requires real-time Three.js shadow rendering, BVH-accelerated raycasting for sun-hours and SVF, multiple ground heatmap overlays, and per-facade vertex coloring for VSC. It exercises the deepest integration between the shared map template's Three.js layer and prototype-specific visualization logic.

The prototype serves two research questions:
1. **Can environmental screening metrics be computed and visualized in-browser from OSM data alone?** This validates the Tier 1/Tier 2 computation architecture from research findings #08, #10, and #40.
2. **Is the shadow animation + ground heatmap + facade coloring UX comprehensible?** This validates whether non-specialist users can interpret sustainability metrics on a 3D map.

### Key References

| Reference | Content | Used For |
|-----------|---------|----------|
| Finding #08 | Solar, shadow, daylight analysis methods | Shadow rendering, sun-hours, SVF/VSC computation |
| Finding #10 | Environmental screening metrics catalog | ISR, BAF, runoff, canyon H/W, LCZ, embodied carbon |
| Finding #40 | UTCI and outdoor thermal comfort | Screening-level UTCI pipeline, Tmrt estimation |
| Findings #41–45 | Sustainability deep dive | Certification thresholds, climate resilience, carbon estimation |
| Spike C5 | Solar/shadow implementation | Shadow mapping, BVH raycasting, hemisphere sampling code |
| Spike K4 | LCZ classification | Threshold-based classification, 14.3ms performance |
| Finding #83 | P1 prototype design | User workflow, UI layout, success criteria |

---

## 1. Complete Metric List

P1 implements 16 metrics organized into three domain tabs. Each metric specifies: computation location (TypeScript client or Python backend), computation tier (instant Tier 1, interactive Tier 2, background Tier 3), input requirements, display approach, and performance budget.

### 1.1 Solar Domain (Tab 1: "Solar & Daylight")

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| S1 | **Shadow pattern** (real-time) | TS client | 1 | Building 3D geometry, sun position | DirectionalLight shadow map on ShadowMaterial ground plane | ≥30 FPS at 500 buildings |
| S2 | **Shadow coverage %** (at timestamp) | TS client | 1 | Shadow map readback | Percentage in summary bar | <100ms per timestamp |
| S3 | **Annual sun-hours** (ground) | TS client | 3 | Merged BVH geometry, ~120 annual sun positions | Ground heatmap (CanvasTexture), hours/year color ramp | <30s for 500 buildings, 10m grid |
| S4 | **SVF** (ground-level) | TS client | 2 | Merged BVH geometry, hemisphere sampling | Ground heatmap, 0–1 scale blue→yellow | <15s for 500 sample points |
| S5 | **VSC** (facade) | TS client | 2 | Merged BVH geometry, CIE hemisphere sampling | Per-face building color, 0–27% scale | <15s for 500 facade points |
| S6 | **Canyon H/W ratio** | Python backend | 1 | Street segments + adjacent building heights | Street line color (MapLibre data-driven) | Included in extraction |

### 1.2 Environmental Domain (Tab 2: "Environment")

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| E1 | **ISR** (Impervious Surface Ratio) | Python backend | 1 | Building footprints, OSM land use tags, tessellation cells | Per-cell fill color, 0–1 scale | Included in extraction |
| E2 | **BAF** (Biotope Area Factor) | Python backend | 1 | Surface type classification from OSM tags, tessellation cells | Per-cell fill color, 0–1 scale (inverted: higher = greener) | Included in extraction |
| E3 | **Runoff coefficient** | Python backend | 1 | Surface type areas, Rational Method | Per-cell fill color, 0–0.95 scale | Included in extraction |
| E4 | **LCZ classification** | Python backend | 1 | BSF, BH, H/W, SVF proxy from momepy metrics | Single badge + description in summary panel | <15ms [K4] |
| E5 | **Embodied carbon estimate** | TS client | 1 | Building footprint area × height × archetype factor | Per-building color, kgCO₂e/m² scale | Instant (<50ms) |
| E6 | **Operational carbon estimate** | TS client | 1 | Building GFA × EUI lookup × grid carbon intensity | Per-building color, kgCO₂e/m²/yr scale | Instant (<50ms) |

### 1.3 Climate Risk Domain (Tab 3: "Climate Risk")

| # | Metric | Comp. Location | Tier | Input | Display | Perf. Budget |
|---|--------|---------------|------|-------|---------|-------------|
| R1 | **UTCI screening** (qualitative) | TS client | 2 | SVF (pre-computed), shadow state, Open-Meteo weather API (Ta, RH, wind, radiation) | Ground heatmap with UTCI stress categories | <5s after SVF computed |
| R2 | **Heat island risk** | TS client | 1 | ISR + LCZ + SVF | Per-cell color (composite score 0–1) | Instant from pre-computed inputs |
| R3 | **Wind canyon risk** | TS client | 1 | Canyon H/W ratio | Street line color (flag H/W > 2.0 as high risk) | Instant from pre-computed H/W |
| R4 | **Flood vulnerability index** | TS client | 1 | ISR + green space fraction | Per-cell color (simplified PFVI 0–1) | Instant (<50ms) |

### 1.4 Summary Metrics (Always Visible in Bottom Bar)

| Metric | Computation | Format |
|--------|------------|--------|
| Area-wide ISR | Mean of cell ISR values | Percentage (e.g., "ISR: 72%") |
| Area-wide BAF | Mean of cell BAF values | Decimal (e.g., "BAF: 0.31") |
| Shadow at solar noon | Shadow coverage % at 12:00 on selected date | Percentage (e.g., "Shade@noon: 34%") |
| Annual sun-hours range | Min–max of ground sun-hours grid | Hours (e.g., "Sun: 840–1,840 hrs/yr") |
| LCZ type | Classification result | Badge (e.g., "LCZ 2 — Compact midrise") |

---

## 2. TypeScript-Side Computation (Tier 1 & 2 Metrics)

### 2.1 Tier 1 Instant Metrics (Client-Side, <100ms)

These metrics compute immediately from extracted data without additional raycasting or API calls.

#### E5: Embodied Carbon Estimate

**Method**: Archetype-based estimation from finding #43.

```typescript
// Archetype lookup table (kgCO₂e/m² GFA, modules A1–A3)
const EMBODIED_CARBON_ARCHETYPES: Record<string, number> = {
  'residential_concrete': 500,   // Typical concrete frame residential
  'residential_timber': 300,     // Timber frame residential
  'residential_masonry': 450,    // Load-bearing masonry
  'office_steel': 600,           // Steel frame office
  'office_concrete': 550,        // Concrete frame office
  'retail': 500,                 // Generic retail
  'default': 500,                // When use type unknown
};

// Per-building: area × floors × archetype factor
// Total lifecycle: A1–A3 + B4 (45% of A1–A3) + C1–C4 (50 kgCO₂e/m²)
function computeEmbodiedCarbon(
  footprintAreaM2: number,
  heightM: number,
  floorHeightM: number = 3.0,
  archetype: string = 'default'
): { perM2: number; total: number } {
  const floors = Math.max(1, Math.round(heightM / floorHeightM));
  const gfa = footprintAreaM2 * floors;
  const a1a3 = EMBODIED_CARBON_ARCHETYPES[archetype] ?? 500;
  const b4 = a1a3 * 0.45;   // Replacement over 60-year period
  const c1c4 = 50;           // End-of-life standard (London Plan)
  const totalPerM2 = a1a3 + b4 + c1c4;
  return { perM2: totalPerM2, total: totalPerM2 * gfa };
}
```

**Display**: Per-building color on `viridis` ramp. Legend: 0–1200 kgCO₂e/m² (A+C+B4). Reference benchmarks: LETI <350 kgCO₂e/m² (A rating), RIBA 2030 <625 kgCO₂e/m².

**Precision label**: "Archetype estimate ±40%. Does not account for specific materials or construction methods."

#### E6: Operational Carbon Estimate

**Method**: EUI lookup by building type + grid carbon intensity (finding #43).

```typescript
// EUI lookup (kWh/m²/year) — typical new construction
const EUI_BY_TYPE: Record<string, number> = {
  'residential': 100,
  'office': 125,
  'retail': 175,
  'education': 120,
  'default': 120,
};

// Climate zone adjustment (applied multiplicatively)
const CLIMATE_ADJUSTMENT: Record<string, number> = {
  'hot_arid': 1.10,     // +30% cooling, -20% heating
  'hot_humid': 1.15,
  'temperate': 1.00,
  'continental': 1.10,
  'cold': 1.20,
};

function computeOperationalCarbon(
  gfa: number,
  buildingType: string,
  gridCarbonIntensity: number = 0.38,  // kgCO₂e/kWh (US avg)
  studyPeriodYears: number = 60,
  climateZone: string = 'temperate'
): { annualPerM2: number; lifetimePerM2: number } {
  const eui = EUI_BY_TYPE[buildingType] ?? 120;
  const adj = CLIMATE_ADJUSTMENT[climateZone] ?? 1.0;
  const annualPerM2 = eui * adj * gridCarbonIntensity;
  return {
    annualPerM2,
    lifetimePerM2: annualPerM2 * studyPeriodYears,
  };
}
```

**Display**: Per-building color on `magma` ramp. Legend: 0–80 kgCO₂e/m²/yr. Show both current grid and decarbonised projection.

**Precision label**: "Screening estimate ±30–50%. Based on building type archetype and national grid intensity."

#### R2: Heat Island Risk (Composite)

**Method**: Weighted composite from pre-computed metrics.

```typescript
function computeHeatIslandRisk(
  isr: number,       // 0–1, from backend
  svf: number,       // 0–1, from SVF computation (or proxy from H/W)
  lczType: number,   // 1–10
  vegetationFrac: number  // 0–1, from BAF data
): number {
  // Normalize each to 0–1 risk scale (higher = worse)
  const isrRisk = isr;                              // Direct: more impervious = more heat
  const svfRisk = svf > 0.6 ? (svf - 0.6) / 0.4 : 0; // High SVF = less shade = more heat
  const vegBenefit = 1 - vegetationFrac;             // Less vegetation = more heat
  const lczRisk = [1, 2, 3, 7].includes(lczType) ? 0.8 :  // Compact = higher heat retention
                  [4, 5, 6, 8].includes(lczType) ? 0.4 : 0.2;

  return 0.35 * isrRisk + 0.25 * svfRisk + 0.25 * vegBenefit + 0.15 * lczRisk;
}
```

**Display**: Per-tessellation-cell color on `rdylgn` (reversed: red=high risk). Thresholds: <0.3 green (low), 0.3–0.6 yellow (moderate), >0.6 red (high).

#### R3: Wind Canyon Risk

**Method**: Flag based on H/W ratio thresholds from finding #42.

```typescript
function computeWindCanyonRisk(hw: number): 'low' | 'moderate' | 'high' {
  if (hw > 2.0) return 'high';       // Venturi channeling risk
  if (hw > 0.65) return 'moderate';   // Skimming flow, poor ventilation
  return 'low';                       // Isolated roughness
}
```

**Display**: Street segment color on MapLibre line layer. Green (<0.65), yellow (0.65–2.0), red (>2.0).

#### R4: Flood Vulnerability Index (Simplified PFVI)

**Method**: Simplified version of finding #42 PFVI (without DEM/TWI, which requires elevation data not in OSM).

```typescript
function computeFloodVulnerability(
  isr: number,            // 0–1
  greenFraction: number,  // 0–1 (from BAF data)
  drainageDensity: number // street network density as proxy, normalized 0–1
): number {
  return 0.45 * isr + 0.35 * (1 - greenFraction) + 0.20 * (1 - drainageDensity);
}
```

**Display**: Per-cell on `rdylgn` reversed ramp. Thresholds per finding #42: 0–0.2 very low, 0.2–0.4 low, 0.4–0.6 moderate, 0.6–0.8 high, 0.8–1.0 very high.

**Precision label**: "Simplified screening. Does not include topography or drainage infrastructure."

### 2.2 Tier 2 Interactive Metrics (Client-Side, 1–30s)

These require Three.js raycasting or API calls but complete within an interactive wait.

#### S3: Annual Sun-Hours (Ground Level)

**Method**: BVH-accelerated raycasting per spike C5.

**Pipeline**:
1. Merge all building ExtrudeGeometry into single BufferGeometry
2. Build MeshBVH acceleration structure (`three-mesh-bvh`)
3. Generate ~120 annual sun positions: 21st of each month × hourly 05:00–21:00, filter altitude > 3°
4. Create ground sample grid at Y = 1m: 10m spacing within extraction bbox
5. For each sample point, cast ray toward each sun position via `bvh.raycastFirst()`
6. Count unobstructed rays → multiply by ~30 hours per position (365÷12) → annual sun-hours

**Grid sizing**: For 1 km² (1000m × 1000m) at 10m spacing = ~10,000 sample points. At ~120 rays per point = ~1.2M ray casts. Based on C5 architecture, this should complete in <30s.

**Performance budget**: <30s for 500 buildings. Use Web Worker to avoid blocking UI. Show progress bar: "Computing sun-hours… 45%".

**Display**: Ground heatmap via CanvasTexture on PlaneGeometry(1200, 1200) at Y=0.1. Color ramp: `magma` (dark = few hours, bright = many hours). Legend: "0 – 2,000+ hrs/year". Canvas resolution: 1 pixel per 10m = 100×100 texture (for 1 km²).

**Interaction**: Hover on ground shows tooltip with specific sun-hours value. Click to pin.

#### S4: Sky View Factor (Ground Level)

**Method**: Fibonacci hemisphere sampling per spike C5.

**Pipeline**:
1. Use same merged BVH geometry as S3
2. Generate 500 ground sample points (5m offset grid within core area, or user-placed)
3. Per sample point: cast 100 uniformly distributed rays on upper hemisphere (Fibonacci spiral)
4. SVF = fraction of unobstructed rays (0 = fully enclosed, 1 = fully open)

**Performance budget**: 500 points × 100 rays = 50,000 ray casts. Target <15s. Use Web Worker.

**Display**: Ground heatmap. Color ramp: `blues` reversed (dark blue = low SVF = more enclosed, light = open). Legend: "SVF 0.0 – 1.0". Typical urban: 0.3–0.8.

**Interaction**: Hover shows specific SVF value. Threshold overlay option: highlight cells with SVF < 0.4 (significant thermal benefit per finding #40).

#### S5: Vertical Sky Component (Facade Level)

**Method**: CIE overcast sky weighted hemisphere sampling per spike C5.

**Pipeline**:
1. Use same merged BVH geometry
2. Generate facade sample points: on building bounding box faces at 3m vertical intervals, 0.5m offset outward from surface, 4 cardinal directions per height
3. Per sample: cast 100 hemisphere rays, weighted by CIE overcast sky luminance distribution
4. VSC = weighted fraction of unobstructed sky (0–27% typical range, per BRE standards)

**Performance budget**: ~500 facade points × 100 rays = 50,000 ray casts. Target <15s. Web Worker.

**Display**: Per-face building vertex coloring. Write RGB values to per-vertex `Float32Array` attribute on merged geometry. Color ramp: `viridis`. Legend: "VSC 0% – 30%". BRE daylight standard: VSC ≥ 27% is "good"; < 15% is "poor".

**Key threshold**: BRE/BS 8206 standard — if VSC falls below 27%, or below 0.8× its former value due to new development, daylight is adversely affected [finding #08].

#### R1: UTCI Screening

**Method**: Simplified Tmrt estimation from SVF + shadow state + Open-Meteo weather per finding #40.

**Pipeline**:
1. **Prerequisite**: S4 (SVF) must be computed first
2. Fetch weather data from Open-Meteo API:
   ```
   GET https://api.open-meteo.com/v1/forecast?
     latitude={lat}&longitude={lng}&
     hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,
            direct_radiation,diffuse_radiation&
     forecast_days=1
   ```
3. For selected hour: extract Ta, RH, wind, direct radiation, diffuse radiation
4. Per ground sample point:
   - Determine sun/shade state from shadow map (S1) at selected time
   - Estimate Tmrt using simplified SOLWEIG approach:
     ```
     Tmrt ≈ f(SVF, shadow_state, Ta, direct_radiation, diffuse_radiation)
     ```
     - If in sun: Tmrt ≈ Ta + 15 + (1 - SVF) × 10 (simplified radiation balance)
     - If in shade: Tmrt ≈ Ta + (1 - SVF) × 8 (longwave from warm walls)
   - Compute UTCI via `jsthermalcomfort` polynomial (Ta, Tmrt, wind, RH)
5. Map to stress categories

**Dependencies**: `jsthermalcomfort` (MIT, npm) for UTCI polynomial. `suncalc` for sun position.

**Performance budget**: <5s after SVF is pre-computed. The UTCI polynomial itself is microseconds per point. The bottleneck is the Open-Meteo API call (~500ms).

**Display**: Ground heatmap. Color ramp: custom 10-color UTCI stress category scale:
- Below 0°C: deep blue (extreme cold)
- 0–9°C: blue (moderate cold)
- 9–26°C: green (no thermal stress — comfort zone)
- 26–32°C: yellow (moderate heat)
- 32–38°C: orange (strong heat)
- 38–46°C: red (very strong heat)
- Above 46°C: dark red (extreme heat)

**Precision label**: "Screening estimate ±5–8°C UTCI (±1 stress category). Based on simplified Tmrt — suitable for comparative design assessment, not regulatory compliance."

---

## 3. Python Backend Computation (Tier 1 Server Metrics)

### 3.1 Endpoint: POST /metrics/sustainability

**Request schema**:
```json
{
  "buildings": { "type": "FeatureCollection", "features": [...] },
  "streets": { "type": "FeatureCollection", "features": [...] },
  "tessellation": { "type": "FeatureCollection", "features": [...] },
  "metrics": ["isr", "baf", "runoff", "canyon_hw", "lcz"],
  "latitude": 41.39
}
```

**Response schema**:
```json
{
  "cell_metrics": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [...] },
        "properties": {
          "cell_id": "abc123",
          "isr": 0.82,
          "baf": 0.18,
          "runoff_coefficient": 0.78,
          "green_fraction": 0.12,
          "surface_type": "sealed"
        }
      }
    ]
  },
  "street_metrics": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "LineString", "coordinates": [...] },
        "properties": {
          "segment_id": "seg456",
          "canyon_hw": 1.35,
          "street_width_m": 12.0,
          "adj_building_height_m": 16.2
        }
      }
    ]
  },
  "aggregate": {
    "mean_isr": 0.72,
    "mean_baf": 0.31,
    "mean_runoff": 0.68,
    "mean_canyon_hw": 1.15,
    "lcz": {
      "primary": { "type": 2, "label": "Compact midrise", "score": 0.009 },
      "secondary": { "type": 1, "label": "Compact high-rise", "score": 0.393 }
    }
  }
}
```

### 3.2 Metric Computation Details (Python)

#### E1: ISR (Impervious Surface Ratio)

```python
def compute_isr(tessellation: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """ISR per tessellation cell.

    Without land cover data: ISR = building_footprint_area / cell_area
    + assume remaining non-green area is 80% impervious (streets, paving).
    With OSM land use: classify surfaces from `landuse=*`, `natural=*`, `leisure=*` tags.
    """
    tess = tessellation.copy()
    tess['cell_area'] = tess.geometry.area

    # Intersect buildings with cells
    building_in_cell = gpd.overlay(buildings, tess, how='intersection')
    building_area = building_in_cell.groupby('cell_id')['geometry'].apply(lambda g: g.area.sum())
    tess['building_area'] = tess['cell_id'].map(building_area).fillna(0)

    # Check for green land use tags in cell
    green_tags = ['grass', 'garden', 'park', 'forest', 'meadow', 'recreation_ground']
    # ... classify from OSM if available, else conservative estimate

    tess['isr'] = (tess['building_area'] + 0.8 * (tess['cell_area'] - tess['building_area'])) / tess['cell_area']
    tess['isr'] = tess['isr'].clip(0, 1)
    return tess
```

#### E2: BAF (Biotope Area Factor)

```python
# BAF weighting factors (Berlin/Seattle standard)
BAF_WEIGHTS = {
    'sealed': 0.0,           # Asphalt, concrete
    'semi_permeable': 0.3,   # Block paving with joints
    'semi_open': 0.5,        # Gravel, wood chips
    'green_roof_ext': 0.5,   # Extensive green roof
    'green_roof_int': 0.7,   # Intensive green roof
    'vegetation_soil': 1.0,  # Connected to soil below
}

def compute_baf(tessellation: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """BAF per tessellation cell. Higher = more ecologically functional."""
    tess = tessellation.copy()
    # Map OSM surface tags to BAF weight categories
    # Default: building footprint = 0.0, remaining = 0.3 (conservative)
    tess['baf'] = tess.apply(classify_and_weight_surfaces, axis=1)
    return tess
```

#### E3: Runoff Coefficient

```python
RUNOFF_COEFFICIENTS = {
    'sealed': 0.85,
    'roof': 0.90,
    'semi_permeable': 0.40,
    'gravel': 0.35,
    'grass_flat': 0.15,
    'park': 0.10,
}

def compute_runoff(tessellation: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Area-weighted Rational Method runoff coefficient per cell."""
    tess = tessellation.copy()
    # C = Σ(Cᵢ × Aᵢ) / Σ(Aᵢ)
    tess['runoff_coefficient'] = tess.apply(weighted_runoff, axis=1)
    return tess
```

#### E4: LCZ Classification

Per spike K4, using sum-of-squared normalized distances to Stewart & Oke threshold ranges.

```python
LCZ_THRESHOLDS = {
    1: {'bsf': (0.40, 1.0), 'bh': (25, 999), 'svf': (0, 0.4), 'hw': (2.0, 999)},
    2: {'bsf': (0.40, 1.0), 'bh': (10, 25),  'svf': (0.3, 0.6), 'hw': (0.75, 2.0)},
    3: {'bsf': (0.40, 1.0), 'bh': (3, 10),   'svf': (0.2, 0.6), 'hw': (0.75, 1.5)},
    # ... types 4–10 per K4 spike threshold table
}

def classify_lcz(bsf: float, bh: float, svf: float, hw: float) -> dict:
    """Returns primary and secondary LCZ with confidence scores."""
    scores = {}
    for lcz_type, thresholds in LCZ_THRESHOLDS.items():
        score = sum(squared_distance_to_range(val, rng)
                    for val, rng in zip([bsf, bh, svf, hw], thresholds.values()))
        scores[lcz_type] = score
    sorted_types = sorted(scores.items(), key=lambda x: x[1])
    return {
        'primary': {'type': sorted_types[0][0], 'score': sorted_types[0][1]},
        'secondary': {'type': sorted_types[1][0], 'score': sorted_types[1][1]},
    }
```

**Performance**: 14.3ms for 10 cities per K4. Single-area classification: <2ms.

#### S6: Canyon H/W Ratio

Already computed by momepy in the extraction pipeline via `streetscape_hw_ratio_mean`. For per-segment display, compute H/W for each street segment:

```python
def compute_canyon_hw(streets: gpd.GeoDataFrame, buildings: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Canyon H/W per street segment using adjacent building heights and street width."""
    streets = streets.copy()
    # momepy.StreetProfile or manual: buffer street by width, intersect buildings,
    # average adjacent building height / street width
    streets['canyon_hw'] = momepy.street_profile(streets, buildings)['hw_ratio']
    return streets
```

---

## 4. Shadow Animation System

### 4.1 Architecture

The shadow animation system uses Three.js DirectionalLight with shadow mapping, driven by SunCalc solar position calculations. This follows the proven C5 spike architecture.

```
SunCalc(lat, lng, date, time)
  → solar altitude, azimuth
    → DirectionalLight position in RTC space
      → Shadow map render pass (PCFSoftShadowMap)
        → ShadowMaterial ground plane shows shadow pattern
```

### 4.2 DirectionalLight Configuration

```typescript
interface ShadowConfig {
  mapSize: number;         // 2048 (default) or 4096 (high quality)
  frustumSize: number;     // 500m (covers typical 1 km² extraction)
  bias: number;            // -0.001 (prevent peter-panning)
  normalBias: number;      // 0.5 (reduce shadow acne)
  shadowType: THREE.ShadowMapType; // PCFSoftShadowMap
}

function initShadowSystem(scene: THREE.Scene, config: ShadowConfig): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.castShadow = true;
  light.shadow.mapSize.set(config.mapSize, config.mapSize);
  light.shadow.camera.left = -config.frustumSize;
  light.shadow.camera.right = config.frustumSize;
  light.shadow.camera.top = config.frustumSize;
  light.shadow.camera.bottom = -config.frustumSize;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = config.frustumSize * 2;
  light.shadow.bias = config.bias;
  light.shadow.normalBias = config.normalBias;
  return light;
}
```

### 4.3 SunCalc Integration

```typescript
import SunCalc from 'suncalc';

function updateLightPosition(
  light: THREE.DirectionalLight,
  lat: number, lng: number,
  date: Date,
  lightDistance: number = 500
): void {
  const sunPos = SunCalc.getPosition(date, lat, lng);
  const altitude = sunPos.altitude;  // radians above horizon
  const azimuth = sunPos.azimuth;    // radians from south, positive west

  if (altitude < 0.05) {
    // Sun below horizon — disable shadows
    light.intensity = 0;
    return;
  }

  // RTC coordinate system: X→East, Y→Up, Z→South
  light.position.set(
    -Math.sin(azimuth) * Math.cos(altitude) * lightDistance,
    Math.sin(altitude) * lightDistance,
    Math.cos(azimuth) * Math.cos(altitude) * lightDistance
  );
  light.target.position.set(0, 0, 0);
  light.intensity = Math.min(1.0, altitude / 0.5);  // Fade near horizon
  light.shadow.camera.updateProjectionMatrix();
}
```

### 4.4 Time Slider Controls

**UI elements in Solar tab**:

1. **Time-of-day slider**: Range 05:00–21:00, step 15 minutes. Shows current time label. Dragging updates shadow in real-time (calls `updateLightPosition` on every change).

2. **Date selector**: Preset buttons — "Summer Solstice" (June 21), "Winter Solstice" (Dec 21), "Spring Equinox" (Mar 20), "Today" (current date). Custom date picker as fallback.

3. **Play/pause button**: Animates shadow sweep from 05:00 to 21:00 over ~4 seconds at 60fps. Animation rate: ~0.05 hours per frame → 280 frames for 16 hours.

4. **Shadow quality selector** (in settings, not main UI): 1024px (fast), 2048px (default), 4096px (high quality).

### 4.5 Shadow Ground Plane

```typescript
function createShadowGroundPlane(size: number = 1200): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);  // Horizontal
  const material = new THREE.ShadowMaterial({
    opacity: 0.4,  // Semi-transparent shadow overlay
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.position.y = 0.05;  // Slightly above ground to avoid z-fighting
  plane.receiveShadow = true;
  return plane;
}
```

This plane is transparent except where shadows fall — so the MapLibre basemap remains visible beneath. Shadow opacity 0.4 provides clear shadow indication without obscuring the map.

### 4.6 Building Shadow Properties

All buildings must have `castShadow = true` and `receiveShadow = true`:

```typescript
// For InstancedMesh (context buildings)
instancedMesh.castShadow = true;
instancedMesh.receiveShadow = true;

// For merged geometry (focal buildings)
mergedMesh.castShadow = true;
mergedMesh.receiveShadow = true;
```

### 4.7 Shadow Coverage Percentage (S2)

To compute the percentage of ground area in shadow at a given timestamp:

```typescript
function computeShadowCoverage(
  renderer: THREE.WebGLRenderer,
  shadowMap: THREE.WebGLShadowMap,
  samplePoints: Float32Array,  // ground grid points
  bvh: MeshBVH,
  sunDirection: THREE.Vector3
): number {
  // Option A: Read shadow map pixels (GPU readback — slower)
  // Option B: Use BVH raycasting (same as sun-hours, but single timestamp)
  let shadowed = 0;
  const ray = new THREE.Ray();
  for (let i = 0; i < samplePoints.length; i += 3) {
    ray.origin.set(samplePoints[i], samplePoints[i + 1], samplePoints[i + 2]);
    ray.direction.copy(sunDirection);
    if (bvh.raycastFirst(ray)) shadowed++;
  }
  return shadowed / (samplePoints.length / 3);
}
```

**Performance**: Single-timestamp BVH raycast for 2,500 points (50m grid on 500m²) × 1 direction = 2,500 rays. Sub-second.

---

## 5. Layer Panel Design with Color Ramps

### 5.1 Layer Structure

The layer panel (bottom-left floating UI per finding #83) manages visibility and coloring for all metric layers. P1 extends the shared LayerPanel with sustainability-specific layers:

```typescript
interface SustainabilityLayer {
  id: string;
  label: string;
  category: 'solar' | 'environment' | 'climate';
  type: 'ground_heatmap' | 'building_color' | 'street_color' | 'badge';
  colorRamp: string;
  valueRange: [number, number];
  unit: string;
  precision: string;  // Honest precision label
  visible: boolean;
  opacity: number;    // 0–1
}

const P1_LAYERS: SustainabilityLayer[] = [
  // Solar tab
  { id: 'shadow',      label: 'Shadow Pattern',      category: 'solar', type: 'ground_heatmap', colorRamp: 'greys',   valueRange: [0, 1],    unit: '', precision: 'Real-time visualization' },
  { id: 'sun_hours',   label: 'Annual Sun-Hours',     category: 'solar', type: 'ground_heatmap', colorRamp: 'magma',   valueRange: [0, 2000], unit: 'hrs/yr', precision: 'Screening (10m resolution, 120 annual samples)' },
  { id: 'svf',         label: 'Sky View Factor',      category: 'solar', type: 'ground_heatmap', colorRamp: 'blues_r', valueRange: [0, 1],    unit: '', precision: '100-ray hemisphere sampling' },
  { id: 'vsc',         label: 'Vertical Sky Component', category: 'solar', type: 'building_color', colorRamp: 'viridis', valueRange: [0, 30], unit: '%', precision: 'CIE overcast sky model (100 rays)' },
  { id: 'canyon_hw',   label: 'Canyon H/W Ratio',     category: 'solar', type: 'street_color',  colorRamp: 'rdylgn_r', valueRange: [0, 3],   unit: '', precision: 'From momepy street profile' },

  // Environment tab
  { id: 'isr',         label: 'Impervious Surface Ratio', category: 'environment', type: 'ground_heatmap', colorRamp: 'rdylgn_r', valueRange: [0, 1], unit: '', precision: 'From OSM land use + building footprints' },
  { id: 'baf',         label: 'Biotope Area Factor',  category: 'environment', type: 'ground_heatmap', colorRamp: 'rdylgn',   valueRange: [0, 1], unit: '', precision: 'Berlin standard weights' },
  { id: 'runoff',      label: 'Runoff Coefficient',   category: 'environment', type: 'ground_heatmap', colorRamp: 'blues',    valueRange: [0, 0.95], unit: '', precision: 'Rational Method ±15%' },
  { id: 'embodied_c',  label: 'Embodied Carbon',      category: 'environment', type: 'building_color', colorRamp: 'viridis',  valueRange: [0, 1200], unit: 'kgCO₂e/m²', precision: 'Archetype estimate ±40%' },
  { id: 'operational_c', label: 'Operational Carbon',  category: 'environment', type: 'building_color', colorRamp: 'magma',    valueRange: [0, 80], unit: 'kgCO₂e/m²/yr', precision: 'EUI archetype ±30–50%' },
  { id: 'lcz',         label: 'LCZ Classification',   category: 'environment', type: 'badge',          colorRamp: 'categorical', valueRange: [1, 10], unit: '', precision: '4 of 6 indicators (K4 spike)' },

  // Climate Risk tab
  { id: 'utci',        label: 'UTCI Thermal Comfort',  category: 'climate', type: 'ground_heatmap', colorRamp: 'utci_stress', valueRange: [-20, 50], unit: '°C eq.', precision: 'Screening ±5–8°C (±1 category)' },
  { id: 'heat_island', label: 'Heat Island Risk',      category: 'climate', type: 'ground_heatmap', colorRamp: 'rdylgn_r',    valueRange: [0, 1], unit: '', precision: 'Composite ISR + SVF + LCZ + vegetation' },
  { id: 'wind_canyon', label: 'Wind Canyon Risk',      category: 'climate', type: 'street_color',   colorRamp: 'rdylgn_r',    valueRange: [0, 3], unit: '', precision: 'H/W threshold classification' },
  { id: 'flood_vuln',  label: 'Flood Vulnerability',   category: 'climate', type: 'ground_heatmap', colorRamp: 'rdylgn_r',    valueRange: [0, 1], unit: '', precision: 'Simplified (no topography)' },
];
```

### 5.2 Color Ramp Implementation

Color ramps are defined as arrays of RGB stops. The MetricColorizer (from shared map template) interpolates between stops.

```typescript
const COLOR_RAMPS: Record<string, [number, number, number][]> = {
  viridis: [[68,1,84], [59,82,139], [33,145,140], [94,201,98], [253,231,37]],
  magma: [[0,0,4], [81,18,124], [183,55,121], [252,137,97], [252,253,191]],
  rdylgn: [[215,48,39], [252,141,89], [254,224,139], [217,239,139], [26,152,80]],
  blues: [[247,251,255], [189,215,231], [107,174,214], [33,113,181], [8,48,107]],
  greys: [[255,255,255], [150,150,150], [50,50,50]],
  utci_stress: [
    [0,0,128],     // Extreme cold: navy
    [65,105,225],   // Moderate cold: royal blue
    [34,139,34],    // No stress: forest green
    [255,255,0],    // Moderate heat: yellow
    [255,140,0],    // Strong heat: orange
    [255,0,0],      // Very strong: red
    [139,0,0],      // Extreme heat: dark red
  ],
};

function interpolateColor(value: number, min: number, max: number, ramp: [number, number, number][]): [number, number, number] {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = t * (ramp.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, ramp.length - 1);
  const frac = idx - lo;
  return [
    ramp[lo][0] + (ramp[hi][0] - ramp[lo][0]) * frac,
    ramp[lo][1] + (ramp[hi][1] - ramp[lo][1]) * frac,
    ramp[lo][2] + (ramp[hi][2] - ramp[lo][2]) * frac,
  ];
}
```

### 5.3 Color Ramp Legend Component

Each active metric layer displays a gradient legend bar in the bottom-right corner of the map:

```
┌──────────────────────────┐
│ Annual Sun-Hours (hrs/yr)│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ 0          1000      2000│
│ ℹ 10m grid, 120 samples │
└──────────────────────────┘
```

- Title: metric name + unit
- Gradient bar: CSS `linear-gradient` from ramp stops
- Range labels: min and max values
- Info line: precision/method note (from `precision` field)
- Only one legend visible at a time (matches active metric)

---

## 6. Building Facade Coloring (VSC)

### 6.1 Per-Face Vertex Color Approach

For VSC and embodied/operational carbon, buildings are colored by metric value using per-vertex color attributes on the merged BufferGeometry.

**Architecture**:
1. Merged geometry has a `color` attribute (Float32Array, 3 components per vertex)
2. Each building's vertices are tracked via a `buildingVertexRanges` lookup: `Map<string, { start: number, count: number }>`
3. To color building `i` by metric value `v`:
   - Look up vertex range for building `i`
   - Compute RGB from color ramp: `interpolateColor(v, min, max, ramp)`
   - Write RGB to all vertices in range
   - Set `geometry.attributes.color.needsUpdate = true`

```typescript
function colorBuildingsByMetric(
  geometry: THREE.BufferGeometry,
  buildingRanges: Map<string, { start: number; count: number }>,
  metricValues: Map<string, number>,
  ramp: [number, number, number][],
  valueRange: [number, number]
): void {
  const colors = geometry.attributes.color as THREE.BufferAttribute;
  const arr = colors.array as Float32Array;

  for (const [buildingId, range] of buildingRanges) {
    const value = metricValues.get(buildingId);
    if (value === undefined) continue;
    const [r, g, b] = interpolateColor(value, valueRange[0], valueRange[1], ramp);
    for (let i = range.start; i < range.start + range.count; i++) {
      arr[i * 3] = r / 255;
      arr[i * 3 + 1] = g / 255;
      arr[i * 3 + 2] = b / 255;
    }
  }
  colors.needsUpdate = true;
}
```

**Material**: Use `MeshStandardMaterial` with `vertexColors: true` for merged geometry. This allows per-vertex coloring while still supporting shadow receiving.

### 6.2 VSC Facade-Specific Coloring

VSC values are computed at specific facade sample points (N/S/E/W faces at 3m intervals). To color facades:

1. **Map VSC sample points to faces**: Each sample point is associated with a building face (N/S/E/W). The ExtrudeGeometry has deterministic face ordering — side faces are generated in footprint-vertex order.

2. **Assign VSC to nearest face vertices**: For each facade sample point, find the nearest vertices on the merged geometry (spatial lookup via face index). Write the VSC color to those vertices.

3. **Interpolation**: Vertices between sample heights get linearly interpolated VSC values. Top faces (roof) get the average of adjacent facade samples.

**Fallback**: If per-face coloring proves too complex for the prototype, fall back to per-building average VSC (single color per building). Note this in the findings document if it occurs.

---

## 7. Ground Heatmap System

### 7.1 Architecture

Ground heatmaps visualize scalar fields (sun-hours, SVF, ISR, UTCI, etc.) as colored overlays on the ground plane. Per finding #83 design:

```
Scalar data (Float32Array grid)
  → CanvasTexture rasterization (offscreen <canvas>)
    → MeshBasicMaterial (transparent, opacity: 0.6)
      → PlaneGeometry at Y=0.1 (above shadow plane)
        → Visible as colored overlay on map
```

### 7.2 Implementation

```typescript
class GroundHeatmap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private mesh: THREE.Mesh;
  private gridResolution: number;  // meters per pixel

  constructor(
    sizeM: number = 1200,         // Physical size in meters
    gridResolution: number = 10,  // Meters per pixel (10m default)
    opacity: number = 0.6
  ) {
    const pixels = Math.ceil(sizeM / gridResolution);
    this.gridResolution = gridResolution;

    this.canvas = document.createElement('canvas');
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(sizeM, sizeM);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity,
      depthWrite: false,  // Prevent z-fighting with shadow plane
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.1;  // Above ground, below shadow plane
    this.mesh.visible = false;
  }

  update(
    data: Float32Array,      // Grid values (row-major)
    width: number,           // Grid width in cells
    height: number,          // Grid height in cells
    ramp: [number, number, number][],
    valueRange: [number, number]
  ): void {
    const imageData = this.ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const [r, g, b] = interpolateColor(data[i], valueRange[0], valueRange[1], ramp);
      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = data[i] === 0 ? 0 : 180;  // Transparent where no data
    }
    this.ctx.putImageData(imageData, 0, 0);
    this.texture.needsUpdate = true;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }
}
```

### 7.3 Ground Heatmap Layer Stacking

Multiple ground heatmaps cannot be visible simultaneously (they would overlap). The layer panel enforces mutual exclusivity within ground heatmap layers:

| Priority | Layer | Y Position |
|----------|-------|-----------|
| 1 (lowest) | MapLibre basemap | 0 (rendered by MapLibre) |
| 2 | Shadow plane (ShadowMaterial) | 0.05 |
| 3 | Active ground heatmap | 0.1 |
| — | Buildings (3D meshes) | Ground to height |

When a ground heatmap is active, the shadow plane remains visible beneath it (shadow material is additive — it only darkens). The heatmap opacity (0.6) allows shadows to show through.

**Layer switching behavior**: When user selects a new ground metric, the previous heatmap data is replaced. The canvas is cleared and repainted with new data. Transition should be instant (canvas repaint is <10ms for 100×100 pixels).

### 7.4 Tessellation Cell Rendering (ISR/BAF/Runoff)

For cell-based environmental metrics (ISR, BAF, runoff, flood vulnerability), the display uses MapLibre `fill-extrusion` or `fill` layers rather than the Three.js ground heatmap:

```typescript
// Add tessellation cells as a MapLibre source
map.addSource('tessellation', {
  type: 'geojson',
  data: tessellationGeoJSON,
});

// Color cells by active metric
map.addLayer({
  id: 'tessellation-fill',
  type: 'fill',
  source: 'tessellation',
  paint: {
    'fill-color': [
      'interpolate', ['linear'],
      ['get', activeMetricKey],  // e.g., 'isr'
      0, '#1a9850',   // Green (low ISR = good)
      0.5, '#ffffbf',  // Yellow (moderate)
      1, '#d73027',   // Red (high ISR = bad)
    ],
    'fill-opacity': 0.5,
  },
});
```

This is more efficient than rasterizing to a canvas because MapLibre handles the geo-projection natively. The tessellation polygons align perfectly with the building footprints since both come from the same extraction.

---

## 8. Web Worker Architecture

### 8.1 Why Web Workers

Tier 2/3 computations (sun-hours, SVF, VSC, UTCI) involve millions of raycasts that would block the main thread for 10–30+ seconds. Web Workers keep the UI responsive.

### 8.2 Worker Pipeline

```
Main Thread                          Web Worker
─────────────                        ──────────

extractArea() ─────────────┐
  buildings, streets       │
  merged geometry          │
                           ▼
              postMessage(geometryData, sunPositions)
                           │
                           ├───────► Build MeshBVH
                           │         Raycast all points × directions
                           │         Report progress (10%, 20%, ...)
                           │◄───────
              onmessage(progress)
  Update progress bar      │
                           │◄───────
              onmessage(result)
  Update GroundHeatmap     │
  Enable layer toggle      │
```

### 8.3 Transferable Data

```typescript
// Main → Worker: transfer geometry buffers (zero-copy)
worker.postMessage({
  type: 'compute_sun_hours',
  positions: positionBuffer,    // Float32Array (transferable)
  indices: indexBuffer,         // Uint32Array (transferable)
  sunPositions: sunPosBuffer,   // Float32Array (transferable)
  gridOrigin: [x, z],
  gridSize: [cols, rows],
  gridSpacing: 10,
}, [positionBuffer.buffer, indexBuffer.buffer, sunPosBuffer.buffer]);

// Worker → Main: transfer result buffer
self.postMessage({
  type: 'sun_hours_result',
  data: sunHoursGrid,           // Float32Array (transferable)
  width: cols,
  height: rows,
}, [sunHoursGrid.buffer]);
```

### 8.4 Progress Reporting

The worker reports progress at regular intervals so the UI can display a progress bar:

```typescript
// Inside worker
for (let i = 0; i < totalPoints; i++) {
  // ... raycast ...
  if (i % 100 === 0) {
    self.postMessage({
      type: 'progress',
      metric: 'sun_hours',
      percent: Math.round((i / totalPoints) * 100),
    });
  }
}
```

UI shows: "Computing sun-hours… 67%" with a determinate progress bar.

---

## 9. Data Flow and State Management

### 9.1 Complete Data Flow

```
User draws rectangle (AreaSelector)
  │
  ▼
POST /extract (bbox, buffer=200m, include_heights=true, include_tessellation=true)
  │  ~30–60s
  ▼
FragmentPackage returned:
  ├── buildings (GeoJSON FeatureCollection)
  ├── streets (GeoJSON FeatureCollection)
  ├── tessellation (GeoJSON FeatureCollection)
  ├── metrics (StandardFragmentProfile — 61 momepy metrics)
  └── metadata (bbox, building count, height source stats)
  │
  ├──► Zustand store: setBuildings(), setStreets(), setTessellation()
  ├──► BuildingMesh: construct InstancedMesh/merged geometry
  ├──► MapLibre: add street + tessellation sources
  │
  ▼
POST /metrics/sustainability (buildings, streets, tessellation, metrics list)
  │  ~1–5s
  ▼
Sustainability metrics returned:
  ├── cell_metrics (ISR, BAF, runoff per tessellation cell)
  ├── street_metrics (canyon H/W per street segment)
  └── aggregate (mean ISR, mean BAF, LCZ classification)
  │
  ├──► Zustand store: setSustainabilityMetrics()
  ├──► MapLibre tessellation layer: paint by active metric
  ├──► Summary bar: display aggregates
  │
  ├──► TS client: compute embodied carbon per building (instant)
  ├──► TS client: compute operational carbon per building (instant)
  │
  ▼
Tier 2/3 computations (Web Worker, user-triggered):
  ├──► Sun-hours (background, ~20–30s) → ground heatmap
  ├──► SVF (background, ~10–15s) → ground heatmap
  ├──► VSC (background, ~10–15s) → facade coloring
  └──► UTCI (after SVF, ~5s) → ground heatmap
```

### 9.2 Zustand Store Extension for P1

```typescript
interface SustainabilityStore {
  // Sustainability-specific state
  sustainabilityMetrics: {
    cellMetrics: GeoJSON.FeatureCollection | null;
    streetMetrics: GeoJSON.FeatureCollection | null;
    aggregate: SustainabilityAggregate | null;
  };

  // Computation state
  computationStatus: {
    sunHours: 'idle' | 'computing' | 'done';
    svf: 'idle' | 'computing' | 'done';
    vsc: 'idle' | 'computing' | 'done';
    utci: 'idle' | 'computing' | 'done';
  };
  computationProgress: {
    sunHours: number;  // 0–100
    svf: number;
    vsc: number;
    utci: number;
  };

  // Heatmap data
  heatmapData: {
    sunHours: Float32Array | null;
    svf: Float32Array | null;
    utci: Float32Array | null;
  };
  heatmapGridSize: { width: number; height: number } | null;

  // Shadow animation state
  shadowDate: Date;
  shadowTime: number;   // Hours (5.0–21.0)
  shadowPlaying: boolean;

  // Active visualization
  activeTab: 'solar' | 'environment' | 'climate';
  activeMetric: string | null;

  // Actions
  fetchSustainabilityMetrics(bbox: [number, number, number, number]): Promise<void>;
  startComputation(metric: 'sunHours' | 'svf' | 'vsc' | 'utci'): void;
  setShadowTime(time: number): void;
  setShadowDate(date: Date): void;
  toggleShadowAnimation(): void;
  setActiveTab(tab: 'solar' | 'environment' | 'climate'): void;
  setActiveMetric(metric: string): void;
}
```

---

## 10. UI Component Hierarchy

```
<App>
  <MapShell maxAreaM2={1_000_000} center={[2.17, 41.39]} zoom={15}>
    {/* Three.js objects added via threeChildren or refs */}
    <ShadowSystem />          {/* DirectionalLight + ShadowMaterial plane */}
    <GroundHeatmapOverlay />   {/* Sun-hours / SVF / UTCI heatmap */}
  </MapShell>

  <Sidebar>
    <ExtractionSummary />      {/* Building count, area, height stats */}
    <TabPanel activeTab={activeTab}>
      <SolarTab>
        <TimeSlider />         {/* Hour-of-day slider + play button */}
        <DateSelector />       {/* Preset dates + custom picker */}
        <MetricList metrics={solarMetrics} />
        <ComputeButton metric="sunHours" label="Compute Sun-Hours" />
        <ComputeButton metric="svf" label="Compute SVF" />
        <ComputeButton metric="vsc" label="Compute VSC" />
      </SolarTab>
      <EnvironmentTab>
        <MetricList metrics={envMetrics} />
        <LCZBadge />           {/* LCZ type + description */}
      </EnvironmentTab>
      <ClimateTab>
        <MetricList metrics={climateMetrics} />
        <ComputeButton metric="utci" label="Compute UTCI" />
        <WeatherInfo />        {/* Current weather data from Open-Meteo */}
      </ClimateTab>
    </TabPanel>
  </Sidebar>

  <SummaryBar />               {/* Bottom bar with aggregates */}
  <ColorRampLegend />          {/* Bottom-right, active metric legend */}
  <ComputationProgress />      {/* Progress bar for Tier 2/3 metrics */}
  <BuildingTooltip />          {/* Hover tooltip with per-building values */}
</App>
```

---

## 11. Dependency List

### 11.1 TypeScript (npm packages)

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `maplibre-gl` | 5.x | Base map | BSD-3-Clause |
| `@dvt3d/maplibre-three-plugin` | 1.3.x | Three.js overlay | MIT |
| `three` | 0.172.x | 3D rendering, shadow mapping | MIT |
| `three-mesh-bvh` | latest | BVH raycasting for sun-hours, SVF, VSC | MIT |
| `suncalc` | 1.9.x | Solar position calculation | BSD-2-Clause |
| `jsthermalcomfort` | 0.2.x | UTCI polynomial computation | MIT |
| `@turf/turf` | 7.x | Geometry operations, area calc | MIT |
| `flatbush` | 4.x | Spatial indexing | ISC |
| `react` | 19.2.x | UI framework | MIT |
| `zustand` | 5.x | State management | MIT |
| `d3-scale-chromatic` | 3.x | Color ramps (optional, can hand-roll) | ISC |

### 11.2 Python (pip/uv packages)

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `fastapi` | 0.115.x | HTTP API framework | MIT |
| `uvicorn` | 0.34.x | ASGI server | BSD-3 |
| `geopandas` | 1.1.x | GeoDataFrame operations | BSD-3 |
| `momepy` | 0.11.x | Morphometric analysis (H/W, tessellation) | BSD-3 |
| `osmnx` | 2.1.x | OSM data extraction | MIT |
| `neatnet` | 0.2.x | Street network simplification | BSD-3 |
| `shapely` | 2.1.x | Geometry operations | BSD-3 |
| `scikit-learn` | 1.6.x | GMM clustering (for LCZ if needed) | BSD-3 |

### 11.3 External APIs (No Authentication Required)

| API | Purpose | Rate Limit |
|-----|---------|-----------|
| Open-Meteo Forecast | Weather data for UTCI (Ta, RH, wind, radiation) | 10,000 calls/day (non-commercial) |
| Overpass API (OSM) | Building/street extraction (via OSMnx) | Fair use |

---

## 12. Implementation Phases

### Phase 1: Shadow Animation (Session 1)

**Goal**: Real-time shadow visualization with time slider.

1. Import MapShell from `@collage/map-template`
2. Add DirectionalLight + ShadowMaterial ground plane to Three.js scene
3. Integrate SunCalc for sun position based on map center lat/lng
4. Build time slider (05:00–21:00) and date presets in sidebar Solar tab
5. Wire slider to `updateLightPosition()` — shadows move in real-time
6. Add play/pause animation (4-second sweep)
7. Configure shadow map: PCFSoftShadowMap, 2048px, frustum ±500m
8. Verify: buildings cast shadows, shadows sweep correctly east→west

**Exit criteria**: Shadow animation plays smoothly at ≥30 FPS for Barcelona Eixample extraction.

### Phase 2: Environmental Metrics (Session 2)

**Goal**: ISR, BAF, runoff, H/W, LCZ, carbon estimates.

1. Implement `/metrics/sustainability` backend endpoint
2. Call endpoint after extraction, store results in Zustand
3. Render tessellation cells as MapLibre fill layer, colored by active metric
4. Render street segments colored by canyon H/W
5. Implement TS-side embodied + operational carbon per building
6. Color buildings by carbon metric (per-vertex color attribute)
7. Build Environment tab with metric selector
8. Add LCZ badge to summary panel
9. Build summary bar with aggregate values

**Exit criteria**: All 6 environment metrics display correctly with color ramps.

### Phase 3: Sun-Hours, SVF, VSC (Session 3)

**Goal**: BVH raycasting for Tier 2/3 solar metrics.

1. Build Web Worker for BVH raycasting
2. Implement sun-hours computation: merge geometry → BVH → 120 positions × grid → ground heatmap
3. Implement SVF computation: Fibonacci hemisphere → 100 rays × 500 points → ground heatmap
4. Implement VSC computation: CIE weighted hemisphere → facade sample points → building coloring
5. Add "Compute" buttons in Solar tab with progress bars
6. Wire results to GroundHeatmap and building color updates

**Exit criteria**: Sun-hours heatmap computes in <30s for 500 buildings. SVF/VSC compute in <15s.

### Phase 4: Climate Risk + Polish (Session 4)

**Goal**: UTCI screening, composite risk metrics, tooltips, testing.

1. Integrate Open-Meteo API for weather data
2. Implement simplified Tmrt estimation from SVF + shadow + weather
3. Compute UTCI via jsthermalcomfort, map to stress categories
4. Build Climate Risk tab with UTCI, heat island, wind canyon, flood layers
5. Add building hover tooltip with all per-building metric values
6. Add color ramp legend component
7. Polish: loading states, error handling, precision labels
8. Full manual testing per Section 13

**Exit criteria**: All 16 metrics functional. All success criteria pass.

---

## 13. Success Criteria and Manual Testing Plan

### 13.1 Success Criteria

| # | Criterion | Target | How to Verify |
|---|-----------|--------|--------------|
| SC1 | Shadow animation FPS | ≥30 FPS at 500 buildings | FPS counter during time slider scrub |
| SC2 | Shadow sweep correctness | Shadows move east→west, match SunCalc positions | Visual: summer noon shadow short, winter noon shadow long |
| SC3 | Sun-hours computation time | <30s for 500 buildings, 10m grid | Console timer |
| SC4 | SVF computation time | <15s for 500 sample points | Console timer |
| SC5 | ISR differentiation | Barcelona (high ISR ~0.7) vs. hypothetical green area | Compare extracted values |
| SC6 | Canyon H/W visual | Narrow streets show red (high H/W), wide boulevards green | Visual on Barcelona Eixample |
| SC7 | Color ramp legends | All 16 metrics have working legends with units and ranges | Visual inspection |
| SC8 | Building hover tooltip | Shows per-building height, embodied carbon, operational carbon | Hover 5 buildings, check values |
| SC9 | LCZ classification | Barcelona area classifies as LCZ 2 (Compact midrise) | Check summary panel badge |
| SC10 | UTCI categories | Summer afternoon shows moderate/strong heat stress in exposed areas | Run UTCI with summer date, check heatmap |
| SC11 | Tab switching | Switching Solar → Environment → Climate updates map correctly | Toggle between tabs |
| SC12 | Precision labels | Every metric shows honest precision/method note | Check legend info text |

### 13.2 Manual Testing Procedure

**Test Location**: Barcelona Eixample (lat: 41.39, lng: 2.17) — dense grid with consistent building heights, well-known morphology.

**Pre-requisites**: Python backend running (`uvicorn main:app --port 8000`), prototype dev server running (`pnpm dev`).

#### Test 1: Extraction and Display
1. Open prototype at `http://localhost:5173`
2. Verify default map shows Barcelona area in 3D
3. Click "Scan Area", draw rectangle ~500m × 500m in Eixample grid
4. Verify progress bar appears during extraction
5. Verify buildings appear as 3D boxes, colored by height
6. Verify sidebar shows extraction summary (building count, area, height range)

#### Test 2: Shadow Animation
1. Switch to Solar tab
2. Drag time slider from 06:00 to 20:00 — shadows should sweep east→west
3. Click "Summer Solstice" — shadows should be short at noon
4. Click "Winter Solstice" — shadows should be much longer at noon
5. Click play — animation should sweep smoothly over ~4 seconds
6. Check FPS counter stays ≥30

#### Test 3: Environmental Metrics
1. Switch to Environment tab
2. Select "ISR" — tessellation cells should color red (high impervious) with some variation
3. Select "BAF" — cells should color inversely (green where ISR is low)
4. Select "Runoff" — similar pattern to ISR
5. Select "Canyon H/W" — streets should show variation (narrow streets redder)
6. Select "Embodied Carbon" — buildings should color by area × height
7. Check LCZ badge shows "LCZ 2 — Compact midrise"
8. Check summary bar values are plausible (ISR ~0.6–0.8 for Eixample)

#### Test 4: BVH Computations
1. Switch to Solar tab
2. Click "Compute Sun-Hours" — progress bar should advance
3. Wait for completion (<30s) — ground heatmap should appear
4. Verify: street intersections (more exposed) show more sun-hours than narrow east-west streets
5. Click "Compute SVF" — ground heatmap updates
6. Verify: open plazas show high SVF (~0.6+), narrow streets show low SVF (~0.3)
7. Click "Compute VSC" — buildings should color by facade daylight
8. Verify: upper floors show higher VSC than lower floors

#### Test 5: Climate Risk
1. Switch to Climate Risk tab
2. Click "Compute UTCI" (requires SVF pre-computed)
3. Verify: exposed areas show warm colors (heat stress), shaded areas show cool/green
4. Select "Heat Island Risk" — composite map should show high risk in dense impervious areas
5. Select "Wind Canyon Risk" — streets with H/W > 2 should be flagged red
6. Select "Flood Vulnerability" — high ISR areas should show high vulnerability

#### Test 6: Tooltips and Legends
1. Hover over a building — tooltip should show height, floor count, embodied carbon, operational carbon
2. Hover over different buildings — values should update
3. For each active metric, verify color ramp legend appears bottom-right
4. Verify legend shows metric name, unit, value range, and precision note

---

## Implications for Collage Earth

1. **P1 validates the complete sustainability screening pipeline.** If the 16 metrics compute and display correctly from OSM data alone, the platform's sustainability capability is confirmed as technically feasible.

2. **Performance budgets from C5 spike are critical.** The <30s sun-hours and <15s SVF targets determine whether these are interactive features (Tier 2) or background pre-computations (Tier 3). If they exceed budgets, the UX changes significantly — computation must happen during extraction rather than on-demand.

3. **Web Worker architecture is non-negotiable.** BVH raycasting for 1.2M rays will freeze the UI without Web Workers. This must be implemented from the start, not retrofitted.

4. **Honest precision labeling differentiates from competitors.** Autodesk Forma doesn't disclose its Tmrt simplifications. P1's transparent precision labels ("Screening estimate ±40%") are both more honest and more appropriate for a research platform.

5. **The UTCI pipeline is the most novel feature.** No existing web tool computes spatially resolved UTCI from user-selected geometry + free weather APIs. Even at screening precision (±1 stress category), this is genuinely new.

## Open Questions

1. **C5 FPS benchmarks are still pending.** If shadow animation doesn't reach ≥30 FPS at 500 buildings, the shadow system needs downgrading (lower resolution, simpler shadow type) or the building count limit needs reducing. This is a blocking unknown that only human browser testing can resolve.

2. **GroundHeatmap vs. tessellation cell rendering overlap.** ISR/BAF/runoff are per-tessellation-cell (polygons), while sun-hours/SVF are per-grid-point (raster). The prototype needs to gracefully switch between vector (MapLibre fill) and raster (Three.js canvas texture) display modes.

3. **SVF proxy quality.** K4 used `streetscape_openness_mean` as an SVF proxy, but C5 computes true hemispherical SVF. P1 should use C5's true SVF for the ground heatmap and only fall back to the proxy for area-wide aggregates where raycasting hasn't been run.

4. **OSM land cover completeness.** ISR and BAF accuracy depend on surface type classification from OSM `landuse=*` and `natural=*` tags. In areas with poor OSM land cover mapping, these metrics will default to conservative (high impervious) estimates. The precision label should note this limitation.

5. **UTCI simplified Tmrt accuracy.** The simplified formula (Section 2.2, R1) uses crude approximations for Tmrt. Real-world validation against a SOLWEIG computation would help calibrate the approximation coefficients. This could be a post-prototype research task.

## Overall Conclusion

P1 is implementable in approximately 4 AI agent sessions, building on the shared map template and Python backend. The 16 metrics span three computation tiers: 8 instant Tier 1 metrics (carbon estimates, composite risk scores), 4 interactive Tier 2 metrics (SVF, VSC, UTCI, shadow coverage), and 1 background Tier 3 metric (annual sun-hours). The shadow animation system and BVH raycasting pipeline are the most technically demanding components, both validated in the C5 spike. The key risk is C5 FPS performance — if shadow animation falls below 30 FPS, the real-time shadow feature must be downgraded. Every other component has a validated implementation path with known performance characteristics.

## Sources

[1] Finding #08 — Solar, Shadow, and Daylight Analysis. `findings/08-solar-shadow-daylight-analysis.md`

[2] Finding #10 — Environmental Screening Metrics from Urban Form. `findings/10-environmental-screening-metrics.md`

[3] Finding #40 — UTCI and Outdoor Thermal Comfort from Urban Form. `findings/40-utci-outdoor-thermal-comfort.md`

[4] Finding #41 — Sustainability Certification Compliance Engine. `findings/41-sustainability-certification-compliance-engine.md`

[5] Finding #42 — Climate Resilience and Adaptation Metrics. `findings/42-climate-resilience-adaptation-metrics.md`

[6] Finding #43 — Whole-Life Carbon and Lifecycle Assessment. `findings/43-whole-life-carbon-lifecycle-assessment.md`

[7] Finding #44 — Transport Carbon Estimation from Urban Form. `findings/44-transport-carbon-estimation-urban-form.md`

[8] Finding #45 — Sustainability Competitive Positioning and Leadership Strategy. `findings/45-sustainability-competitive-positioning-leadership-strategy.md`

[9] Finding #83 — Design of All 5 Prototypes and Shared Infrastructure. `findings/83-prototype-designs.md`

[10] Finding #82 — Final Spike Synthesis and Build-Readiness Assessment. `findings/82-final-spike-synthesis.md`

[11] Spike C5 — Solar/Shadow Analysis. `collage-spike-c5/spikes/c5-solar-shadow/FINDINGS.md`

[12] Spike K4 — LCZ Classification. `collage-spike-k4/spikes/k4-lcz-classification/FINDINGS.md`

[13] Stewart, I.D. and Oke, T.R. (2012). "Local Climate Zones for Urban Temperature Studies." *Bulletin of the American Meteorological Society*, 93(12), 1879–1900.

[14] Bröde, P. et al. (2012). "Deriving the operational procedure for the Universal Thermal Climate Index (UTCI)." *International Journal of Biometeorology*, 56, 491–494.

[15] Schueler, T.R. (1994). "The Importance of Imperviousness." *Watershed Protection Techniques*, 1(3), 100–111.

[16] Berlin Biotope Area Factor (BAF) guidelines (1994), adopted by Seattle Green Factor, Singapore, Malmö.

[17] Open-Meteo API documentation. https://open-meteo.com/en/docs

[18] jsthermalcomfort npm package. https://github.com/FedericoTartarini/jsthermalcomfort

[19] three-mesh-bvh documentation. https://github.com/gkjohnson/three-mesh-bvh

[20] SunCalc documentation. https://github.com/mourner/suncalc
