CREATE TABLE resume_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  resume_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
