#![allow(dead_code)]

use crate::daemon::event_hub::{EventHub, FrontendEvent};
use crate::workspace::manager::WorkspaceManager;
use crate::workspace::types::{Workspace, WorkspacePullRequest};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;
use tracing::{debug, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60); // 5 minutes
const GH_UNKNOWN_HOST_FRAGMENT: &str =
    "none of the git remotes configured for this repository point to a known github host";

struct Inner {
    active: HashMap<String, Workspace>,
    in_flight: HashSet<String>,
}

/// Background poll tracker for workspace pull-request state.
/// Publishes `workspacePullRequestUpdated` events when meaningful PR fields change.
pub struct PrTracker {
    inner: Arc<Mutex<Inner>>,
    cancel: Arc<Notify>,
    manager: Arc<WorkspaceManager>,
    events: Arc<EventHub>,
}

impl PrTracker {
    pub fn new(manager: Arc<WorkspaceManager>, events: Arc<EventHub>) -> Arc<Self> {
        Arc::new(Self {
            inner: Arc::new(Mutex::new(Inner {
                active: HashMap::new(),
                in_flight: HashSet::new(),
            })),
            cancel: Arc::new(Notify::new()),
            manager,
            events,
        })
    }

    /// Start the background poll loop. Safe to call once.
    pub fn start(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move { this.poll_loop().await });
    }

    /// Register a workspace for PR tracking; optionally trigger an immediate refresh.
    pub fn ensure_tracked(self: &Arc<Self>, worktree_path: &str, refresh_immediately: bool) {
        let path = worktree_path.trim();
        if path.is_empty() {
            return;
        }
        let ws = match self.find_by_path(path) {
            Some(w) => w,
            None => return,
        };
        {
            let mut guard = self.inner.lock().unwrap();
            guard.active.insert(ws.id.clone(), ws.clone());
        }
        if refresh_immediately {
            let this = self.clone();
            let ws2 = ws.clone();
            tokio::spawn(async move { this.do_refresh(ws2).await });
        }
    }

    /// Remove a workspace from tracking.
    pub fn stop_tracking(&self, workspace_id: &str) {
        self.inner.lock().unwrap().active.remove(workspace_id);
    }

    /// Signal the poll loop to stop.
    pub fn stop(&self) {
        self.cancel.notify_waiters();
    }

    /// Immediately refresh PR state for the workspace at the given path.
    pub async fn refresh_by_path(self: &Arc<Self>, worktree_path: &str) {
        let ws = match self.find_by_path(worktree_path) {
            Some(w) => w,
            None => {
                warn!(path = worktree_path, "PR refresh: workspace not found");
                return;
            }
        };
        let tracked = self.inner.lock().unwrap().active.contains_key(&ws.id);
        if !tracked {
            debug!(id = ws.id, "PR refresh skipped: not tracked");
            return;
        }
        if !self.begin_refresh(&ws.id) {
            debug!(id = ws.id, "PR refresh skipped: already in flight");
            return;
        }
        self.do_refresh(ws.clone()).await;
        self.end_refresh(&ws.id);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    async fn poll_loop(self: &Arc<Self>) {
        let mut interval = tokio::time::interval(POLL_INTERVAL);
        interval.tick().await; // skip first immediate tick
        loop {
            tokio::select! {
                _ = self.cancel.notified() => {
                    debug!("PR tracker poll loop stopped");
                    return;
                }
                _ = interval.tick() => {
                    let tracked: Vec<Workspace> = {
                        self.inner.lock().unwrap().active.values().cloned().collect()
                    };
                    for ws in tracked {
                        if !self.begin_refresh(&ws.id) { continue; }
                        let this = self.clone();
                        tokio::spawn(async move {
                            this.do_refresh(ws.clone()).await;
                            this.end_refresh(&ws.id);
                        });
                    }
                }
            }
        }
    }

    fn begin_refresh(&self, workspace_id: &str) -> bool {
        let mut guard = self.inner.lock().unwrap();
        if guard.in_flight.contains(workspace_id) {
            return false;
        }
        guard.in_flight.insert(workspace_id.to_string());
        true
    }

    fn end_refresh(&self, workspace_id: &str) {
        self.inner.lock().unwrap().in_flight.remove(workspace_id);
    }

    async fn do_refresh(self: &Arc<Self>, ws: Workspace) {
        // All git operations are blocking (subprocess calls) — run on blocking thread.
        let mgr = self.manager.clone();
        let events = self.events.clone();
        let inner = self.inner.clone();
        let ws_id = ws.id.clone();
        let _ws_path = ws.path.clone();
        let ws2 = ws.clone();

        tokio::task::spawn_blocking(move || {
            refresh_workspace_sync(&mgr, &events, &inner, ws2);
        })
        .await
        .unwrap_or_else(|e| debug!(err = %e, id = ws_id, "PR refresh task panicked"));
    }

    fn find_by_path(&self, path: &str) -> Option<Workspace> {
        let path = path.trim();
        self.manager.list().into_iter().find(|w| w.path.trim() == path)
    }
}

