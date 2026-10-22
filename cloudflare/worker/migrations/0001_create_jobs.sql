CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL,
  job_description TEXT NOT NULL,
  company TEXT,
  role_title TEXT,
  inventory_revision TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  evidence_matches_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
