use serde::{Deserialize, Serialize};

/// A workspace registered with the daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub org_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pull_request: Option<WorkspacePullRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePullRequest {
    pub number: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub branch: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub base_branch: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub github_state: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub status: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub review_decision: String,
    #[serde(default)]
    pub is_draft: bool,
    #[serde(default)]
    pub complete: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub checks: Vec<GitPullRequestCheck>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deployments: Vec<GitPullRequestDeployment>,
}

// ── Git types (shared between workspace types and git_service) ────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestCheck {
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub workflow: String,
    pub state: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestDeployment {
    pub id: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub environment: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub state: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub environment_url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub created_at: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub original_payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    pub branch: String,
    pub files: Vec<String>,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub kind: String,
    pub additions: i64,
    pub deletions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitChangesBySection {
    pub unstaged: Vec<GitChange>,
    pub staged: Vec<GitChange>,
    pub untracked: Vec<GitChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchStatus {
    pub has_upstream: bool,
    pub ahead_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchPullRequestStatus {
    pub found: bool,
    pub branch: String,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub number: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub state: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub review_decision: String,
    #[serde(default)]
    pub is_draft: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub merged_at: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub head_ref_name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub base_ref_name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub checks: Vec<GitPullRequestCheck>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deployments: Vec<GitPullRequestDeployment>,
}

fn is_zero(v: &i64) -> bool { *v == 0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub committed_at: String,
    pub subject: String,
    #[serde(default)]
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitComparison {
    pub current_branch: String,
    pub target_branch: String,
    pub all_changed_files: Vec<String>,
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchDiffSummary {
    pub file_count: i64,
    pub additions: i64,
    pub deletions: i64,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffContent {
    pub old_content: String,
    pub new_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchList {
    pub current_branch: String,
    pub branches: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub local_branches: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub remote_branches: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub worktree_branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitInspectResult {
    pub is_git_repository: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub remote_url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub current_branch: String,
}

// ── File types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(default)]
    pub is_ignored: bool,
    pub size: u64,
    pub modified_at: String,
}

// ── Terminal request/response types ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    /// Environment variables as "KEY=value" strings, matching the desktop wire format.
    #[serde(default)]
    pub env: Option<Vec<String>>,
    #[serde(default)]
    pub cols: Option<u16>,
    #[serde(default)]
    pub rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartResponse {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSendRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSendResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalReadRequest {
    pub session_id: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalReadResponse {
    pub output: String,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStopRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStopResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalKillProcessRequest {
    pub session_id: String,
    pub signal: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalKillProcessResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalListSessionsRequest {
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSummary {
    pub session_id: String,
    pub workspace_id: String,
    pub running: bool,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDetectedPort {
    pub session_id: String,
    pub workspace_id: String,
    pub port: u16,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeRequest {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeResponse {
    pub ok: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSubscribeRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalUnsubscribeRequest {
    pub session_id: String,
    pub subscription_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalUnsubscribeResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveWorkspaceRequest {
    pub workspace_id: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveWorkspaceResponse {
    pub ok: bool,
}
