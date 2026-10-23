import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_CANDIDATES_PER_REQUIREMENT } from "../src/config.js";
import { retrieveEvidenceCandidates } from "../src/evidence-retrieval.js";
import { validateInventory } from "../src/validation.js";

const inventory = JSON.parse(readFileSync(
  new URL("../../../data/master-career-inventory.json", import.meta.url),
  "utf8",
));

function requirement(id, description, category, keywords) {
  return { id, description, category, importance: "high", keywords };
}

function candidateById(result, id) {
  return result.candidates.find(({ record }) => record.id === id);
}

test("evidence retrieval returns strongly matching inventory records with original IDs", () => {
  assert.deepEqual(validateInventory(inventory), []);

  const [result] = retrieveEvidenceCandidates(inventory, [
    requirement("req_001", "Build and maintain Kafka consumers", "skill", ["Kafka"]),
  ]);
  const accomplishment = candidateById(result, "ACC-002");

  assert.ok(accomplishment);
  assert.equal(accomplishment.type, "accomplishment");
  assert.equal(accomplishment.record, inventory.accomplishments.find(({ id }) => id === "ACC-002"));
  assert.match(accomplishment.record.technical_details, /consumer only/);
  assert.match(accomplishment.record.technical_details, /never set up topics or emitted\/produced/);
});

test("ambiguous matches preserve evidence boundaries rather than strengthening claims", () => {
  const [kafkaResult, vueResult] = retrieveEvidenceCandidates(inventory, [
    requirement("req_kafka", "Own Kafka producer pipelines", "skill", ["Kafka", "producer"]),
    requirement("req_vue", "Implement Vue.js frontend features", "skill", ["Vue"]),
  ]);
  const kafkaCandidate = candidateById(kafkaResult, "ACC-002");
  const vueCandidate = candidateById(vueResult, "SK-035");
  const vueAccomplishment = candidateById(vueResult, "ACC-010");

  assert.ok(kafkaCandidate);
  assert.match(kafkaCandidate.record.technical_details, /consumer only/);
  assert.match(kafkaCandidate.record.technical_details, /did not build the pipeline/);
  assert.ok(vueCandidate);
  assert.match(vueCandidate.record.limitations, /NEVER coded in Vue/);
  assert.ok(vueAccomplishment);
  assert.match(vueAccomplishment.record.my_contribution, /reviewed Vue code/);
  assert.match(vueAccomplishment.record.my_contribution, /limited hands-on Vue coding/);
});

test("evidence retrieval returns no candidates for unrelated requirements", () => {
  const [result] = retrieveEvidenceCandidates(inventory, [
    requirement("req_001", "Pilot underwater asteroid mining", "experience", ["asteroid"]),
  ]);

  assert.deepEqual(result, { requirementId: "req_001", candidates: [] });
});

test("evidence retrieval is deterministic and enforces the configurable candidate limit", () => {
  const requirements = [
    requirement("req_001", "Software engineering leadership experience", "experience", ["engineering"]),
  ];
  const first = retrieveEvidenceCandidates(inventory, requirements);
  const second = retrieveEvidenceCandidates(inventory, requirements);

  assert.deepEqual(first, second);
  assert.equal(MAX_CANDIDATES_PER_REQUIREMENT, 5);
  assert.equal(first[0].candidates.length, MAX_CANDIDATES_PER_REQUIREMENT);
  const expanded = retrieveEvidenceCandidates(inventory, requirements, 100);
  assert.ok(expanded[0].candidates.length > MAX_CANDIDATES_PER_REQUIREMENT);
  assert.throws(
    () => retrieveEvidenceCandidates(inventory, requirements, -1),
    RangeError,
  );
});
