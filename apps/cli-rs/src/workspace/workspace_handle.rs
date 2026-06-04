use crate::daemon::rpc::DomainRpcError;
use crate::workspace::{
    file_service::FileService, git_service::GitService, terminal::TerminalManager, types::*,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::RwLock;

/// Workspace-scoped facade over file, git, and terminal services.
pub struct WorkspaceHandle<'a> {
    pub(super) workspace: Workspace,
    pub(super) workspaces: &'a RwLock<HashMap<String, Workspace>>,
    pub(super) files: &'a FileService,
    pub(super) gits: &'a GitService,
    pub(super) terminals: &'a TerminalManager,
}

impl WorkspaceHandle<'_> {
    pub fn set_pull_request(&self, pr: Option<WorkspacePullRequest>) -> Result<(), DomainRpcError> {
        let mut workspaces = self.workspaces.write().unwrap();
        let workspace = workspaces.get_mut(&self.workspace.id).ok_or_else(|| {
            DomainRpcError::not_found(format!("workspace not found: {}", self.workspace.id))
        })?;
        workspace.pull_request = pr;
        Ok(())
    }

    pub fn file_list(&self, path: &str, recursive: bool) -> Result<Vec<FileEntry>, DomainRpcError> {
        self.files.list(&self.workspace.path, path, recursive)
    }

    pub fn file_stat(&self, path: &str) -> Result<FileEntry, DomainRpcError> {
        self.files.stat(&self.workspace.path, path)
    }

    pub fn file_read(&self, path: &str) -> Result<String, DomainRpcError> {
        self.files.read(&self.workspace.path, path)
    }

    pub fn file_write(
        &self,
        path: &str,
        content: &str,
        mode: u32,
    ) -> Result<usize, DomainRpcError> {
        self.files.write(&self.workspace.path, path, content, mode)
    }

    pub fn file_delete(&self, path: &str, recursive: bool) -> Result<(), DomainRpcError> {
        self.files.delete(&self.workspace.path, path, recursive)
    }

    pub fn file_move(&self, from: &str, to: &str) -> Result<(), DomainRpcError> {
        self.files.move_path(&self.workspace.path, from, to)
    }

    pub fn file_mkdir(&self, path: &str, parents: bool, mode: u32) -> Result<(), DomainRpcError> {
        self.files.mkdir(&self.workspace.path, path, parents, mode)
    }

    pub fn file_read_diff(&self, path: &str) -> Result<GitDiffContent, DomainRpcError> {
        self.files.read_diff(&self.workspace.path, path)
    }

    pub fn git_status(&self) -> Result<GitStatusResponse, DomainRpcError> {
        self.gits.status(&self.workspace.path)
    }

    pub fn git_inspect(&self) -> Result<GitInspectResult, DomainRpcError> {
        self.gits.inspect(&self.workspace.path)
    }

    pub fn git_list_changes(&self) -> Result<GitChangesBySection, DomainRpcError> {
        self.gits.list_changes(&self.workspace.path)
    }

    pub fn git_track(&self, paths: &[String]) -> Result<(), DomainRpcError> {
        self.gits.track_changes(&self.workspace.path, paths)
    }

    pub fn git_unstage(&self, paths: &[String]) -> Result<(), DomainRpcError> {
        self.gits.unstage_changes(&self.workspace.path, paths)
    }

    pub fn git_revert(&self, paths: &[String]) -> Result<(), DomainRpcError> {
        self.gits.revert_changes(&self.workspace.path, paths)
    }

    pub fn git_commit(
        &self,
        message: &str,
        amend: bool,
        signoff: bool,
    ) -> Result<String, DomainRpcError> {
        self.gits
            .commit_changes(&self.workspace.path, message, amend, signoff)
    }

    pub fn current_branch(&self) -> Result<String, DomainRpcError> {
        self.gits.current_branch(&self.workspace.path)
    }

    pub fn git_branch_status(&self) -> Result<GitBranchStatus, DomainRpcError> {
        self.gits.branch_status(&self.workspace.path)
    }

    pub fn git_branch_pr(
        &self,
        branch: &str,
    ) -> Result<GitBranchPullRequestStatus, DomainRpcError> {
        self.gits.branch_pull_request(&self.workspace.path, branch)
    }

    pub fn git_commits_to_target(
        &self,
        target: &str,
    ) -> Result<GitCommitComparison, DomainRpcError> {
        self.gits
            .list_commits_to_target(&self.workspace.path, target)
    }

    pub fn git_branch_diff_summary(
        &self,
        target: &str,
    ) -> Result<GitBranchDiffSummary, DomainRpcError> {
        self.gits.branch_diff_summary(&self.workspace.path, target)
    }

    pub fn git_commit_diff(
        &self,
        hash: &str,
        path: &str,
    ) -> Result<GitDiffContent, DomainRpcError> {
        self.gits.read_commit_diff(&self.workspace.path, hash, path)
    }

    pub fn git_branch_diff(
        &self,
        target: &str,
        path: &str,
    ) -> Result<GitDiffContent, DomainRpcError> {
        self.gits
            .read_branch_comparison_diff(&self.workspace.path, target, path)
    }

    pub fn git_branches(&self) -> Result<GitBranchList, DomainRpcError> {
        self.gits.list_branches(&self.workspace.path)
    }

    pub fn git_push(&self) -> Result<String, DomainRpcError> {
        self.gits.push_branch(&self.workspace.path)
    }

    pub fn git_publish(&self) -> Result<String, DomainRpcError> {
        self.gits.publish_branch(&self.workspace.path)
    }

    pub fn git_rename_branch(&self, next_branch: &str) -> Result<(), DomainRpcError> {
        self.gits.rename_branch(&self.workspace.path, next_branch)
    }

    pub fn git_remove_branch(&self, branch: &str, force: bool) -> Result<(), DomainRpcError> {
        self.gits.remove_branch(&self.workspace.path, branch, force)
    }

    pub fn git_pr_merge(
        &self,
        pr_number: i64,
        method: &str,
        delete_branch: bool,
    ) -> Result<String, DomainRpcError> {
        self.gits
            .merge_pull_request(&self.workspace.path, pr_number, method, delete_branch)
    }

    pub fn git_pr_close(&self, pr_number: i64) -> Result<String, DomainRpcError> {
        self.gits
            .close_pull_request(&self.workspace.path, pr_number)
    }

    pub fn git_worktree_create(
        &self,
        branch: &str,
        worktree_path: &str,
        create_branch: bool,
        from_ref: &str,
    ) -> Result<(), DomainRpcError> {
        self.gits.create_worktree(
            &self.workspace.path,
            branch,
            worktree_path,
            create_branch,
            from_ref,
        )
    }

    pub fn git_worktree_remove(
        &self,
        worktree_path: &str,
        force: bool,
    ) -> Result<(), DomainRpcError> {
        let main_worktree_path = self.gits.main_worktree_path(&self.workspace.path)?;
        self.gits
            .remove_worktree(&main_worktree_path, worktree_path, force)
    }

    pub fn git_author_name(&self) -> Result<String, DomainRpcError> {
        self.gits.author_name(&self.workspace.path)
    }

    pub fn terminal_start(
        &self,
        req: &TerminalStartRequest,
    ) -> Result<TerminalStartResponse, DomainRpcError> {
        self.terminals.start(&self.workspace.path, req)
    }

    pub fn terminal_send(
        &self,
        req: &TerminalSendRequest,
    ) -> Result<TerminalSendResponse, DomainRpcError> {
        self.terminals.send(req)
    }

    pub fn terminal_read(
        &self,
        req: &TerminalReadRequest,
    ) -> Result<TerminalReadResponse, DomainRpcError> {
        self.terminals.read(req)
    }

    pub fn terminal_stop(
        &self,
        req: &TerminalStopRequest,
    ) -> Result<TerminalStopResponse, DomainRpcError> {
        self.terminals.stop(req)
    }

    pub fn terminal_list_sessions(&self) -> Vec<TerminalSessionSummary> {
        self.terminals.list_sessions(&TerminalListSessionsRequest {
            workspace_id: Some(self.workspace.id.clone()),
        })
    }

    pub fn terminal_resize(
        &self,
        req: &TerminalResizeRequest,
    ) -> Result<TerminalResizeResponse, DomainRpcError> {
        self.terminals.resize(req)
    }

    pub fn terminal_subscribe_output(
        &self,
        session_id: &str,
        sink: Arc<
            tokio::sync::Mutex<
                futures_util::stream::SplitSink<
                    axum::extract::ws::WebSocket,
                    axum::extract::ws::Message,
                >,
            >,
        >,
    ) -> Result<(), DomainRpcError> {
        self.terminals.subscribe_output(session_id, sink)
    }
}
