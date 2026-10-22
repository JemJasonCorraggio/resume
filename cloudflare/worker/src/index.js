import { auditInventory } from "./validation.js";
import { runSmokeTest } from "./ai.js";
import { MAX_JOB_DESCRIPTION_LENGTH } from "./config.js";
import {
  AIOutputInvalidError,
  AIServiceError,
  extractJobAnalysis,
  JobDetailsMissingError,
} from "./job-analysis.js";

const inventoryAssetUrl = "https://inventory/master-career-inventory.json";

function jsonResponse(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function errorResponse(status, code, message, headers = {}) {
  return jsonResponse({ error: { code, message } }, status, headers);
}

function countUnicodeCharacters(value) {
  let count = 0;
  for (const character of value) {
    count += 1;
    if (count > MAX_JOB_DESCRIPTION_LENGTH) return count;
  }
  return count;
}

async function loadInventory(env) {
  const asset = await env.INVENTORY_ASSETS.fetch(inventoryAssetUrl);
  if (!asset.ok) throw new Error(`Inventory asset request returned HTTP ${asset.status}`);

  const inventory = await asset.json();
  return inventory;
}

async function handleCreateJob(request, env) {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse(400, "INVALID_REQUEST", "Content-Type must be application/json.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Request body must contain valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }

  const { jobDescription } = body;
  if (typeof jobDescription !== "string") {
    return errorResponse(400, "INVALID_REQUEST", "jobDescription must be a string.");
  }
  if (!jobDescription.trim()) {
    return errorResponse(400, "INVALID_REQUEST", "jobDescription is required.");
  }
  if (countUnicodeCharacters(jobDescription) > MAX_JOB_DESCRIPTION_LENGTH) {
    return errorResponse(
      413,
      "REQUEST_TOO_LARGE",
      `jobDescription must not exceed ${MAX_JOB_DESCRIPTION_LENGTH} characters.`,
    );
  }

  let analysis;
  try {
    analysis = await extractJobAnalysis(env.AI, jobDescription, env.AI_MAX_TOKENS);
  } catch (error) {
    if (error instanceof JobDetailsMissingError) {
      return errorResponse(422, "JOB_DETAILS_NOT_FOUND", error.message);
    }
    if (error instanceof AIOutputInvalidError) {
      console.error(error.message)
      return errorResponse(502, "AI_OUTPUT_INVALID", "Workers AI returned unusable analysis.");
    }
    if (error instanceof AIServiceError) {
      console.error("Job analysis AI service failed.");
      return errorResponse(502, "AI_SERVICE_ERROR", "The job analysis could not be completed.");
    }
    console.error("Job analysis failed:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }

  let inventory;
  try {
    inventory = await loadInventory(env);
  } catch (error) {
    console.error("Could not load career inventory:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }
  if (
    !inventory ||
    typeof inventory !== "object" ||
    typeof inventory.inventory_revision_date !== "string" ||
    !inventory.inventory_revision_date
  ) {
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }

  return jsonResponse(
    {
      jobId: crypto.randomUUID(),
      status: "completed",
      company: analysis.company,
      roleTitle: analysis.roleTitle,
      inventoryRevision: inventory.inventory_revision_date,
      requirements: analysis.requirements,
      evidenceMatches: [],
      warnings: [],
      createdAt: new Date().toISOString(),
    },
    201,
  );
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/jobs") {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "POST" });
    }
    return handleCreateJob(request, env);
  }

  if (url.pathname === "/api/ai/smoke-test") {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "POST" });
    }

    try {
      const response = await runSmokeTest(env.AI, env.AI_MAX_TOKENS);
      return jsonResponse({ ok: true, response });
    } catch {
      console.error("Workers AI smoke test failed.");
      return errorResponse(502, "AI_SERVICE_ERROR", "The AI smoke test could not be completed.");
    }
  }

  if (url.pathname !== "/api/inventory") {
    return errorResponse(404, "NOT_FOUND", "The requested resource was not found.");
  }
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "GET" });
  }

  let inventory;
  try {
    inventory = await loadInventory(env);
  } catch {
    console.error("Could not load bundled career inventory.");
    return errorResponse(500, "INTERNAL_ERROR", "The inventory could not be loaded.");
  }

  return jsonResponse({
    loaded: true,
    inventory,
    validation: auditInventory(inventory),
  });
}

export default {
  fetch: handleRequest,
};
