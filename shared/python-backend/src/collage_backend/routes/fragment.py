"""Fragment operations: save, load, relocate, network merge, isochrone."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import (
    FragmentLoadRequest,
    FragmentRelocateRequest,
    FragmentSaveRequest,
    NetworkIsochroneRequest,
    NetworkMergeRequest,
)
from collage_backend.services.fragment_ops import (
    compute_isochrone,
    load_fragment,
    merge_networks,
    relocate_fragment,
    save_fragment,
)
from collage_backend.utils.io import geojson_to_gdf, gdf_to_geojson

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/fragment/save")
async def save_fragment_endpoint(req: FragmentSaveRequest):
    """Save a fragment as GeoParquet."""
    try:
        path = save_fragment(req.fragment, req.path)
        return {"status": "ok", "path": path}
    except Exception as e:
        logger.exception("Fragment save failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fragment/load")
async def load_fragment_endpoint(req: FragmentLoadRequest):
    """Load a fragment from GeoParquet."""
    try:
        return load_fragment(req.path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.path}")
    except Exception as e:
        logger.exception("Fragment load failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fragment/relocate")
async def relocate_fragment_endpoint(req: FragmentRelocateRequest):
    """Relocate a fragment to a new center using CRS reassignment."""
    try:
        return relocate_fragment(req.fragment, tuple(req.target_center))
    except Exception as e:
        logger.exception("Fragment relocation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/network/merge")
async def merge_networks_endpoint(req: NetworkMergeRequest):
    """Merge design and context street networks."""
    try:
        design = geojson_to_gdf(req.design_streets)
        context = geojson_to_gdf(req.context_streets)
        merged = merge_networks(design, context)
        return gdf_to_geojson(merged)
    except Exception as e:
        logger.exception("Network merge failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/network/isochrone")
async def compute_isochrone_endpoint(req: NetworkIsochroneRequest):
    """Compute walking isochrone from an origin point."""
    try:
        streets = geojson_to_gdf(req.streets)
        return compute_isochrone(streets, tuple(req.origin), req.max_distance_m)
    except Exception as e:
        logger.exception("Isochrone computation failed")
        raise HTTPException(status_code=500, detail=str(e))
