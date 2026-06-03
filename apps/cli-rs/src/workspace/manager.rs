use crate::daemon::rpc::DomainRpcError;
use crate::workspace::{
    file_service::FileService,
    git_service::GitService,
    terminal::TerminalManager,
    types::*,
};
use std::collections::HashMap;
use std::sync::RwLock;

/// Composition root for all workspace-scoped services.
/// Fixes A1 by splitting FileService, GitService, TerminalManager into owned structs.
pub struct WorkspaceManager {
    workspaces: RwLock<HashMap<String, Workspace>>,
    pub files: FileService,
    pub gits: GitService,
    pub terminals: TerminalManager,
}

impl WorkspaceManager {
    pub fn new() -> Self {
        Self {
            workspaces: RwLock::new(HashMap::new()),
            files: FileService::new(),
            gits: GitService::new(),
            terminals: TerminalManager::new(),
        }
    }

    // ── Workspace lifecycle ───────────────────────────────────────────────────

    pub fn open(&self, id: String, path: String, org_id: String, project_id: String) -> Result<Workspace, DomainRpcError> {
        if id.is_empty() || path.is_empty() {
            return Err(DomainRpcError::invalid_params("id and path are required"));
        }
        let abs_path = std::fs::canonicalize(&path)
            .map_err(|e| DomainRpcError::not_found(format!("workspace path: {e}")))?;
        if !abs_path.is_dir() {
            return Err(DomainRpcError::invalid_params("workspace path must be a directory"));
        }
        let ws = Workspace {
            id: id.clone(),
            path: abs_path.to_string_lossy().into_owned(),
            org_id,
            project_id,
            pull_request: None,
        };
        self.workspaces.write().unwrap().insert(id, ws.clone());
        Ok(ws)
    }

    pub fn list(&self) -> Vec<Workspace> {
        self.workspaces.read().unwrap().values().cloned().collect()
    }

