"""POST /tessellate — Enclosed tessellation from buildings + streets.

Based on C1 spike: momepy.enclosed_tessellation with neatnet-simplified streets.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import TessellateRequest

router = APIRouter()


@router.post("/tessellate")
async def tessellate(req: TessellateRequest):
    """Compute morphological tessellation."""
    raise HTTPException(
        status_code=501,
        detail="Tessellation endpoint not yet implemented. See task #90.",
    )
