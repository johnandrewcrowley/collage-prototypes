"""momepy morphometric metric computation.

Based on B1/C4 spikes: computes dimension, shape, spatial distribution metrics.
"""

import logging

import geopandas as gpd
import momepy
import numpy as np

from collage_backend.utils.crs import ensure_projected

logger = logging.getLogger(__name__)


def compute_all_metrics(
    buildings_gdf: gpd.GeoDataFrame,
    streets_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
    metric_keys: list[str] | None = None,
) -> dict:
    """Compute momepy morphometric metrics.

    Args:
        buildings_gdf: Building polygons.
        streets_gdf: Street LineStrings.
        tessellation_gdf: Tessellation cells.
        metric_keys: Specific metrics to compute, or None for all.

    Returns:
        Dict mapping building_id → {metric_key: value}.
    """
    if buildings_gdf.empty:
        return {}

    # Ensure projected CRS
    bldg = ensure_projected(buildings_gdf)
    streets = streets_gdf.to_crs(bldg.crs) if not streets_gdf.empty else streets_gdf
    tess = tessellation_gdf.to_crs(bldg.crs) if not tessellation_gdf.empty else tessellation_gdf

    results: dict[str, dict[str, float | None]] = {}
    for bid in bldg["id"]:
        results[bid] = {}

    logger.info("Computing morphometrics for %d buildings", len(bldg))

    # --- Dimension metrics ---
    try:
        bldg["dim_area"] = bldg.geometry.area
        bldg["dim_perimeter"] = bldg.geometry.length
        bldg["dim_longest_axis"] = momepy.LongestAxisLength(bldg).series
    except Exception as e:
        logger.warning("Dimension metrics failed: %s", e)
        bldg["dim_area"] = bldg.geometry.area
        bldg["dim_perimeter"] = bldg.geometry.length
        bldg["dim_longest_axis"] = np.nan

    # --- Shape metrics ---
    try:
        bldg["shape_circularity"] = momepy.CircularCompactness(bldg).series
        bldg["shape_elongation"] = momepy.Elongation(bldg).series
        bldg["shape_convexity"] = momepy.Convexity(bldg).series
        bldg["shape_rectangularity"] = momepy.Rectangularity(bldg).series
    except Exception as e:
        logger.warning("Shape metrics failed: %s", e)

    # --- Orientation ---
    try:
        bldg["orientation"] = momepy.Orientation(bldg).series
    except Exception as e:
        logger.warning("Orientation failed: %s", e)

    # --- Spacematrix (from tessellation) ---
    if not tess.empty and "building_id" in tess.columns:
        try:
            # Join tessellation areas to buildings
            tess_areas = tess.groupby("building_id")["area_m2"].sum()
            bldg["tess_area"] = bldg["id"].map(tess_areas).fillna(bldg.geometry.area)
            bldg["gsi"] = bldg["dim_area"] / bldg["tess_area"]
            height = bldg["height_m"].fillna(9.0)
            floors = (height / 3.0).round().clip(lower=1)
            bldg["gfa"] = bldg["dim_area"] * floors
            bldg["fsi"] = bldg["gfa"] / bldg["tess_area"]
            bldg["osr"] = (1 - bldg["gsi"]) / bldg["fsi"].replace(0, np.nan)
            bldg["layers"] = bldg["fsi"] / bldg["gsi"].replace(0, np.nan)
        except Exception as e:
            logger.warning("Spacematrix metrics failed: %s", e)

    # --- Height statistics ---
    bldg["height_m_val"] = bldg["height_m"].fillna(9.0).astype(float)

    # Build results dict
    metric_cols = [
        "dim_area", "dim_perimeter", "dim_longest_axis",
        "shape_circularity", "shape_elongation", "shape_convexity", "shape_rectangularity",
        "orientation", "gsi", "fsi", "osr", "layers", "gfa", "tess_area", "height_m_val",
    ]

    for _, row in bldg.iterrows():
        bid = row["id"]
        for col in metric_cols:
            if col in bldg.columns:
                val = row.get(col)
                if val is not None and not (isinstance(val, float) and np.isnan(val)):
                    results[bid][col] = float(val)
                else:
                    results[bid][col] = None

    # --- Aggregate metrics ---
    aggregates = {}
    for col in metric_cols:
        if col in bldg.columns:
            series = bldg[col].dropna()
            if len(series) > 0:
                aggregates[f"{col}_mean"] = float(series.mean())
                aggregates[f"{col}_std"] = float(series.std())
                aggregates[f"{col}_min"] = float(series.min())
                aggregates[f"{col}_max"] = float(series.max())

    logger.info("Computed %d metrics per building, %d aggregates", len(metric_cols), len(aggregates))
    return {"per_building": results, "aggregates": aggregates}


def compute_summary_metrics(
    buildings_gdf: gpd.GeoDataFrame,
    streets_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
) -> dict:
    """Compute fragment-level summary metrics (for the StandardFragmentProfile)."""
    bldg = ensure_projected(buildings_gdf)

    summary = {
        "building_count": len(bldg),
        "total_footprint_area": float(bldg.geometry.area.sum()),
        "mean_building_area": float(bldg.geometry.area.mean()) if len(bldg) > 0 else 0,
        "mean_height": float(bldg["height_m"].fillna(9).mean()) if len(bldg) > 0 else 0,
        "height_std": float(bldg["height_m"].fillna(9).std()) if len(bldg) > 1 else 0,
    }

    if not streets_gdf.empty:
        streets = streets_gdf.to_crs(bldg.crs)
        summary["total_street_length"] = float(streets.geometry.length.sum())
        summary["street_count"] = len(streets)

    if not tessellation_gdf.empty:
        tess = tessellation_gdf.to_crs(bldg.crs)
        summary["tessellation_cell_count"] = len(tess)
        summary["mean_cell_area"] = float(tess.geometry.area.mean())

    return summary
