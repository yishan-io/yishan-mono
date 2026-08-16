CREATE TABLE token_usage_hourly (
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    workspace_path TEXT NOT NULL DEFAULT '',
    organization_id TEXT NOT NULL DEFAULT '',
    agent_kind TEXT NOT NULL,
    model TEXT NOT NULL,
    model_normalized TEXT NOT NULL,
    bucket_start_hour_utc INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cached_input_tokens INTEGER NOT NULL,
    cached_write_tokens INTEGER NOT NULL,
    reasoning_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    session_count INTEGER NOT NULL,
    turn_count INTEGER NOT NULL,
    tool_call_count INTEGER NOT NULL,
    attribution_confidence TEXT NOT NULL,
    scanner_source_kind TEXT NOT NULL,
    scanner_source_id TEXT NOT NULL,
    ingested_at INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_dirty INTEGER NOT NULL DEFAULT 1,
    last_synced_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, workspace_id, agent_kind, model_normalized, bucket_start_hour_utc)
);


CREATE INDEX idx_token_usage_hourly_bucket ON token_usage_hourly(bucket_start_hour_utc);
CREATE INDEX idx_token_usage_hourly_project_bucket ON token_usage_hourly(project_id, bucket_start_hour_utc);
CREATE INDEX idx_token_usage_hourly_workspace_bucket ON token_usage_hourly(workspace_id, bucket_start_hour_utc);
CREATE INDEX idx_token_usage_hourly_dirty_bucket ON token_usage_hourly(is_dirty, bucket_start_hour_utc);
