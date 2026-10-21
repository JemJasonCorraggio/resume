const arrayOf = (item) => ({ kind: "array", item });
const nullable = (item) => ({ kind: "union", options: [item, "null"] });
const objectOf = (fields, optional = []) => ({
  kind: "object",
  fields,
  optional: new Set(optional),
});

const subject = objectOf({
  display_name_for_resumes: "string",
  legal_name_for_official_forms: "string",
  note_on_names: "string",
  location_current: "string",
  email: "string",
  phone_for_resumes: "string",
  github: "string",
  linkedin: "string",
  portfolio: "string",
  github_note: "string",
});
const employment = objectOf({
  id: "string",
  employer: "string",
  job_title: "string",
  employment_type: "string",
  start_date: "string",
  end_date: "string",
  location: "string",
  team_and_business_context: nullable("string"),
  role_type: "string",
  team_size: nullable("string"),
  direct_reports: nullable("integer"),
  scope_of_ownership: nullable("string"),
  technologies: arrayOf("string"),
  systems: arrayOf("string"),
  operational_responsibilities: nullable("string"),
  accomplishment_ids: arrayOf("string"),
  missing_or_unconfirmed: arrayOf("string"),
  end_date_note: "string",
  direct_reports_note: "string",
  alternate_employer_name: "string",
  constraints_and_limitations: arrayOf("string"),
  metrics_verified: "string",
}, [
  "end_date_note",
  "direct_reports_note",
  "alternate_employer_name",
  "constraints_and_limitations",
  "metrics_verified",
]);
const metric = objectOf({
  value: "string",
  unit: "string",
  confidence: "string",
});
const accomplishment = objectOf({
  id: "string",
  title: "string",
  employer_id: "string",
  problem_or_motivation: "string",
  my_contribution: "string",
  ownership_level: "string",
  technical_details: "string",
  scale_and_scope: nullable("string"),
  outcome: nullable("string"),
  metrics: arrayOf(metric),
  evidence_and_confidence: "string",
  potential_relevance: arrayOf("string"),
  resume_bullet_candidates: arrayOf("string"),
  verification_questions: arrayOf("string"),
  employer_note: "string",
}, ["employer_note"]);
const skill = objectOf({
  id: "string",
  name: "string",
  aliases: arrayOf("string"),
  category: "string",
  contexts: arrayOf("string"),
  usage_level: "string",
  duration_or_recency: nullable("string"),
  examples: arrayOf("string"),
  limitations: nullable("string"),
});
const leadershipExample = objectOf({
  id: "string",
  title: "string",
  accomplishment_id: nullable("string"),
  situation: "string",
  actions: "string",
  reasoning: nullable("string"),
  outcome: nullable("string"),
  related_accomplishment_ids: arrayOf("string"),
}, ["related_accomplishment_ids"]);
const project = objectOf({
  id: "string",
  name: "string",
  type: "string",
  description: "string",
  my_contribution: "string",
  technologies: arrayOf("string"),
  skill_ids: arrayOf("string"),
  evidence_and_confidence: "string",
  verification_questions: arrayOf("string"),
});
const educationCredential = objectOf({
  id: "string",
  institution: nullable("string"),
  credential: "string",
  details: "string",
  dates: nullable("string"),
  evidence_and_confidence: "string",
});
const verificationQuestion = objectOf({
  id: "string",
  question: "string",
  affects: arrayOf("string"),
  priority: "string",
  status: "string",
  answer: "string",
  answered_date: "string",
}, ["answered_date"]);
const sourceNote = objectOf({
  id: "string",
  source: "string",
  role: "string",
});
const workAuthorization = objectOf({
  citizenship: "string",
  canada_status: "string",
  application_form_answers_stated: "string",
  biggest_obstacle_stated: "string",
});
const careerPreferences = objectOf({
  targeting_note: "string",
  role_types_open_to: arrayOf("string"),
  filtering_rule: "string",
  technical_work_targeted: arrayOf("string"),
  strengths_positioning: arrayOf("string"),
  geography_current_search: "string",
  "contract_rate_stated_2026-09-21": "string",
  work_authorization: workAuthorization,
  cover_letter_preference: "string",
  resume_tailoring_preference: "string",
});
const negativeQualification = objectOf({
  statement: "string",
  scope: "string",
  evidence: "string",
  related_ids: arrayOf("string"),
});

