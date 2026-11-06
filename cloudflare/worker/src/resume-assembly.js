export class FixedResumeConfigError extends Error {}
export class GeneratedResumeContentError extends Error {}
export class ResumeEmploymentMatchError extends Error {}
export class ResumeAssemblyError extends Error {}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new FixedResumeConfigError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new FixedResumeConfigError(`${label} has missing or unexpected properties`);
  }
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateFixedSkillsCategory(category) {
  exactKeys(category, ["name", "skills"], "Fixed skills category");
  if (!nonemptyString(category.name)) throw new FixedResumeConfigError("Fixed skills category name is invalid");
  if (!Array.isArray(category.skills)) throw new FixedResumeConfigError("Fixed skills category skills is invalid");
  for (const skill of category.skills) {
    exactKeys(skill, ["name"], "Fixed skill");
    if (!nonemptyString(skill.name)) throw new FixedResumeConfigError("Fixed skill name is invalid");
  }
}

export function validateFixedResumeConfig(config, inventory) {
  if (!isObject(config) || !Object.prototype.hasOwnProperty.call(config, "resume")) {
    throw new FixedResumeConfigError("Fixed resume configuration must contain resume");
  }
  exactKeys(config, ["resume"], "Fixed resume configuration");
  const resume = config.resume;
  exactKeys(resume, ["header", "languageNote", "summary", "skillsAndLanguages", "experience", "education"], "Fixed resume");

  exactKeys(resume.header, ["name", "contact", "links"], "Fixed resume header");
  if (!nonemptyString(resume.header.name)) throw new FixedResumeConfigError("Fixed resume name is invalid");
  if (!Array.isArray(resume.header.contact) || resume.header.contact.length === 0 ||
      resume.header.contact.some((value) => !nonemptyString(value))) {
    throw new FixedResumeConfigError("Fixed resume contact is invalid");
  }
  if (!Array.isArray(resume.header.links)) throw new FixedResumeConfigError("Fixed resume links is invalid");
  for (const link of resume.header.links) {
    exactKeys(link, ["text", "href"], "Fixed resume link");
    if (!nonemptyString(link.text) || !nonemptyString(link.href)) throw new FixedResumeConfigError("Fixed resume link is invalid");
  }

  if (!nonemptyString(resume.languageNote)) throw new FixedResumeConfigError("Fixed language note is invalid");
  exactKeys(resume.summary, ["CUSMANote"], "Fixed resume summary");
  if (!nonemptyString(resume.summary.CUSMANote)) throw new FixedResumeConfigError("Fixed CUSMA note is invalid");

  exactKeys(resume.skillsAndLanguages, ["FMPNote", "fixedSkillsCategories"], "Fixed skills and languages");
  if (!nonemptyString(resume.skillsAndLanguages.FMPNote)) throw new FixedResumeConfigError("Fixed FMP note is invalid");
  if (!Array.isArray(resume.skillsAndLanguages.fixedSkillsCategories)) {
    throw new FixedResumeConfigError("Fixed skills categories is invalid");
  }
  const languageCategories = [];
  for (const category of resume.skillsAndLanguages.fixedSkillsCategories) {
    validateFixedSkillsCategory(category);
    if (category.name === "Languages") languageCategories.push(category);
  }
  if (languageCategories.length !== 1) {
    throw new FixedResumeConfigError("Fixed resume must contain exactly one Languages category");
  }
  if (languageCategories[0].skills.length === 0) {
    throw new FixedResumeConfigError("Fixed Languages category must contain entries");
  }
  if (resume.skillsAndLanguages.fixedSkillsCategories.length !== 1) {
    throw new FixedResumeConfigError("Fixed skills categories may contain only the Languages category");
  }

  if (!Array.isArray(resume.experience) || resume.experience.length === 0) {
    throw new FixedResumeConfigError("Fixed experience is invalid");
  }
  const employmentIds = new Set((inventory?.employment_history ?? []).map((record) => record.id));
  const seen = new Set();
  for (const employment of resume.experience) {
    exactKeys(employment, ["employmentRecordId", "company", "location", "title", "dates"], "Fixed experience");
    for (const field of ["employmentRecordId", "company", "location", "title", "dates"]) {
      if (!nonemptyString(employment[field])) throw new FixedResumeConfigError(`Fixed experience ${field} is invalid`);
    }
    if (!employmentIds.has(employment.employmentRecordId)) {
      throw new FixedResumeConfigError("Fixed experience references an unknown employment record");
    }
    if (seen.has(employment.employmentRecordId)) {
      throw new FixedResumeConfigError("Fixed experience contains duplicate employment records");
    }
    seen.add(employment.employmentRecordId);
  }

  exactKeys(resume.education, ["school", "degree", "details"], "Fixed education");
  if (!["school", "degree", "details"].every((field) => nonemptyString(resume.education[field]))) {
    throw new FixedResumeConfigError("Fixed education is invalid");
  }
  return config;
}

