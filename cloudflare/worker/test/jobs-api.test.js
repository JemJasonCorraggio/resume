import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_JOB_DESCRIPTION_LENGTH } from "../src/config.js";
import { handleRequest } from "../src/index.js";
import { retrieveEvidenceCandidates } from "../src/evidence-retrieval.js";

const inventory = JSON.parse(readFileSync(
  new URL("../../../data/master-career-inventory.json", import.meta.url),
  "utf8",
));
const extractableDescription = "Build and maintain backend APIs.";
const analysis = {
  requirements: [
    {
      description: "Build and maintain backend APIs",
      category: "responsibility",
      importance: "high",
      keywords: ["backend", "API"],
    },
  ],
};

function jobsRequest(body, headers = { "Content-Type": "application/json" }, addJobDetails = true) {
  let requestBody = body;
  try {
    const parsed = JSON.parse(body);
    if (
      addJobDetails &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "jobDescription" in parsed
    ) {
      requestBody = JSON.stringify({
        company: "Example Company",
        title: "Senior Backend Engineer",
        ...parsed,
      });
    }
  } catch {
    // Preserve malformed request bodies for validation tests.
  }
  return new Request("https://worker.example/api/jobs", {
    method: "POST",
    headers,
    body: requestBody,
  });
}

function createD1TestDouble() {
  const rows = new Map();
  const calls = [];
  const db = {
    rows,
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async run() {
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
              return rows.get(values[0]) ?? null;
            },
          };
        },
      };
    },
  };
  return db;
}

function envForInventory(fetch = async () => Response.json(inventory), aiRun) {
  let fetchCount = 0;
  let aiCount = 0;
  const db = createD1TestDouble();
  return {
    db,
    get fetchCount() {
      return fetchCount;
    },
    get aiCount() {
      return aiCount;
    },
    env: {
      INVENTORY_ASSETS: {
        fetch: async (...args) => {
          fetchCount += 1;
          return fetch(...args);
        },
      },
      AI: {
        run: async (model, options) => {
          aiCount += 1;
          if (aiRun) return aiRun(model, options);
          if (options.messages[0].content.includes("Assess whether the supplied candidate")) {
            const { requirements } = JSON.parse(options.messages[1].content);
            return {
              response: JSON.stringify({
                matches: requirements.map(({ requirement, candidates }) => ({
                  requirementId: requirement.id,
                  matchStrength: candidates.length ? "strong" : "none",
                  evidenceRecordIds: candidates.length ? [candidates[0].record.id] : [],
                  rationale: candidates.length
                    ? "A supplied record contains relevant experience."
                    : "No supplied candidate record supports this requirement.",
                  gap: candidates.length ? null : "No supporting evidence was retrieved.",
                })),
              }),
            };
          }
          return { response: JSON.stringify(analysis) };
        },
      },
      AI_MAX_TOKENS: 2048,
      DB: db,
    },
  };
}

async function responseBody(response) {
  return response.json();
}

test("POST jobs completes AI analysis with generated requirement IDs", async () => {
  const environment = envForInventory();
  const originalJobDescription = ` ${extractableDescription}\n `;
  const response = await handleRequest(
    jobsRequest(JSON.stringify({
      company: "Contoso",
      title: "Staff Platform Engineer",
      jobDescription: originalJobDescription,
    })),
    environment.env,
  );
  const body = await responseBody(response);

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(body), [
    "jobId",
    "status",
    "jobDescription",
    "company",
    "roleTitle",
    "inventoryRevision",
    "requirements",
    "evidenceMatches",
    "warnings",
    "createdAt",
  ]);
  assert.match(body.jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(body.status, "completed");
  assert.equal(body.jobDescription, originalJobDescription);
  assert.equal(body.company, "Contoso");
  assert.equal(body.roleTitle, "Staff Platform Engineer");
  assert.equal(body.inventoryRevision, inventory.inventory_revision_date);
  assert.deepEqual(body.requirements, [{
    ...analysis.requirements[0],
    id: "req_001",
  }]);
  const candidates = retrieveEvidenceCandidates(inventory, body.requirements);
  assert.deepEqual(body.evidenceMatches, [{
    requirementId: "req_001",
    matchStrength: "strong",
    evidenceRecordIds: [candidates[0].candidates[0].record.id],
    rationale: "A supplied record contains relevant experience.",
    gap: null,
  }]);
  assert.deepEqual(body.warnings, []);
  assert.ok(Number.isFinite(Date.parse(body.createdAt)));
  assert.match(body.createdAt, /Z$/);
  assert.equal(environment.aiCount, 2);
  assert.equal(environment.fetchCount, 1);
  assert.equal(environment.db.rows.size, 1);
  assert.match(environment.db.calls[0].sql, /^\s*INSERT INTO jobs/s);
});

