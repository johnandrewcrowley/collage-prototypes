"""Sustainability metrics: ISR, BAF, runoff, canyon H/W, LCZ, SVF.

Based on C5 spike and research findings #08, #10, #40.
"""

import logging

import geopandas as gpd
import numpy as np

from collage_backend.utils.crs import ensure_projected

logger = logging.getLogger(__name__)

# Runoff coefficients by surface type
RUNOFF_COEFFICIENTS = {
    "impervious": 0.95,
    "semi_pervious": 0.50,
    "pervious": 0.20,
    "green_roof": 0.30,
}


def compute_sustainability_metrics(
    buildings_gdf: gpd.GeoDataFrame,
    streets_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
) -> dict:
    """Compute all sustainability metrics.

    Returns dict with per-building and aggregate metrics:
    - ISR (Impervious Surface Ratio)
    - BAF (Biotope Area Factor) proxy
    - Runoff coefficient
    - Canyon H/W ratio
    - SVF (Sky View Factor) proxy
    """
    if buildings_gdf.empty:
        return {"per_building": {}, "aggregates": {}}

    bldg = ensure_projected(buildings_gdf)
    streets = streets_gdf.to_crs(bldg.crs) if not streets_gdf.empty else streets_gdf
    tess = tessellation_gdf.to_crs(bldg.crs) if not tessellation_gdf.empty else tessellation_gdf

    results: dict[str, dict[str, float | None]] = {}
    for bid in bldg["id"]:
        results[bid] = {}

    # --- ISR: building footprint / tessellation area ---
    if not tess.empty and "building_id" in tess.columns:
        tess_areas = tess.groupby("building_id")["area_m2"].sum()
        for _, row in bldg.iterrows():
            bid = row["id"]
            bldg_area = row.geometry.area
            tess_area = tess_areas.get(bid, bldg_area)
            isr = bldg_area / tess_area if tess_area > 0 else 1.0
            results[bid]["isr"] = min(float(isr), 1.0)
    else:
        for _, row in bldg.iterrows():
            results[row["id"]]["isr"] = None

    # --- BAF proxy: 1 - ISR (simplified; real BAF needs land cover data) ---
    for bid, metrics in results.items():
        isr = metrics.get("isr")
        metrics["baf_proxy"] = 1.0 - isr if isr is not None else None

    # --- Runoff coefficient: weighted by ISR ---
    for bid, metrics in results.items():
        isr = metrics.get("isr")
        if isr is not None:
            metrics["runoff_coefficient"] = (
                isr * RUNOFF_COEFFICIENTS["impervious"]
                + (1 - isr) * RUNOFF_COEFFICIENTS["pervious"]
            )
        else:
            metrics["runoff_coefficient"] = None

    # --- Canyon H/W ratio ---
    if not streets.empty:
        _compute_canyon_hw(bldg, streets, results)
    else:
        for bid in results:
            results[bid]["canyon_hw_ratio"] = None

    # --- SVF proxy (simplified: based on canyon H/W) ---
    for bid, metrics in results.items():
        hw = metrics.get("canyon_hw_ratio")
        if hw is not None and hw > 0:
            # Johnson & Watson (1984) approximation: SVF ≈ cos(arctan(2*H/W))
            metrics["svf_proxy"] = float(np.cos(np.arctan(2 * hw)))
        else:
            metrics["svf_proxy"] = None

    # --- Aggregates ---
    aggregates = {}
    metric_keys = ["isr", "baf_proxy", "runoff_coefficient", "canyon_hw_ratio", "svf_proxy"]
    for key in metric_keys:
        values = [m[key] for m in results.values() if m.get(key) is not None]
        if values:
            aggregates[f"{key}_mean"] = float(np.mean(values))
            aggregates[f"{key}_std"] = float(np.std(values))

    logger.info("Sustainability metrics: %d buildings, %d aggregates", len(results), len(aggregates))
    return {"per_building": results, "aggregates": aggregates}


def _compute_canyon_hw(
    buildings: gpd.GeoDataFrame,
    streets: gpd.GeoDataFrame,
    results: dict,
) -> None:
    """Compute canyon H/W ratio for each building.

    Uses nearest street distance as half-width, building height as H.
    """
    from shapely.ops import nearest_points

    street_union = streets.geometry.union_all()

    for _, row in buildings.iterrows():
        bid = row["id"]
        height = float(row.get("height_m", 9) or 9)

        try:
            _, nearest_pt = nearest_points(row.geometry.centroid, street_union)
            distance = row.geometry.centroid.distance(nearest_pt)
            # W = 2 × distance to nearest street (approximate canyon width)
            width = max(2 * distance, 1.0)
            results[bid]["canyon_hw_ratio"] = height / width
        except Exception:
            results[bid]["canyon_hw_ratio"] = None
