export class JobAnalysisError extends Error {}

function extractLabeledValue(description, pattern) {
  const match = description.match(pattern);
  return match?.[1]?.trim() || null;
}

export function analyzeJobDescription(description) {
  const company = extractLabeledValue(
    description,
    /^\s*(?:company(?: name)?|employer)\s*:\s*(.+?)\s*$/im,
  );
  const roleTitle = extractLabeledValue(
    description,
    /^\s*(?:(?:job|role)\s+title|position|role)\s*:\s*(.+?)\s*$/im,
  );

  if (!company || !roleTitle) {
    throw new JobAnalysisError(
      "Could not identify the company and role title. Please amend the job description.",
    );
  }

  return {
    company,
    roleTitle,
    requirements: [],
    evidenceMatches: [],
    warnings: [],
  };
}
