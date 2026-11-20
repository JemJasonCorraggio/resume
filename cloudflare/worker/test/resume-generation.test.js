import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AIOutputInvalidError,
  AIServiceError,
} from "../src/job-analysis.js";
import {
  generateTailoredResumeContent,
  StaleEvidenceError,
  validateEvidenceReferences,
} from "../src/resume-generation.js";

const inventory = JSON.parse(readFileSync(new URL("../../../data/master-career-inventory.json", import.meta.url), "utf8"));
const job = {
  jobId: "job-1",
  jobDescription: "Build and maintain backend APIs.",
  roleTitle: "Backend Engineer",
  requirements: [{ id: "req_001", description: "Build backend APIs", category: "responsibility", importance: "high", keywords: ["API"] }],
  evidenceMatches: [{ requirementId: "req_001", matchStrength: "strong", evidenceRecordIds: ["ACC-001"], rationale: "API evidence", gap: null }],
};

function aiReturning(content) {
  return { run: async () => ({ response: { generatedContent: content } }) };
}

function validContent() {
  return {
    title: "Backend Engineer",
    summary: { text: "Backend engineer experienced in API delivery.", sourceRecordIds: ["ACC-001"] },
    skillsCategories: [{ name: "Engineering", skills: [{ name: "Go", sourceRecordIds: ["SK-004"] }] }],
    experience: inventory.employment_history.map((employment, index) => ({
      employmentRecordId: employment.id,
      bullets: (employment.accomplishment_ids ?? []).slice(0, index === 0 ? 4 : 2).map((id) => ({ text: `Supported ${id} contribution.`, sourceRecordIds: [id] })),
    })),
  };
}

test("resume generation returns a complete validated draft", async () => {
  const draft = await generateTailoredResumeContent({ ai: aiReturning(validContent()), job, inventory, maxTokens: 2048, gatewayId: "default", draftId: "draft-1", createdAt: "2026-10-27T16:00:00Z" });
  assert.equal(draft.draftId, "draft-1");
  assert.equal(draft.jobId, "job-1");
  assert.equal(draft.inventoryRevision, inventory.inventory_revision_date);
  assert.deepEqual(draft.generatedContent.experience.map((entry) => entry.employmentRecordId), inventory.employment_history.map((entry) => entry.id));
  assert.deepEqual(draft.warnings.map((warning) => warning.employmentRecordId), []);
});

test("shortfalls produce structured warnings", async () => {
  const content = validContent();
  content.experience[1].bullets = [];
  const draft = await generateTailoredResumeContent({ ai: aiReturning(content), job, inventory, maxTokens: 2048, gatewayId: "default" });
  assert.deepEqual(draft.warnings.map((warning) => warning.employmentRecordId), ["EMP-002"]);
  assert.equal(draft.warnings[0].actualBulletCount, 0);
  assert.equal(draft.warnings[0].requiredMinimum, 2);
});

test("weak skill provenance is normalized and preserved with specific warnings", async () => {
  const content = validContent();
  content.skillsCategories[0].skills = [
    { name: "Unlisted skill", sourceRecordIds: [] },
    { name: "AI-assisted development", sourceRecordIds: ["LEAD-008", "LEAD-008"] },
    { name: "Unlisted leadership-supported skill", sourceRecordIds: ["LEAD-008"] },
    { name: "Java", sourceRecordIds: ["SK-004", "SK-004"] },
    { name: inventory.skills[0].name, sourceRecordIds: [] },
    { name: "Unlisted skill with stale evidence", sourceRecordIds: ["MISSING-001"] },
    { name: "Unlisted skill with unrelated record", sourceRecordIds: ["EMP-001"] },
  ];

  const draft = await generateTailoredResumeContent({
    ai: aiReturning(content),
    job,
    inventory,
    maxTokens: 2048,
    gatewayId: "default",
  });
  const [unlisted, leadershipSupported, unlistedLeadershipSupported, java, autoMatched, stale, unsupported] =
    draft.generatedContent.skillsCategories[0].skills;

  assert.deepEqual(unlisted.sourceRecordIds, []);
  assert.match(unlisted.provenanceWarning, /No matching evidence/);
  assert.deepEqual(leadershipSupported.sourceRecordIds, ["LEAD-008", "SK-037"]);
  assert.equal(leadershipSupported.provenanceWarning, undefined);
  assert.deepEqual(unlistedLeadershipSupported.sourceRecordIds, ["LEAD-008"]);
  assert.match(unlistedLeadershipSupported.provenanceWarning, /No exact canonical skill record matches/);
  assert.doesNotMatch(unlistedLeadershipSupported.provenanceWarning, /not recognized skill evidence types/);
  assert.deepEqual(java.sourceRecordIds, ["SK-004"]);
  assert.equal(java.provenanceWarning, undefined);
  assert.deepEqual(autoMatched.sourceRecordIds, [inventory.skills[0].id]);
  assert.equal(autoMatched.provenanceWarning, undefined);
  assert.deepEqual(stale.sourceRecordIds, ["MISSING-001"]);
  assert.match(stale.provenanceWarning, /not found in the inventory/);
  assert.deepEqual(unsupported.sourceRecordIds, ["EMP-001"]);
  assert.match(unsupported.provenanceWarning, /not recognized skill evidence types/);
});

test("ambiguous skill-name matching warns without selecting a canonical record", async () => {
  const ambiguousInventory = structuredClone(inventory);
  ambiguousInventory.skills.push({
    ...structuredClone(inventory.skills[0]),
    id: "SK-DUPLICATE",
  });
  const content = validContent();
  content.skillsCategories[0].skills = [{
    name: inventory.skills[0].name,
    sourceRecordIds: [],
  }];

  const draft = await generateTailoredResumeContent({
    ai: aiReturning(content),
    job,
    inventory: ambiguousInventory,
    maxTokens: 2048,
    gatewayId: "default",
  });
  const skill = draft.generatedContent.skillsCategories[0].skills[0];
  assert.deepEqual(skill.sourceRecordIds, []);
  assert.match(skill.provenanceWarning, /Multiple inventory skill records match/);
});

test("stale evidence references are rejected", () => {
  assert.throws(() => validateEvidenceReferences({ ...job, evidenceMatches: [{ evidenceRecordIds: ["ACC-999"] }] }, inventory), StaleEvidenceError);
});

test("invalid provenance and malformed AI output are rejected", async () => {
  const invalid = validContent();
  invalid.experience[0].bullets[0].sourceRecordIds = ["ACC-999"];
  await assert.rejects(generateTailoredResumeContent({ ai: aiReturning(invalid), job, inventory, maxTokens: 2048, gatewayId: "default" }), AIOutputInvalidError);
  const malformedSkill = validContent();
  malformedSkill.skillsCategories[0].skills[0].sourceRecordIds = [7];
  await assert.rejects(generateTailoredResumeContent({ ai: aiReturning(malformedSkill), job, inventory, maxTokens: 2048, gatewayId: "default" }), AIOutputInvalidError);
  await assert.rejects(generateTailoredResumeContent({ ai: { run: async () => ({ response: "{" }) }, job, inventory, maxTokens: 2048, gatewayId: "default" }), AIOutputInvalidError);
  await assert.rejects(generateTailoredResumeContent({ ai: null, job, inventory, maxTokens: 2048, gatewayId: "default" }), AIServiceError);
});
