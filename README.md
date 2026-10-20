# resume
An AI tool for tailoring a resume to a given job description while using only veritably true facts about the candidate

## Career inventory schema

[`career_inventory_schema.py`](./career_inventory_schema.py) defines the Python 3.11+ typed schema and standard-library validator for [`data/master-career-inventory.json`](./data/master-career-inventory.json). The current schema version is **1.2.0**. The validator also accepts the baseline's **1.1.0** version for backward compatibility; use 1.2.0 for new or updated inventories. Additive optional fields require a minor version bump; incompatible changes require a major version bump.

Run the validator and regression tests from the repository root:

```sh
python -c 'import json; from pathlib import Path; from career_inventory_schema import validate_inventory; data=json.loads(Path("data/master-career-inventory.json").read_text(encoding="utf-8")); errors=validate_inventory(data); print("\n".join(errors) if errors else "Inventory is valid"); raise SystemExit(bool(errors))'
python -m unittest test_career_inventory_schema.py
```

### Updating the inventory fixture

Prepare a replacement inventory JSON file, then install it from the repository root:

```sh
python -m tools.update_inventory_fixture /path/to/new-inventory.json
```

The updater checks that the source is valid JSON and conforms to the inventory schema, preserves every existing record ID (new IDs may be added), sets `schema_version` to the current supported schema version, records today's date in `inventory_revision_date`, and atomically replaces `data/master-career-inventory.json`. To provide a specific revision date:

```sh
python -m tools.update_inventory_fixture /path/to/new-inventory.json --revision-date YYYY-MM-DD
```

This updates the inventory fixture, not the schema definition: ordinary content updates use the current schema version. If the inventory structure changes, update the Python schema and `SCHEMA_VERSION` first, then upload a source file that conforms to that schema. The tool refuses unsupported source versions or an upload that removes an existing ID.

### Expected inventory structure

- `schema_version`, `inventory_generation_date`, and `inventory_revision_date` identify the schema and the dates the inventory was generated/revised.
- `subject` holds the person's profile and contact fields.
- `employment_history` contains one record per role: stable ID, employer/title/type, dates and location, context, role/ownership, team information, technologies, systems, operational responsibilities, related accomplishments, and unknowns. `accomplishment_ids` points to `ACC-*` records.
- `accomplishments` records the problem, the person's contribution and ownership, technical details, scope, outcome, metrics, evidence/confidence, relevance, candidate resume bullets, and follow-up questions. `employer_id` points to an `EMP-*` record. A metric stores string `value`, `unit`, and `confidence`; values remain strings so approximate and qualified figures are not converted into false precision.
- `skills` describes the skill/category, aliases, contexts, usage level, recency, evidence examples, and limitations. Examples may point to `ACC-*`, `PROJ-*`, or `LEAD-*` records.
- `leadership_examples` stores situation, actions, reasoning, outcome, and links to `ACC-*` records.
- `projects` stores project description, contribution, technologies, related `SK-*` IDs, evidence, and verification questions.
- `education_and_credentials` records education/certifications; unknown institution or dates may be `null`.
- `career_preferences` records target roles, work preferences, geography, compensation context, work authorization, and tailoring preferences.
- `verification_questions` tracks open or answered questions and IDs of affected records.
- `source_notes` records the source and its role in supporting inventory facts.
- Optional `negative_qualifications` is a list of explicit, evidence-backed boundaries/non-experience, each with a statement, scope, evidence, and a `related_ids` list that may be empty. This is an addition to the baseline shape; it can be omitted or be an empty list.

### Required, optional, and nullable values

Every field in the Python `TypedDict` definitions is required unless marked `NotRequired`. A `NotRequired` field may be omitted; this does **not** mean its value may be `null`. Fields whose annotations include `| None` are required keys that explicitly permit JSON `null`. Empty strings/lists are not interchangeable with `null`; use them only when they accurately represent known empty content. The validator rejects unexpected fields, missing required fields, type mismatches, unsupported schema versions, duplicate record IDs, and dangling/wrong-kind references. It does not coerce values.

Optional fields present in the baseline include employment notes/constraints, accomplishment `employer_note`, leadership related-accomplishment links, and a verification question's `answered_date`. See the Python definitions for the complete required/nullability contract.

### IDs, references, and truthful limitations

IDs are stable record keys, not sequence positions: `EMP-*` employment, `ACC-*` accomplishment, `SK-*` skill, `LEAD-*` leadership example, `PROJ-*` project, `EDU-*` education/credential, `VQ-*` verification question, and `SRC-*` source note. Preserve an existing ID when editing a record; allocate a new unique ID when adding one. IDs are unique within their collection and references must point to an existing record of the permitted kind. `verification_questions.affects` may reference employment, accomplishment, skill, leadership, project, or education IDs.

Do not turn absence of evidence into experience. Put confirmed skill boundaries in `skills[].limitations`, role constraints in `employment_history[].constraints_and_limitations`, unknown/missing facts in `employment_history[].missing_or_unconfirmed` or `verification_questions`, and explicit negative qualifications in `negative_qualifications`. Keep claims qualified by the evidence/confidence field. For example, a work item known not to have reached production belongs as a limitation; do not describe it as a production outcome.

### Known limitations

- This schema validates shape, JSON-compatible primitive types, version, and ID references; it cannot determine whether a factual statement is true or whether evidence supports its wording.
- Dates and confidence/status vocabulary are strings because the baseline uses partial dates and descriptive confidence values. Their semantic consistency requires human review.
- Detailed limitations and unknowns are mostly prose, so the validator cannot infer whether all facts requiring qualification have been recorded.
