"""CRS utilities — custom Transverse Mercator, projection helpers.

Based on D1 spike: custom tmerc CRS for fragment operations (not UTM).
"""

from pyproj import CRS


def custom_tmerc(center_lon: float, center_lat: float) -> CRS:
    """Create a custom Transverse Mercator CRS centered at a given point.

    This avoids UTM zone boundary issues and provides consistent
    meter-based coordinates for fragment operations.
    """
    return CRS.from_proj4(
        f"+proj=tmerc +lat_0={center_lat} +lon_0={center_lon} "
        f"+k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    )


def ensure_projected(gdf, target_crs=None):
    """Ensure a GeoDataFrame is in a projected CRS.

    If no target_crs is given, uses a custom tmerc at the centroid.
    """
    if gdf.crs is None or gdf.crs.is_geographic:
        if target_crs is None:
            centroid = gdf.geometry.union_all().centroid
            target_crs = custom_tmerc(centroid.x, centroid.y)
        return gdf.to_crs(target_crs)
    return gdf
