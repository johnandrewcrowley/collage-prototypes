"""POST /space-syntax — cityseer NAIN/NACH at multiple radii.

Based on C3 spike: cityseer networks.node_centrality at [400, 800, 1600, 10000]m.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import SpaceSyntaxRequest

router = APIRouter()


@router.post("/space-syntax")
async def compute_space_syntax(req: SpaceSyntaxRequest):
    """Compute space syntax metrics (NAIN/NACH) at specified radii."""
    raise HTTPException(
        status_code=501,
        detail="Space syntax endpoint not yet implemented. See task #90.",
    )
