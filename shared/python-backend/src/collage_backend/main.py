"""FastAPI application for Collage Earth prototypes."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from collage_backend import __version__
from collage_backend.routes import (
    classify,
    extract,
    fragment,
    heights,
    metrics,
    space_syntax,
    tessellate,
)

app = FastAPI(
    title="Collage Earth Backend",
    version=__version__,
    description="Shared backend for all Collage Earth prototypes",
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(extract.router, tags=["extraction"])
app.include_router(heights.router, tags=["heights"])
app.include_router(tessellate.router, tags=["tessellation"])
app.include_router(metrics.router, tags=["metrics"])
app.include_router(space_syntax.router, tags=["space-syntax"])
app.include_router(classify.router, tags=["classification"])
app.include_router(fragment.router, tags=["fragment"])


@app.get("/health")
async def health():
    """Health check endpoint."""
    libs = {}
    try:
        import momepy

        libs["momepy"] = momepy.__version__
    except ImportError:
        libs["momepy"] = None

    try:
        import osmnx

        libs["osmnx"] = osmnx.__version__
    except ImportError:
        libs["osmnx"] = None

    try:
        import cityseer

        libs["cityseer"] = cityseer.__version__
    except ImportError:
        libs["cityseer"] = None

    try:
        import geopandas

        libs["geopandas"] = geopandas.__version__
    except ImportError:
        libs["geopandas"] = None

    return {
        "status": "ok",
        "version": __version__,
        "libraries": libs,
    }
