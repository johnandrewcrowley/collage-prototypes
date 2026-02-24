"""POST /metrics/momepy and POST /metrics/sustainability."""

import logging

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import MomepyMetricsRequest, SustainabilityMetricsRequest
from collage_backend.services.morphometrics import compute_all_metrics
from collage_backend.services.sustainability import compute_sustainability_metrics
from collage_backend.utils.io import geojson_to_gdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/metrics/momepy")
async def compute_momepy_metrics(req: MomepyMetricsRequest):
    """Compute momepy morphometric metrics."""
    try:
        buildings_gdf = geojson_to_gdf(req.buildings)
        streets_gdf = geojson_to_gdf(req.streets)
        tessellation_gdf = geojson_to_gdf(req.tessellation)
        results = compute_all_metrics(
            buildings_gdf, streets_gdf, tessellation_gdf,
            metric_keys=req.metrics if req.metrics != ["all"] else None,
        )
        return results
    except Exception as e:
        logger.exception("Momepy metrics failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/metrics/sustainability")
async def compute_sustainability_metrics_endpoint(req: SustainabilityMetricsRequest):
    """Compute sustainability metrics (ISR, BAF, runoff, canyon H/W, SVF)."""
    try:
        buildings_gdf = geojson_to_gdf(req.buildings)
        streets_gdf = geojson_to_gdf(req.streets)
        tessellation_gdf = geojson_to_gdf(req.tessellation)
        results = compute_sustainability_metrics(buildings_gdf, streets_gdf, tessellation_gdf)
        return results
    except Exception as e:
        logger.exception("Sustainability metrics failed")
        raise HTTPException(status_code=500, detail=str(e))
