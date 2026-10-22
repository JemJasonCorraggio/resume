export const SMOKE_TEST_RESPONSE = "Workers AI is ready.";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const PROMPT = `Reply with exactly "${SMOKE_TEST_RESPONSE}" and no other text.`;

export async function runSmokeTest(ai, maxTokens) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("Workers AI binding is unavailable");
  }
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    throw new Error("AI_MAX_TOKENS must be a positive integer");
  }

  const result = await ai.run(MODEL, {
    prompt: PROMPT,
    max_tokens: maxTokens,
    temperature: 0,
    seed: 1,
  });

  if (!result || typeof result !== "object" || typeof result.response !== "string") {
    throw new Error("Workers AI returned an invalid response");
  }

  const response = result.response.trim();
  if (response !== SMOKE_TEST_RESPONSE) {
    throw new Error("Workers AI returned incomplete or unexpected output");
  }

  return response;
}
