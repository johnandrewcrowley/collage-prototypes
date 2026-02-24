"""Fragment operations: save, load, relocate, network merge, isochrone.

Based on D1/D2/K3 spikes.
Stub implementation — task #90 adds the real logic.
"""

from fastapi import APIRouter, HTTPException

from collage_backend.models.request import (
    FragmentLoadRequest,
    FragmentRelocateRequest,
    FragmentSaveRequest,
    NetworkIsochroneRequest,
    NetworkMergeRequest,
)

router = APIRouter()


@router.post("/fragment/save")
async def save_fragment(req: FragmentSaveRequest):
    """Save a fragment as GeoParquet."""
    raise HTTPException(
        status_code=501,
        detail="Fragment save not yet implemented. See task #90.",
    )


@router.post("/fragment/load")
async def load_fragment(req: FragmentLoadRequest):
    """Load a fragment from GeoParquet."""
    raise HTTPException(
        status_code=501,
        detail="Fragment load not yet implemented. See task #90.",
    )


@router.post("/fragment/relocate")
async def relocate_fragment(req: FragmentRelocateRequest):
    """Relocate a fragment to a new center using CRS reassignment."""
    raise HTTPException(
        status_code=501,
        detail="Fragment relocation not yet implemented. See task #90.",
    )


@router.post("/network/merge")
async def merge_networks(req: NetworkMergeRequest):
    """Merge design and context street networks."""
    raise HTTPException(
        status_code=501,
        detail="Network merge not yet implemented. See task #90.",
    )


@router.post("/network/isochrone")
async def compute_isochrone(req: NetworkIsochroneRequest):
    """Compute walking isochrone from an origin point."""
    raise HTTPException(
        status_code=501,
        detail="Isochrone computation not yet implemented. See task #90.",
    )
