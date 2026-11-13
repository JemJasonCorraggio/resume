import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleRequest } from "../src/index.js";
import { assembleResume } from "../src/resume-assembly.js";
import {
  getResumeDraft,
  getResumeDraftById,
  insertResumeDraft,
  validateEditedResume,
} from "../src/resume-drafts.js";

const inventory = JSON.parse(readFileSync(
  new URL("../../../data/master-career-inventory.json", import.meta.url),
  "utf8",
));
const fixedConfig = JSON.parse(readFileSync(
  new URL("../../../data/fixed-resume-content.json", import.meta.url),
  "utf8",
));

function makeDraft(draftId, createdAt = "2026-11-06T00:00:00Z") {
  return assembleResume({
    fixedConfig,
    inventory,
    draftId,
    jobId: "job-1",
    inventoryRevision: inventory.inventory_revision_date,
    createdAt,
    warnings: [{ type: "review", detail: "Keep visible" }],
    generatedContent: {
      title: "Platform Engineer",
      summary: { text: "Experienced platform engineer.", sourceRecordIds: ["ACC-001"] },
      skillsCategories: [{
        name: "Engineering",
        skills: [{ name: "Go", sourceRecordIds: ["SK-004"] }],
      }],
      experience: fixedConfig.resume.experience.map((entry, index) => ({
        employmentRecordId: entry.employmentRecordId,
        bullets: [{ text: `Delivered work ${index + 1}.`, sourceRecordIds: ["ACC-001"] }],
      })),
    },
  });
}