fn refresh_workspace_sync(
    manager: &WorkspaceManager,
    events: &EventHub,
    inner: &Mutex<Inner>,
    ws: Workspace,
) {
    // Resolve current branch (sync subprocess).
    let branch = match manager.gits.current_branch(&ws.path) {
        Ok(b) => b.trim().to_string(),
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            if should_disable_for_branch_error(&msg) {
                set_pull_request(manager, events, inner, &ws, None, false);
                return;
            }
            debug!(err = %e, id = ws.id, "PR refresh: branch resolution failed");
            return;
        }
    };

    if branch.is_empty() || branch == "HEAD" {
        set_pull_request(manager, events, inner, &ws, None, true);
        return;
    }

    // Fetch PR details.
    let pr_result = manager.gits.branch_pull_request(&ws.path, &branch);
    let pr_status = match pr_result {
        Ok(s) => s,
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            if should_disable_for_pr_error(&msg) {
                set_pull_request(manager, events, inner, &ws, None, false);
                return;
            }
            debug!(err = %e, id = ws.id, "PR refresh: pr resolution failed");
            return;
        }
    };

    if !pr_status.found {
        set_pull_request(manager, events, inner, &ws, None, true);
        return;
    }

    let status = normalize_pr_status(&pr_status);
    let complete = status == "merged";
    let pr = WorkspacePullRequest {
        number: pr_status.number,
        title: pr_status.title.clone(),
        url: pr_status.url.clone(),
        branch: pr_status.head_ref_name.clone(),
        base_branch: pr_status.base_ref_name.clone(),
        github_state: pr_status.state.clone(),
        status: status.clone(),
        review_decision: pr_status.review_decision.clone(),
        is_draft: pr_status.is_draft,
        complete,
        updated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
        checks: pr_status.checks.clone(),
        deployments: pr_status.deployments.clone(),
    };

    set_pull_request(manager, events, inner, &ws, Some(pr), !complete);
}

fn set_pull_request(
    manager: &WorkspaceManager,
    events: &EventHub,
    inner: &Mutex<Inner>,
    ws: &Workspace,
    pr: Option<WorkspacePullRequest>,
    keep_active: bool,
) {
    // Get previous value.
    let prev = manager.get(&ws.id).ok().and_then(|w| w.pull_request);
    let _ = manager.set_pull_request(&ws.id, pr.clone());

    if pr_meaningfully_changed(prev.as_ref(), pr.as_ref()) {
        events.publish(FrontendEvent::new(
            "workspacePullRequestUpdated",
            json!({
                "workspaceId": ws.id,
                "workspaceWorktreePath": ws.path,
                "pullRequest": pr,
            }),
        ));
    }

    let mut guard = inner.lock().unwrap();
    if keep_active {
        if let Some(entry) = guard.active.get_mut(&ws.id) {
            entry.pull_request = pr;
        }
    } else {
        guard.active.remove(&ws.id);
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

fn normalize_pr_status(pr: &crate::workspace::types::GitBranchPullRequestStatus) -> String {
    let state = pr.state.trim().to_uppercase();
    if state == "MERGED" || !pr.merged_at.trim().is_empty() {
        return "merged".into();
    }
    if pr.is_draft {
        return "draft".into();
    }
    if pr.review_decision.trim().eq_ignore_ascii_case("REVIEW_REQUIRED") {
        return "review".into();
    }
    match state.as_str() {
        "OPEN" => "open".into(),
        "CLOSED" => "closed".into(),
        _ => state.to_lowercase(),
    }
}

fn pr_meaningfully_changed(
    prev: Option<&WorkspacePullRequest>,
    next: Option<&WorkspacePullRequest>,
) -> bool {
    match (prev, next) {
        (None, None) => false,
        (None, Some(_)) | (Some(_), None) => true,
        (Some(a), Some(b)) => {
            a.number != b.number
                || a.title != b.title
                || a.url != b.url
                || a.branch != b.branch
                || a.base_branch != b.base_branch
                || a.github_state != b.github_state
                || a.status != b.status
                || a.review_decision != b.review_decision
                || a.is_draft != b.is_draft
                || a.complete != b.complete
        }
    }
}

fn should_disable_for_branch_error(msg: &str) -> bool {
    msg.contains("workspace is not on a branch")
        || msg.contains("ambiguous argument 'head'")
        || msg.contains("unknown revision or path not in the working tree")
}

fn should_disable_for_pr_error(msg: &str) -> bool {
    msg.contains(GH_UNKNOWN_HOST_FRAGMENT)
        || msg.contains("no git remote")
        || msg.contains("no remotes")
}
