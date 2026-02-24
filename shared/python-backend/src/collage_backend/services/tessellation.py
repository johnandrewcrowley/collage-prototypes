"""Morphological tessellation via momepy.

Based on C1 spike: momepy.enclosures + momepy.enclosed_tessellation.
"""

import logging
import uuid

import geopandas as gpd
import momepy

from collage_backend.utils.crs import ensure_projected

logger = logging.getLogger(__name__)


def compute_tessellation(
    buildings_gdf: gpd.GeoDataFrame,
    streets_gdf: gpd.GeoDataFrame,
    segment: float = 1.0,
    simplify: bool = True,
    n_jobs: int = -1,
) -> gpd.GeoDataFrame:
    """Compute enclosed tessellation.

    Pipeline: streets → enclosures → enclosed_tessellation(buildings, enclosures).

    Args:
        buildings_gdf: Building polygons (WGS84 or projected).
        streets_gdf: Street LineStrings (WGS84 or projected).
        segment: Tessellation discretization parameter (meters).
        simplify: Whether to simplify output tessellation.
        n_jobs: Parallelism (-1 = all CPUs).

    Returns:
        GeoDataFrame with tessellation cells in same CRS as input.
    """
    if buildings_gdf.empty or streets_gdf.empty:
        logger.warning("Empty input; returning empty tessellation")
        return gpd.GeoDataFrame(
            columns=["id", "building_id", "area_m2", "enclosure_id", "geometry"],
            geometry="geometry",
            crs=buildings_gdf.crs or "EPSG:4326",
        )

    # Ensure projected CRS for momepy
    buildings_proj = ensure_projected(buildings_gdf)
    streets_proj = streets_gdf.to_crs(buildings_proj.crs) if streets_gdf.crs != buildings_proj.crs else streets_gdf.copy()

    logger.info(
        "Computing tessellation: %d buildings, %d streets, segment=%.1f",
        len(buildings_proj),
        len(streets_proj),
        segment,
    )

    # Step 1: Compute enclosures from street network
    enclosures = momepy.enclosures(streets_proj)
    logger.info("Computed %d enclosures", len(enclosures))

    # Step 2: Enclosed tessellation
    tess = momepy.enclosed_tessellation(
        buildings_proj,
        enclosures=enclosures,
        segment=segment,
        n_jobs=n_jobs,
    )

    if simplify and hasattr(tess, "simplify"):
        tess["geometry"] = tess.geometry.simplify(tolerance=0.5)

    # Add metadata columns
    tess["id"] = [str(uuid.uuid4())[:8] for _ in range(len(tess))]

    # building_id: link to building via spatial join if not already present
    if "building_id" not in tess.columns:
        tess["building_id"] = None

    # Compute area in projected CRS
    tess["area_m2"] = tess.geometry.area

    # enclosure_id
    if "enclosure_id" not in tess.columns:
        tess["enclosure_id"] = "unknown"

    # Convert back to input CRS
    if buildings_gdf.crs and buildings_gdf.crs.is_geographic:
        tess = tess.to_crs(buildings_gdf.crs)

    result = tess[["id", "building_id", "area_m2", "enclosure_id", "geometry"]].copy()
    logger.info("Tessellation complete: %d cells", len(result))
    return result
