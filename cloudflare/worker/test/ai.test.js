import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.js";
import {
  FREE_TEXT_MODEL,
  SMOKE_TEST_RESPONSE,
  runSmokeTest,
  runThroughAIGateway,
} from "../src/ai.js";

const maxTokens = 2048;
const gatewayId = "default";

test("smoke test invokes Llama 3.3 with configured token limit", async () => {
  let invocation;
  const ai = {
    run: async (...args) => {
      invocation = args;
      return { response: SMOKE_TEST_RESPONSE };
    },
  };

  const response = await runSmokeTest(ai, maxTokens, gatewayId);

  assert.equal(response, SMOKE_TEST_RESPONSE);
  assert.equal(invocation[0], FREE_TEXT_MODEL);
  assert.equal(invocation[1].max_tokens, maxTokens);
  assert.match(invocation[1].prompt, /Workers AI is ready\./);
  assert.equal(invocation[1].temperature, 0);
  assert.deepEqual(invocation[2], {
    gateway: {
      id: gatewayId,
      collectLog: true,
      metadata: {
        application: "career-inventory-api",
        operation: "smoke-test",
      },
    },
    extraHeaders: {
      "cf-aig-collect-log-payload": "false",
    },
  });
});

test("smoke test rejects malformed and truncated model output", async () => {
  for (const result of [null, {}, { response: "" }, { response: "Workers AI is" }]) {
    await assert.rejects(
      runSmokeTest({ run: async () => result }, maxTokens, gatewayId),
    );
  }
});

test("smoke test validates its binding and configured token limit", async () => {
  await assert.rejects(runSmokeTest(undefined, maxTokens, gatewayId), /binding is unavailable/);
  await assert.rejects(runSmokeTest({ run: async () => ({}) }, 0, gatewayId), /AI_MAX_TOKENS/);
});

test("gateway invocation logs only its operation and log ID for success and failure", async () => {
  const infoLogs = [];
  const errorLogs = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => infoLogs.push(args);
  console.error = (...args) => errorLogs.push(args);

  try {
    await runThroughAIGateway(
      {
        aiGatewayLogId: "gateway-success-id",
        run: async () => ({ response: SMOKE_TEST_RESPONSE }),
      },
      FREE_TEXT_MODEL,
      { prompt: "must not appear in logs" },
      gatewayId,
      "smoke-test",
    );
    await assert.rejects(
      runThroughAIGateway(
        {
          aiGatewayLogId: "gateway-failure-id",
          run: async () => { throw new Error("provider details"); },
        },
        FREE_TEXT_MODEL,
        { prompt: "must not appear in logs" },
        gatewayId,
        "job-analysis",
      ),
      /provider details/,
    );
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.deepEqual(infoLogs[0][1], {
    operation: "smoke-test",
    aiGatewayLogId: "gateway-success-id",
  });
  assert.deepEqual(errorLogs[0][1], {
    operation: "job-analysis",
    aiGatewayLogId: "gateway-failure-id",
    errorName: "Error",
  });
  assert.doesNotMatch(JSON.stringify([...infoLogs, ...errorLogs]), /must not appear in logs|provider details/);
});

test("AI route returns a successful invocation result to application code", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/api/ai/smoke-test", { method: "POST" }),
    {
      AI: {
        run: async (model, options) => {
          assert.equal(model, FREE_TEXT_MODEL);
          assert.equal(options.max_tokens, maxTokens);
          return { response: SMOKE_TEST_RESPONSE };
        },
      },
      AI_MAX_TOKENS: maxTokens,
      AI_GATEWAY_ID: gatewayId,
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
      AI_GATEWAY_ID: gatewayId,
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
      AI_GATEWAY_ID: gatewayId,
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
