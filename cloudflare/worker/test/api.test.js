import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.js";

const inventory = {
  schema_version: "invalid",
  accomplishments: [],
  employment_history: [],
  skills: [],
  projects: [],
  leadership_examples: [],
};

function envFor(response) {
  return {
    INVENTORY_ASSETS: {
      fetch: async () => response,
    },
  };
}

test("GET inventory returns loaded data and canonical validation results", async () => {
  const request = new Request("https://worker.example/api/inventory?refresh=1");
  const response = await handleRequest(
    request,
    envFor(Response.json(inventory)),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(body), ["loaded", "inventory", "validation"]);
  assert.equal(body.loaded, true);
  assert.deepEqual(body.inventory, inventory);
  assert.ok(body.validation.errors.some((error) => error.includes("inventory.career_preferences")));
});

test("inventory load failures use the standard API error response", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/inventory"),
    {
      INVENTORY_ASSETS: {
        fetch: async () => { throw new Error("asset unavailable"); },
      },
    },
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: {
      code: "INTERNAL_ERROR",
      message: "The inventory could not be loaded.",
    },
  });
});

test("unsupported routes and methods retain their HTTP status", async () => {
  const missing = await handleRequest(
    new Request("https://worker.example/other"),
    envFor(Response.json(inventory)),
  );
  const method = await handleRequest(
    new Request("https://worker.example/api/inventory", { method: "POST" }),
    envFor(Response.json(inventory)),
  );

  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    },
  });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
  assert.deepEqual(await method.json(), {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed.",
    },
  });
});
