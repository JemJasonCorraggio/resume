import assert from "node:assert/strict";
import test from "node:test";
import { getJob, insertJob } from "../src/jobs.js";

const job = {
  id: "job-1",
  job_description: "Build a web application.",
  company: null,
  role_title: "Software Engineer",
  inventory_revision: "2026-10-21",
  requirements: [
    { name: "JavaScript", evidence: { ids: ["SK-1"], confidence: 0.9 } },
  ],
  evidence_matches: {
    "SK-1": { supported: true, notes: ["Used in a previous project"] },
  },
  warnings: [{ code: "review", details: { fields: ["company"] } }],
  status: "completed",
  created_at: "2026-10-21T12:34:56.000Z",
};

function createD1TestDouble() {
  const rows = new Map();
  const calls = [];

  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async run() {
              assert.match(sql, /^\s*INSERT INTO jobs/s);
              rows.set(values[0], {
                id: values[0],
                job_description: values[1],
                company: values[2],
                role_title: values[3],
                inventory_revision: values[4],
                requirements_json: values[5],
                evidence_matches_json: values[6],
                warnings_json: values[7],
                status: values[8],
                created_at: values[9],
              });
            },
            async first() {
              assert.match(sql, /^\s*SELECT/s);
              assert.match(sql, /WHERE id = \?/);
              return rows.get(values[0]) ?? null;
            },
          };
        },
      };
    },
  };
}

test("jobs insert and retrieve structured JSON fields without loss", async () => {
  const db = createD1TestDouble();

  await insertJob(db, job);
  const result = await getJob(db, job.id);

  assert.deepEqual(result, job);
  assert.equal(db.calls.length, 2);
  assert.equal(db.calls[0].values[0], job.id);
  assert.match(db.calls[0].sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/);
  assert.deepEqual(JSON.parse(db.calls[0].values[5]), job.requirements);
  assert.deepEqual(JSON.parse(db.calls[0].values[6]), job.evidence_matches);
  assert.deepEqual(JSON.parse(db.calls[0].values[7]), job.warnings);
  assert.deepEqual(db.calls[1].values, [job.id]);
});

test("getJob returns null for a missing job", async () => {
  const db = createD1TestDouble();

  assert.equal(await getJob(db, "missing"), null);
});

test("insertJob rejects values that JSON.stringify would silently omit", async () => {
  const db = createD1TestDouble();

  await assert.rejects(
    insertJob(db, { ...job, requirements: undefined }),
    /requirements must be JSON serializable/,
  );
  assert.equal(db.calls.length, 0);
});
