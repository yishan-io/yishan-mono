use crate::daemon::rpc::DomainRpcError;
use crate::workspace::{
    file_service::FileService, git_service::GitService, terminal::TerminalManager, types::*,
    workspace_handle::WorkspaceHandle,
};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Composition root for all workspace-scoped services.
/// Fixes A1 by splitting FileService, GitService, TerminalManager into owned structs.
pub struct WorkspaceManager {
    workspaces: RwLock<HashMap<String, Workspace>>,
    files: FileService,
    gits: GitService,
    terminals: TerminalManager,
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

    pub fn open(
        &self,
        id: String,
        path: String,
        org_id: String,
        project_id: String,
    ) -> Result<Workspace, DomainRpcError> {
        if id.is_empty() || path.is_empty() {
            return Err(DomainRpcError::invalid_params("id and path are required"));
        }
        let abs_path = std::fs::canonicalize(&path)
            .map_err(|e| DomainRpcError::not_found(format!("workspace path: {e}")))?;
        if !abs_path.is_dir() {
            return Err(DomainRpcError::invalid_params(
                "workspace path must be a directory",
            ));
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
        ws_map.remove(workspace_id).ok_or_else(|| {
            DomainRpcError::not_found(format!("workspace not found: {workspace_id}"))
        })?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Workspace, DomainRpcError> {
        self.workspaces
            .read()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| DomainRpcError::not_found(format!("workspace not found: {id}")))
    }

    pub fn workspace(&self, workspace_id: &str) -> Result<WorkspaceHandle<'_>, DomainRpcError> {
        Ok(WorkspaceHandle {
            workspace: self.get(workspace_id)?,
            workspaces: &self.workspaces,
            files: &self.files,
            gits: &self.gits,
            terminals: &self.terminals,
        })
    }

    pub fn workspace_for_terminal_session(
        &self,
        session_id: &str,
    ) -> Result<WorkspaceHandle<'_>, DomainRpcError> {
        let workspace_id = self.terminals.workspace_id_for_session(session_id)?;
        self.workspace(&workspace_id)
    }

    pub fn git_inspect_path(&self, path: &str) -> Result<GitInspectResult, DomainRpcError> {
        self.gits.inspect(path)
    }

    pub fn set_terminal_detected_ports_listener(
        &self,
        listener: Arc<dyn Fn(Vec<TerminalDetectedPort>) + Send + Sync>,
    ) {
        self.terminals.set_ports_changed_listener(listener);
    }

    // ── Terminal ops (non-workspace-scoped) ───────────────────────────────────

    pub async fn terminal_send_raw(&self, session_id: &str, data: &[u8]) {
        self.terminals.send_raw(session_id, data);
    }
    pub fn terminal_kill_process(
        &self,
        req: &TerminalKillProcessRequest,
    ) -> Result<TerminalKillProcessResponse, DomainRpcError> {
        self.terminals.kill_process(req)
    }
    pub fn terminal_list_ports(&self) -> Vec<TerminalDetectedPort> {
        self.terminals.list_detected_ports()
    }

    pub fn terminal_list_sessions(&self) -> Vec<TerminalSessionSummary> {
        self.terminals
            .list_sessions(&TerminalListSessionsRequest { workspace_id: None })
    }

    pub fn set_active_workspace(
        &self,
        req: &SetActiveWorkspaceRequest,
    ) -> Result<SetActiveWorkspaceResponse, DomainRpcError> {
        self.terminals.set_active_workspace(req)
    }
}

impl Default for WorkspaceManager {
    fn default() -> Self {
        Self::new()
    }
}
