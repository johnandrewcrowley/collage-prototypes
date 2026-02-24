"""Fragment operations: save, load, relocate, merge.

Based on D1/D2/K3 spikes.
Stub — task #90 implements.
"""


def save_fragment(fragment_data, path):
    """Save fragment as GeoParquet."""
    raise NotImplementedError("See task #90")


def load_fragment(path):
    """Load fragment from GeoParquet."""
    raise NotImplementedError("See task #90")


def relocate_fragment(fragment_data, target_center):
    """Relocate fragment using CRS reassignment."""
    raise NotImplementedError("See task #90")


def merge_networks(design_streets_gdf, context_streets_gdf):
    """Merge design and context street networks."""
    raise NotImplementedError("See task #90")


def compute_isochrone(streets_gdf, origin, max_distance_m=800):
    """Compute walking isochrone from an origin point."""
    raise NotImplementedError("See task #90")
