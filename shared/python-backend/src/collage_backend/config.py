"""Configuration constants for the Collage Earth backend."""

from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent.parent.parent.parent.parent / "data"
FIXTURES_DIR = DATA_DIR / "fixtures"

# CRS
DEFAULT_CRS = "EPSG:4326"

# Extraction defaults
DEFAULT_BUFFER_M = 200
DEFAULT_HEIGHT_M = 9.0
DEFAULT_FLOOR_HEIGHT_M = 3.0

# Tessellation
TESSELLATION_SEGMENT = 1.0
TESSELLATION_SIMPLIFY = True
TESSELLATION_N_JOBS = -1

# Space syntax radii (meters)
SPACE_SYNTAX_RADII = [400, 800, 1600, 10000]

# Fragment size thresholds (building count)
FRAGMENT_SIZES = {
    "small": 100,
    "medium": 500,
    "large": 2000,
    "stress": 5000,
}
