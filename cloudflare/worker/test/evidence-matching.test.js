import assert from "node:assert/strict";
import test from "node:test";
import { JSON_MODEL } from "../src/ai.js";
import {
  AIOutputInvalidError,
  AIServiceError,
} from "../src/job-analysis.js";
import {
  MATCHING_SCHEMA,
  matchRequirementsToEvidence,
  normalizeEvidenceMatches,
} from "../src/evidence-matching.js";

const requirements = [
  {
    id: "req_001",
    description: "Own and build a public Go API",
    category: "responsibility",
    importance: "high",
    keywords: ["Go", "API"],
  },
  {
    id: "req_002",
    description: "Lead an engineering team",
    category: "experience",
    importance: "medium",
    keywords: ["leadership"],
  },
  {
    id: "req_003",
    description: "Operate a commercial aircraft",
    category: "qualification",
    importance: "high",
    keywords: ["pilot"],
  },
];

const candidateGroups = [
  {
    requirementId: "req_001",
    candidates: [{
      type: "accomplishment",
      record: {
        id: "ACC-001",
        my_contribution: "Owned and implemented a public Go API.",
        technical_details: "Go API implementation.",
      },
    }],
  },
  {
    requirementId: "req_002",
    candidates: [{
      type: "accomplishment",
      record: {
        id: "ACC-002",
        title: "Led a team of four engineers.",
      },
    }],
  },
  { requirementId: "req_003", candidates: [] },
];

const matches = [
  {
    requirementId: "req_001",
    matchStrength: "strong",
    evidenceRecordIds: ["ACC-001"],
    rationale: "The record documents ownership and implementation of a public Go API.",
    gap: null,
  },
  {
    requirementId: "req_002",
    matchStrength: "partial",
    evidenceRecordIds: ["ACC-002"],
    rationale: "The record documents team leadership but not the requested scope.",
    gap: "The record does not specify the duration of team leadership.",
  },
  {
    requirementId: "req_003",
    matchStrength: "none",
    evidenceRecordIds: [],
    rationale: "No supplied candidate record supports this qualification.",
    gap: "No aviation credentials or experience are documented.",
  },
];

function aiReturning(response, onCall = () => {}) {
  return {
    run: async (model, options) => {
      onCall(model, options);
      return { response: JSON.stringify(response) };
    },
  };
}

test("matching returns validated strong, partial, and none results", async () => {
  let invocation;
  const result = await matchRequirementsToEvidence(
    aiReturning({ matches }, (model, options) => {
      invocation = { model, options };
    }),
    requirements,
    candidateGroups,
    2048,
  );

  assert.deepEqual(result, matches);
  assert.equal(invocation.model, JSON_MODEL);
  assert.deepEqual(invocation.options.response_format, {
    type: "json_schema",
    json_schema: {
      name: "match_result",
      schema: MATCHING_SCHEMA,
      strict: true,
    },
  });
  assert.deepEqual(MATCHING_SCHEMA.required, ["matches"]);
  assert.deepEqual(MATCHING_SCHEMA.properties.matches.items.required, [
    "requirementId",
    "matchStrength",
    "evidenceRecordIds",
    "rationale",
    "gap",
  ]);
  assert.deepEqual(MATCHING_SCHEMA.properties.matches.items.properties.matchStrength.enum, [
    "strong",
    "partial",
    "none",
  ]);
  assert.deepEqual(MATCHING_SCHEMA.properties.matches.items.properties.gap.type, ["string", "null"]);
  assert.deepEqual(result[0].evidenceRecordIds, ["ACC-001"]);
  assert.equal(result[0].gap, null);
  assert.deepEqual(result[2].evidenceRecordIds, []);
  assert.equal(typeof result[2].gap, "string");
  assert.equal(invocation.options.max_tokens, 2048);
  assert.equal(invocation.options.temperature, 0);
  const input = JSON.parse(invocation.options.messages[1].content);
  assert.deepEqual(input, {
    requirements: requirements.map((requirement, index) => ({
      requirement,
      candidates: candidateGroups[index].candidates,
    })),
  });
  assert.match(invocation.options.messages[0].content, /only source of candidate experience/);
  assert.match(invocation.options.messages[0].content, /only valid evidence IDs/);
  assert.match(invocation.options.messages[0].content, /shared keyword as sufficient proof/);
  assert.match(invocation.options.messages[0].content, /Do not infer ownership/);
});

