import assert from "node:assert/strict";
import test from "node:test";
import { MAX_JOB_DESCRIPTION_LENGTH } from "../src/config.js";
import { handleRequest } from "../src/index.js";

const inventory = { inventory_revision_date: "2026-10-21" };
const extractableDescription = "Company: Example Company\nRole Title: Senior Backend Engineer";
const analysis = {
  company: "Example Company",
  roleTitle: "Senior Backend Engineer",
  requirements: [
    {
      description: "Build and maintain backend APIs",
      category: "responsibility",
      importance: "high",
      keywords: ["backend", "API"],
    },
  ],
};

function jobsRequest(body, headers = { "Content-Type": "application/json" }) {
  return new Request("https://worker.example/api/jobs", {
    method: "POST",
    headers,
    body,
  });
}

function envForInventory(fetch = async () => Response.json(inventory), aiRun) {
  let fetchCount = 0;
  let aiCount = 0;
  return {
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
        run: async (...args) => {
          aiCount += 1;
          if (aiRun) return aiRun(...args);
          return { response: JSON.stringify(analysis) };
        },
      },
      AI_MAX_TOKENS: 2048,
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
    jobsRequest(JSON.stringify({ jobDescription: originalJobDescription })),
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
  assert.equal(body.company, "Example Company");
  assert.equal(body.roleTitle, "Senior Backend Engineer");
  assert.equal(body.inventoryRevision, inventory.inventory_revision_date);
  assert.deepEqual(body.requirements, [{
    ...analysis.requirements[0],
    id: "req_001",
  }]);
  assert.deepEqual(body.evidenceMatches, []);
  assert.deepEqual(body.warnings, []);
  assert.ok(Number.isFinite(Date.parse(body.createdAt)));
  assert.match(body.createdAt, /Z$/);
  assert.equal(environment.aiCount, 1);
  assert.equal(environment.fetchCount, 1);
});

test("POST jobs returns controlled 400 errors for malformed requests", async () => {
  const requests = [
    jobsRequest("{"),
    jobsRequest(JSON.stringify({})),
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

test("POST jobs returns 422 when company or role title cannot be extracted", async () => {
  const environment = envForInventory(undefined, async () => ({
    response: JSON.stringify({ company: "", roleTitle: "", requirements: [] }),
  }));
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: "Build great software." })),
    environment.env,
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), {
    error: {
      code: "JOB_DETAILS_NOT_FOUND",
      message: "Could not identify the company and role title. Please amend the job description.",
    },
  });
  assert.equal(environment.fetchCount, 0);
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