    pub fn close(&self, workspace_id: &str) -> Result<(), DomainRpcError> {
        let mut ws_map = self.workspaces.write().unwrap();
        ws_map.remove(workspace_id)
            .ok_or_else(|| DomainRpcError::not_found(format!("workspace not found: {workspace_id}")))?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Workspace, DomainRpcError> {
        self.workspaces.read().unwrap().get(id)
            .cloned()
            .ok_or_else(|| DomainRpcError::not_found(format!("workspace not found: {id}")))
    }

    pub fn set_pull_request(&self, id: &str, pr: Option<WorkspacePullRequest>) -> Result<(), DomainRpcError> {
        let mut map = self.workspaces.write().unwrap();
        let ws = map.get_mut(id)
            .ok_or_else(|| DomainRpcError::not_found(format!("workspace not found: {id}")))?;
        ws.pull_request = pr;
        Ok(())
    }

    // ── File ops (delegate to FileService) ───────────────────────────────────

    fn ws_path(&self, workspace_id: &str) -> Result<String, DomainRpcError> {
        Ok(self.get(workspace_id)?.path)
    }

    pub fn file_list(&self, workspace_id: &str, path: &str, recursive: bool) -> Result<Vec<FileEntry>, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.list(&root, path, recursive)
    }
    pub fn file_stat(&self, workspace_id: &str, path: &str) -> Result<FileEntry, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.stat(&root, path)
    }
    pub fn file_read(&self, workspace_id: &str, path: &str) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.read(&root, path)
    }
    pub fn file_write(&self, workspace_id: &str, path: &str, content: &str, mode: u32) -> Result<usize, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.write(&root, path, content, mode)
    }
    pub fn file_delete(&self, workspace_id: &str, path: &str, recursive: bool) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.delete(&root, path, recursive)
    }
    pub fn file_move(&self, workspace_id: &str, from: &str, to: &str) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.move_path(&root, from, to)
    }
    pub fn file_mkdir(&self, workspace_id: &str, path: &str, parents: bool, mode: u32) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.mkdir(&root, path, parents, mode)
    }
    pub fn file_read_diff(&self, workspace_id: &str, path: &str) -> Result<GitDiffContent, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.files.read_diff(&root, path)
    }

    // ── Git ops (delegate to GitService) ─────────────────────────────────────

    pub fn git_status(&self, workspace_id: &str) -> Result<GitStatusResponse, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.status(&root)
    }
    pub fn git_inspect(&self, path: &str) -> Result<GitInspectResult, DomainRpcError> {
        self.gits.inspect(path)
    }
    pub fn git_list_changes(&self, workspace_id: &str) -> Result<GitChangesBySection, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.list_changes(&root)
    }
    pub fn git_track(&self, workspace_id: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.track_changes(&root, paths)
    }
    pub fn git_unstage(&self, workspace_id: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.unstage_changes(&root, paths)
    }
    pub fn git_revert(&self, workspace_id: &str, paths: &[String]) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.revert_changes(&root, paths)
    }
    pub fn git_commit(&self, workspace_id: &str, msg: &str, amend: bool, signoff: bool) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.commit_changes(&root, msg, amend, signoff)
    }
    pub fn git_branch_status(&self, workspace_id: &str) -> Result<GitBranchStatus, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.branch_status(&root)
    }
    pub fn git_branch_pr(&self, workspace_id: &str, branch: &str) -> Result<GitBranchPullRequestStatus, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.branch_pull_request(&root, branch)
    }
    pub fn git_commits_to_target(&self, workspace_id: &str, target: &str) -> Result<GitCommitComparison, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.list_commits_to_target(&root, target)
    }
    pub fn git_branch_diff_summary(&self, workspace_id: &str, target: &str) -> Result<GitBranchDiffSummary, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.branch_diff_summary(&root, target)
    }
    pub fn git_commit_diff(&self, workspace_id: &str, hash: &str, path: &str) -> Result<GitDiffContent, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.read_commit_diff(&root, hash, path)
    }
    pub fn git_branch_diff(&self, workspace_id: &str, target: &str, path: &str) -> Result<GitDiffContent, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.read_branch_comparison_diff(&root, target, path)
    }
    pub fn git_branches(&self, workspace_id: &str) -> Result<GitBranchList, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.list_branches(&root)
    }
    pub fn git_push(&self, workspace_id: &str) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.push_branch(&root)
    }
    pub fn git_publish(&self, workspace_id: &str) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.publish_branch(&root)
    }
    pub fn git_rename_branch(&self, workspace_id: &str, next: &str) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.rename_branch(&root, next)
    }
    pub fn git_remove_branch(&self, workspace_id: &str, branch: &str, force: bool) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.remove_branch(&root, branch, force)
    }
    pub fn git_pr_merge(&self, workspace_id: &str, pr: i64, method: &str, del: bool) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.merge_pull_request(&root, pr, method, del)
    }
    pub fn git_pr_close(&self, workspace_id: &str, pr: i64) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.close_pull_request(&root, pr)
    }
    pub fn git_worktree_create(&self, workspace_id: &str, branch: &str, wt_path: &str, create: bool, from: &str) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.create_worktree(&root, branch, wt_path, create, from)
    }
    pub fn git_worktree_remove(&self, workspace_id: &str, wt_path: &str, force: bool) -> Result<(), DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        let main = self.gits.main_worktree_path(&root)?;
        self.gits.remove_worktree(&main, wt_path, force)
    }
    pub fn git_author_name(&self, workspace_id: &str) -> Result<String, DomainRpcError> {
        let root = self.ws_path(workspace_id)?;
        self.gits.author_name(&root)
    }

    // ── Terminal ops (delegate to TerminalManager) ────────────────────────────

    pub fn terminal_start(&self, req: &TerminalStartRequest) -> Result<TerminalStartResponse, DomainRpcError> {
        let root = self.ws_path(&req.workspace_id)?;
        self.terminals.start(&root, req)
    }
    pub fn terminal_send(&self, req: &TerminalSendRequest) -> Result<TerminalSendResponse, DomainRpcError> {
        self.terminals.send(req)
    }
    pub async fn terminal_send_raw(&self, session_id: &str, data: &[u8]) {
        self.terminals.send_raw(session_id, data);
    }
    pub fn terminal_read(&self, req: &TerminalReadRequest) -> Result<TerminalReadResponse, DomainRpcError> {
        self.terminals.read(req)
    }
    pub fn terminal_stop(&self, req: &TerminalStopRequest) -> Result<TerminalStopResponse, DomainRpcError> {
        self.terminals.stop(req)
    }
    pub fn terminal_kill_process(&self, req: &TerminalKillProcessRequest) -> Result<TerminalKillProcessResponse, DomainRpcError> {
        self.terminals.kill_process(req)
    }
    pub fn terminal_list_sessions(&self, req: &TerminalListSessionsRequest) -> Vec<TerminalSessionSummary> {
        self.terminals.list_sessions(req)
    }
    pub fn terminal_list_ports(&self) -> Vec<TerminalDetectedPort> {
        self.terminals.list_detected_ports()
    }
    pub fn terminal_resize(&self, req: &TerminalResizeRequest) -> Result<TerminalResizeResponse, DomainRpcError> {
        self.terminals.resize(req)
    }
    pub fn set_active_workspace(&self, req: &SetActiveWorkspaceRequest) -> Result<SetActiveWorkspaceResponse, DomainRpcError> {
        self.terminals.set_active_workspace(req)
    }
}

impl Default for WorkspaceManager {
    fn default() -> Self { Self::new() }
}
