"""Typed schema and validation for master-career-inventory.json.

Requires Python 3.11 or newer. The current schema is version 1.2.0.
"""

import argparse
import json
from pathlib import Path
import sys
from typing import NotRequired, TypedDict, get_args, get_origin, get_type_hints
import types
import typing


SCHEMA_VERSION = "1.2.0"
SUPPORTED_INVENTORY_VERSIONS = {"1.1.0", SCHEMA_VERSION}


class Subject(TypedDict):
    display_name_for_resumes: str
    legal_name_for_official_forms: str
    note_on_names: str
    location_current: str
    email: str
    phone_for_resumes: str
    github: str
    linkedin: str
    portfolio: str
    github_note: str


class Employment(TypedDict):
    id: str
    employer: str
    job_title: str
    employment_type: str
    start_date: str
    end_date: str
    location: str
    team_and_business_context: str | None
    role_type: str
    team_size: str | None
    direct_reports: int | None
    scope_of_ownership: str | None
    technologies: list[str]
    systems: list[str]
    operational_responsibilities: str | None
    accomplishment_ids: list[str]
    missing_or_unconfirmed: list[str]
    end_date_note: NotRequired[str]
    direct_reports_note: NotRequired[str]
    alternate_employer_name: NotRequired[str]
    constraints_and_limitations: NotRequired[list[str]]
    metrics_verified: NotRequired[str]


class Metric(TypedDict):
    value: str
    unit: str
    confidence: str


class Accomplishment(TypedDict):
    id: str
    title: str
    employer_id: str
    problem_or_motivation: str
    my_contribution: str
    ownership_level: str
    technical_details: str
    scale_and_scope: str | None
    outcome: str | None
    metrics: list[Metric]
    evidence_and_confidence: str
    potential_relevance: list[str]
    resume_bullet_candidates: list[str]
    verification_questions: list[str]
    employer_note: NotRequired[str]


class Skill(TypedDict):
    id: str
    name: str
    aliases: list[str]
    category: str
    contexts: list[str]
    usage_level: str
    duration_or_recency: str | None
    examples: list[str]
    limitations: str | None


class LeadershipExample(TypedDict):
    id: str
    title: str
    accomplishment_id: str | None
    situation: str
    actions: str
    reasoning: str | None
    outcome: str | None
    related_accomplishment_ids: NotRequired[list[str]]


class Project(TypedDict):
    id: str
    name: str
    type: str
    description: str
    my_contribution: str
    technologies: list[str]
    skill_ids: list[str]
    evidence_and_confidence: str
    verification_questions: list[str]


class EducationCredential(TypedDict):
    id: str
    institution: str | None
    credential: str
    details: str
    dates: str | None
    evidence_and_confidence: str


class VerificationQuestion(TypedDict):
    id: str
    question: str
    affects: list[str]
    priority: str
    status: str
    answer: str
    answered_date: NotRequired[str]


class SourceNote(TypedDict):
    id: str
    source: str
    role: str


class WorkAuthorization(TypedDict):
    citizenship: str
    canada_status: str
    application_form_answers_stated: str
    biggest_obstacle_stated: str


CareerPreferences = TypedDict(
    "CareerPreferences",
    {
        "targeting_note": str,
        "role_types_open_to": list[str],
        "filtering_rule": str,
        "technical_work_targeted": list[str],
        "strengths_positioning": list[str],
        "geography_current_search": str,
        "contract_rate_stated_2026-09-21": str,
        "work_authorization": WorkAuthorization,
        "cover_letter_preference": str,
        "resume_tailoring_preference": str,
    },
)


class NegativeQualification(TypedDict):
    """A confirmed boundary or non-experience, not an inferred skill or claim."""

    statement: str
    scope: str
    evidence: str
    related_ids: list[str]


