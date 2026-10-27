export const SMOKE_TEST_RESPONSE = "Workers AI is ready.";

export const FREE_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const JSON_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const PROMPT = `Reply with exactly "${SMOKE_TEST_RESPONSE}" and no other text.`;

export async function runThroughAIGateway(ai, model, input, gatewayId, operation) {
  if (typeof gatewayId !== "string" || !gatewayId.trim()) {
    throw new Error("AI_GATEWAY_ID must be configured");
  }

  const gatewayOptions = {
    gateway: {
      id: gatewayId,
      collectLog: true,
      metadata: {
        application: "career-inventory-api",
        operation,
      },
    },
    extraHeaders: {
      "cf-aig-collect-log-payload": "false",
    },
  };

  try {
    const result = await ai.run(model, input, gatewayOptions);
    console.info("AI Gateway request completed", {
      operation,
      aiGatewayLogId: ai.aiGatewayLogId ?? null,
    });
    return result;
  } catch (error) {
    console.error("AI Gateway request failed", {
      operation,
      aiGatewayLogId: ai.aiGatewayLogId ?? null,
      errorName: error instanceof Error ? error.name : "Unknown error",
    });
    throw error;
  }
}

export async function runSmokeTest(ai, maxTokens, gatewayId) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("Workers AI binding is unavailable");
  }
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    throw new Error("AI_MAX_TOKENS must be a positive integer");
  }

  const result = await runThroughAIGateway(
    ai,
    FREE_TEXT_MODEL,
    {
      prompt: PROMPT,
      max_tokens: maxTokens,
      temperature: 0,
      seed: 1,
    },
    gatewayId,
    "smoke-test",
  );

  if (!result || typeof result !== "object" || typeof result.response !== "string") {
    throw new Error("Workers AI returned an invalid response: " + result);
  }

  const response = result.response.trim();
  if (response !== SMOKE_TEST_RESPONSE) {
    throw new Error("Workers AI returned incomplete or unexpected output");
  }

  return response;
}