test("GET jobs returns the persisted analysis with the POST response shape", async () => {
  const environment = envForInventory();
  const postResponse = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    environment.env,
  );
  const postBody = await responseBody(postResponse);

  const getResponse = await handleRequest(
    new Request(`https://worker.example/api/jobs/${postBody.jobId}`),
    environment.env,
  );

  assert.equal(getResponse.status, 200);
  assert.deepEqual(await responseBody(getResponse), postBody);
  assert.equal(environment.db.calls[1].values[0], postBody.jobId);
});

test("GET jobs returns the standard 404 response for an unknown ID", async () => {
  const environment = envForInventory();
  const response = await handleRequest(
    new Request("https://worker.example/api/jobs/not-found"),
    environment.env,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "NOT_FOUND",
      message: "The requested job was not found.",
    },
  });
  assert.deepEqual(environment.db.calls[0].values, ["not-found"]);
});

test("POST jobs matches and persists only priority-selected requirements", async () => {
  const extractedRequirements = Array.from({ length: 20 }, (_, index) => ({
    description: `Requirement ${index + 1}`,
    category: "skill",
    importance: index % 3 === 0 ? "low" : index % 3 === 1 ? "medium" : "high",
    keywords: [`keyword-${index + 1}`],
  }));
  let matchRequest;
  const environment = envForInventory(undefined, async (model, options) => {
    if (options.messages[0].content.includes("Assess whether the supplied candidate")) {
      matchRequest = JSON.parse(options.messages[1].content).requirements;
      return {
        response: JSON.stringify({
          matches: matchRequest.map(({ requirement }) => ({
            requirementId: requirement.id,
            matchStrength: "none",
            evidenceRecordIds: [],
            rationale: "No supplied accomplishment supports this requirement.",
            gap: "No supporting evidence was retrieved.",
          })),
        }),
      };
    }
    return { response: JSON.stringify({ requirements: extractedRequirements }) };
  });
  const response = await handleRequest(
    jobsRequest(JSON.stringify({
      company: "Example Company",
      title: "Engineer",
      jobDescription: "Original posting text",
    })),
    environment.env,
  );
  const body = await responseBody(response);
  const retained = body.requirements;
  const expectedRetained = extractedRequirements
    .map((requirement, index) => ({ ...requirement, index }))
    .sort((left, right) => (
      ({ high: 0, medium: 1, low: 2 })[left.importance] -
        ({ high: 0, medium: 1, low: 2 })[right.importance] ||
      left.index - right.index
    ))
    .slice(0, 15)
    .sort((left, right) => left.index - right.index)
    .map(({ index }) => `req_${String(index + 1).padStart(3, "0")}`);

  assert.equal(response.status, 201);
  assert.deepEqual(retained.map(({ id }) => id), expectedRetained);
  assert.equal(retained.length, 15);
  assert.deepEqual(matchRequest.map(({ requirement }) => requirement.id), expectedRetained);
  assert.equal(body.evidenceMatches.length, 15);
  assert.deepEqual(body.warnings, [
    "Requirements limited: 20 extracted, 15 retained, 5 omitted.",
  ]);
  const persistedJob = environment.db.rows.get(body.jobId);
  assert.deepEqual(JSON.parse(persistedJob.requirements_json), retained);
  assert.deepEqual(JSON.parse(persistedJob.evidence_matches_json), body.evidenceMatches);
  assert.deepEqual(JSON.parse(persistedJob.warnings_json), body.warnings);
  assert.equal(body.jobDescription, "Original posting text");
});

test("POST jobs does not report success when D1 persistence fails", async () => {
  const environment = envForInventory();
  environment.env.DB = {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              throw new Error("private database details");
            },
          };
        },
      };
    },
  };
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    environment.env,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "INTERNAL_ERROR",
      message: "The job analysis could not be completed.",
    },
  });
  assert.equal(environment.aiCount, 2);
});

test("POST jobs returns controlled 400 errors for malformed requests", async () => {
  const requests = [
    jobsRequest("{"),
    jobsRequest(JSON.stringify({})),
    jobsRequest(JSON.stringify({ title: "Engineer", jobDescription: "Build services." }), undefined, false),
    jobsRequest(JSON.stringify({ company: "Example", jobDescription: "Build services." }), undefined, false),
    jobsRequest(JSON.stringify({ company: " ", title: "Engineer", jobDescription: "Build services." })),
    jobsRequest(JSON.stringify({ company: "Example", title: " ", jobDescription: "Build services." })),
    jobsRequest(JSON.stringify({
      company: "c".repeat(201),
      title: "Engineer",
      jobDescription: "Build services.",
    })),
    jobsRequest(JSON.stringify({
      company: "Example",
      title: "t".repeat(201),
      jobDescription: "Build services.",
    })),
    jobsRequest(JSON.stringify({ company: "Example", title: "Engineer" })),
    jobsRequest(JSON.stringify({ company: "Example", title: "Engineer", jobDescription: "" })),
    jobsRequest(JSON.stringify({ jobDescription: "" })),
    jobsRequest(JSON.stringify({ jobDescription: "  \n " })),
    jobsRequest(JSON.stringify({ jobDescription: 42 })),
    jobsRequest(JSON.stringify({ jobDescription: null })),
    jobsRequest(JSON.stringify(["description"])),
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription }), {}),
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription }), {
      "Content-Type": "text/plain",
    }),
  ];

  for (const request of requests) {
    const response = await handleRequest(request, {});
    const body = await responseBody(response);

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(typeof body.error.code, "string");
    assert.equal(typeof body.error.message, "string");
    assert.doesNotMatch(JSON.stringify(body), /stack|Error:/);
  }
});

