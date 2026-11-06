import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assembleResume,
  FixedResumeConfigError,
  ResumeEmploymentMatchError,
  validateFixedResumeConfig,
} from "../src/resume-assembly.js";

const inventory = JSON.parse(readFileSync(new URL("../../../data/master-career-inventory.json", import.meta.url), "utf8"));
const fixedConfig = JSON.parse(readFileSync(new URL("../../../data/fixed-resume-content.json", import.meta.url), "utf8"));

function generatedContent() {
  return {
    title: "Senior Backend Engineer",
    summary: {
      text: "Backend engineer with distributed systems experience.",
      sourceRecordIds: ["ACC-001"],
    },
    skillsCategories: [
      {
        name: "Engineering",
        skills: [{ name: "Go", sourceRecordIds: ["SK-004"] }],
      },
    ],
    experience: fixedConfig.resume.experience.map((entry, index) => ({
      employmentRecordId: entry.employmentRecordId,
      bullets: [{ text: `Contribution ${index + 1}`, sourceRecordIds: ["ACC-001"] }],
    })),
  };
}

function assemble(content = generatedContent()) {
  return assembleResume({
    fixedConfig,
    generatedContent: content,
    inventory,
    draftId: "draft-1",
    jobId: "job-1",
    inventoryRevision: inventory.inventory_revision_date,
    createdAt: "2026-11-06T00:00:00Z",
    warnings: [],
  });
}

test("assembles fixed and generated resume content without mutating inputs", () => {
  const generated = generatedContent();
  const fixedBefore = JSON.stringify(fixedConfig);
  const generatedBefore = JSON.stringify(generated);
  const draft = assemble(generated);
  const resume = draft.resume;

  assert.equal(resume.header.title, generated.title);
  assert.notEqual(resume.header.title, fixedConfig.resume.experience[0].title);
  assert.deepEqual(resume.header.name, fixedConfig.resume.header.name);
  assert.equal(resume.summary.text, generated.summary.text);
  assert.deepEqual(resume.summary.sourceRecordIds, generated.summary.sourceRecordIds);
  assert.equal(resume.summary.CUSMANote, fixedConfig.resume.summary.CUSMANote);
  assert.equal(resume.skillsAndLanguages.skillsCategories.at(-1).name, "Languages");
  assert.equal(resume.skillsAndLanguages.skillsCategories.filter((category) => category.name === "Languages").length, 1);
  assert.equal(resume.skillsAndLanguages.FMPNote, fixedConfig.resume.skillsAndLanguages.FMPNote);
  assert.deepEqual(resume.experience.map((entry) => entry.employmentRecordId), fixedConfig.resume.experience.map((entry) => entry.employmentRecordId));
  assert.deepEqual(resume.education, fixedConfig.resume.education);
  assert.equal(JSON.stringify(fixedConfig), fixedBefore);
  assert.equal(JSON.stringify(generated), generatedBefore);
});

test("rejects malformed fixed configuration and invalid employment references", () => {
  assert.throws(() => validateFixedResumeConfig({}, inventory), FixedResumeConfigError);

  const duplicateLanguages = structuredClone(fixedConfig);
  duplicateLanguages.resume.skillsAndLanguages.fixedSkillsCategories.push(
    structuredClone(duplicateLanguages.resume.skillsAndLanguages.fixedSkillsCategories[0]),
  );
  assert.throws(() => validateFixedResumeConfig(duplicateLanguages, inventory), FixedResumeConfigError);

  const unknownEmployment = structuredClone(fixedConfig);
  unknownEmployment.resume.experience[0].employmentRecordId = "EMP-999";
  assert.throws(() => validateFixedResumeConfig(unknownEmployment, inventory), FixedResumeConfigError);

  const unexpectedField = structuredClone(fixedConfig);
  unexpectedField.resume.header.title = "Generated title";
  assert.throws(() => validateFixedResumeConfig(unexpectedField, inventory), FixedResumeConfigError);
});

test("rejects missing, duplicate, and unexpected generated employment entries", () => {
  const missing = generatedContent();
  missing.experience.pop();
  assert.throws(() => assemble(missing), ResumeEmploymentMatchError);

  const duplicate = generatedContent();
  duplicate.experience.push(structuredClone(duplicate.experience[0]));
  assert.throws(() => assemble(duplicate), ResumeEmploymentMatchError);

  const unexpected = generatedContent();
  unexpected.experience[0].employmentRecordId = "EMP-999";
  assert.throws(() => assemble(unexpected), ResumeEmploymentMatchError);
});

test("assembled resume captures a snapshot of fixed configuration values", () => {
  const draft = assemble();
  fixedConfig.resume.header.name = "Changed Name";
  assert.notEqual(draft.resume.header.name, "Changed Name");
  fixedConfig.resume.header.name = "Jason/Jem Corraggio";
});
