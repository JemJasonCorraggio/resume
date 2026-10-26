import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_CANDIDATES_PER_REQUIREMENT } from "../src/config.js";
import { matchRequirementsToEvidence } from "../src/evidence-matching.js";
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

test("selected employment records expand to matchable canonical accomplishments", async () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer",
    accomplishment_ids: ["ACC-001", "ACC-002"],
  };
  const accomplishments = [
    { id: "ACC-001", employer_id: "EMP-TEST", title: "Improved deployment safety" },
    { id: "ACC-002", employer_id: "EMP-TEST", title: "Reduced service latency" },
  ];
  const testInventory = { employment_history: [employment], accomplishments };
  const [result] = retrieveEvidenceCandidates(testInventory, [
    requirement("req_platform", "Platform engineer", "experience", ["platform"]),
  ]);

  assert.deepEqual(result.candidates, [
    { type: "employment", record: employment },
    ...accomplishments.map((record) => ({ type: "accomplishment", record })),
  ]);

  const [match] = await matchRequirementsToEvidence(
    {
      run: async () => ({
        response: JSON.stringify({
          matches: [{
            requirementId: "req_platform",
            matchStrength: "strong",
            evidenceRecordIds: ["ACC-001"],
            rationale: "The supplied accomplishment supports this requirement.",
            gap: null,
          }],
        }),
      }),
    },
    [requirement("req_platform", "Platform engineer", "experience", ["platform"])],
    [result],
    2048,
  );
  assert.deepEqual(match.evidenceRecordIds, ["ACC-001"]);
});

test("employment with no associated accomplishments does not expand", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer",
    accomplishment_ids: [],
  };
  const [result] = retrieveEvidenceCandidates(
    { employment_history: [employment], accomplishments: [] },
    [requirement("req_platform", "Platform engineer", "experience", ["platform"])],
  );

  assert.deepEqual(result.candidates, [{ type: "employment", record: employment }]);
});

test("expansion does not duplicate an independently retrieved accomplishment", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer",
    accomplishment_ids: ["ACC-001"],
  };
  const accomplishment = {
    id: "ACC-001",
    employer_id: "EMP-TEST",
    title: "Platform engineer improved deployment safety",
  };
  const [result] = retrieveEvidenceCandidates(
    { employment_history: [employment], accomplishments: [accomplishment] },
    [requirement("req_platform", "Platform engineer", "experience", ["platform"])],
  );

  assert.equal(
    result.candidates.filter(({ record }) => record.id === "ACC-001").length,
    1,
  );
  assert.ok(result.candidates.some(({ type, record }) => (
    type === "accomplishment" && record === accomplishment
  )));
});

test("unselected employment does not add accomplishments beyond independent retrieval", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer",
    accomplishment_ids: ["ACC-RELATED"],
  };
  const independentlyMatching = {
    id: "ACC-MATCH",
    employer_id: "EMP-OTHER",
    title: "Kafka consumers",
  };
  const related = {
    id: "ACC-RELATED",
    employer_id: "EMP-TEST",
    title: "Improved deployment safety",
  };
  const [result] = retrieveEvidenceCandidates(
    {
      employment_history: [employment],
      accomplishments: [independentlyMatching, related],
    },
    [requirement("req_kafka", "Build Kafka consumers", "skill", ["Kafka"])],
  );

  assert.deepEqual(result.candidates, [
    { type: "accomplishment", record: independentlyMatching },
  ]);
});

test("related accomplishments are appended even when retrieval reaches its candidate limit", () => {
  const employment = {
    id: "EMP-TEST",
    job_title: "Platform engineer delivery",
    accomplishment_ids: ["ACC-RELATED"],
  };
  const independentlyMatching = Array.from({ length: MAX_CANDIDATES_PER_REQUIREMENT - 1 }, (_, index) => ({
    id: `ACC-MATCH-${index}`,
    employer_id: "EMP-OTHER",
    title: "Platform delivery",
  }));
  const related = {
    id: "ACC-RELATED",
    employer_id: "EMP-TEST",
    title: "Improved deployment safety",
  };
  const [result] = retrieveEvidenceCandidates(
    {
      employment_history: [employment],
      accomplishments: [...independentlyMatching, related],
    },
    [requirement("req_platform", "Platform engineer delivery", "experience", ["platform"])],
  );

  assert.equal(
    result.candidates.filter(({ record }) => record.id !== "ACC-RELATED").length,
    MAX_CANDIDATES_PER_REQUIREMENT,
  );
  assert.ok(result.candidates.some(({ type, record }) => (
    type === "accomplishment" && record === related
  )));
});

test("evidence retrieval is deterministic and enforces the configurable candidate limit", () => {
  const requirements = [
    requirement("req_001", "Software engineering leadership experience", "experience", ["engineering"]),
  ];
  const first = retrieveEvidenceCandidates(inventory, requirements);
  const second = retrieveEvidenceCandidates(inventory, requirements);

  assert.deepEqual(first, second);
  assert.equal(MAX_CANDIDATES_PER_REQUIREMENT, 5);
  assert.ok(first[0].candidates.length >= MAX_CANDIDATES_PER_REQUIREMENT);
  const expanded = retrieveEvidenceCandidates(inventory, requirements, 100);
  assert.ok(expanded[0].candidates.length > MAX_CANDIDATES_PER_REQUIREMENT);
  assert.ok(expanded[0].candidates.length > first[0].candidates.length);
  assert.throws(
    () => retrieveEvidenceCandidates(inventory, requirements, -1),
    RangeError,
  );
});