test("POST jobs rejects oversized descriptions before inventory retrieval", async () => {
  const environment = envForInventory();
  const response = await handleRequest(
    jobsRequest(JSON.stringify({
      jobDescription: `${extractableDescription}\n${"😀".repeat(MAX_JOB_DESCRIPTION_LENGTH)}`,
    })),
    environment.env,
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "REQUEST_TOO_LARGE",
      message: `jobDescription must not exceed ${MAX_JOB_DESCRIPTION_LENGTH} characters.`,
    },
  });
  assert.equal(environment.fetchCount, 0);
  assert.equal(environment.aiCount, 0);
});

test("POST jobs counts Unicode code points and accepts the configured limit", async () => {
  const prefix = `${extractableDescription}\n`;
  const paddingLength = MAX_JOB_DESCRIPTION_LENGTH - Array.from(prefix).length;
  const description = `${prefix}${"😀".repeat(paddingLength)}`;
  const environment = envForInventory();
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: description })),
    environment.env,
  );

  assert.equal(Array.from(description).length, MAX_JOB_DESCRIPTION_LENGTH);
  assert.equal(response.status, 201);
  assert.equal(environment.fetchCount, 1);
});

test("POST jobs returns controlled errors for unusable AI output and service failures", async () => {
  const invalidOutput = envForInventory(undefined, async () => ({ response: "not JSON" }));
  const invalidResponse = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    invalidOutput.env,
  );
  assert.equal(invalidResponse.status, 502);
  assert.deepEqual(await responseBody(invalidResponse), {
    error: {
      code: "AI_OUTPUT_INVALID",
      message: "Workers AI returned unusable analysis.",
    },
  });
  assert.equal(invalidOutput.fetchCount, 0);
  assert.equal(invalidOutput.db.rows.size, 0);

  const unavailableAI = envForInventory(undefined, async () => {
    throw new Error("private provider details");
  });
  const serviceResponse = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    unavailableAI.env,
  );
  assert.equal(serviceResponse.status, 502);
  assert.deepEqual(await responseBody(serviceResponse), {
    error: {
      code: "AI_SERVICE_ERROR",
      message: "The job analysis could not be completed.",
    },
  });
  assert.equal(unavailableAI.fetchCount, 0);
});

test("POST jobs hides inventory failures behind the standard error shape", async () => {
  const environment = envForInventory(async () => {
    throw new Error("private inventory details");
  });
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    environment.env,
  );
  const body = await responseBody(response);

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: {
      code: "INTERNAL_ERROR",
      message: "The job analysis could not be completed.",
    },
  });
  assert.doesNotMatch(JSON.stringify(body), /private inventory details/);
});

test("POST jobs rejects an inventory that fails schema validation", async () => {
  const environment = envForInventory(async () => Response.json({
    inventory_revision_date: "2026-10-21",
  }));
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    environment.env,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "INTERNAL_ERROR",
      message: "The job analysis could not be completed.",
    },
  });
});

test("POST jobs returns controlled errors for failed evidence matching", async () => {
  let calls = 0;
  const malformedMatch = envForInventory(undefined, async () => {
    calls += 1;
    if (calls === 1) return { response: JSON.stringify(analysis) };
    return { response: JSON.stringify({ matches: [] }) };
  });
  const invalidResponse = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    malformedMatch.env,
  );
  assert.equal(invalidResponse.status, 502);
  assert.deepEqual(await responseBody(invalidResponse), {
    error: {
      code: "AI_OUTPUT_INVALID",
      message: "Workers AI returned unusable evidence matches.",
    },
  });
  assert.equal(malformedMatch.fetchCount, 1);
  assert.equal(malformedMatch.db.rows.size, 0);

  calls = 0;
  const unavailableMatcher = envForInventory(undefined, async () => {
    calls += 1;
    if (calls === 1) return { response: JSON.stringify(analysis) };
    throw new Error("private provider details");
  });
  const serviceResponse = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    unavailableMatcher.env,
  );
  assert.equal(serviceResponse.status, 502);
  assert.deepEqual(await responseBody(serviceResponse), {
    error: {
      code: "AI_SERVICE_ERROR",
      message: "The job analysis could not be completed.",
    },
  });
  assert.equal(unavailableMatcher.fetchCount, 1);
  assert.equal(unavailableMatcher.db.rows.size, 0);
});

test("POST jobs rejects unsupported methods with a standard JSON error", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/jobs"),
    {},
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed.",
    },
  });
});