function createD1TestDouble() {
  const rows = new Map();
  const jobs = new Map();
  const calls = [];
  return {
    rows,
    jobs,
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async run() {
              if (/^\s*INSERT INTO resume_drafts/s.test(sql)) {
                if (rows.has(values[0])) throw new Error("duplicate draft ID");
                rows.set(values[0], {
                  job_id: values[1],
                  resume_json: values[2],
                  created_at: values[3],
                  version: 1,
                });
                return { meta: { changes: 1 } };
              }
              if (/^\s*UPDATE resume_drafts/s.test(sql)) {
                const row = rows.get(values[1]);
                if (!row || row.version !== values[2]) return { meta: { changes: 0 } };
                row.resume_json = values[0];
                row.version += 1;
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
            async first() {
              if (/FROM jobs/s.test(sql)) return jobs.get(values[0]) ?? null;
              if (/SELECT version/s.test(sql)) {
                const row = rows.get(values[0]);
                return row ? { version: row.version } : null;
              }
              if (/WHERE job_id = \?/s.test(sql)) {
                const match = [...rows.entries()]
                  .filter(([, row]) => row.job_id === values[0])
                  .sort((left, right) => right[1].created_at.localeCompare(left[1].created_at))[0];
                return match ? { resume_json: match[1].resume_json, version: match[1].version } : null;
              }
              if (/WHERE id = \?/s.test(sql)) {
                const row = rows.get(values[0]);
                return row ? { resume_json: row.resume_json, version: row.version } : null;
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  };
}

function putRequest(draftId, body) {
  return new Request(`https://worker.example/api/resume-drafts/${draftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function markLanguagesFixed(resume) {
  const category = resume.skillsAndLanguages.skillsCategories.find((entry) => entry.name === "Languages");
  category.categoryRole = "languages";
  for (const skill of category.skills) {
    if (!skill.manualAdded) skill.contentOrigin = "fixed";
  }
}

test("draft persistence stores independent snapshots and retrieves by draft ID", async () => {
  const db = createD1TestDouble();
  const first = makeDraft("draft-1", "2026-11-06T00:00:00Z");
  const second = makeDraft("draft-2", "2026-11-07T00:00:00Z");

  await insertResumeDraft(db, first);
  await insertResumeDraft(db, second);

  assert.deepEqual(await getResumeDraftById(db, first.draftId), { ...first, version: 1 });
  assert.deepEqual(await getResumeDraftById(db, second.draftId), { ...second, version: 1 });
  assert.equal((await getResumeDraft(db, "job-1")).draftId, second.draftId);
  assert.equal(db.rows.size, 2);
  assert.match(db.calls[0].sql, /^\s*INSERT INTO resume_drafts/s);
  assert.doesNotMatch(db.calls[0].sql, /ON CONFLICT/);
});

test("resume generation creates separate persisted drafts that reopen by draft ID", async () => {
  const db = createD1TestDouble();
  db.jobs.set("job-1", {
    id: "job-1",
    job_description: "Build reliable services.",
    company: "Example",
    role_title: "Platform Engineer",
    inventory_revision: inventory.inventory_revision_date,
    requirements_json: "[]",
    evidence_matches_json: "[]",
    warnings_json: "[]",
    status: "completed",
    created_at: "2026-11-06T00:00:00Z",
  });
  const employment = [...inventory.employment_history].sort((left, right) => {
    const leftDate = left.end_date && !/^present$/i.test(left.end_date) ? left.end_date : "9999-99";
    const rightDate = right.end_date && !/^present$/i.test(right.end_date) ? right.end_date : "9999-99";
    return rightDate.localeCompare(leftDate) || String(left.start_date).localeCompare(String(right.start_date));
  });
  const generated = {
    title: "Platform Engineer",
    summary: { text: "Experienced platform engineer.", sourceRecordIds: [inventory.accomplishments[0].id] },
    skillsCategories: [{
      name: "Engineering",
      skills: [{ name: inventory.skills[0].name, sourceRecordIds: [inventory.skills[0].id] }],
    }],
    experience: employment.map((record) => ({
      employmentRecordId: record.id,
      bullets: (record.accomplishment_ids ?? []).slice(0, 1).map((id) => ({
        text: "Delivered a documented contribution.",
        sourceRecordIds: [id],
      })),
    })),
  };
  const env = {
    DB: db,
    INVENTORY_ASSETS: {
      fetch: async (url) => Response.json(
        String(url).includes("fixed-resume-content") ? fixedConfig : inventory,
      ),
    },
    AI: { run: async () => ({ response: generated }) },
    AI_MAX_TOKENS: 2048,
    AI_GATEWAY_ID: "default",
  };

  const responses = [];
  for (let index = 0; index < 2; index += 1) {
    responses.push(await handleRequest(
      new Request("https://worker.example/api/jobs/job-1/generated-content", { method: "POST" }),
      env,
    ));
  }
  const first = await responses[0].json();
  const second = await responses[1].json();
  assert.equal(responses[0].status, 201);
  assert.equal(responses[1].status, 201);
  assert.notEqual(first.draftId, second.draftId);
  assert.deepEqual(await getResumeDraftById(db, first.draftId), first);
  assert.deepEqual(await getResumeDraftById(db, second.draftId), second);
  assert.equal(db.rows.size, 2);
});

test("draft validation permits manual additions and edits while preserving provenance and structure", () => {
  const draft = makeDraft("draft-1");
  const edited = structuredClone(draft.resume);
  edited.summary.text = "A manually adjusted summary.";
  edited.summary.manuallyEdited = true;
  edited.skillsAndLanguages.skillsCategories[0].skills.push({ name: "Rust", manualAdded: true });
  markLanguagesFixed(edited);
  edited.skillsAndLanguages.skillsCategories.at(-1).name = "Spoken languages";
  edited.experience[0].bullets.push({ text: "A new manual accomplishment.", manualAdded: true });
  edited.education.details = "Edited education details.";

  assert.equal(validateEditedResume(edited, draft.resume), edited);

  const missingProvenance = structuredClone(edited);
  delete missingProvenance.summary.sourceRecordIds;
  assert.throws(() => validateEditedResume(missingProvenance, draft.resume), /sourceRecordIds/);

  const fabricatedProvenance = structuredClone(edited);
  fabricatedProvenance.experience[0].bullets.at(-1).sourceRecordIds = ["ACC-999"];
  assert.throws(() => validateEditedResume(fabricatedProvenance, draft.resume), /manually added experience bullet cannot have generated provenance/);

  const reorderedEmployment = structuredClone(edited);
  [reorderedEmployment.experience[0], reorderedEmployment.experience[1]] =
    [reorderedEmployment.experience[1], reorderedEmployment.experience[0]];
  assert.throws(() => validateEditedResume(reorderedEmployment, draft.resume), /reordered or replaced/);

  const removedLanguages = structuredClone(edited);
  removedLanguages.skillsAndLanguages.skillsCategories.pop();
  assert.throws(() => validateEditedResume(removedLanguages, draft.resume), /Languages category/);

  const manualLanguage = structuredClone(edited);
  manualLanguage.skillsAndLanguages.skillsCategories.at(-1).skills.push({
    name: "German",
    manualAdded: true,
  });
  assert.doesNotThrow(() => validateEditedResume(manualLanguage, draft.resume));

  const fabricatedLanguage = structuredClone(edited);
  fabricatedLanguage.skillsAndLanguages.skillsCategories.at(-1).skills.push({
    name: "German",
    sourceRecordIds: ["ACC-001"],
  });
  assert.throws(() => validateEditedResume(fabricatedLanguage, draft.resume), /fixed content cannot have generated provenance/);
});

test("draft validation permits deleting generated skill categories while preserving Languages and remaining provenance", () => {
  const draft = makeDraft("draft-delete-categories");
  draft.resume.skillsAndLanguages.skillsCategories[0].skills.push({
    name: "Kubernetes",
    sourceRecordIds: ["SK-005"],
  });
  draft.resume.skillsAndLanguages.skillsCategories.splice(1, 0, {
    name: "Leadership",
    skills: [{ name: "Mentoring", sourceRecordIds: ["ACC-001"] }],
  });

  const deletedOne = structuredClone(draft.resume);
  markLanguagesFixed(deletedOne);
  deletedOne.skillsAndLanguages.skillsCategories.splice(1, 1);
  assert.equal(validateEditedResume(deletedOne, draft.resume), deletedOne);
  assert.equal(deletedOne.skillsAndLanguages.skillsCategories[0].name, "Engineering");
  assert.deepEqual(deletedOne.skillsAndLanguages.skillsCategories[0].skills[1].sourceRecordIds, ["SK-005"]);

  const deletedAllEditable = structuredClone(draft.resume);
  markLanguagesFixed(deletedAllEditable);
  deletedAllEditable.skillsAndLanguages.skillsCategories =
    deletedAllEditable.skillsAndLanguages.skillsCategories.filter((category) => category.categoryRole === "languages");
  assert.equal(validateEditedResume(deletedAllEditable, draft.resume), deletedAllEditable);
  assert.deepEqual(
    deletedAllEditable.skillsAndLanguages.skillsCategories.map((category) => category.name),
    ["Languages"],
  );
  assert.equal(deletedAllEditable.skillsAndLanguages.FMPNote, draft.resume.skillsAndLanguages.FMPNote);
});

test("GET and PUT update only the addressed draft, preserve metadata, and enforce versions", async () => {
  const db = createD1TestDouble();
  const draft = makeDraft("draft-1");
  const otherDraft = makeDraft("draft-2");
  await insertResumeDraft(db, draft);
  await insertResumeDraft(db, otherDraft);
  const env = { DB: db };

  const fetched = await handleRequest(
    new Request("https://worker.example/api/resume-drafts/draft-1"),
    env,
  );
  assert.equal(fetched.status, 200);
  const loaded = await fetched.json();
  assert.equal(loaded.version, 1);
  assert.deepEqual(loaded.resume, draft.resume);

  const edited = structuredClone(loaded.resume);
  markLanguagesFixed(edited);
  edited.header.name = "Edited name";
  edited.summary.text = "Updated summary.";
  edited.summary.manuallyEdited = true;
  edited.skillsAndLanguages.skillsCategories[0].skills[0].name = "Edited skill";
  edited.skillsAndLanguages.skillsCategories[0].skills[0].manuallyEdited = true;
  const savedResponse = await handleRequest(
    putRequest("draft-1", { resume: edited, version: loaded.version }),
    env,
  );
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.version, 2);
  assert.equal(saved.draftId, draft.draftId);
  assert.equal(saved.jobId, draft.jobId);
  assert.equal(saved.inventoryRevision, draft.inventoryRevision);
  assert.equal(saved.createdAt, draft.createdAt);
  assert.deepEqual(saved.warnings, draft.warnings);
  assert.equal(saved.resume.summary.sourceRecordIds[0], draft.resume.summary.sourceRecordIds[0]);
  assert.equal((await getResumeDraftById(db, otherDraft.draftId)).resume.header.name, otherDraft.resume.header.name);

  const staleResume = structuredClone(loaded.resume);
  staleResume.summary.text = "Stale edit.";
  staleResume.summary.manuallyEdited = true;
  const conflict = await handleRequest(
    putRequest("draft-1", { resume: staleResume, version: loaded.version }),
    env,
  );
  assert.equal(conflict.status, 409);
  assert.equal((await getResumeDraftById(db, draft.draftId)).resume.summary.text, "Updated summary.");

  const notFound = await handleRequest(
    new Request("https://worker.example/api/resume-drafts/missing"),
    env,
  );
  assert.equal(notFound.status, 404);
});

test("PUT persists deleted skill categories and reopening the draft retains the deletion", async () => {
  const db = createD1TestDouble();
  const draft = makeDraft("draft-delete-category");
  draft.resume.skillsAndLanguages.skillsCategories.splice(1, 0, {
    name: "Leadership",
    skills: [{ name: "Mentoring", sourceRecordIds: ["ACC-001"] }],
  });
  await insertResumeDraft(db, draft);

  const edited = structuredClone(draft.resume);
  markLanguagesFixed(edited);
  edited.skillsAndLanguages.skillsCategories.splice(0, 1);
  const response = await handleRequest(
    putRequest(draft.draftId, { resume: edited, version: 1 }),
    { DB: db },
  );

  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(
    saved.resume.skillsAndLanguages.skillsCategories.map((category) => category.name),
    ["Leadership", "Languages"],
  );
  assert.equal(saved.draftId, draft.draftId);
  assert.equal(saved.jobId, draft.jobId);
  assert.equal(saved.createdAt, draft.createdAt);
  assert.equal(saved.inventoryRevision, draft.inventoryRevision);
  const reopened = await getResumeDraftById(db, draft.draftId);
  assert.deepEqual(reopened.resume, saved.resume);
});

test("draft update rejects malformed structures, immutable metadata changes, and unsafe links", async () => {
  const db = createD1TestDouble();
  const draft = makeDraft("draft-1");
  await insertResumeDraft(db, draft);
  const env = { DB: db };

  const invalid = structuredClone(draft.resume);
  invalid.header.links[0].href = "javascript:alert(1)";
  const invalidResponse = await handleRequest(
    putRequest(draft.draftId, { resume: invalid, version: 1 }),
    env,
  );
  assert.equal(invalidResponse.status, 400);

  const badBody = await handleRequest(
    putRequest(draft.draftId, { ...draft, resume: draft.resume, version: 1 }),
    env,
  );
  assert.equal(badBody.status, 400);
  assert.deepEqual((await getResumeDraftById(db, draft.draftId)).resume, draft.resume);
});
