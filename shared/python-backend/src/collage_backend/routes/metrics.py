"""POST /metrics/momepy and POST /metrics/sustainability.

momepy: 61 morphometric metrics based on B1/C4 spike code.
sustainability: ISR, BAF, runoff, canyon H/W, SVF based on C5/research findings.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import MomepyMetricsRequest, SustainabilityMetricsRequest

router = APIRouter()


@router.post("/metrics/momepy")
async def compute_momepy_metrics(req: MomepyMetricsRequest):
    """Compute momepy morphometric metrics."""
    raise HTTPException(
        status_code=501,
        detail="Momepy metrics endpoint not yet implemented. See task #90.",
    )


@router.post("/metrics/sustainability")
async def compute_sustainability_metrics(req: SustainabilityMetricsRequest):
    """Compute sustainability metrics (ISR, BAF, runoff, canyon H/W, SVF)."""
    raise HTTPException(
        status_code=501,
        detail="Sustainability metrics endpoint not yet implemented. See task #90.",
    )
