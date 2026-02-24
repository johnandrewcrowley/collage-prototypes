"""POST /tessellate — Enclosed tessellation from buildings + streets."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import TessellateRequest
from collage_backend.services.tessellation import compute_tessellation
from collage_backend.utils.io import gdf_to_geojson, geojson_to_gdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/tessellate")
async def tessellate(req: TessellateRequest):
    """Compute morphological tessellation."""
    try:
        buildings_gdf = geojson_to_gdf(req.buildings)
        streets_gdf = geojson_to_gdf(req.streets)
        tess = compute_tessellation(
            buildings_gdf, streets_gdf,
            segment=req.segment,
            simplify=req.simplify,
            n_jobs=req.n_jobs,
        )
        return gdf_to_geojson(tess)
    except Exception as e:
        logger.exception("Tessellation failed")
        raise HTTPException(status_code=500, detail=str(e))
