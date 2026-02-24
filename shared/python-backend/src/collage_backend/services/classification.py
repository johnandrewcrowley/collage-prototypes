"""Urban classification: Spacematrix, LCZ, GMM clustering.

Based on K2/K4 spikes.
Stub — task #90 implements.
"""


def classify_spacematrix(buildings_gdf, tessellation_gdf):
    """Classify using Spacematrix (FSI/GSI/L → 8 types)."""
    raise NotImplementedError("See task #90")


def classify_lcz(buildings_gdf, tessellation_gdf):
    """Classify using Local Climate Zones (threshold-based)."""
    raise NotImplementedError("See task #90")


def classify_gmm(buildings_gdf, tessellation_gdf, metrics_df):
    """Classify using Gaussian Mixture Model on morphometric characters."""
    raise NotImplementedError("See task #90")
