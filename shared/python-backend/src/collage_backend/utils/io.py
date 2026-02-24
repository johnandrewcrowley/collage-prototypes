"""I/O utilities — GeoJSON/GeoParquet read/write, GeoDataFrame conversion."""

import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import shape


def geojson_to_gdf(geojson_dict: dict) -> gpd.GeoDataFrame:
    """Convert a GeoJSON dict to a GeoDataFrame."""
    return gpd.GeoDataFrame.from_features(geojson_dict["features"], crs="EPSG:4326")


def gdf_to_geojson(gdf: gpd.GeoDataFrame) -> dict:
    """Convert a GeoDataFrame to a GeoJSON dict (WGS84)."""
    if gdf.crs and not gdf.crs.is_geographic:
        gdf = gdf.to_crs("EPSG:4326")
    return json.loads(gdf.to_json())


def save_geoparquet(gdf: gpd.GeoDataFrame, path: str | Path) -> None:
    """Save a GeoDataFrame as GeoParquet."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(path, engine="pyarrow")


def load_geoparquet(path: str | Path) -> gpd.GeoDataFrame:
    """Load a GeoDataFrame from GeoParquet."""
    return gpd.read_parquet(Path(path))
