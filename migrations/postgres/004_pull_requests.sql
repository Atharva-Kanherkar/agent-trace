CREATE TABLE IF NOT EXISTS pull_requests
(
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  url TEXT,
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_session ON pull_requests(session_id);
