import copy
import json
from pathlib import Path
import tempfile
import unittest

from career_inventory import (
    get_accomplishment,
    get_employment,
    get_leadership_example,
    get_project,
    get_related_evidence,
    get_skill,
)
from career_inventory_schema import (
    SCHEMA_VERSION,
    SUPPORTED_INVENTORY_VERSIONS,
    audit_inventory,
    validate_inventory,
)
from tools.update_inventory_fixture import update_inventory_fixture


class CareerInventorySchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).parent / "data" / "master-career-inventory.json"
        cls.inventory = json.loads(path.read_text(encoding="utf-8"))

    def test_baseline_inventory_is_valid(self):
        self.assertIn(self.inventory["schema_version"], SUPPORTED_INVENTORY_VERSIONS)
        self.assertEqual(validate_inventory(self.inventory), [])

    def test_accepts_current_schema_version(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["schema_version"] = SCHEMA_VERSION
        self.assertEqual(validate_inventory(inventory), [])

    def test_rejects_missing_required_field(self):
        inventory = copy.deepcopy(self.inventory)
        del inventory["employment_history"][0]["employer"]
        self.assertTrue(
            any("employment_history[0].employer: required field is missing" in e
                for e in validate_inventory(inventory))
        )

    def test_rejects_invalid_nullable_field_type(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["skills"][0]["limitations"] = 42
        self.assertTrue(
            any("skills[0].limitations: invalid value or type" in e
                for e in validate_inventory(inventory))
        )

    def test_rejects_dangling_reference(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["employment_history"][0]["accomplishment_ids"].append("ACC-999")
        self.assertTrue(
            any("unknown or wrong-kind reference 'ACC-999'" in e
                for e in validate_inventory(inventory))
        )

    def test_rejects_duplicate_ids_across_collections(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["skills"][0]["id"] = inventory["accomplishments"][0]["id"]
        self.assertTrue(
            any("skills[0].id: duplicate ID 'ACC-001'" in e
                for e in validate_inventory(inventory))
        )

    def test_accepts_missing_optional_references(self):
        inventory = copy.deepcopy(self.inventory)
        leadership = inventory["leadership_examples"][0]
        leadership["accomplishment_id"] = None
        leadership.pop("related_accomplishment_ids", None)
        inventory["projects"][0]["skill_ids"] = []
        self.assertEqual(validate_inventory(inventory), [])

    def test_audit_reports_unresolved_questions_and_source_conflicts_as_warnings(self):
        report = audit_inventory(self.inventory)
        self.assertEqual(report["errors"], [])
        self.assertTrue(
            any("verification_questions[12] (VQ-013).status" in warning
                for warning in report["warnings"])
        )
        self.assertTrue(
            any("source_notes[5] (SRC-006).source" in warning
                for warning in report["warnings"])
        )
        self.assertTrue(
            any("accomplishments[" in warning and ".verification_questions[" in warning
                for warning in report["warnings"])
        )

    def test_record_lookups_return_records_by_id(self):
        lookups = (
            (get_accomplishment, "ACC-001", "accomplishments"),
            (get_skill, "SK-001", "skills"),
            (get_employment, "EMP-001", "employment_history"),
            (get_project, "PROJ-001", "projects"),
            (get_leadership_example, "LEAD-001", "leadership_examples"),
        )
        for lookup, record_id, collection in lookups:
            with self.subTest(record_id=record_id):
                record = lookup(self.inventory, record_id)
                self.assertIsNotNone(record)
                self.assertEqual(record["id"], record_id)
                self.assertIn(record, self.inventory[collection])

    def test_record_lookups_return_none_for_unknown_ids(self):
        for lookup in (
            get_accomplishment,
            get_skill,
            get_employment,
            get_project,
            get_leadership_example,
        ):
            with self.subTest(lookup=lookup.__name__):
                self.assertIsNone(lookup(self.inventory, "UNKNOWN-999"))
        self.assertIsNone(get_related_evidence(self.inventory, "UNKNOWN-999"))

    def test_related_evidence_resolves_explicit_references(self):
        related = get_related_evidence(self.inventory, "ACC-005")
        self.assertIsNotNone(related)
        related_ids = {record["id"] for record in related}
        self.assertIn("EMP-001", related_ids)
        self.assertIn("LEAD-001", related_ids)

    def test_lookup_results_do_not_mutate_inventory(self):
        inventory = copy.deepcopy(self.inventory)
        original_name = inventory["skills"][0]["name"]
        result = get_skill(inventory, "SK-001")
        result["name"] = "Changed"
        result["aliases"].append("Changed")
        self.assertEqual(inventory["skills"][0]["name"], original_name)
        self.assertNotIn("Changed", inventory["skills"][0]["aliases"])

        related = get_related_evidence(inventory, "ACC-005")
        employment = next(record for record in related if record["id"] == "EMP-001")
        employment["employer"] = "Changed"
        self.assertNotEqual(
            inventory["employment_history"][0]["employer"], "Changed"
        )

    def test_accepts_documented_negative_qualification(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["negative_qualifications"] = [
            {
                "statement": "No production experience with an additional technology.",
                "scope": "Professional experience",
                "evidence": "Confirmed by the subject.",
                "related_ids": ["SK-001"],
            }
        ]
        self.assertEqual(validate_inventory(inventory), [])

    def test_update_sets_version_revision_and_preserves_original_ids(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["inventory_revision_date"] = "2000-01-01"
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source = temp_path / "incoming.json"
            destination = temp_path / "data" / "master-career-inventory.json"
            source.write_text(json.dumps(inventory), encoding="utf-8")
            destination.parent.mkdir()
            destination.write_text(json.dumps(self.inventory), encoding="utf-8")

            update_inventory_fixture(source, destination, "2026-10-20")

            updated = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual(updated["schema_version"], SCHEMA_VERSION)
        self.assertEqual(updated["inventory_revision_date"], "2026-10-20")
        self.assertEqual(validate_inventory(updated), [])
        for collection in (
            "employment_history",
            "accomplishments",
            "skills",
            "leadership_examples",
            "projects",
            "education_and_credentials",
            "verification_questions",
            "source_notes",
        ):
            self.assertEqual(
                {item["id"] for item in updated[collection]},
                {item["id"] for item in self.inventory[collection]},
            )

    def test_update_rejects_removed_original_id(self):
        inventory = copy.deepcopy(self.inventory)
        inventory["source_notes"][0]["id"] = "SRC-999"
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source = temp_path / "incoming.json"
            destination = temp_path / "master-career-inventory.json"
            source.write_text(json.dumps(inventory), encoding="utf-8")
            destination.write_text(json.dumps(self.inventory), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "does not preserve existing IDs"):
                update_inventory_fixture(source, destination, "2026-10-20")


if __name__ == "__main__":
    unittest.main()
