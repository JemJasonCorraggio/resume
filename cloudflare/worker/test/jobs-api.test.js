import assert from "node:assert/strict";
import test from "node:test";
import { MAX_JOB_DESCRIPTION_LENGTH } from "../src/config.js";
import { handleRequest } from "../src/index.js";

const inventory = { inventory_revision_date: "2026-10-21" };
const extractableDescription = "Company: Example Company\nRole Title: Senior Backend Engineer";

function jobsRequest(body, headers = { "Content-Type": "application/json" }) {
  return new Request("https://worker.example/api/jobs", {
    method: "POST",
    headers,
    body,
  });
}

function envForInventory(fetch = async () => Response.json(inventory)) {
  let fetchCount = 0;
  return {
    get fetchCount() {
      return fetchCount;
    },
    env: {
      INVENTORY_ASSETS: {
        fetch: async (...args) => {
          fetchCount += 1;
          return fetch(...args);
        },
      },
      AI: {
        run: async () => {
          throw new Error("The placeholder must not invoke Workers AI");
        },
      },
    },
  };
}

async function responseBody(response) {
  return response.json();
}

test("POST jobs completes placeholder analysis with a generated response", async () => {
  const environment = envForInventory();
  const response = await handleRequest(
    jobsRequest(JSON.stringify({ jobDescription: extractableDescription })),
    environment.env,
  );
  const body = await responseBody(response);

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(body), [
    "jobId",
    "status",
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
  assert.equal(body.company, "Example Company");
  assert.equal(body.roleTitle, "Senior Backend Engineer");
  assert.equal(body.inventoryRevision, inventory.inventory_revision_date);
  assert.deepEqual(body.requirements, []);
  assert.deepEqual(body.evidenceMatches, []);
  assert.deepEqual(body.warnings, []);
  assert.ok(Number.isFinite(Date.parse(body.createdAt)));
  assert.match(body.createdAt, /Z$/);
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
  const environment = envForInventory();
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
