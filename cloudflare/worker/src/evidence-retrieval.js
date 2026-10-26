import { MAX_CANDIDATES_PER_REQUIREMENT } from "./config.js";

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

export function retrieveEvidenceCandidates(
  inventory,
  requirements,
  limit = MAX_CANDIDATES_PER_REQUIREMENT,
) {
  validateInputs(inventory, requirements, limit);

  const accomplishments = inventory.accomplishments;
  if (accomplishments !== undefined && !Array.isArray(accomplishments)) {
    throw new TypeError("inventory.accomplishments must be an array");
  }
  const records = (accomplishments || []).map((record) => ({
    type: "accomplishment",
    record,
  }));

  return requirements.map((requirement) => {
    const weights = requirementWeights(requirement);
    const candidates = records
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

    return { requirementId: requirement.id, candidates };
  });
}
