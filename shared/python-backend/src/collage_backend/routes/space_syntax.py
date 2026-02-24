"""POST /space-syntax — cityseer NAIN/NACH at multiple radii."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import SpaceSyntaxRequest
from collage_backend.services.space_syntax import compute_space_syntax
from collage_backend.utils.io import geojson_to_gdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/space-syntax")
async def compute_space_syntax_endpoint(req: SpaceSyntaxRequest):
    """Compute space syntax metrics (NAIN/NACH) at specified radii."""
    try:
        streets_gdf = geojson_to_gdf(req.streets)
        results = compute_space_syntax(streets_gdf, radii=req.radii)
        return results
    except Exception as e:
        logger.exception("Space syntax computation failed")
        raise HTTPException(status_code=500, detail=str(e))
