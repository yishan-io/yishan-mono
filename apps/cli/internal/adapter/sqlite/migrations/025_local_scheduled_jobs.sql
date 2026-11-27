-- Scheduled jobs run from the daemon: definitions and runs live here and
-- api-service no longer schedules, claims or records them. Timestamps are
-- UTC ISO-8601 with milliseconds so they sort lexically. The run outbox that
-- buffered results for api-service is no longer needed.
CREATE TABLE scheduled_jobs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    name TEXT NOT NULL,
    agent_kind TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT,
    command TEXT,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    next_run_at TEXT NOT NULL,
    last_scheduled_for TEXT,
    last_run_at TEXT,
    last_run_status TEXT CHECK (last_run_status IS NULL OR last_run_status IN ('succeeded', 'failed')),
    last_error_code TEXT,
    last_error_message TEXT,
    created_by_user_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_scheduled_jobs_org ON scheduled_jobs(organization_id);
CREATE INDEX idx_scheduled_jobs_project ON scheduled_jobs(project_id);
CREATE INDEX idx_scheduled_jobs_status_next ON scheduled_jobs(status, next_run_at);

CREATE TABLE scheduled_job_runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'schedule')),
    started_at TEXT,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped_offline')),
    response_body TEXT,
    error_code TEXT,
    error_message TEXT,
    error_details TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_scheduled_job_runs_job ON scheduled_job_runs(job_id, scheduled_for DESC);
CREATE INDEX idx_scheduled_job_runs_status ON scheduled_job_runs(status);
CREATE UNIQUE INDEX idx_scheduled_job_runs_schedule_occurrence
ON scheduled_job_runs(job_id, scheduled_for)
WHERE trigger = 'schedule';

DROP TABLE IF EXISTS scheduled_job_run_outbox;
