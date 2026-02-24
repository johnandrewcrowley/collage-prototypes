"""OSM extraction + neatnet street simplification.

Based on B1 spike: OSMnx → neatnet.neatify → GeoDataFrame output.
Stub — task #90 implements.
"""


def extract_buildings(bbox: tuple[float, float, float, float]):
    """Extract buildings from OSM via OSMnx."""
    raise NotImplementedError("See task #90")


def extract_streets(bbox: tuple[float, float, float, float]):
    """Extract and simplify streets from OSM via OSMnx + neatnet."""
    raise NotImplementedError("See task #90")