class CareerInventory(TypedDict):
    schema_version: str
    inventory_generation_date: str
    subject: Subject
    employment_history: list[Employment]
    accomplishments: list[Accomplishment]
    skills: list[Skill]
    leadership_examples: list[LeadershipExample]
    projects: list[Project]
    education_and_credentials: list[EducationCredential]
    career_preferences: CareerPreferences
    verification_questions: list[VerificationQuestion]
    source_notes: list[SourceNote]
    inventory_revision_date: str
    negative_qualifications: NotRequired[list[NegativeQualification]]


_COLLECTIONS = {
    "EMP": "employment_history",
    "ACC": "accomplishments",
    "SK": "skills",
    "LEAD": "leadership_examples",
    "PROJ": "projects",
    "EDU": "education_and_credentials",
    "VQ": "verification_questions",
    "SRC": "source_notes",
}


def _matches(value: object, annotation: object) -> bool:
    """Check the supported TypedDict field types without coercing input."""
    if annotation is type(None):
        return value is None
    origin = get_origin(annotation)
    if origin in (typing.Required, typing.NotRequired):
        return _matches(value, get_args(annotation)[0])
    if origin in (typing.Union, types.UnionType):
        return any(_matches(value, option) for option in get_args(annotation))
    if origin is list:
        (item_type,) = get_args(annotation)
        return isinstance(value, list) and all(_matches(item, item_type) for item in value)
    if typing.is_typeddict(annotation):
        return isinstance(value, dict)
    if annotation is int:
        return type(value) is int
    if annotation is str:
        return isinstance(value, str)
    return False


def _validate_typed_dict(
    value: object, model: type, path: str, errors: list[str]
) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}: expected object")
        return

    hints = get_type_hints(model, include_extras=True)
    required = model.__required_keys__
    for key in sorted(required - value.keys()):
        errors.append(f"{path}.{key}: required field is missing")
    for key in sorted(value.keys() - hints.keys()):
        errors.append(f"{path}.{key}: unexpected field")

    for key, field_type in hints.items():
        if key not in value:
            continue
        field_value = value[key]
        field_path = f"{path}.{key}"
        if not _matches(field_value, field_type):
            errors.append(f"{field_path}: invalid value or type")
            continue

        origin = get_origin(field_type)
        if origin in (typing.Required, typing.NotRequired):
            field_type = get_args(field_type)[0]
            origin = get_origin(field_type)
        if typing.is_typeddict(field_type):
            _validate_typed_dict(field_value, field_type, field_path, errors)
        elif origin is list:
            item_type = get_args(field_type)[0]
            if typing.is_typeddict(item_type):
                for index, item in enumerate(field_value):
                    _validate_typed_dict(item, item_type, f"{field_path}[{index}]", errors)


def _check_ids_and_references(data: CareerInventory, errors: list[str]) -> None:
    ids: dict[str, set[str]] = {}
    first_occurrence: dict[str, str] = {}
    for prefix, collection_name in _COLLECTIONS.items():
        collection = data[collection_name]
        for index, record in enumerate(collection):
            record_id = record["id"]
            path = f"{collection_name}[{index}].id"
            if not record_id.startswith(f"{prefix}-") or not record_id[len(prefix) + 1 :]:
                errors.append(f"{path}: expected an ID beginning with {prefix}-")
            if record_id in first_occurrence:
                errors.append(
                    f"{path}: duplicate ID {record_id!r}; first used at "
                    f"{first_occurrence[record_id]}"
                )
            else:
                first_occurrence[record_id] = path
            ids.setdefault(prefix, set()).add(record_id)

    def reference(value: str, allowed: tuple[str, ...], path: str) -> None:
        prefix = value.partition("-")[0]
        if prefix not in allowed or value not in ids.get(prefix, set()):
            errors.append(f"{path}: unknown or wrong-kind reference {value!r}")

    for i, record in enumerate(data["employment_history"]):
        for j, ref in enumerate(record["accomplishment_ids"]):
            reference(ref, ("ACC",), f"employment_history[{i}].accomplishment_ids[{j}]")
    for i, record in enumerate(data["accomplishments"]):
        reference(record["employer_id"], ("EMP",), f"accomplishments[{i}].employer_id")
    for i, record in enumerate(data["leadership_examples"]):
        refs = []
        if record["accomplishment_id"] is not None:
            refs.append(("accomplishment_id", record["accomplishment_id"]))
        refs.extend(
            ("related_accomplishment_ids", ref)
            for ref in record.get("related_accomplishment_ids", [])
        )
        for field, ref in refs:
            reference(ref, ("ACC",), f"leadership_examples[{i}].{field}")
    for i, record in enumerate(data["projects"]):
        for j, ref in enumerate(record["skill_ids"]):
            reference(ref, ("SK",), f"projects[{i}].skill_ids[{j}]")
    for i, record in enumerate(data["skills"]):
        for j, ref in enumerate(record["examples"]):
            reference(ref, ("ACC", "PROJ", "LEAD"), f"skills[{i}].examples[{j}]")
    for i, record in enumerate(data["verification_questions"]):
        for j, ref in enumerate(record["affects"]):
            reference(
                ref,
                ("EMP", "ACC", "SK", "LEAD", "PROJ", "EDU"),
                f"verification_questions[{i}].affects[{j}]",
            )
    for i, record in enumerate(data.get("negative_qualifications", [])):
        for j, ref in enumerate(record["related_ids"]):
            reference(
                ref,
                ("EMP", "ACC", "SK", "LEAD", "PROJ", "EDU"),
                f"negative_qualifications[{i}].related_ids[{j}]",
            )


