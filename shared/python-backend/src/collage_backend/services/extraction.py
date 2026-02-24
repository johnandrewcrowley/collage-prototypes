"""OSM extraction + neatnet street simplification.

Based on B1 spike: OSMnx → neatnet.neatify → GeoDataFrame output.
"""

import logging
import uuid

import geopandas as gpd
import osmnx as ox

from collage_backend.utils.crs import ensure_projected
from collage_backend.utils.geometry import buffer_bbox

logger = logging.getLogger(__name__)


def extract_buildings(
    bbox: tuple[float, float, float, float],
    buffer_m: float = 200,
) -> gpd.GeoDataFrame:
    """Extract buildings from OSM via OSMnx.

    Args:
        bbox: (west, south, east, north) in WGS84.
        buffer_m: Buffer distance in meters for extraction boundary.

    Returns:
        GeoDataFrame with building polygons in WGS84.
    """
    buffered = buffer_bbox(bbox, buffer_m)
    west, south, east, north = buffered

    logger.info("Extracting buildings: bbox=%s buffer=%sm", bbox, buffer_m)

    buildings = ox.features_from_bbox(
        bbox=(west, south, east, north),
        tags={"building": True},
    )

    if buildings.empty:
        logger.warning("No buildings found in bbox")
        return _empty_buildings_gdf()

    # Filter to Polygon/MultiPolygon only
    buildings = buildings[buildings.geometry.type.isin(["Polygon", "MultiPolygon"])].copy()
    if buildings.empty:
        return _empty_buildings_gdf()

    # Standardize columns
    buildings["id"] = [str(uuid.uuid4())[:8] for _ in range(len(buildings))]
    buildings["height_m"] = None
    buildings["height_source"] = None
    buildings["floor_count"] = None
    buildings["use"] = buildings.get("building", "yes").astype(str)

    # Height from 'height' tag
    if "height" in buildings.columns:
        h = buildings["height"].apply(_parse_height)
        mask = h.notna()
        buildings.loc[mask, "height_m"] = h[mask]
        buildings.loc[mask, "height_source"] = "osm_tag"

    # Height from 'building:levels' tag
    if "building:levels" in buildings.columns:
        levels = buildings["building:levels"].apply(_parse_levels)
        mask = levels.notna() & buildings["height_m"].isna()
        buildings.loc[mask, "height_m"] = levels[mask] * 3.0
        buildings.loc[mask, "floor_count"] = levels[mask]
        buildings.loc[mask, "height_source"] = "osm_levels"

    # Default height for remaining
    mask = buildings["height_m"].isna()
    buildings.loc[mask, "height_m"] = 9.0
    buildings.loc[mask, "height_source"] = "type_default"

    # Compute floor count where missing
    mask = buildings["floor_count"].isna()
    buildings.loc[mask, "floor_count"] = (buildings.loc[mask, "height_m"] / 3.0).round()

    result = buildings[["id", "height_m", "floor_count", "use", "height_source", "geometry"]].copy()
    result = result.set_crs("EPSG:4326", allow_override=True)

    logger.info("Extracted %d buildings", len(result))
    return result


def extract_streets(
    bbox: tuple[float, float, float, float],
    buffer_m: float = 200,
    simplify: bool = True,
) -> gpd.GeoDataFrame:
    """Extract and simplify streets from OSM via OSMnx + neatnet.

    Args:
        bbox: (west, south, east, north) in WGS84.
        buffer_m: Buffer distance in meters.
        simplify: Whether to apply neatnet simplification.

    Returns:
        GeoDataFrame with street LineStrings in WGS84.
    """
    buffered = buffer_bbox(bbox, buffer_m)
    west, south, east, north = buffered

    logger.info("Extracting streets: bbox=%s buffer=%sm", bbox, buffer_m)

    try:
        G = ox.graph_from_bbox(bbox=(west, south, east, north), network_type="all")
    except Exception as e:
        logger.warning("Street extraction failed: %s", e)
        return _empty_streets_gdf()

    edges = ox.graph_to_gdfs(G, nodes=False, edges=True)

    if simplify and len(edges) > 0:
        try:
            import neatnet
            projected = ensure_projected(edges)
            simplified = neatnet.neatify(projected)
            edges = simplified.to_crs("EPSG:4326")
            logger.info("neatnet simplified to %d edges", len(edges))
        except Exception as e:
            logger.warning("neatnet simplification failed, using raw: %s", e)

    result = gpd.GeoDataFrame(geometry=edges.geometry, crs="EPSG:4326")
    result["id"] = [str(uuid.uuid4())[:8] for _ in range(len(result))]
    result["name"] = edges.get("name", None)
    result["highway"] = edges.get("highway", "unclassified")
    result["width_m"] = edges.get("width", None)
    result["lanes"] = edges.get("lanes", None)
    result["oneway"] = edges.get("oneway", False)

    # highway may be a list; take the first element
    result["highway"] = result["highway"].apply(
        lambda x: x[0] if isinstance(x, list) else str(x) if x else "unclassified"
    )

    logger.info("Extracted %d street segments", len(result))
    return result


def _parse_height(val) -> float | None:
    if val is None or (isinstance(val, float) and val != val):
        return None
    s = str(val).strip().lower().rstrip("m").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _parse_levels(val) -> float | None:
    if val is None or (isinstance(val, float) and val != val):
        return None
    try:
        return float(str(val).strip())
    except ValueError:
        return None


def _empty_buildings_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        columns=["id", "height_m", "floor_count", "use", "height_source", "geometry"],
        geometry="geometry",
        crs="EPSG:4326",
    )


def _empty_streets_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        columns=["id", "name", "highway", "width_m", "lanes", "oneway", "geometry"],
        geometry="geometry",
        crs="EPSG:4326",
    )
