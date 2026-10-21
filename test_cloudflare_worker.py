import copy
import json
from pathlib import Path
import subprocess
import unittest

from career_inventory_schema import audit_inventory


ROOT = Path(__file__).parent
WORKER_VALIDATION = ROOT / "cloudflare" / "worker" / "src" / "validation.js"


class CloudflareWorkerValidationParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        baseline_path = ROOT / "data" / "master-career-inventory.json"
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        cases = {"baseline": baseline}

        missing_field = copy.deepcopy(baseline)
        del missing_field["employment_history"][0]["employer"]
        cases["missing_field"] = missing_field

        invalid_type = copy.deepcopy(baseline)
        invalid_type["skills"][0]["limitations"] = 42
        cases["invalid_type"] = invalid_type

        broken_reference = copy.deepcopy(baseline)
        broken_reference["employment_history"][0]["accomplishment_ids"].append("ACC-999")
        cases["broken_reference"] = broken_reference

        wrong_kind_reference = copy.deepcopy(baseline)
        wrong_kind_reference["projects"][0]["skill_ids"].append("ACC-001")
        cases["wrong_kind_reference"] = wrong_kind_reference

        duplicate_id = copy.deepcopy(baseline)
        duplicate_id["skills"][0]["id"] = duplicate_id["accomplishments"][0]["id"]
        cases["duplicate_id"] = duplicate_id

        unsupported_version = copy.deepcopy(baseline)
        unsupported_version["schema_version"] = "9.9.9"
        cases["unsupported_version"] = unsupported_version

        invalid_integer = copy.deepcopy(baseline)
        invalid_integer["employment_history"][0]["direct_reports"] = 1.5
        cases["invalid_integer"] = invalid_integer

        cls.cases = cases
        runner = f"""
            import {{ auditInventory }} from {json.dumps(WORKER_VALIDATION.as_uri())};
            let input = "";
            for await (const chunk of process.stdin) input += chunk;
            const cases = JSON.parse(input);
            process.stdout.write(JSON.stringify(
              Object.fromEntries(Object.entries(cases).map(([key, value]) =>
                [key, auditInventory(value)]))
            ));
        """
        result = subprocess.run(
            ["node", "--input-type=module", "-e", runner],
            input=json.dumps(cases),
            capture_output=True,
            check=True,
            cwd=ROOT,
            text=True,
        )
        cls.worker_reports = json.loads(result.stdout)

    def test_worker_validation_matches_python_source_of_truth(self):
        for name, inventory in self.cases.items():
            with self.subTest(case=name):
                self.assertEqual(
                    self.worker_reports[name],
                    audit_inventory(inventory),
                )


if __name__ == "__main__":
    unittest.main()
