"""Geometry utilities — bbox helpers, polygon construction."""

from shapely.geometry import box


def bbox_to_polygon(bbox: tuple[float, float, float, float]):
    """Convert [west, south, east, north] bbox to a Shapely polygon."""
    west, south, east, north = bbox
    return box(west, south, east, north)


def buffer_bbox(bbox: tuple[float, float, float, float], buffer_m: float):
    """Buffer a WGS84 bbox by approximate meters.

    Uses a rough degree approximation (1° ≈ 111km at equator).
    For more accuracy, project to meters first.
    """
    west, south, east, north = bbox
    lat_mid = (south + north) / 2
    # Approximate degree per meter
    deg_per_m_lat = 1 / 111_320
    deg_per_m_lon = 1 / (111_320 * __import__("math").cos(__import__("math").radians(lat_mid)))

    return (
        west - buffer_m * deg_per_m_lon,
        south - buffer_m * deg_per_m_lat,
        east + buffer_m * deg_per_m_lon,
        north + buffer_m * deg_per_m_lat,
    )
