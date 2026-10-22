const INSERT_JOB_SQL = `
  INSERT INTO jobs (
    id,
    job_description,
    company,
    role_title,
    inventory_revision,
    requirements_json,
    evidence_matches_json,
    warnings_json,
    status,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_JOB_SQL = `
  SELECT
    id,
    job_description,
    company,
    role_title,
    inventory_revision,
    requirements_json,
    evidence_matches_json,
    warnings_json,
    status,
    created_at
  FROM jobs
  WHERE id = ?
`;

function serializeJson(value, field) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(`${field} must be JSON serializable`);
  }
  return serialized;
}

export async function insertJob(db, job) {
  await db.prepare(INSERT_JOB_SQL).bind(
    job.id,
    job.job_description,
    job.company,
    job.role_title,
    job.inventory_revision,
    serializeJson(job.requirements, "requirements"),
    serializeJson(job.evidence_matches, "evidence_matches"),
    serializeJson(job.warnings, "warnings"),
    job.status,
    job.created_at,
  ).run();
}

export async function getJob(db, id) {
  const row = await db.prepare(SELECT_JOB_SQL).bind(id).first();
  if (!row) return null;

  return {
    id: row.id,
    job_description: row.job_description,
    company: row.company,
    role_title: row.role_title,
    inventory_revision: row.inventory_revision,
    requirements: JSON.parse(row.requirements_json),
    evidence_matches: JSON.parse(row.evidence_matches_json),
    warnings: JSON.parse(row.warnings_json),
    status: row.status,
    created_at: row.created_at,
  };
}
