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
  assert.deepEqual(draft.warnings.map((warning) => warning.employmentRecordId), ["EMP-005"]);
});

test("shortfalls produce structured warnings", async () => {
  const content = validContent();
  content.experience[1].bullets = [];
  const draft = await generateTailoredResumeContent({ ai: aiReturning(content), job, inventory, maxTokens: 2048, gatewayId: "default" });
  assert.deepEqual(draft.warnings.map((warning) => warning.employmentRecordId), ["EMP-002", "EMP-005"]);
  assert.equal(draft.warnings[0].actualBulletCount, 0);
  assert.equal(draft.warnings[0].requiredMinimum, 2);
});

test("stale evidence references are rejected", () => {
  assert.throws(() => validateEvidenceReferences({ ...job, evidenceMatches: [{ evidenceRecordIds: ["ACC-999"] }] }, inventory), StaleEvidenceError);
});

test("invalid provenance and malformed AI output are rejected", async () => {
  const invalid = validContent();
  invalid.experience[0].bullets[0].sourceRecordIds = ["ACC-999"];
  await assert.rejects(generateTailoredResumeContent({ ai: aiReturning(invalid), job, inventory, maxTokens: 2048, gatewayId: "default" }), AIOutputInvalidError);
  await assert.rejects(generateTailoredResumeContent({ ai: { run: async () => ({ response: "{" }) }, job, inventory, maxTokens: 2048, gatewayId: "default" }), AIOutputInvalidError);
  await assert.rejects(generateTailoredResumeContent({ ai: null, job, inventory, maxTokens: 2048, gatewayId: "default" }), AIServiceError);
});
