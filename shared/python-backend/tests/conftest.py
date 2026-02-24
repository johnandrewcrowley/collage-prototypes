"""Shared test fixtures for backend tests."""

import pytest


@pytest.fixture
def barcelona_bbox():
    """Barcelona Eixample bounding box (small area for testing)."""
    return (2.1600, 41.3850, 2.1750, 41.3950)
