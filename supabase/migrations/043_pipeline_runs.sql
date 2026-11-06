-- Migration 043: pipeline_runs tabel til persistering af pipeline-status
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text        NOT NULL DEFAULT 'running'
              CHECK (status IN ('running', 'done', 'error')),
  steps       jsonb       NOT NULL DEFAULT '{}',
  summary     jsonb,
  error       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_runs_started_at_idx ON pipeline_runs (started_at DESC);
