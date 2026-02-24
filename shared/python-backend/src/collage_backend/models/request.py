"""Pydantic request models for all endpoints."""

from pydantic import BaseModel, Field


class ExtractRequest(BaseModel):
    """Request for POST /extract."""

    bbox: tuple[float, float, float, float] = Field(
        ..., description="Bounding box [west, south, east, north] in WGS84"
    )
    buffer_m: float = Field(default=200, description="Buffer distance in meters")
    include_heights: bool = Field(default=True)
    include_tessellation: bool = Field(default=True)
    include_metrics: bool = Field(default=True)
    include_space_syntax: bool = Field(default=True)


class HeightsRequest(BaseModel):
    """Request for POST /heights."""

    buildings: dict = Field(..., description="GeoJSON FeatureCollection of buildings")
    region: str = Field(default="other", description="Region hint: 'europe', 'us', or 'other'")


class TessellateRequest(BaseModel):
    """Request for POST /tessellate."""

    buildings: dict = Field(..., description="GeoJSON FeatureCollection of buildings")
    streets: dict = Field(..., description="GeoJSON FeatureCollection of streets")
    segment: float = Field(default=1.0)
    simplify: bool = Field(default=True)
    n_jobs: int = Field(default=-1)


class MomepyMetricsRequest(BaseModel):
    """Request for POST /metrics/momepy."""

    buildings: dict = Field(..., description="GeoJSON FeatureCollection of buildings")
    streets: dict = Field(..., description="GeoJSON FeatureCollection of streets")
    tessellation: dict = Field(..., description="GeoJSON FeatureCollection of tessellation cells")
    metrics: list[str] = Field(default=["all"], description="Metric keys or ['all']")


class SustainabilityMetricsRequest(BaseModel):
    """Request for POST /metrics/sustainability."""

    buildings: dict = Field(..., description="GeoJSON FeatureCollection of buildings")
    streets: dict = Field(..., description="GeoJSON FeatureCollection of streets")
    tessellation: dict = Field(..., description="GeoJSON FeatureCollection of tessellation cells")


class SpaceSyntaxRequest(BaseModel):
    """Request for POST /space-syntax."""

    streets: dict = Field(..., description="GeoJSON FeatureCollection of streets")
    radii: list[int] = Field(default=[400, 800, 1600, 10000])


class ClassifyRequest(BaseModel):
    """Request for POST /classify."""

    buildings: dict = Field(..., description="GeoJSON FeatureCollection of buildings")
    tessellation: dict = Field(..., description="GeoJSON FeatureCollection of tessellation cells")
    metrics: dict = Field(default={}, description="Pre-computed metric values")
    methods: list[str] = Field(
        default=["spacematrix", "lcz", "gmm"], description="Classification methods"
    )


class FragmentSaveRequest(BaseModel):
    """Request for POST /fragment/save."""

    fragment: dict = Field(..., description="FragmentPackage JSON")
    path: str = Field(..., description="Output file path")


class FragmentLoadRequest(BaseModel):
    """Request for POST /fragment/load."""

    path: str = Field(..., description="GeoParquet file path")


class FragmentRelocateRequest(BaseModel):
    """Request for POST /fragment/relocate."""

    fragment: dict = Field(..., description="FragmentPackage JSON")
    target_center: tuple[float, float] = Field(
        ..., description="Target center [lng, lat] in WGS84"
    )


class NetworkMergeRequest(BaseModel):
    """Request for POST /network/merge."""

    design_streets: dict = Field(..., description="Design network GeoJSON")
    context_streets: dict = Field(..., description="Context network GeoJSON")


class NetworkIsochroneRequest(BaseModel):
    """Request for POST /network/isochrone."""

    streets: dict = Field(..., description="Street network GeoJSON")
    origin: tuple[float, float] = Field(..., description="Origin point [lng, lat]")
    max_distance_m: float = Field(default=800, description="Maximum walk distance in meters")
