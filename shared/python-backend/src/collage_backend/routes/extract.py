"""POST /extract — Full extraction pipeline.

Pipeline: OSMnx → neatnet → height cascade → tessellation → momepy metrics → space syntax.
"""

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import ExtractRequest
from collage_backend.services.extraction import extract_buildings, extract_streets
from collage_backend.services.height_cascade import enrich_heights
from collage_backend.services.morphometrics import compute_summary_metrics
from collage_backend.services.tessellation import compute_tessellation
from collage_backend.utils.io import gdf_to_geojson

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/extract")
async def extract(req: ExtractRequest):
    """Extract OSM data for a bounding box.

    Returns a FragmentPackage-compatible JSON response with buildings,
    streets, tessellation, and basic metrics.
    """
    t0 = time.time()
    bbox = tuple(req.bbox)

    try:
        # Step 1: Extract buildings
        logger.info("Step 1: Extracting buildings...")
        buildings_gdf = extract_buildings(bbox, buffer_m=req.buffer_m)

        if buildings_gdf.empty:
            raise HTTPException(status_code=404, detail="No buildings found in bbox")

        # Step 2: Extract streets
        logger.info("Step 2: Extracting streets...")
        streets_gdf = extract_streets(bbox, buffer_m=req.buffer_m)

        # Step 3: Height enrichment
        if req.include_heights:
            logger.info("Step 3: Enriching heights...")
            buildings_gdf = enrich_heights(buildings_gdf)

        # Step 4: Tessellation
        tessellation_gdf = None
        if req.include_tessellation and not streets_gdf.empty:
            logger.info("Step 4: Computing tessellation...")
            try:
                tessellation_gdf = compute_tessellation(buildings_gdf, streets_gdf)
            except Exception as e:
                logger.warning("Tessellation failed: %s", e)

        # Step 5: Summary metrics
        metrics = None
        if req.include_metrics:
            logger.info("Step 5: Computing summary metrics...")
            try:
                summary = compute_summary_metrics(
                    buildings_gdf, streets_gdf,
                    tessellation_gdf if tessellation_gdf is not None else buildings_gdf.iloc[:0],
                )
                metrics = {
                    "fragment_id": str(uuid.uuid4())[:8],
                    "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "tier1": [
                        {"key": k, "label": k.replace("_", " ").title(), "value": v,
                         "unit": "", "tier": 1, "category": "dimension"}
                        for k, v in summary.items()
                    ],
                    "tier2": [],
                    "tier3": [],
                }
            except Exception as e:
                logger.warning("Metrics failed: %s", e)

        elapsed = time.time() - t0
        logger.info("Extraction complete in %.1fs: %d buildings, %d streets",
                     elapsed, len(buildings_gdf), len(streets_gdf))

        # Build response
        buildings_geojson = gdf_to_geojson(buildings_gdf)
        streets_geojson = gdf_to_geojson(streets_gdf)
        tess_geojson = gdf_to_geojson(tessellation_gdf) if tessellation_gdf is not None else {
            "type": "FeatureCollection", "features": []
        }

        height_coverage = (
            (buildings_gdf["height_source"] != "type_default").sum() / len(buildings_gdf)
            if len(buildings_gdf) > 0 else 0
        )

        return {
            "metadata": {
                "id": str(uuid.uuid4())[:8],
                "name": f"Extract {bbox[0]:.4f},{bbox[1]:.4f}",
                "city": "unknown",
                "country": "unknown",
                "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "crs": "EPSG:4326",
                "bbox": list(bbox),
                "data_sources": ["osm"],
                "building_count": len(buildings_gdf),
                "street_segment_count": len(streets_gdf),
                "tessellation_cell_count": len(tessellation_gdf) if tessellation_gdf is not None else 0,
                "quality": {
                    "building_completeness": 1.0,
                    "height_coverage": float(height_coverage),
                    "street_network_connected": True,
                    "tessellation_success": tessellation_gdf is not None,
                },
            },
            "buildings": buildings_geojson,
            "streets": streets_geojson,
            "tessellation": tess_geojson,
            "blocks": {"type": "FeatureCollection", "features": []},
            "metrics": metrics,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Extraction failed")
        raise HTTPException(status_code=500, detail=str(e))
