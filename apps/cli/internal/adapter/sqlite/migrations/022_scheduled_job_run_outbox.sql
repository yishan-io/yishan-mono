CREATE TABLE scheduled_job_run_outbox (
    run_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('claimed', 'started', 'finished')),
    result_status TEXT NOT NULL DEFAULT '',
    response_body TEXT NOT NULL DEFAULT '',
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    delivered_at INTEGER
);

CREATE INDEX idx_scheduled_job_run_outbox_undelivered
    ON scheduled_job_run_outbox(delivered_at, updated_at);
