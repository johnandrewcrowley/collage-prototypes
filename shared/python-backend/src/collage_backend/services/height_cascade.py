"""Region-adaptive height enrichment cascade.

Based on B2 spike:
  T1: OSM 'height' tag (parsed to meters)
  T2: OSM 'building:levels' × floor height (3.0m residential, 3.5m office, 4.0m retail)
  T3: Default (9.0m = ~3 floors)

Overture and GBA integration deferred to P4 fragment workflow.
"""

import logging

import geopandas as gpd

logger = logging.getLogger(__name__)

# Floor heights by building use
FLOOR_HEIGHTS = {
    "residential": 3.0,
    "apartments": 3.0,
    "house": 3.0,
    "detached": 3.0,
    "commercial": 4.0,
    "retail": 4.0,
    "office": 3.5,
    "industrial": 5.0,
    "warehouse": 6.0,
}
DEFAULT_FLOOR_HEIGHT = 3.0
DEFAULT_HEIGHT = 9.0


def enrich_heights(
    buildings_gdf: gpd.GeoDataFrame,
    region: str = "other",
) -> gpd.GeoDataFrame:
    """Enrich building heights using region-adaptive cascade.

    Priority:
      1. OSM height tag (already parsed during extraction)
      2. OSM building:levels × type-specific floor height
      3. Default 9.0m

    Args:
        buildings_gdf: GeoDataFrame with 'height_m', 'height_source', 'floor_count', 'use'.
        region: Region hint ('europe', 'us', 'other'). Reserved for future GBA/Overture.

    Returns:
        GeoDataFrame with enriched height_m and height_source columns.
    """
    gdf = buildings_gdf.copy()

    # Re-derive from levels with type-specific floor heights where source is osm_levels
    mask_levels = gdf["height_source"] == "osm_levels"
    if mask_levels.any():
        floor_h = gdf.loc[mask_levels, "use"].map(FLOOR_HEIGHTS).fillna(DEFAULT_FLOOR_HEIGHT)
        gdf.loc[mask_levels, "height_m"] = gdf.loc[mask_levels, "floor_count"] * floor_h

    # Fill remaining NaN with default
    mask_null = gdf["height_m"].isna()
    gdf.loc[mask_null, "height_m"] = DEFAULT_HEIGHT
    gdf.loc[mask_null, "height_source"] = "type_default"

    coverage = (gdf["height_source"] != "type_default").sum() / len(gdf) if len(gdf) > 0 else 0
    logger.info("Height enrichment: %d buildings, %.1f%% non-default", len(gdf), coverage * 100)

    return gdf
