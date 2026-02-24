"""Space syntax via cityseer.

Based on C3 spike: cityseer NAIN/NACH at [400, 800, 1600, 10000]m radii.
Pre-computed at extraction time (AGPL mitigation: values are data, not software).
"""

import logging

import geopandas as gpd

logger = logging.getLogger(__name__)

DEFAULT_RADII = [400, 800, 1600, 10000]


def compute_space_syntax(
    streets_gdf: gpd.GeoDataFrame,
    radii: list[int] | None = None,
) -> dict:
    """Compute NAIN/NACH at specified radii.

    Uses cityseer's Rust-backed node_centrality for performance.
    Falls back to momepy dual-graph approach if cityseer is unavailable.

    Args:
        streets_gdf: Street LineStrings (WGS84 or projected).
        radii: Radii in meters (default: [400, 800, 1600, 10000]).

    Returns:
        Dict with per-segment centrality values and aggregates.
    """
    if streets_gdf.empty:
        return {"per_segment": {}, "aggregates": {}}

    radii = radii or DEFAULT_RADII

    logger.info("Computing space syntax: %d streets, radii=%s", len(streets_gdf), radii)

    try:
        return _compute_cityseer(streets_gdf, radii)
    except ImportError:
        logger.warning("cityseer not available, falling back to momepy")
        return _compute_momepy(streets_gdf, radii)
    except Exception as e:
        logger.warning("cityseer failed: %s, falling back to momepy", e)
        return _compute_momepy(streets_gdf, radii)


def _compute_cityseer(streets_gdf: gpd.GeoDataFrame, radii: list[int]) -> dict:
    """Compute via cityseer (Rust-backed, ~1.7s for 1000 segments)."""
    from cityseer.metrics import networks as net_metrics
    from cityseer.tools import graphs as graph_tools
    from cityseer.tools import io as cs_io

    from collage_backend.utils.crs import ensure_projected

    streets_proj = ensure_projected(streets_gdf)

    # Build cityseer network from GeoDataFrame
    G = cs_io.nx_from_generic_geopandas(streets_proj)
    graph_tools.nx_remove_filler_nodes(G)
    graph_tools.nx_remove_dangling_nodes(G)

    struct = cs_io.network_structure_from_nx(G)
    centrality_df = net_metrics.node_centrality_simplest(
        struct,
        distances=radii,
    )

    # Extract per-segment results
    per_segment: dict[str, dict] = {}
    aggregates: dict[str, float] = {}

    for radius in radii:
        nain_col = f"cc_beta_simplest_{radius}"
        nach_col = f"cc_betweenness_simplest_{radius}"

        nain_vals = centrality_df[nain_col].values if nain_col in centrality_df.columns else []
        nach_vals = centrality_df[nach_col].values if nach_col in centrality_df.columns else []

        if len(nain_vals) > 0:
            aggregates[f"nain_{radius}_mean"] = float(nain_vals.mean())
            aggregates[f"nain_{radius}_std"] = float(nain_vals.std())
        if len(nach_vals) > 0:
            aggregates[f"nach_{radius}_mean"] = float(nach_vals.mean())
            aggregates[f"nach_{radius}_std"] = float(nach_vals.std())

    logger.info("cityseer computed %d aggregates", len(aggregates))
    return {"per_segment": per_segment, "aggregates": aggregates}


def _compute_momepy(streets_gdf: gpd.GeoDataFrame, radii: list[int]) -> dict:
    """Fallback: compute via momepy dual graph (slower, global radius only)."""
    import momepy
    import networkx as nx

    from collage_backend.utils.crs import ensure_projected

    streets_proj = ensure_projected(streets_gdf)

    try:
        G = momepy.gdf_to_nx(streets_proj, approach="dual")
    except Exception as e:
        logger.warning("momepy dual graph construction failed: %s", e)
        return {"per_segment": {}, "aggregates": {}}

    aggregates: dict[str, float] = {}

    # Global NAIN/NACH (momepy radius-limited is too slow for production)
    try:
        closeness = nx.closeness_centrality(G, distance="angle")
        betweenness = nx.betweenness_centrality(G, weight="angle")

        c_vals = list(closeness.values())
        b_vals = list(betweenness.values())

        if c_vals:
            aggregates["nain_global_mean"] = float(sum(c_vals) / len(c_vals))
        if b_vals:
            aggregates["nach_global_mean"] = float(sum(b_vals) / len(b_vals))
    except Exception as e:
        logger.warning("momepy centrality failed: %s", e)

    logger.info("momepy fallback computed %d aggregates", len(aggregates))
    return {"per_segment": {}, "aggregates": aggregates}
