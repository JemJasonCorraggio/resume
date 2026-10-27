import { auditInventory, validateInventory } from "./validation.js";
import { runSmokeTest } from "./ai.js";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_REQUIREMENTS_PER_JOB,
} from "./config.js";
import { matchRequirementsToEvidence } from "./evidence-matching.js";
import { retrieveEvidenceCandidates } from "./evidence-retrieval.js";
import { getJob, insertJob } from "./jobs.js";
import {
  AIOutputInvalidError,
  AIServiceError,
  extractJobAnalysis,
  limitRequirements,
} from "./job-analysis.js";
import {
  generateTailoredResumeContent,
  StaleEvidenceError,
} from "./resume-generation.js";

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

  const { company, title, jobDescription } = body;
  if (typeof company !== "string" || !company.trim()) {
    return errorResponse(400, "INVALID_REQUEST", "company is required.");
  }
  if (countUnicodeCharacters(company.trim()) > 200) {
    return errorResponse(400, "INVALID_REQUEST", "company must not exceed 200 characters.");
  }
  if (typeof title !== "string" || !title.trim()) {
    return errorResponse(400, "INVALID_REQUEST", "title is required.");
  }
  if (countUnicodeCharacters(title.trim()) > 200) {
    return errorResponse(400, "INVALID_REQUEST", "title must not exceed 200 characters.");
  }
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

  const normalizedCompany = company.trim();
  const normalizedRoleTitle = title.trim();
  let extractedRequirements;
  try {
    ({ requirements: extractedRequirements } = await extractJobAnalysis(
      env.AI,
      jobDescription,
      env.AI_MAX_TOKENS,
      env.AI_GATEWAY_ID,
    ));
  } catch (error) {
    if (error instanceof AIOutputInvalidError) {
      console.error(error.message)
      return errorResponse(502, "AI_OUTPUT_INVALID", "Workers AI returned unusable analysis.");
    }
    if (error instanceof AIServiceError) {
      console.error("Job analysis AI service failed:", error);
      return errorResponse(502, "AI_SERVICE_ERROR", "The job analysis could not be completed.");
    }
    console.error("Job analysis failed:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }
  let selection;
  try {
    selection = limitRequirements(
      extractedRequirements,
      env.MAX_REQUIREMENTS_PER_JOB ?? MAX_REQUIREMENTS_PER_JOB,
    );
  } catch (error) {
    console.error("Invalid maximum requirements configuration:", error instanceof Error ? error.message : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }
  const { requirements, warning } = selection;

  let inventory;
  try {
    inventory = await loadInventory(env);
    const validationErrors = validateInventory(inventory);
    if (validationErrors.length) {
      throw new Error("Bundled career inventory failed schema validation");
    }
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

  const candidateGroups = retrieveEvidenceCandidates(inventory, requirements);
  let evidenceMatches;
  try {
    evidenceMatches = await matchRequirementsToEvidence(
      env.AI,
      requirements,
      candidateGroups,
      env.AI_MAX_TOKENS,
      env.AI_GATEWAY_ID,
    );
  } catch (error) {
    if (error instanceof AIOutputInvalidError) {
      console.error(error.message);
      return errorResponse(502, "AI_OUTPUT_INVALID", "Workers AI returned unusable evidence matches.");
    }
    if (error instanceof AIServiceError) {
      console.error("Evidence matching AI service failed.");
      return errorResponse(502, "AI_SERVICE_ERROR", "The job analysis could not be completed.");
    }
    console.error("Evidence matching failed:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }

  const completedJob = {
    jobId: crypto.randomUUID(),
    status: "completed",
    jobDescription,
    company: normalizedCompany,
    roleTitle: normalizedRoleTitle,
    inventoryRevision: inventory.inventory_revision_date,
    requirements,
    evidenceMatches,
    warnings: warning ? [warning] : [],
    createdAt: new Date().toISOString(),
  };

  try {
    await insertJob(env.DB, {
      id: completedJob.jobId,
      job_description: completedJob.jobDescription,
      company: completedJob.company,
      role_title: completedJob.roleTitle,
      inventory_revision: completedJob.inventoryRevision,
      requirements: completedJob.requirements,
      evidence_matches: completedJob.evidenceMatches,
      warnings: completedJob.warnings,
      status: completedJob.status,
      created_at: completedJob.createdAt,
    });
  } catch (error) {
    console.error("Could not persist completed job:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be completed.");
  }

  return jsonResponse(completedJob, 201);
}

async function handleGenerateResumeContent(jobId, env) {
  let job;
  try {
    job = await getJob(env.DB, jobId);
  } catch (error) {
    console.error("Could not retrieve job for resume generation:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The resume content could not be generated.");
  }
  if (!job) return errorResponse(404, "NOT_FOUND", "The requested job was not found.");

  let inventory;
  try {
    inventory = await loadInventory(env);
    const validationErrors = validateInventory(inventory);
    if (validationErrors.length) throw new Error("Bundled career inventory failed schema validation");
  } catch (error) {
    console.error("Could not load career inventory:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The resume content could not be generated.");
  }

  const analysis = {
    id: job.id,
    jobId: job.id,
    jobDescription: job.job_description,
    company: job.role_title ? job.company : undefined,
    roleTitle: job.role_title,
    requirements: job.requirements,
    evidenceMatches: job.evidence_matches,
  };
  try {
    const draft = await generateTailoredResumeContent({
      ai: env.AI,
      job: analysis,
      inventory,
      maxTokens: env.AI_MAX_TOKENS,
      gatewayId: env.AI_GATEWAY_ID,
    });
    return jsonResponse(draft, 201);
  } catch (error) {
    if (error instanceof StaleEvidenceError) {
      console.error("Resume generation found stale evidence:", error.message);
      return errorResponse(409, "STALE_EVIDENCE", error.message);
    }
    if (error instanceof AIOutputInvalidError) {
      console.error("Resume generation received unusable AI output");
      return errorResponse(502, "AI_OUTPUT_INVALID", "Workers AI returned unusable resume content.");
    }
    if (error instanceof AIServiceError) {
      console.error("Resume generation AI service failed");
      return errorResponse(502, "AI_SERVICE_ERROR", "The resume content could not be generated.");
    }
    console.error("Resume generation failed:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The resume content could not be generated.");
  }
}

async function handleGetJob(jobId, env) {
  let job;
  try {
    job = await getJob(env.DB, jobId);
  } catch (error) {
    console.error("Could not retrieve completed job:", error instanceof Error ? error.name : "Unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "The job analysis could not be retrieved.");
  }
  if (!job) {
    return errorResponse(404, "NOT_FOUND", "The requested job was not found.");
  }

  return jsonResponse({
    jobId: job.id,
    status: job.status,
    jobDescription: job.job_description,
    company: job.company,
    roleTitle: job.role_title,
    inventoryRevision: job.inventory_revision,
    requirements: job.requirements,
    evidenceMatches: job.evidence_matches,
    warnings: job.warnings,
    createdAt: job.created_at,
  });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/jobs") {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "POST" });
    }
    return handleCreateJob(request, env);
  }
  const resumeContentPathMatch = /^\/api\/jobs\/([^/]+)\/(resume-content|generated-content|resume-draft|tailored-resume-content)$/.exec(url.pathname);
  if (resumeContentPathMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "POST" });
    }
    let jobId;
    try {
      jobId = decodeURIComponent(resumeContentPathMatch[1]);
    } catch {
      return errorResponse(404, "NOT_FOUND", "The requested job was not found.");
    }
    return handleGenerateResumeContent(jobId, env);
  }
  const jobPathMatch = /^\/api\/jobs\/([^/]+)$/.exec(url.pathname);
  if (jobPathMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "GET" });
    }
    let jobId;
    try {
      jobId = decodeURIComponent(jobPathMatch[1]);
    } catch {
      return errorResponse(404, "NOT_FOUND", "The requested job was not found.");
    }
    return handleGetJob(jobId, env);
  }

  if (url.pathname === "/api/ai/smoke-test") {
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.", { Allow: "POST" });
    }

    try {
      const response = await runSmokeTest(
        env.AI,
        env.AI_MAX_TOKENS,
        env.AI_GATEWAY_ID,
      );
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
