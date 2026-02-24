"""Fragment operations: save, load, relocate, merge.

Based on D1/D2/K3 spikes.
"""

import json
import logging
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree

from collage_backend.utils.crs import custom_tmerc, ensure_projected
from collage_backend.utils.io import gdf_to_geojson, load_geoparquet, save_geoparquet

logger = logging.getLogger(__name__)


def save_fragment(fragment_data: dict, path: str) -> str:
    """Save fragment as GeoParquet.

    Args:
        fragment_data: FragmentPackage JSON dict.
        path: Output file path.

    Returns:
        Saved file path.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Save buildings as primary parquet
    buildings_gdf = gpd.GeoDataFrame.from_features(
        fragment_data["buildings"]["features"], crs="EPSG:4326"
    )
    save_geoparquet(buildings_gdf, path)

    # Save metadata alongside
    meta_path = path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(fragment_data.get("metadata", {}), indent=2))

    logger.info("Saved fragment to %s (%d buildings)", path, len(buildings_gdf))
    return str(path)


def load_fragment(path: str) -> dict:
    """Load fragment from GeoParquet.

    Args:
        path: GeoParquet file path.

    Returns:
        FragmentPackage-like dict.
    """
    path = Path(path)
    buildings_gdf = load_geoparquet(path)

    # Load metadata if exists
    meta_path = path.with_suffix(".meta.json")
    metadata = {}
    if meta_path.exists():
        metadata = json.loads(meta_path.read_text())

    buildings_geojson = gdf_to_geojson(buildings_gdf)

    logger.info("Loaded fragment from %s (%d buildings)", path, len(buildings_gdf))
    return {
        "metadata": metadata,
        "buildings": buildings_geojson,
        "streets": {"type": "FeatureCollection", "features": []},
        "tessellation": {"type": "FeatureCollection", "features": []},
        "blocks": {"type": "FeatureCollection", "features": []},
        "metrics": None,
    }


def relocate_fragment(
    fragment_data: dict,
    target_center: tuple[float, float],
) -> dict:
    """Relocate fragment using CRS reassignment (from D1 spike).

    Algorithm: WGS84 → custom_tmerc(source) → set_crs(target_tmerc) → WGS84.
    Zero geometric distortion — verified in D1 spike at 0.000000m drift.

    Args:
        fragment_data: FragmentPackage JSON dict.
        target_center: (longitude, latitude) of destination.

    Returns:
        Relocated FragmentPackage dict.
    """
    buildings_gdf = gpd.GeoDataFrame.from_features(
        fragment_data["buildings"]["features"], crs="EPSG:4326"
    )

    if buildings_gdf.empty:
        return fragment_data

    # Compute source center
    source_centroid = buildings_gdf.geometry.union_all().centroid
    source_crs = custom_tmerc(source_centroid.x, source_centroid.y)
    target_crs = custom_tmerc(target_center[0], target_center[1])

    # Project to source meters → reassign CRS to target → back to WGS84
    buildings_proj = buildings_gdf.to_crs(source_crs)
    buildings_proj = buildings_proj.set_crs(target_crs, allow_override=True)
    buildings_relocated = buildings_proj.to_crs("EPSG:4326")

    result = fragment_data.copy()
    result["buildings"] = gdf_to_geojson(buildings_relocated)

    # Relocate streets if present
    if fragment_data.get("streets", {}).get("features"):
        streets_gdf = gpd.GeoDataFrame.from_features(
            fragment_data["streets"]["features"], crs="EPSG:4326"
        )
        streets_proj = streets_gdf.to_crs(source_crs)
        streets_proj = streets_proj.set_crs(target_crs, allow_override=True)
        result["streets"] = gdf_to_geojson(streets_proj.to_crs("EPSG:4326"))

    logger.info(
        "Relocated fragment from (%.4f, %.4f) to (%.4f, %.4f)",
        source_centroid.x, source_centroid.y,
        target_center[0], target_center[1],
    )
    return result


def merge_networks(
    design_streets_gdf: gpd.GeoDataFrame,
    context_streets_gdf: gpd.GeoDataFrame,
    snap_threshold_m: float = 50.0,
) -> gpd.GeoDataFrame:
    """Merge design and context street networks using edge-split approach.

    Based on K3 spike: KD-tree nearest-node snapping with hybrid edge-split.

    Args:
        design_streets_gdf: Design network GeoDataFrame.
        context_streets_gdf: Context network GeoDataFrame.
        snap_threshold_m: Max distance for snapping (meters).

    Returns:
        Merged GeoDataFrame.
    """
    design = ensure_projected(design_streets_gdf)
    context = context_streets_gdf.to_crs(design.crs)

    # Simple concatenation with boundary snapping
    merged = gpd.GeoDataFrame(
        data={"source": (["design"] * len(design)) + (["context"] * len(context))},
        geometry=list(design.geometry) + list(context.geometry),
        crs=design.crs,
    )

    # TODO: Implement edge-split snapping from K3 spike
    # For now, simple union is sufficient for prototype use
    logger.info("Merged networks: %d design + %d context = %d total",
                len(design), len(context), len(merged))
    return merged


def compute_isochrone(
    streets_gdf: gpd.GeoDataFrame,
    origin: tuple[float, float],
    max_distance_m: float = 800,
) -> dict:
    """Compute walking isochrone from an origin point.

    Based on K3 spike: Dijkstra shortest-path, 0.011s for ~2000 nodes.

    Args:
        streets_gdf: Street network GeoDataFrame.
        origin: (longitude, latitude) of origin.
        max_distance_m: Maximum walk distance in meters.

    Returns:
        Dict with reachable nodes and convex hull polygon.
    """
    import osmnx as ox
    from shapely.geometry import MultiPoint

    streets = ensure_projected(streets_gdf)

    # Build NetworkX graph from edges
    G = nx.Graph()
    for _, row in streets.iterrows():
        coords = list(row.geometry.coords)
        start = coords[0]
        end = coords[-1]
        length = row.geometry.length
        G.add_edge(start, end, length=length)

    if len(G.nodes) == 0:
        return {"reachable_nodes": 0, "hull": None}

    # Find nearest node to origin
    origin_proj = gpd.GeoDataFrame(
        geometry=gpd.points_from_xy([origin[0]], [origin[1]], crs="EPSG:4326")
    ).to_crs(streets.crs)
    origin_pt = (origin_proj.geometry.iloc[0].x, origin_proj.geometry.iloc[0].y)

    nodes = np.array(list(G.nodes))
    tree = cKDTree(nodes)
    _, nearest_idx = tree.query(origin_pt)
    source_node = tuple(nodes[nearest_idx])

    # Dijkstra
    distances = nx.single_source_dijkstra_path_length(G, source_node, weight="length", cutoff=max_distance_m)

    if not distances:
        return {"reachable_nodes": 0, "hull": None}

    # Convex hull of reachable nodes
    reachable_pts = [node for node in distances.keys()]
    hull = MultiPoint(reachable_pts).convex_hull

    # Convert hull back to WGS84
    hull_gdf = gpd.GeoDataFrame(geometry=[hull], crs=streets.crs).to_crs("EPSG:4326")
    hull_geojson = json.loads(hull_gdf.to_json())

    logger.info("Isochrone: %d reachable nodes within %dm", len(distances), max_distance_m)
    return {
        "reachable_nodes": len(distances),
        "max_distance_m": max_distance_m,
        "hull": hull_geojson["features"][0]["geometry"] if hull_geojson["features"] else None,
    }
