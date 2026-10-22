import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.js";
import { SMOKE_TEST_RESPONSE, runSmokeTest } from "../src/ai.js";

const maxTokens = 2048;

test("smoke test invokes Llama 3.3 with configured token limit", async () => {
  let invocation;
  const ai = {
    run: async (...args) => {
      invocation = args;
      return { response: SMOKE_TEST_RESPONSE };
    },
  };

  const response = await runSmokeTest(ai, maxTokens);

  assert.equal(response, SMOKE_TEST_RESPONSE);
  assert.equal(invocation[0], "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(invocation[1].max_tokens, maxTokens);
  assert.match(invocation[1].prompt, /Workers AI is ready\./);
  assert.equal(invocation[1].temperature, 0);
});

test("smoke test rejects malformed and truncated model output", async () => {
  for (const result of [null, {}, { response: "" }, { response: "Workers AI is" }]) {
    await assert.rejects(
      runSmokeTest({ run: async () => result }, maxTokens),
    );
  }
});

test("smoke test validates its binding and configured token limit", async () => {
  await assert.rejects(runSmokeTest(undefined, maxTokens), /binding is unavailable/);
  await assert.rejects(runSmokeTest({ run: async () => ({}) }, 0), /AI_MAX_TOKENS/);
});

test("AI route returns a successful invocation result to application code", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/ai/smoke-test", { method: "POST" }),
    {
      AI: {
        run: async (model, options) => {
          assert.equal(model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
          assert.equal(options.max_tokens, maxTokens);
          return { response: SMOKE_TEST_RESPONSE };
        },
      },
      AI_MAX_TOKENS: maxTokens,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    response: SMOKE_TEST_RESPONSE,
  });
});

test("AI route returns a generic controlled error when invocation fails", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/ai/smoke-test", { method: "POST" }),
    {
      AI: {
        run: async () => {
          throw new Error("provider details must not reach the browser");
        },
      },
      AI_MAX_TOKENS: maxTokens,
    },
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.deepEqual(body, {
    error: {
      code: "AI_SERVICE_ERROR",
      message: "The AI smoke test could not be completed.",
    },
  });
  assert.doesNotMatch(JSON.stringify(body), /provider details/);
});

test("AI route returns a controlled error for truncated model output", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/ai/smoke-test", { method: "POST" }),
    {
      AI: {
        run: async () => ({ response: "Workers AI is" }),
      },
      AI_MAX_TOKENS: maxTokens,
    },
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AI_SERVICE_ERROR",
      message: "The AI smoke test could not be completed.",
    },
  });
});

test("AI route rejects unsupported methods", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/ai/smoke-test"),
    {},
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});
