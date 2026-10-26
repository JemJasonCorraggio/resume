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
  const vueAccomplishment = candidateById(vueResult, "ACC-010");

  assert.ok(kafkaCandidate);
  assert.match(kafkaCandidate.record.technical_details, /consumer only/);
  assert.match(kafkaCandidate.record.technical_details, /did not build the pipeline/);
  assert.ok(vueAccomplishment);
  assert.match(vueAccomplishment.record.my_contribution, /reviewed Vue code/);
  assert.match(vueAccomplishment.record.my_contribution, /limited hands-on Vue coding/);
  assert.ok(vueResult.candidates.every(({ type }) => type === "accomplishment"));
  assert.equal(candidateById(vueResult, "SK-035"), undefined);
});

test("evidence retrieval returns no candidates for unrelated requirements", () => {
  const [result] = retrieveEvidenceCandidates(inventory, [
    requirement("req_001", "Pilot underwater asteroid mining", "experience", ["asteroid"]),
  ]);

  assert.deepEqual(result, { requirementId: "req_001", candidates: [] });
});

test("retrieves accomplishments linked to employment without selecting employment", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Customer operations manager",
    accomplishment_ids: ["ACC-RELATED"],
  };
  const related = {
    id: "ACC-RELATED",
    employer_id: "EMP-TEST",
    title: "Migrated a service to Kubernetes",
  };
  const [result] = retrieveEvidenceCandidates(
    {
      employment_history: [employment],
      accomplishments: [related],
    },
    [requirement("req_kubernetes", "Deploy services with Kubernetes", "experience", ["Kubernetes"])],
  );

  assert.deepEqual(result.candidates, [{ type: "accomplishment", record: related }]);
  assert.equal(result.candidates[0].record, related);
});

test("linked accomplishments cannot expand candidates beyond the limit", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer delivery",
    accomplishment_ids: ["ACC-001", "ACC-002", "ACC-003", "ACC-004"],
  };
  const accomplishments = employment.accomplishment_ids.map((id, index) => ({
    id,
    employer_id: employment.id,
    title: `Platform delivery outcome ${index}`,
  }));
  const [result] = retrieveEvidenceCandidates(
    {
      employment_history: [employment],
      accomplishments,
    },
    [requirement("req_platform", "Platform engineer delivery", "experience", ["platform"])],
    2,
  );

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(({ type, record }) => [type, record.id]), [
    ["accomplishment", "ACC-001"],
    ["accomplishment", "ACC-002"],
  ]);
});

test("fewer matching accomplishments than the limit are returned unchanged", () => {
  const accomplishment = {
    id: "ACC-ONE",
    employer_id: "EMP-NOT-MATCHED",
    title: "Maintained Kafka consumers",
  };
  const [result] = retrieveEvidenceCandidates(
    { accomplishments: [accomplishment] },
    [requirement("req_kafka", "Operate Kafka consumers", "skill", ["Kafka"])],
    5,
  );

  assert.deepEqual(result.candidates, [{ type: "accomplishment", record: accomplishment }]);
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
  assert.ok(first[0].candidates.every(({ type }) => type === "accomplishment"));
  const more = retrieveEvidenceCandidates(inventory, requirements, 100);
  assert.ok(more[0].candidates.length <= 100);
  assert.ok(more[0].candidates.length >= first[0].candidates.length);
  assert.ok(more[0].candidates.every(({ type }) => type === "accomplishment"));
  assert.throws(
    () => retrieveEvidenceCandidates(inventory, requirements, -1),
    RangeError,
  );
});
