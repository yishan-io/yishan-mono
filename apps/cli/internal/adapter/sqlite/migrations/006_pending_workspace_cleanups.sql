-- Pending workspace cleanups moved from pending-workspace-cleanups.json into
-- SQLite so the daemon's retry queue shares the transactional store with the
-- rest of the workspace lifecycle state.
CREATE TABLE pending_workspace_cleanups (
    workspace_id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    branch TEXT,
    remove_branch INTEGER NOT NULL DEFAULT 0,
    force_worktree INTEGER NOT NULL DEFAULT 0,
    force_branch INTEGER NOT NULL DEFAULT 0,
    post_hook TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);
