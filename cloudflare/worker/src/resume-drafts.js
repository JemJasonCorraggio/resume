const INSERT_RESUME_DRAFT_SQL = `
  INSERT INTO resume_drafts (id, job_id, resume_json, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    resume_json = excluded.resume_json,
    created_at = excluded.created_at
`;

const SELECT_RESUME_DRAFT_SQL = `
  SELECT resume_json
  FROM resume_drafts
  WHERE job_id = ?
  ORDER BY created_at DESC
  LIMIT 1
`;

export async function insertResumeDraft(db, draft) {
  const serialized = JSON.stringify(draft);
  if (serialized === undefined) throw new TypeError("resume draft must be JSON serializable");
  await db.prepare(INSERT_RESUME_DRAFT_SQL).bind(draft.draftId, draft.jobId, serialized, draft.createdAt).run();
}

export async function getResumeDraft(db, jobId) {
  const row = await db.prepare(SELECT_RESUME_DRAFT_SQL).bind(jobId).first();
  return row ? JSON.parse(row.resume_json) : null;
}
