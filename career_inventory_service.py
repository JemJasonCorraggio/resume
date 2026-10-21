"""Compatibility entrypoint for shared inventory API response helpers."""

from cloudflare.worker.career_inventory_service import (
    build_inventory_load_failure,
    build_inventory_response,
)

__all__ = ["build_inventory_load_failure", "build_inventory_response"]
