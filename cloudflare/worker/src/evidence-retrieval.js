import { MAX_CANDIDATES_PER_REQUIREMENT } from "./config.js";

const RECORD_TYPES = {
  employment_history: "employment",
  accomplishments: "accomplishment",
  skills: "skill",
  leadership_examples: "leadership",
  projects: "project",
  education_and_credentials: "education",
};

const TYPES_BY_CATEGORY = {
  skill: ["skill", "accomplishment", "project", "employment"],
  responsibility: ["accomplishment", "employment", "leadership", "project"],
  experience: ["employment", "accomplishment", "leadership", "project", "skill"],
  qualification: ["education", "skill", "accomplishment", "project", "employment"],
};

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is", "of",
  "on", "or", "the", "to", "with",
]);

function tokens(value) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function addWeightedTokens(weights, value, weight) {
  for (const token of tokens(value)) {
    if (!STOP_WORDS.has(token)) {
      weights.set(token, Math.max(weights.get(token) || 0, weight));
    }
  }
}

function collectRecordTokens(record) {
  const recordTokens = new Set();
  const visit = (value, key) => {
    if (typeof value === "string") {
      if (key !== "id") {
        for (const token of tokens(value)) recordTokens.add(token);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey);
      }
    }
  };

  visit(record);
  return recordTokens;
}

function requirementWeights(requirement) {
  const weights = new Map();
  addWeightedTokens(weights, requirement.description, 1);
  requirement.keywords.forEach((keyword) => addWeightedTokens(weights, keyword, 2));
  return weights;
}

function validateInputs(inventory, requirements, limit) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new TypeError("inventory must be an object");
  }
  if (!Array.isArray(requirements)) {
    throw new TypeError("requirements must be an array");
  }
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("candidate limit must be a non-negative integer");
  }
  for (const requirement of requirements) {
    if (
      !requirement ||
      typeof requirement.id !== "string" ||
      typeof requirement.description !== "string" ||
      !Array.isArray(requirement.keywords) ||
      requirement.keywords.some((keyword) => typeof keyword !== "string") ||
      !Object.hasOwn(TYPES_BY_CATEGORY, requirement.category)
    ) {
      throw new TypeError("requirements must be validated job-analysis requirements");
    }
  }
}

function expandEmploymentCandidates(candidates, accomplishments) {
  const accomplishmentsById = new Map(
    accomplishments.map((record) => [record.id, record]),
  );
  const candidateIds = new Set(candidates.map(({ record }) => record.id));
  const expanded = [...candidates];

  for (const { type, record } of candidates) {
    if (type !== "employment" || !Array.isArray(record.accomplishment_ids)) continue;

    for (const id of record.accomplishment_ids) {
      const accomplishment = accomplishmentsById.get(id);
      if (!accomplishment || candidateIds.has(accomplishment.id)) continue;

      expanded.push({ type: "accomplishment", record: accomplishment });
      candidateIds.add(accomplishment.id);
    }
  }

  return expanded;
}

export function retrieveEvidenceCandidates(
  inventory,
  requirements,
  limit = MAX_CANDIDATES_PER_REQUIREMENT,
) {
  validateInputs(inventory, requirements, limit);

  const records = Object.entries(RECORD_TYPES).flatMap(([collection, type]) => {
    const entries = inventory[collection];
    if (entries === undefined) return [];
    if (!Array.isArray(entries)) {
      throw new TypeError(`inventory.${collection} must be an array`);
    }
    return entries.map((record) => ({ type, record }));
  });

  return requirements.map((requirement) => {
    const weights = requirementWeights(requirement);
    const allowedTypes = new Set(TYPES_BY_CATEGORY[requirement.category]);
    const candidates = records
      .filter(({ type }) => allowedTypes.has(type))
      .map((candidate, order) => {
        const recordTokens = collectRecordTokens(candidate.record);
        let score = 0;
        for (const [token, weight] of weights) {
          if (recordTokens.has(token)) score += weight;
        }
        return { ...candidate, order, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.order - right.order)
      .slice(0, limit)
      .map(({ type, record }) => ({ type, record }));

    console.info("Available accomplishment IDs:", (inventory.accomplishments || []).map(({ id }) => id));

    const expandedCandidates = expandEmploymentCandidates(
      candidates,
      inventory.accomplishments || [],
    );

    return { requirementId: requirement.id, candidates: expandedCandidates };
  });
}
