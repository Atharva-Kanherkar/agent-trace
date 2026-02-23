CREATE TABLE IF NOT EXISTS sessions
(
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  project_path TEXT,
  git_repo TEXT,
  git_branch TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commits
(
  sha TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(session_id),
  prompt_id TEXT,
  message TEXT,
  lines_added BIGINT NOT NULL DEFAULT 0,
  lines_removed BIGINT NOT NULL DEFAULT 0,
  chain_cost_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

