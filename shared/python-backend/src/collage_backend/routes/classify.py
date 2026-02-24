"""POST /classify — Spacematrix + LCZ + GMM morphometric clustering.

Based on K2/K4 spikes.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import ClassifyRequest

router = APIRouter()


@router.post("/classify")
async def classify(req: ClassifyRequest):
    """Run classification (Spacematrix, LCZ, GMM clustering)."""
    raise HTTPException(
        status_code=501,
        detail="Classification endpoint not yet implemented. See task #90.",
    )
