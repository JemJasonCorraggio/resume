"""Install a validated career inventory as the project's data fixture."""

from __future__ import annotations

import argparse
from datetime import date
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from career_inventory_schema import (
    SCHEMA_VERSION,
    SUPPORTED_INVENTORY_VERSIONS,
    validate_inventory,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "data" / "master-career-inventory.json"
ID_COLLECTIONS = (
    "employment_history",
    "accomplishments",
    "skills",
    "leadership_examples",
    "projects",
    "education_and_credentials",
    "verification_questions",
    "source_notes",
)


def _read_inventory(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as inventory_file:
            inventory = json.load(inventory_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read valid JSON from {path}: {exc}") from exc
    if not isinstance(inventory, dict):
        raise ValueError(f"Inventory in {path} must be a JSON object")
    return inventory


def _inventory_ids(inventory: dict[str, Any]) -> dict[str, set[str]]:
    return {
        collection: {record["id"] for record in inventory[collection]}
        for collection in ID_COLLECTIONS
    }


def update_inventory_fixture(
    source: str | Path,
    destination: str | Path = FIXTURE_PATH,
    revision_date: str | None = None,
) -> Path:
    """Validate and install a newer inventory while retaining all existing IDs.

    The fixture's schema version is set to the current supported schema version.
    The revision date defaults to today's date and can be supplied for reproducible
    updates or tests.
    """
    source_path = Path(source)
    destination_path = Path(destination)
    previous = _read_inventory(destination_path)
    candidate = _read_inventory(source_path)

    source_version = candidate.get("schema_version")
    if source_version not in SUPPORTED_INVENTORY_VERSIONS:
        raise ValueError(
            "Source inventory has an unsupported schema_version "
            f"{source_version!r}; supported versions: "
            f"{', '.join(sorted(SUPPORTED_INVENTORY_VERSIONS))}"
        )

    if revision_date is None:
        revision_date = date.today().isoformat()
    try:
        parsed_revision_date = date.fromisoformat(revision_date)
    except ValueError as exc:
        raise ValueError(f"revision_date must be an ISO date: {exc}") from exc
    if parsed_revision_date.isoformat() != revision_date:
        raise ValueError("revision_date must use YYYY-MM-DD format")

    previous_errors = validate_inventory(previous)
    if previous_errors:
        raise ValueError(
            f"Existing fixture {destination_path} is invalid: "
            + "; ".join(previous_errors)
        )

    candidate["schema_version"] = SCHEMA_VERSION
    candidate["inventory_revision_date"] = revision_date
    errors = validate_inventory(candidate)
    if errors:
        raise ValueError("Source inventory is invalid: " + "; ".join(errors))

    previous_ids = _inventory_ids(previous)
    candidate_ids = _inventory_ids(candidate)
    removed_ids = {
        collection: sorted(ids - candidate_ids[collection])
        for collection, ids in previous_ids.items()
        if ids - candidate_ids[collection]
    }
    if removed_ids:
        details = "; ".join(
            f"{collection}: {', '.join(ids)}" for collection, ids in removed_ids.items()
        )
        raise ValueError(f"Source inventory does not preserve existing IDs: {details}")

    destination_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=destination_path.parent,
            prefix=f".{destination_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            json.dump(candidate, temp_file, ensure_ascii=False, indent=2)
            temp_file.write("\n")
        os.replace(temp_path, destination_path)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()

    return destination_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Validate a new inventory JSON file, preserve existing record IDs, "
            "and update the project's data fixture."
        )
    )
    parser.add_argument("source", type=Path, help="path to the replacement inventory JSON")
    parser.add_argument(
        "--revision-date",
        help="ISO date to record as inventory_revision_date (defaults to today)",
    )
    args = parser.parse_args()
    if args.revision_date is not None:
        try:
            date.fromisoformat(args.revision_date)
        except ValueError as exc:
            parser.error(f"--revision-date must be an ISO date: {exc}")

    try:
        updated_path = update_inventory_fixture(args.source, revision_date=args.revision_date)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Inventory update failed: {exc}\n")
    print(f"Updated {updated_path} (schema version {SCHEMA_VERSION})")


if __name__ == "__main__":
    main()
