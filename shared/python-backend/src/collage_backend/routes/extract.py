"""POST /extract — OSM extraction + neatnet + height enrichment + tessellation + metrics.

Full pipeline based on B1/B2/C1/C3/C4 spike code.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import ExtractRequest

router = APIRouter()


@router.post("/extract")
async def extract(req: ExtractRequest):
    """Extract OSM data for a bounding box.

    Pipeline: OSMnx extraction → neatnet simplification → height cascade →
    enclosed tessellation → momepy metrics → cityseer space syntax.
    """
    raise HTTPException(
        status_code=501,
        detail="Extraction endpoint not yet implemented. See task #90.",
    )
