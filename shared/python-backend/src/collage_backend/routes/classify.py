"""POST /classify — Spacematrix + LCZ + GMM morphometric clustering."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import ClassifyRequest
from collage_backend.services.classification import classify_gmm, classify_lcz, classify_spacematrix
from collage_backend.utils.io import geojson_to_gdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/classify")
async def classify(req: ClassifyRequest):
    """Run classification (Spacematrix, LCZ, GMM clustering)."""
    try:
        buildings_gdf = geojson_to_gdf(req.buildings)
        tessellation_gdf = geojson_to_gdf(req.tessellation)

        results = {}

        if "spacematrix" in req.methods:
            results["spacematrix"] = classify_spacematrix(buildings_gdf, tessellation_gdf)

        if "lcz" in req.methods:
            results["lcz"] = classify_lcz(buildings_gdf, tessellation_gdf)

        if "gmm" in req.methods:
            results["gmm"] = classify_gmm(
                buildings_gdf, tessellation_gdf, metrics_df=req.metrics or None
            )

        return results
    except Exception as e:
        logger.exception("Classification failed")
        raise HTTPException(status_code=500, detail=str(e))
