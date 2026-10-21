"""Read-only lookup helpers for master-career-inventory records."""

from copy import deepcopy
from typing import Any, Mapping


_RECORD_COLLECTIONS = (
    "accomplishments",
    "skills",
    "employment_history",
    "projects",
    "leadership_examples",
)


def _get_record(
    inventory: Mapping[str, Any], collection: str, record_id: str
) -> dict[str, Any] | None:
    records = inventory.get(collection, [])
    if not isinstance(records, list):
        return None
    for record in records:
        if isinstance(record, dict) and record.get("id") == record_id:
            return deepcopy(record)
    return None


def get_accomplishment(
    inventory: Mapping[str, Any], record_id: str
) -> dict[str, Any] | None:
    """Return a detached accomplishment record, or None if its ID is not found."""
    return _get_record(inventory, "accomplishments", record_id)


def get_skill(inventory: Mapping[str, Any], record_id: str) -> dict[str, Any] | None:
    """Return a detached skill record, or None if its ID is not found."""
    return _get_record(inventory, "skills", record_id)


def get_employment(
    inventory: Mapping[str, Any], record_id: str
) -> dict[str, Any] | None:
    """Return a detached employment record, or None if its ID is not found."""
    return _get_record(inventory, "employment_history", record_id)


def get_project(inventory: Mapping[str, Any], record_id: str) -> dict[str, Any] | None:
    """Return a detached project record, or None if its ID is not found."""
    return _get_record(inventory, "projects", record_id)


def get_leadership_example(
    inventory: Mapping[str, Any], record_id: str
) -> dict[str, Any] | None:
    """Return a detached leadership example, or None if its ID is not found."""
    return _get_record(inventory, "leadership_examples", record_id)


def _referenced_ids(record: Mapping[str, Any]) -> set[str]:
    references: set[str] = set()
    for field in ("accomplishment_ids", "examples", "skill_ids", "related_accomplishment_ids"):
        values = record.get(field, [])
        if isinstance(values, list):
            references.update(value for value in values if isinstance(value, str))

    for field in ("employer_id", "accomplishment_id"):
        value = record.get(field)
        if isinstance(value, str):
            references.add(value)
    return references


def get_related_evidence(
    inventory: Mapping[str, Any], record_id: str
) -> list[dict[str, Any]] | None:
    """Return directly linked records as detached copies, or None for an unknown ID.

    Links are discovered from explicit inventory references in either direction.
    Records without related references return an empty list.
    """
    record = next(
        (
            candidate
            for collection in _RECORD_COLLECTIONS
            for candidate in inventory.get(collection, [])
            if isinstance(candidate, dict) and candidate.get("id") == record_id
        ),
        None,
    )
    if record is None:
        return None

    related_ids = _referenced_ids(record)
    related_ids.update(
        candidate["id"]
        for collection in _RECORD_COLLECTIONS
        for candidate in inventory.get(collection, [])
        if isinstance(candidate, dict)
        and candidate.get("id") != record_id
        and record_id in _referenced_ids(candidate)
        and isinstance(candidate.get("id"), str)
    )
    related_ids.discard(record_id)

    return [
        deepcopy(candidate)
        for collection in _RECORD_COLLECTIONS
        for candidate in inventory.get(collection, [])
        if isinstance(candidate, dict) and candidate.get("id") in related_ids
    ]