def _check_warnings(data: CareerInventory) -> list[str]:
    warnings: list[str] = []
    for collection_name, records in (
        ("accomplishments", data["accomplishments"]),
        ("projects", data["projects"]),
    ):
        for index, record in enumerate(records):
            for question_index, question in enumerate(record["verification_questions"]):
                warnings.append(
                    f"{collection_name}[{index}] ({record['id']})."
                    f"verification_questions[{question_index}]: unresolved question: "
                    f"{question}"
                )

    for index, record in enumerate(data["verification_questions"]):
        if record["status"].casefold() != "answered":
            warnings.append(
                f"verification_questions[{index}] ({record['id']}).status: "
                f"question is unresolved (status {record['status']!r})"
            )

    for index, record in enumerate(data["source_notes"]):
        for field in ("source", "role"):
            value = record[field]
            lowered = value.casefold()
            if any(marker in lowered for marker in ("conflict", "inconsisten", "uncorroborated")):
                warnings.append(
                    f"source_notes[{index}] ({record['id']}).{field}: "
                    "source note flags a conflict or uncorroborated claim; "
                    "review the canonical inventory value"
                )
                break
    return warnings


def audit_inventory(value: object) -> dict[str, list[str]]:
    """Return blocking validation errors and non-blocking inventory warnings."""
    errors = validate_inventory(value)
    warnings: list[str] = []
    if not errors:
        warnings = _check_warnings(value)
    return {"errors": errors, "warnings": warnings}


def validate_inventory(value: object) -> list[str]:
    """Return validation errors; an empty list means the inventory is valid."""
    errors: list[str] = []
    _validate_typed_dict(value, CareerInventory, "inventory", errors)
    if errors:
        return errors

    inventory = value
    if inventory["schema_version"] not in SUPPORTED_INVENTORY_VERSIONS:
        errors.append(
            "inventory.schema_version: expected one of "
            f"{', '.join(sorted(SUPPORTED_INVENTORY_VERSIONS))}"
        )
    _check_ids_and_references(inventory, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and audit a career inventory.")
    parser.add_argument("inventory", type=Path, help="path to the inventory JSON file")
    args = parser.parse_args()

    try:
        with args.inventory.open(encoding="utf-8") as inventory_file:
            value = json.load(inventory_file)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read valid JSON from {args.inventory}: {exc}", file=sys.stderr)
        return 1

    report = audit_inventory(value)
    for severity in ("errors", "warnings"):
        for message in report[severity]:
            print(f"{severity[:-1].upper()}: {message}")
    if not report["errors"] and not report["warnings"]:
        print("Inventory is valid; no warnings.")
    return bool(report["errors"])


if __name__ == "__main__":
    raise SystemExit(main())
