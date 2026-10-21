import json
from pathlib import Path
import tempfile
import unittest

from career_inventory_api import build_inventory_response
from career_inventory_service import build_inventory_response as build_service_response


class CareerInventoryApiTests(unittest.TestCase):
    def test_returns_inventory_and_audit_report(self):
        inventory_path = (
            Path(__file__).parent / "data" / "master-career-inventory.json"
        )

        status, payload = build_inventory_response(inventory_path)

        self.assertEqual(status, 200)
        self.assertTrue(payload["loaded"])
        self.assertIn("inventory", payload)
        self.assertIn("errors", payload["validation"])
        self.assertIn("warnings", payload["validation"])

    def test_validation_failures_are_returned_with_loaded_inventory(self):
        inventory_path = (
            Path(__file__).parent / "data" / "master-career-inventory.json"
        )
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        inventory["schema_version"] = "0.0.1"
        payload = build_service_response(inventory)

        self.assertTrue(payload["loaded"])
        self.assertTrue(payload["validation"]["errors"])
        self.assertTrue(
            any(
                "inventory.schema_version" in error
                for error in payload["validation"]["errors"]
            )
        )

    def test_load_failures_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            inventory_path = Path(directory) / "inventory.json"
            inventory_path.write_text("{not valid JSON")

            status, payload = build_inventory_response(inventory_path)

        self.assertEqual(status, 500)
        self.assertFalse(payload["loaded"])
        self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