function validateGenerated(value) {
  if (!isObject(value)) throw new GeneratedResumeContentError("Generated resume content must be an object");
  exactGeneratedKeys(value, ["title", "summary", "skillsCategories", "experience"], "Generated resume content");
  if (!nonemptyString(value.title)) throw new GeneratedResumeContentError("Generated resume title is invalid");

  exactGeneratedKeys(value.summary, ["text", "sourceRecordIds"], "Generated summary");
  if (!nonemptyString(value.summary.text) || !validStringArray(value.summary.sourceRecordIds)) {
    throw new GeneratedResumeContentError("Generated summary is invalid");
  }
  if (!Array.isArray(value.skillsCategories)) throw new GeneratedResumeContentError("Generated skills categories is invalid");
  for (const category of value.skillsCategories) {
    exactGeneratedKeys(category, ["name", "skills"], "Generated skills category");
    if (!nonemptyString(category.name) || !Array.isArray(category.skills)) {
      throw new GeneratedResumeContentError("Generated skills category is invalid");
    }
    for (const skill of category.skills) {
      exactGeneratedKeys(skill, ["name", "sourceRecordIds"], "Generated skill");
      if (!nonemptyString(skill.name) || !validNonemptyStringArray(skill.sourceRecordIds)) {
        throw new GeneratedResumeContentError("Generated skill is invalid");
      }
    }
  }
  if (!Array.isArray(value.experience)) throw new GeneratedResumeContentError("Generated experience is invalid");
  return value;
}

function exactGeneratedKeys(value, expected, label) {
  if (!isObject(value)) throw new GeneratedResumeContentError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new GeneratedResumeContentError(`${label} has missing or unexpected properties`);
  }
}

function validStringArray(value) {
  return Array.isArray(value) && value.every((id) => typeof id === "string" && id.length > 0);
}

function validNonemptyStringArray(value) {
  return validStringArray(value) && value.length > 0;
}

