const INSERT_RESUME_DRAFT_SQL = `
  INSERT INTO resume_drafts (id, job_id, resume_json, created_at, version)
  VALUES (?, ?, ?, ?, 1)
`;

const SELECT_RESUME_DRAFT_BY_JOB_SQL = `
  SELECT resume_json, version
  FROM resume_drafts
  WHERE job_id = ?
  ORDER BY created_at DESC
  LIMIT 1
`;

const SELECT_RESUME_DRAFT_BY_ID_SQL = `
  SELECT resume_json, version
  FROM resume_drafts
  WHERE id = ?
`;

const UPDATE_RESUME_DRAFT_SQL = `
  UPDATE resume_drafts
  SET resume_json = ?, version = version + 1
  WHERE id = ? AND version = ?
`;

const SELECT_RESUME_DRAFT_VERSION_SQL = `
  SELECT version
  FROM resume_drafts
  WHERE id = ?
`;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} has missing or unexpected properties`);
  }
}

function exactOptionalKeys(value, required, optional, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
  const keys = Object.keys(value);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
  if (keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new TypeError(`${label} has unexpected properties`);
  }
}

function validStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new TypeError(`${label} must be an array of nonempty strings`);
  }
}

function validateEditableItem(item, label, { allowFixed = false } = {}) {
  exactOptionalKeys(item, ["name"], ["sourceRecordIds", "manualAdded", "manuallyEdited", "contentOrigin"], label);
  if (typeof item.name !== "string") throw new TypeError(`${label}.name must be a string`);
  if ("sourceRecordIds" in item) validStringArray(item.sourceRecordIds, `${label}.sourceRecordIds`);
  if ("manualAdded" in item && typeof item.manualAdded !== "boolean") {
    throw new TypeError(`${label}.manualAdded must be a boolean`);
  }
  if ("manuallyEdited" in item && typeof item.manuallyEdited !== "boolean") {
    throw new TypeError(`${label}.manuallyEdited must be a boolean`);
  }
  if ("contentOrigin" in item && item.contentOrigin !== "fixed") {
    throw new TypeError(`${label}.contentOrigin is invalid`);
  }
  if (allowFixed && "sourceRecordIds" in item) {
    throw new TypeError(`${label} fixed content cannot have generated provenance`);
  }
  if (allowFixed && !item.manualAdded && item.contentOrigin !== "fixed") {
    throw new TypeError(`${label} must remain marked as fixed content or be marked manually added`);
  }
  if (!allowFixed && "contentOrigin" in item) {
    throw new TypeError(`${label} cannot be marked as fixed content`);
  }
  if (item.manualAdded && "sourceRecordIds" in item) {
    throw new TypeError(`${label} cannot be manually added and have generated provenance`);
  }
  if (item.manualAdded && "contentOrigin" in item) {
    throw new TypeError(`${label} cannot be manually added and marked as fixed content`);
  }
  if (!allowFixed && !item.manualAdded && !("sourceRecordIds" in item && item.sourceRecordIds.length)) {
    throw new TypeError(`${label} must retain provenance or be marked manually added`);
  }
}

function validateProvenanceSequence(originalItems, editedItems, textField, label) {
  const originalGenerated = originalItems.filter((item) => Array.isArray(item.sourceRecordIds));
  const editedGenerated = editedItems.filter((item) => Array.isArray(item.sourceRecordIds));
  let originalIndex = 0;
  for (const edited of editedGenerated) {
    while (
      originalIndex < originalGenerated.length &&
      JSON.stringify(originalGenerated[originalIndex].sourceRecordIds) !== JSON.stringify(edited.sourceRecordIds)
    ) originalIndex += 1;
    if (originalIndex === originalGenerated.length) {
      throw new TypeError(`${label} provenance must remain associated with its original generated item`);
    }
    const original = originalGenerated[originalIndex];
    if (edited[textField] !== original[textField] && edited.manuallyEdited !== true) {
      throw new TypeError(`${label} text edits must be marked manually edited`);
    }
    originalIndex += 1;
  }
}

export function validateEditedResume(resume, originalResume) {
  exactOptionalKeys(
    resume,
    ["header", "languageNote", "summary", "skillsAndLanguages", "experience", "education"],
    [],
    "resume",
  );
  exactOptionalKeys(
    resume.header,
    ["name", "contact", "links", "title"],
    ["titleManuallyEdited"],
    "resume.header",
  );
  if (typeof resume.header.name !== "string" || typeof resume.header.title !== "string") {
    throw new TypeError("Resume header name and title must be strings");
  }
  if ("titleManuallyEdited" in resume.header && typeof resume.header.titleManuallyEdited !== "boolean") {
    throw new TypeError("Resume header titleManuallyEdited must be a boolean");
  }
  if (resume.header.title !== originalResume.header.title && resume.header.titleManuallyEdited !== true) {
    throw new TypeError("Edited target title must be marked manually edited");
  }
  if (!Array.isArray(resume.header.contact) ||
      resume.header.contact.some((entry) => typeof entry !== "string")) {
    throw new TypeError("Resume contact must be an array of strings");
  }
  if (!Array.isArray(resume.header.links)) throw new TypeError("Resume links must be an array");
  for (const [index, link] of resume.header.links.entries()) {
    exactKeys(link, ["text", "href"], `resume.header.links[${index}]`);
    if (typeof link.text !== "string" || typeof link.href !== "string") {
      throw new TypeError(`resume.header.links[${index}] fields must be strings`);
    }
    if (link.href) {
      let protocol;
      try {
        protocol = new URL(link.href, "https://resume.invalid").protocol;
      } catch {
        throw new TypeError(`resume.header.links[${index}].href is invalid`);
      }
      if (!["http:", "https:", "mailto:", "tel:"].includes(protocol)) {
        throw new TypeError(`resume.header.links[${index}].href uses an unsupported protocol`);
      }
    }
  }
  if (resume.header.contact.length !== originalResume.header.contact.length ||
      resume.header.links.length !== originalResume.header.links.length) {
    throw new TypeError("Resume contact and link structure cannot be changed");
  }

  if (typeof resume.languageNote !== "string") throw new TypeError("Resume languageNote must be a string");
  exactOptionalKeys(resume.summary, ["text", "sourceRecordIds", "CUSMANote"], ["manuallyEdited"], "resume.summary");
  if (typeof resume.summary.text !== "string" || typeof resume.summary.CUSMANote !== "string") {
    throw new TypeError("Resume summary fields must be strings");
  }
  validStringArray(resume.summary.sourceRecordIds, "resume.summary.sourceRecordIds");
  if (JSON.stringify(resume.summary.sourceRecordIds) !== JSON.stringify(originalResume.summary.sourceRecordIds)) {
    throw new TypeError("Resume summary provenance cannot be changed");
  }
  if (resume.summary.text !== originalResume.summary.text && resume.summary.manuallyEdited !== true) {
    throw new TypeError("Edited summary text must be marked manually edited");
  }
  if ("manuallyEdited" in resume.summary && typeof resume.summary.manuallyEdited !== "boolean") {
    throw new TypeError("Resume summary manuallyEdited must be a boolean");
  }

  exactKeys(resume.skillsAndLanguages, ["skillsCategories", "FMPNote"], "resume.skillsAndLanguages");
  if (typeof resume.skillsAndLanguages.FMPNote !== "string" ||
      !Array.isArray(resume.skillsAndLanguages.skillsCategories)) {
    throw new TypeError("Resume skills and languages are invalid");
  }
  const categories = resume.skillsAndLanguages.skillsCategories;
  const originalCategories = originalResume.skillsAndLanguages.skillsCategories;
  const originalLanguagesIndex = originalCategories.findIndex(
    (category) => category.categoryRole === "languages" || category.name === "Languages",
  );
  const editedLanguagesCategory = categories[originalLanguagesIndex];
  const preservesLanguagesCategory = editedLanguagesCategory?.categoryRole === "languages" ||
    (originalCategories[originalLanguagesIndex]?.categoryRole !== "languages" &&
      editedLanguagesCategory?.name === "Languages");
  if (categories.length !== originalCategories.length || originalLanguagesIndex < 0 ||
      originalCategories.filter((category) => category.categoryRole === "languages" || category.name === "Languages").length !== 1 ||
      categories.filter((category) => category?.categoryRole === "languages").length > 1 ||
      !preservesLanguagesCategory) {
    throw new TypeError("Resume must preserve its skill categories and required Languages category");
  }
  for (const [categoryIndex, category] of categories.entries()) {
    exactOptionalKeys(
      category,
      ["name", "skills"],
      ["categoryRole"],
      `resume.skillsAndLanguages.skillsCategories[${categoryIndex}]`,
    );
    if (typeof category.name !== "string" || !Array.isArray(category.skills)) {
      throw new TypeError(`Resume skill category ${categoryIndex} is invalid`);
    }
    if (categoryIndex === originalLanguagesIndex && category.categoryRole !== "languages") {
      if (category.categoryRole !== undefined || category.name !== "Languages") {
        throw new TypeError("The required Languages category cannot be removed");
      }
    }
    if (categoryIndex !== originalLanguagesIndex &&
        (category.categoryRole !== undefined || category.name === "Languages")) {
      throw new TypeError("Only the required category may represent Languages");
    }
    for (const [skillIndex, skill] of category.skills.entries()) {
      validateEditableItem(
        skill,
        `resume.skillsAndLanguages.skillsCategories[${categoryIndex}].skills[${skillIndex}]`,
        { allowFixed: categoryIndex === originalLanguagesIndex },
      );
    }
    if (categoryIndex !== originalLanguagesIndex) {
      validateProvenanceSequence(
        originalCategories[categoryIndex].skills,
        category.skills,
        "name",
        `Skill category ${categoryIndex}`,
      );
    }
  }

  if (!Array.isArray(resume.experience) ||
      resume.experience.length !== originalResume.experience.length) {
    throw new TypeError("Resume employment entries cannot be added or removed");
  }
  for (const [index, entry] of resume.experience.entries()) {
    exactKeys(entry, ["employmentRecordId", "company", "location", "title", "dates", "bullets"], `resume.experience[${index}]`);
    const originalEntry = originalResume.experience[index];
    if (entry.employmentRecordId !== originalEntry.employmentRecordId) {
      throw new TypeError("Resume employment entries cannot be reordered or replaced");
    }
    for (const field of ["company", "location", "title", "dates"]) {
      if (typeof entry[field] !== "string") throw new TypeError(`resume.experience[${index}].${field} must be a string`);
    }
    if (!Array.isArray(entry.bullets)) throw new TypeError(`resume.experience[${index}].bullets must be an array`);
    for (const [bulletIndex, bullet] of entry.bullets.entries()) {
      exactOptionalKeys(
        bullet,
        ["text"],
        ["sourceRecordIds", "manualAdded", "manuallyEdited"],
        `resume.experience[${index}].bullets[${bulletIndex}]`,
      );
      if (typeof bullet.text !== "string") throw new TypeError(`resume.experience[${index}].bullets[${bulletIndex}].text must be a string`);
      if ("sourceRecordIds" in bullet) validStringArray(bullet.sourceRecordIds, `resume.experience[${index}].bullets[${bulletIndex}].sourceRecordIds`);
      if ("manualAdded" in bullet && typeof bullet.manualAdded !== "boolean") {
        throw new TypeError(`resume.experience[${index}].bullets[${bulletIndex}].manualAdded must be a boolean`);
      }
      if ("manuallyEdited" in bullet && typeof bullet.manuallyEdited !== "boolean") {
        throw new TypeError(`resume.experience[${index}].bullets[${bulletIndex}].manuallyEdited must be a boolean`);
      }
      if (bullet.manualAdded && "sourceRecordIds" in bullet) {
        throw new TypeError("A manually added experience bullet cannot have generated provenance");
      }
      if (!bullet.manualAdded && !("sourceRecordIds" in bullet && bullet.sourceRecordIds.length)) {
        throw new TypeError("Experience bullets must retain provenance or be marked manually added");
      }
    }
    validateProvenanceSequence(
      originalEntry.bullets,
      entry.bullets,
      "text",
      `Experience entry ${index} bullets`,
    );
  }

  exactKeys(resume.education, ["school", "degree", "details"], "resume.education");
  if (["school", "degree", "details"].some((field) => typeof resume.education[field] !== "string")) {
    throw new TypeError("Resume education fields must be strings");
  }
  return resume;
}

function withVersion(row) {
  if (!row) return null;
  return { ...JSON.parse(row.resume_json), version: row.version ?? 1 };
}

export async function insertResumeDraft(db, draft) {
  const serialized = JSON.stringify(draft);
  if (serialized === undefined) throw new TypeError("resume draft must be JSON serializable");
  await db.prepare(INSERT_RESUME_DRAFT_SQL)
    .bind(draft.draftId, draft.jobId, serialized, draft.createdAt)
    .run();
}

export async function getResumeDraft(db, jobId) {
  const row = await db.prepare(SELECT_RESUME_DRAFT_BY_JOB_SQL).bind(jobId).first();
  return withVersion(row);
}

export async function getResumeDraftById(db, draftId) {
  const row = await db.prepare(SELECT_RESUME_DRAFT_BY_ID_SQL).bind(draftId).first();
  return withVersion(row);
}

export async function updateResumeDraft(db, draft, expectedVersion) {
  const serialized = JSON.stringify(draft);
  if (serialized === undefined) throw new TypeError("resume draft must be JSON serializable");
  const result = await db.prepare(UPDATE_RESUME_DRAFT_SQL)
    .bind(serialized, draft.draftId, expectedVersion)
    .run();
  if (result?.meta?.changes > 0) return { status: "updated", version: expectedVersion + 1 };

  const row = await db.prepare(SELECT_RESUME_DRAFT_VERSION_SQL).bind(draft.draftId).first();
  return row ? { status: "conflict", version: row.version } : { status: "not_found" };
}
