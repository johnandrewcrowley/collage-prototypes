"""Urban classification: Spacematrix, LCZ, GMM clustering.

Based on K2/K4 spikes.
"""

import logging

import geopandas as gpd
import numpy as np

from collage_backend.utils.crs import ensure_projected

logger = logging.getLogger(__name__)

# LCZ thresholds from Stewart & Oke (2012)
LCZ_THRESHOLDS = {
    1: {"label": "Compact high-rise", "bsf": (0.40, None), "bh": (25, None), "hw": (2.0, None)},
    2: {"label": "Compact midrise", "bsf": (0.40, None), "bh": (10, 25), "hw": (0.75, 2.0)},
    3: {"label": "Compact low-rise", "bsf": (0.40, None), "bh": (3, 10), "hw": (0.75, 1.5)},
    4: {"label": "Open high-rise", "bsf": (0.20, 0.40), "bh": (25, None), "hw": (0.75, 2.0)},
    5: {"label": "Open midrise", "bsf": (0.20, 0.40), "bh": (10, 25), "hw": (0.3, 0.75)},
    6: {"label": "Open low-rise", "bsf": (0.20, 0.40), "bh": (3, 10), "hw": (0.3, 0.75)},
    7: {"label": "Lightweight low-rise", "bsf": (0.60, None), "bh": (None, 10), "hw": (1.0, 2.0)},
    8: {"label": "Large low-rise", "bsf": (0.30, 0.50), "bh": (3, 10), "hw": (0.1, 0.3)},
    9: {"label": "Sparsely built", "bsf": (0.10, 0.20), "bh": (3, 10), "hw": (0.1, 0.25)},
    10: {"label": "Heavy industry", "bsf": (0.20, 0.30), "bh": (5, 15), "hw": (0.2, 0.5)},
}

# Spacematrix types by FSI/GSI/L ranges
SPACEMATRIX_TYPES = {
    "detached_low": {"fsi": (0, 0.5), "gsi": (0, 0.2), "layers": (1, 2)},
    "suburban": {"fsi": (0.3, 1.0), "gsi": (0.15, 0.35), "layers": (1, 3)},
    "urban_low": {"fsi": (0.8, 2.0), "gsi": (0.3, 0.6), "layers": (2, 4)},
    "urban_mid": {"fsi": (1.5, 3.5), "gsi": (0.3, 0.5), "layers": (4, 7)},
    "urban_high": {"fsi": (3.0, 8.0), "gsi": (0.2, 0.4), "layers": (7, 20)},
    "compact_low": {"fsi": (1.0, 2.5), "gsi": (0.5, 0.8), "layers": (2, 4)},
    "compact_mid": {"fsi": (2.0, 5.0), "gsi": (0.4, 0.7), "layers": (4, 8)},
    "compact_high": {"fsi": (4.0, None), "gsi": (0.3, 0.6), "layers": (8, None)},
}


def classify_spacematrix(
    buildings_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
) -> dict:
    """Classify using Spacematrix (FSI/GSI/L → 8 types).

    Returns dict with per-building classification and fragment-level type.
    """
    if buildings_gdf.empty:
        return {"per_building": {}, "fragment_type": None}

    bldg = ensure_projected(buildings_gdf)
    tess = tessellation_gdf.to_crs(bldg.crs) if not tessellation_gdf.empty else tessellation_gdf

    # Compute FSI, GSI, L per building
    per_building: dict[str, dict] = {}

    if not tess.empty and "building_id" in tess.columns:
        tess_areas = tess.groupby("building_id")["area_m2"].sum()
    else:
        tess_areas = None

    for _, row in bldg.iterrows():
        bid = row["id"]
        footprint = row.geometry.area
        height = float(row.get("height_m", 9) or 9)
        floors = max(1, round(height / 3.0))

        if tess_areas is not None and bid in tess_areas.index:
            site_area = tess_areas[bid]
        else:
            site_area = footprint * 2  # rough approximation

        gsi = footprint / site_area if site_area > 0 else 0
        fsi = (footprint * floors) / site_area if site_area > 0 else 0
        layers = fsi / gsi if gsi > 0 else floors

        # Score against types
        best_type = "unclassified"
        best_score = float("inf")
        for stype, thresholds in SPACEMATRIX_TYPES.items():
            score = _range_score(fsi, thresholds["fsi"]) + \
                    _range_score(gsi, thresholds["gsi"]) + \
                    _range_score(layers, thresholds["layers"])
            if score < best_score:
                best_score = score
                best_type = stype

        per_building[bid] = {
            "fsi": float(fsi),
            "gsi": float(gsi),
            "layers": float(layers),
            "spacematrix_type": best_type,
        }

    # Fragment-level: majority vote
    type_counts: dict[str, int] = {}
    for m in per_building.values():
        t = m["spacematrix_type"]
        type_counts[t] = type_counts.get(t, 0) + 1
    fragment_type = max(type_counts, key=type_counts.get) if type_counts else None

    logger.info("Spacematrix: %d buildings, fragment type=%s", len(per_building), fragment_type)
    return {"per_building": per_building, "fragment_type": fragment_type}


