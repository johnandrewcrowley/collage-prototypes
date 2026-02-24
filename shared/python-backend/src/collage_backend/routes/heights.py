"""POST /heights — Region-adaptive height cascade enrichment."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import HeightsRequest
from collage_backend.services.height_cascade import enrich_heights
from collage_backend.utils.io import gdf_to_geojson, geojson_to_gdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/heights")
async def enrich_heights_endpoint(req: HeightsRequest):
    """Enrich building heights using region-adaptive cascade."""
    try:
        buildings_gdf = geojson_to_gdf(req.buildings)
        enriched = enrich_heights(buildings_gdf, region=req.region)
        return gdf_to_geojson(enriched)
    except Exception as e:
        logger.exception("Height enrichment failed")
        raise HTTPException(status_code=500, detail=str(e))
