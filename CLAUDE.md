# Collage Earth — Prototypes CLAUDE.md

## What is this repo?

This is the **prototype development repo** for Collage Earth — 5 working web app prototypes that test real urban analysis user workflows. Each prototype shares a common MapLibre + Three.js map template and Python FastAPI backend.

## Prototypes

| ID | Name | Description | Max Area |
|----|------|-------------|----------|
| P1 | p1-sustainability | Sustainability metrics scanner (solar, shadow, SVF, BAF) | 1 km² |
| P2 | p2-morphology | Momepy morphological metrics (61 metrics) | 1 km² |
| P3 | p3-network | Network & space syntax analysis (NAIN/NACH, isochrones) | 5 km² |
| P4 | p4-fragment | Urban fragment workflow (extract → library → cut → place) | 1 km² |
| P5 | p5-taxonomy | Urban taxonomy of San Francisco (pre-extracted, 3 classifiers) | Citywide |

## Repository structure

```
collage-prototypes/
├── shared/
│   ├── types/           # @collage/proto-types (TypeScript type definitions)
│   ├── map-template/    # @collage/map-template (MapLibre + Three.js + React)
│   └── python-backend/  # FastAPI server with all computation endpoints
├── prototypes/
│   ├── p1-sustainability/
│   ├── p2-morphology/
│   ├── p3-network/
│   ├── p4-fragment/
│   └── p5-taxonomy/
├── scripts/
│   ├── proto-autorun.sh        # Autonomous build loop
│   ├── worktree-create.sh      # Create worktrees for parallel dev
│   └── proto-prompt-p*.txt     # AI agent prompts per prototype
├── research/            # Copied reference docs
├── data/                # Runtime data (gitignored except fixtures)
└── logs/                # Session logs (gitignored)
```

## Tech stack (validated by spikes)

### Frontend
- **MapLibre GL JS 5.x** + **Three.js 0.172.x** via `@dvt3d/maplibre-three-plugin 1.3.x`
- **React 19.x**, **TypeScript 5.9.x**, **Vite 7.x**, **Zustand 5.x**
- **Turf.js 7.x** for client-side geometry
- **D3.js** for specialized visualizations (P5 Spacematrix diagram, dendrogram)
- **Graphology** for client-side network metrics

### Backend (Python 3.12)
- **FastAPI** — REST API with CORS
- **OSMnx >=2.1** — OpenStreetMap extraction
- **momepy >=0.11** — morphological metrics (61 metrics)
- **cityseer >=4.21** — space syntax (NAIN/NACH)
- **geopandas >=1.1** — spatial data processing
- **scikit-learn >=1.6** — GMM clustering
- **neatnet >=0.3** — street simplification
- **pyarrow** — GeoParquet I/O
- **SunCalc** + **three-mesh-bvh** for solar/shadow (P1, client-side)

### Tooling
- **pnpm** workspaces with single lockfile
- **Biome 2.4.x** — TS/JS linting + formatting
- **Ruff** — Python linting + formatting
- **Turborepo** — build orchestration

## Development workflow

### Running a prototype

```bash
# Start the Python backend (required for all prototypes)
pnpm dev:backend

# In another terminal, start a prototype
pnpm dev:p1   # or p2, p3, p4, p5
```

### Worktree-based parallel development

Each prototype develops in its own git worktree:
```bash
bash scripts/worktree-create.sh        # Create all worktrees
bash scripts/worktree-create.sh p1 p3  # Create specific worktrees
bash scripts/worktree-create.sh --clean # Remove all worktrees
```

Worktree paths: `/c/Users/johnc/collage-proto-p1/` through `collage-proto-p5/`

### Autonomous build

```bash
bash scripts/proto-autorun.sh --all     # Build all 5 prototypes
bash scripts/proto-autorun.sh p1 p2     # Build specific prototypes
bash scripts/proto-autorun.sh --dry-run # Preview what would run
```

## Coding conventions

### TypeScript
- Strict mode, no `any`, explicit return types
- Named exports, interfaces over type aliases
- Kebab-case filenames (`map-shell.tsx`), PascalCase components (`MapShell`)
- Biome for formatting (2-space indent, single quotes, semicolons)

### Python
- Type hints on all functions
- Google-style docstrings
- pathlib.Path for file operations
- Ruff for formatting (double quotes, 100 char line width)

### Git
- Work on prototype branches: `proto/p1-sustainability`, etc.
- Conventional commits: `proto(p1): description`
- Each prototype marks completion by writing `Status: Complete` in its FINDINGS.md

## Testing conventions

### Philosophy
Lightweight automated checks only. No browser automation. No visual regression. No test frameworks.

### window.__TEST_API__
Every prototype inherits `window.__TEST_API__` from the shared map template with base scene state. Prototypes extend it with domain-specific getters:

```typescript
(window as any).__TEST_API__ = {
  ...(window as any).__TEST_API__,
  getMetricValues: () => { /* return computed metrics as JSON */ },
};
```

### Backend smoke tests
Verify backend connectivity and response shape with simple fetch calls. Log results in FINDINGS.md. Use `console.assert()` — no test framework.

### Metric benchmarks (Barcelona Eixample)
| Metric | Expected | Tolerance |
|--------|----------|-----------|
| GSI | 0.37 | +/-15% |
| FSI | 1.89 | +/-15% |
| Mean height | ~18m | +/-20% |
| LCZ | Compact Midrise (2) | exact |

Log comparisons with `[PN-BENCHMARK]` prefix.

### What NOT to do
- No Playwright, Puppeteer, or browser automation
- No programmatic screenshots
- No test frameworks (Jest, Vitest)
- No unit tests for shared code

## Shared map template API

```tsx
import { MapShell, useMapStore } from '@collage/map-template';

function App() {
  return (
    <MapShell
      center={[2.1686, 41.3874]}
      zoom={15}
      pitch={45}
      maxAreaM2={1_000_000}
      onExtracted={(data) => console.log(data)}
      onBuildingClick={(id) => console.log(id)}
    >
      {/* Prototype-specific overlays */}
    </MapShell>
  );
}
```

## Python backend API

All endpoints accept/return JSON. Backend runs on `http://localhost:8000`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Status + library versions |
| `/extract` | POST | OSM extraction pipeline |
| `/heights` | POST | Height cascade enrichment |
| `/tessellate` | POST | Morphological tessellation |
| `/metrics/momepy` | POST | 61 momepy metrics |
| `/metrics/sustainability` | POST | ISR, BAF, SVF, etc. |
| `/space-syntax` | POST | cityseer NAIN/NACH |
| `/classify` | POST | Spacematrix + LCZ + GMM |
| `/fragment/save` | POST | Save as GeoParquet |
| `/fragment/load` | POST | Load from GeoParquet |
| `/fragment/relocate` | POST | CRS reassignment |
| `/network/merge` | POST | Merge street networks |
| `/network/isochrone` | POST | Walking isochrone |

## Key coordinate system notes

- **MapLibre + Three.js RTC group**: X = East, Y = Up, Z = South (negated)
- **ExtrudeGeometry**: Extrude along Z, then `rotateX(-Math.PI / 2)` for Y-up
- **Fragment operations**: Use custom Transverse Mercator CRS (not UTM)
- **InstancedMesh**: Position at centroid, scale to bounding box dimensions
