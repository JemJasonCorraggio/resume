"""Read-only API response helpers used by the local Python server."""

from typing import Any

from career_inventory_schema import audit_inventory


def build_inventory_response(inventory: Any) -> dict[str, object]:
    """Build the API payload with validation from the canonical schema module."""
    return {
        "loaded": True,
        "inventory": inventory,
        "validation": audit_inventory(inventory),
    }


def build_inventory_load_failure() -> dict[str, object]:
    """Return the stable API payload for inventory read or parse failures."""
    return {
        "loaded": False,
        "error": "The inventory could not be loaded. Check the API server logs.",
    }