test("normalization defaults only omitted evidence IDs on no-match results", () => {
  const omittedNone = { ...matches[2] };
  delete omittedNone.evidenceRecordIds;
  const omittedStrong = { ...matches[0] };
  delete omittedStrong.evidenceRecordIds;
  const unknownEvidence = { ...matches[2], evidenceRecordIds: ["ACC-999"] };

  assert.deepEqual(
    normalizeEvidenceMatches({
      matches: [omittedNone, omittedStrong, unknownEvidence],
    }),
    {
      matches: [
        { ...matches[2], evidenceRecordIds: [] },
        omittedStrong,
        unknownEvidence,
      ],
    },
  );
});

test("matching accepts a no-match result with omitted evidence IDs", async () => {
  const omittedNone = { ...matches[2] };
  delete omittedNone.evidenceRecordIds;

  const result = await matchRequirementsToEvidence(
    aiReturning({ matches: [...matches.slice(0, 2), omittedNone] }),
    requirements,
    candidateGroups,
    2048,
  );

  assert.deepEqual(result, matches);
});

test("matching rejects malformed or out-of-scope model output", async () => {
  const omittedGap = { ...matches[0] };
  delete omittedGap.gap;
  const omittedStrongEvidenceIds = { ...matches[0] };
  delete omittedStrongEvidenceIds.evidenceRecordIds;
  const invalidOutputs = [
    "not JSON",
    { matches: matches.slice(0, 2) },
    { matches: [{ ...matches[0], evidenceRecordIds: ["ACC-999"] }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], evidenceRecordIds: ["EMP-001"] }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], evidenceRecordIds: "ACC-001" }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], evidenceRecordIds: ["ACC-001", 1] }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], requirementId: "req_fake" }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], matchStrength: "maybe" }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], evidenceRecordIds: ["ACC-001", "ACC-001"] }, ...matches.slice(1)] },
    { matches: [{ ...matches[0], evidenceRecordIds: [] }, ...matches.slice(1)] },
    { matches: [{ ...matches[2], evidenceRecordIds: ["ACC-001"] }, ...matches.slice(0, 2)] },
    { matches: [{ ...matches[0], extra: true }, ...matches.slice(1)] },
    { matches: [omittedGap, ...matches.slice(1)] },
    { matches: [omittedStrongEvidenceIds, ...matches.slice(1)] },
  ];

  const loggedErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => loggedErrors.push(args);
  try {
    for (const response of invalidOutputs) {
      const ai = typeof response === "string"
        ? { run: async () => ({ response }) }
        : aiReturning(response);
      await assert.rejects(
        matchRequirementsToEvidence(ai, requirements, candidateGroups, 2048),
        AIOutputInvalidError,
      );
    }
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(loggedErrors.some((args) => args.includes("not JSON")));
});

test("matching rejects employment records as candidate evidence", async () => {
  let called = false;
  const invalidCandidateGroups = [
    ...candidateGroups.slice(0, 1),
    {
      requirementId: "req_002",
      candidates: [{
        type: "employment",
        record: { id: "EMP-001", job_title: "Senior Engineer" },
      }],
    },
    ...candidateGroups.slice(2),
  ];

  await assert.rejects(
    matchRequirementsToEvidence(
      { run: async () => { called = true; } },
      requirements,
      invalidCandidateGroups,
      2048,
    ),
    TypeError,
  );
  assert.equal(called, false);
});

test("matching surfaces AI service failures and rejects invalid configuration", async () => {
  await assert.rejects(
    matchRequirementsToEvidence(
      { run: async () => { throw new Error("provider details"); } },
      requirements,
      candidateGroups,
      2048,
    ),
    AIServiceError,
  );
  await assert.rejects(
    matchRequirementsToEvidence({ run: async () => ({}) }, requirements, candidateGroups, 0),
    AIServiceError,
  );
  await assert.rejects(
    matchRequirementsToEvidence(undefined, requirements, candidateGroups, 2048),
    AIServiceError,
  );
  await assert.rejects(
    matchRequirementsToEvidence(
      { run: async () => ({ errors: [{ message: "model unavailable" }] }) },
      requirements,
      candidateGroups,
      2048,
    ),
    AIServiceError,
  );
});

test("matching avoids an inference call when there are no requirements", async () => {
  let called = false;
  const result = await matchRequirementsToEvidence(
    { run: async () => { called = true; } },
    [],
    [],
    2048,
  );

  assert.deepEqual(result, []);
  assert.equal(called, false);
});
