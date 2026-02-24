"""POST /heights — Region-adaptive height cascade enrichment.

Based on B2 spike: OSM tags → OSM levels → Overture → GBA → default 9m.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import HeightsRequest

router = APIRouter()


@router.post("/heights")
async def enrich_heights(req: HeightsRequest):
    """Enrich building heights using region-adaptive cascade."""
    raise HTTPException(
        status_code=501,
        detail="Heights endpoint not yet implemented. See task #90.",
    )