def classify_lcz(
    buildings_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
) -> dict:
    """Classify using Local Climate Zones (threshold-based, 14.3ms per K4).

    Returns dict with LCZ class, confidence, and indicator values.
    """
    if buildings_gdf.empty:
        return {"lcz_class": None, "confidence": 0, "indicators": {}}

    bldg = ensure_projected(buildings_gdf)
    tess = tessellation_gdf.to_crs(bldg.crs) if not tessellation_gdf.empty else tessellation_gdf

    # Compute indicators
    total_area = bldg.geometry.area.sum()
    bh_mean = float(bldg["height_m"].fillna(9).mean())

    if not tess.empty:
        site_area = tess.geometry.area.sum()
    else:
        site_area = total_area * 2

    bsf = total_area / site_area if site_area > 0 else 0.5

    # Canyon H/W from sustainability metrics (approximate)
    hw = bh_mean / 10.0  # rough approximation

    indicators = {
        "bsf": float(min(bsf, 1.0)),
        "bh": float(bh_mean),
        "hw": float(hw),
    }

    # Score against LCZ types
    best_lcz = 1
    best_score = float("inf")
    for lcz_id, thresholds in LCZ_THRESHOLDS.items():
        score = (
            _range_score(bsf, thresholds["bsf"]) +
            _range_score(bh_mean, thresholds["bh"]) +
            _range_score(hw, thresholds["hw"])
        )
        if score < best_score:
            best_score = score
            best_lcz = lcz_id

    confidence = max(0, 1.0 - best_score) if best_score < 1.0 else 0.0

    result = {
        "lcz_class": best_lcz,
        "lcz_label": LCZ_THRESHOLDS[best_lcz]["label"],
        "confidence": float(confidence),
        "indicators": indicators,
    }

    logger.info("LCZ classification: %s (class %d, confidence %.2f)", result["lcz_label"], best_lcz, confidence)
    return result


def classify_gmm(
    buildings_gdf: gpd.GeoDataFrame,
    tessellation_gdf: gpd.GeoDataFrame,
    metrics_df: dict | None = None,
    n_clusters: int = 5,
) -> dict:
    """Classify using Gaussian Mixture Model on morphometric characters.

    Args:
        buildings_gdf: Building polygons.
        tessellation_gdf: Tessellation cells.
        metrics_df: Pre-computed metrics dict (from compute_all_metrics).
        n_clusters: Number of GMM clusters.

    Returns:
        Dict with per-building cluster assignments and cluster profiles.
    """
    if buildings_gdf.empty:
        return {"per_building": {}, "cluster_profiles": {}}

    from sklearn.mixture import GaussianMixture
    from sklearn.preprocessing import StandardScaler

    bldg = ensure_projected(buildings_gdf)

    # Build feature matrix from basic building properties
    features = []
    bids = []
    for _, row in bldg.iterrows():
        area = row.geometry.area
        perimeter = row.geometry.length
        height = float(row.get("height_m", 9) or 9)
        features.append([area, perimeter, height, area / max(perimeter, 1)])
        bids.append(row["id"])

    if len(features) < n_clusters:
        logger.warning("Too few buildings (%d) for %d clusters", len(features), n_clusters)
        return {"per_building": {bid: {"cluster": 0} for bid in bids}, "cluster_profiles": {}}

    X = np.array(features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    gmm = GaussianMixture(n_components=min(n_clusters, len(features)), random_state=42)
    labels = gmm.fit_predict(X_scaled)

    per_building = {}
    for i, bid in enumerate(bids):
        per_building[bid] = {"cluster": int(labels[i])}

    # Cluster profiles
    cluster_profiles = {}
    for c in range(gmm.n_components):
        mask = labels == c
        cluster_features = X[mask]
        if len(cluster_features) > 0:
            cluster_profiles[str(c)] = {
                "count": int(mask.sum()),
                "mean_area": float(cluster_features[:, 0].mean()),
                "mean_height": float(cluster_features[:, 2].mean()),
            }

    logger.info("GMM clustering: %d buildings → %d clusters", len(bids), gmm.n_components)
    return {"per_building": per_building, "cluster_profiles": cluster_profiles}


def _range_score(value: float, range_tuple: tuple) -> float:
    """Score how well a value fits within a range. 0 = perfect fit."""
    low, high = range_tuple
    if low is not None and value < low:
        return ((low - value) / max(abs(low), 1)) ** 2
    if high is not None and value > high:
        return ((value - high) / max(abs(high), 1)) ** 2
    return 0.0