export function assembleResume({ fixedConfig, generatedContent, inventory, draftId, jobId, inventoryRevision, createdAt, warnings = [] }) {
  try {
    validateFixedResumeConfig(fixedConfig, inventory);
    validateGenerated(generatedContent);
    const fixed = fixedConfig.resume;

    const fixedById = new Map(fixed.experience.map((entry) => [entry.employmentRecordId, entry]));
    const generatedById = new Map();
    for (const entry of generatedContent.experience) {
      if (!isObject(entry) || Object.keys(entry).sort().join(",") !== "bullets,employmentRecordId") {
        throw new ResumeEmploymentMatchError("Generated experience entry is invalid");
      }
      if (!nonemptyString(entry.employmentRecordId) || !fixedById.has(entry.employmentRecordId)) {
        throw new ResumeEmploymentMatchError("Generated experience contains an unexpected employment record");
      }
      if (generatedById.has(entry.employmentRecordId)) {
        throw new ResumeEmploymentMatchError("Generated experience contains a duplicate employment record");
      }
      if (!Array.isArray(entry.bullets)) {
        throw new ResumeEmploymentMatchError("Generated experience bullets are invalid");
      }
      for (const bullet of entry.bullets) {
        exactGeneratedKeys(bullet, ["text", "sourceRecordIds"], "Generated experience bullet");
        if (!nonemptyString(bullet.text) || !validNonemptyStringArray(bullet.sourceRecordIds)) {
          throw new GeneratedResumeContentError("Generated experience bullet is invalid");
        }
      }
      generatedById.set(entry.employmentRecordId, entry);
    }
    for (const fixedEntry of fixed.experience) {
      if (!generatedById.has(fixedEntry.employmentRecordId)) {
        throw new ResumeEmploymentMatchError("Generated experience is missing a fixed employment record");
      }
    }

    const generatedLanguages = generatedContent.skillsCategories.filter(
      (category) => category.name.trim().toLowerCase() === "languages",
    );
    if (generatedLanguages.length > 0) {
      throw new GeneratedResumeContentError("Generated skills content must not contain Languages");
    }

    const languages = fixed.skillsAndLanguages.fixedSkillsCategories[0];
    const assembled = {
      resume: {
        header: {
          name: fixed.header.name,
          contact: clone(fixed.header.contact),
          links: clone(fixed.header.links),
          title: generatedContent.title,
        },
        languageNote: fixed.languageNote,
        summary: {
          text: generatedContent.summary.text,
          sourceRecordIds: clone(generatedContent.summary.sourceRecordIds),
          CUSMANote: fixed.summary.CUSMANote,
        },
        skillsAndLanguages: {
          skillsCategories: [
            ...clone(generatedContent.skillsCategories),
            clone(languages),
          ],
          FMPNote: fixed.skillsAndLanguages.FMPNote,
        },
        experience: fixed.experience.map((entry) => ({
          ...clone(entry),
          bullets: clone(generatedById.get(entry.employmentRecordId).bullets),
        })),
        education: clone(fixed.education),
      },
      draftId,
      jobId,
      inventoryRevision,
      createdAt,
      warnings: clone(warnings),
    };
    validateAssembledResume(assembled, fixedConfig, generatedContent);
    return assembled;
  } catch (error) {
    if (error instanceof FixedResumeConfigError ||
        error instanceof GeneratedResumeContentError ||
        error instanceof ResumeEmploymentMatchError ||
        error instanceof ResumeAssemblyError) throw error;
    throw new ResumeAssemblyError("Unexpected resume assembly failure");
  }
}

export function validateAssembledResume(assembled, fixedConfig, generatedContent) {
  try {
    exactAssembledKeys(assembled, ["resume", "draftId", "jobId", "inventoryRevision", "createdAt", "warnings"], "Assembled resume");
    const resume = assembled.resume;
    exactKeys(resume, ["header", "languageNote", "summary", "skillsAndLanguages", "experience", "education"], "Assembled resume");
    if (JSON.stringify(resume) !== JSON.stringify(buildExpectedResume(fixedConfig.resume, generatedContent))) {
      throw new ResumeAssemblyError("Assembled resume does not match fixed and generated inputs");
    }
    return assembled;
  } catch (error) {
    if (error instanceof ResumeAssemblyError || error instanceof FixedResumeConfigError) throw error;
    throw new ResumeAssemblyError("Invalid assembled resume");
  }
}

function exactAssembledKeys(value, expected, label) {
  if (!isObject(value)) throw new ResumeAssemblyError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new ResumeAssemblyError(`${label} has missing or unexpected properties`);
  }
}

function buildExpectedResume(fixed, generated) {
  const byId = new Map(generated.experience.map((entry) => [entry.employmentRecordId, entry]));
  return {
    header: { name: fixed.header.name, contact: fixed.header.contact, links: fixed.header.links, title: generated.title },
    languageNote: fixed.languageNote,
    summary: { text: generated.summary.text, sourceRecordIds: generated.summary.sourceRecordIds, CUSMANote: fixed.summary.CUSMANote },
    skillsAndLanguages: {
      skillsCategories: [...generated.skillsCategories, fixed.skillsAndLanguages.fixedSkillsCategories[0]],
      FMPNote: fixed.skillsAndLanguages.FMPNote,
    },
    experience: fixed.experience.map((entry) => ({ ...entry, bullets: byId.get(entry.employmentRecordId).bullets })),
    education: fixed.education,
  };
}