const inventorySchema = objectOf({
  schema_version: "string",
  inventory_generation_date: "string",
  subject,
  employment_history: arrayOf(employment),
  accomplishments: arrayOf(accomplishment),
  skills: arrayOf(skill),
  leadership_examples: arrayOf(leadershipExample),
  projects: arrayOf(project),
  education_and_credentials: arrayOf(educationCredential),
  career_preferences: careerPreferences,
  verification_questions: arrayOf(verificationQuestion),
  source_notes: arrayOf(sourceNote),
  inventory_revision_date: "string",
  negative_qualifications: arrayOf(negativeQualification),
}, ["negative_qualifications"]);

const collections = [
  ["EMP", "employment_history"],
  ["ACC", "accomplishments"],
  ["SK", "skills"],
  ["LEAD", "leadership_examples"],
  ["PROJ", "projects"],
  ["EDU", "education_and_credentials"],
  ["VQ", "verification_questions"],
  ["SRC", "source_notes"],
];
const supportedVersions = new Set(["1.1.0", "1.2.0"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pythonRepr(value) {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  const escaped = [...value].map((character) => {
    if (character === "\\") return "\\\\";
    if (character === quote) return `\\${quote}`;
    if (character === "\n") return "\\n";
    if (character === "\r") return "\\r";
    if (character === "\t") return "\\t";
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return `\\x${codePoint.toString(16).padStart(2, "0")}`;
    }
    return character;
  }).join("");
  return `${quote}${escaped}${quote}`;
}

function matches(value, type) {
  if (typeof type === "string") {
    if (type === "null") return value === null;
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    return typeof value === type;
  }
  if (type.kind === "union") {
    return type.options.some((option) => matches(value, option));
  }
  if (type.kind === "array") {
    return Array.isArray(value) && value.every((entry) => matches(entry, type.item));
  }
  if (type.kind === "object") return isObject(value);
  return false;
}

function validateObject(value, schema, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path}: expected object`);
    return;
  }

  const schemaKeys = Object.keys(schema.fields);
  const required = schemaKeys.filter((key) => !schema.optional.has(key));
  for (const key of required.filter((key) => !(key in value)).sort()) {
    errors.push(`${path}.${key}: required field is missing`);
  }
  for (const key of Object.keys(value).filter((key) => !(key in schema.fields)).sort()) {
    errors.push(`${path}.${key}: unexpected field`);
  }

  for (const key of schemaKeys) {
    if (!(key in value)) continue;
    const field = value[key];
    const type = schema.fields[key];
    const fieldPath = `${path}.${key}`;
    if (!matches(field, type)) {
      errors.push(`${fieldPath}: invalid value or type`);
      continue;
    }
    validateNested(field, type, fieldPath, errors);
  }
}

function validateNested(value, type, path, errors) {
  if (typeof type === "string") return;
  if (type.kind === "union") {
    const match = type.options.find((option) => matches(value, option));
    if (match) validateNested(value, match, path, errors);
    return;
  }
  if (type.kind === "object") {
    validateObject(value, type, path, errors);
    return;
  }
  if (type.kind === "array" && type.item.kind === "object") {
    value.forEach((entry, index) => validateObject(entry, type.item, `${path}[${index}]`, errors));
  }
}

function checkIdsAndReferences(data, errors) {
  const ids = new Map();
  const firstOccurrence = new Map();
  for (const [prefix, collectionName] of collections) {
    const collectionIds = new Set();
    data[collectionName].forEach((record, index) => {
      const recordId = record.id;
      const path = `${collectionName}[${index}].id`;
      if (!recordId.startsWith(`${prefix}-`) || !recordId.slice(prefix.length + 1)) {
        errors.push(`${path}: expected an ID beginning with ${prefix}-`);
      }
      if (firstOccurrence.has(recordId)) {
        errors.push(
          `${path}: duplicate ID ${pythonRepr(recordId)}; first used at ${firstOccurrence.get(recordId)}`,
        );
      } else {
        firstOccurrence.set(recordId, path);
      }
      collectionIds.add(recordId);
    });
    ids.set(prefix, collectionIds);
  }

  function reference(value, allowed, path) {
    const prefix = value.split("-", 1)[0];
    if (!allowed.includes(prefix) || !ids.get(prefix)?.has(value)) {
      errors.push(`${path}: unknown or wrong-kind reference ${pythonRepr(value)}`);
    }
  }

  data.employment_history.forEach((record, index) => {
    record.accomplishment_ids.forEach((id, refIndex) => {
      reference(id, ["ACC"], `employment_history[${index}].accomplishment_ids[${refIndex}]`);
    });
  });
  data.accomplishments.forEach((record, index) => {
    reference(record.employer_id, ["EMP"], `accomplishments[${index}].employer_id`);
  });
  data.leadership_examples.forEach((record, index) => {
    if (record.accomplishment_id !== null) {
      reference(record.accomplishment_id, ["ACC"], `leadership_examples[${index}].accomplishment_id`);
    }
    for (const id of record.related_accomplishment_ids || []) {
      reference(id, ["ACC"], `leadership_examples[${index}].related_accomplishment_ids`);
    }
  });
  data.projects.forEach((record, index) => {
    record.skill_ids.forEach((id, refIndex) => {
      reference(id, ["SK"], `projects[${index}].skill_ids[${refIndex}]`);
    });
  });
  data.skills.forEach((record, index) => {
    record.examples.forEach((id, refIndex) => {
      reference(id, ["ACC", "PROJ", "LEAD"], `skills[${index}].examples[${refIndex}]`);
    });
  });
  data.verification_questions.forEach((record, index) => {
    record.affects.forEach((id, refIndex) => {
      reference(id, ["EMP", "ACC", "SK", "LEAD", "PROJ", "EDU"],
        `verification_questions[${index}].affects[${refIndex}]`);
    });
  });
  (data.negative_qualifications || []).forEach((record, index) => {
    record.related_ids.forEach((id, refIndex) => {
      reference(id, ["EMP", "ACC", "SK", "LEAD", "PROJ", "EDU"],
        `negative_qualifications[${index}].related_ids[${refIndex}]`);
    });
  });
}

function checkWarnings(data) {
  const warnings = [];
  for (const [collectionName, records] of [
    ["accomplishments", data.accomplishments],
    ["projects", data.projects],
  ]) {
    records.forEach((record, index) => {
      record.verification_questions.forEach((question, questionIndex) => {
        warnings.push(
          `${collectionName}[${index}] (${record.id}).verification_questions[${questionIndex}]: unresolved question: ${question}`,
        );
      });
    });
  }

  data.verification_questions.forEach((record, index) => {
    if (record.status.toLocaleLowerCase() !== "answered") {
      warnings.push(
        `verification_questions[${index}] (${record.id}).status: question is unresolved (status ${pythonRepr(record.status)})`,
      );
    }
  });

  data.source_notes.forEach((record, index) => {
    for (const field of ["source", "role"]) {
      const value = record[field];
      const lowered = value.toLocaleLowerCase();
      if (["conflict", "inconsisten", "uncorroborated"].some((marker) => lowered.includes(marker))) {
        warnings.push(
          `source_notes[${index}] (${record.id}).${field}: source note flags a conflict or uncorroborated claim; review the canonical inventory value`,
        );
        break;
      }
    }
  });
  return warnings;
}

export function validateInventory(value) {
  const errors = [];
  validateObject(value, inventorySchema, "inventory", errors);
  if (errors.length) return errors;

  if (!supportedVersions.has(value.schema_version)) {
    errors.push(
      `inventory.schema_version: expected one of ${[...supportedVersions].sort().join(", ")}`,
    );
  }
  checkIdsAndReferences(value, errors);
  return errors;
}

export function auditInventory(value) {
  const errors = validateInventory(value);
  let warnings = [];
  if (!errors.length) warnings = checkWarnings(value);
  return { errors, warnings };
}
