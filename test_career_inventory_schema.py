import copy
import json
from pathlib import Path
import tempfile
import unittest

from career_inventory_schema import (
    SCHEMA_VERSION,
    SUPPORTED_INVENTORY_VERSIONS,
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
