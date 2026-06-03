use crate::daemon::constants::*;
use crate::daemon::rpc::{decode_params, DomainRpcError};
use crate::workspace::manager::WorkspaceManager;
use crate::workspace::types::*;
use axum::extract::ws::Message;
use futures_util::SinkExt;
use serde_json::{json, Value};
use std::sync::Arc;

type Sink = Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>>>;

// ── Workspace dispatcher ──────────────────────────────────────────────────────

pub async fn workspace(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    mgr: &WorkspaceManager,
) -> Result<Value, DomainRpcError> {
    match method {
        METHOD_WORKSPACE_LIST => {
            let workspaces = mgr.list();
            Ok(json!(workspaces))
        }
        METHOD_WORKSPACE_OPEN => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { id: String, path: String, #[serde(default)] org_id: String, #[serde(default)] project_id: String }
            let req: Req = decode_params(params)?;
            let ws = mgr.open(req.id, req.path, req.org_id, req.project_id)?;
            Ok(json!(ws))
        }
        METHOD_WORKSPACE_CREATE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { id: String, path: String, #[serde(default)] org_id: String, #[serde(default)] project_id: String }
            let req: Req = decode_params(params)?;
            let ws = mgr.open(req.id, req.path, req.org_id, req.project_id)?;
            Ok(json!(ws))
        }
        METHOD_WORKSPACE_CLOSE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            mgr.close(&req.workspace_id)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_WORKSPACE_SYNC_CONTEXT_LINK => Ok(json!({ "ok": true })),
        METHOD_WORKSPACE_SET_ACTIVE => {
            let req: SetActiveWorkspaceRequest = decode_params(params)?;
            let resp = mgr.set_active_workspace(&req)?;
            Ok(json!(resp))
        }
        _ => Err(DomainRpcError::method_not_found(method)),
    }
}

// ── Git dispatcher ────────────────────────────────────────────────────────────

pub async fn git(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    mgr: &WorkspaceManager,
) -> Result<Value, DomainRpcError> {
    match method {
        METHOD_GIT_STATUS => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_status(&req.workspace_id)?))
        }
        METHOD_GIT_INSPECT => {
            #[derive(serde::Deserialize)]
            struct Req { path: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_inspect(&req.path)?))
        }
        METHOD_GIT_LIST_CHANGES => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_list_changes(&req.workspace_id)?))
        }
        METHOD_GIT_TRACK => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, paths: Vec<String> }
            let req: Req = decode_params(params)?;
            mgr.git_track(&req.workspace_id, &req.paths)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_UNSTAGE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, paths: Vec<String> }
            let req: Req = decode_params(params)?;
            mgr.git_unstage(&req.workspace_id, &req.paths)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_REVERT => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, paths: Vec<String> }
            let req: Req = decode_params(params)?;
            mgr.git_revert(&req.workspace_id, &req.paths)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_COMMIT => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, message: String, #[serde(default)] amend: bool, #[serde(default)] signoff: bool }
            let req: Req = decode_params(params)?;
            let out = mgr.git_commit(&req.workspace_id, &req.message, req.amend, req.signoff)?;
            Ok(json!({ "output": out }))
        }
        METHOD_GIT_BRANCH_STATUS => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_branch_status(&req.workspace_id)?))
        }
        METHOD_GIT_BRANCH_PR => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, #[serde(default)] branch: String }
            let req: Req = decode_params(params)?;
            let branch = if req.branch.is_empty() {
                let root = mgr.get(&req.workspace_id)?.path;
                mgr.gits.current_branch(&root)?
            } else {
                req.branch.clone()
            };
            Ok(json!(mgr.git_branch_pr(&req.workspace_id, &branch)?))
        }
        METHOD_GIT_COMMITS_TO_TARGET => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, target_branch: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_commits_to_target(&req.workspace_id, &req.target_branch)?))
        }
        METHOD_GIT_BRANCH_DIFF_SUMMARY => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, target_branch: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_branch_diff_summary(&req.workspace_id, &req.target_branch)?))
        }
        METHOD_GIT_COMMIT_DIFF => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, commit_hash: String, #[serde(default)] path: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_commit_diff(&req.workspace_id, &req.commit_hash, &req.path)?))
        }
        METHOD_GIT_BRANCH_DIFF => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, target_branch: String, #[serde(default)] path: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_branch_diff(&req.workspace_id, &req.target_branch, &req.path)?))
        }
        METHOD_GIT_BRANCHES => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.git_branches(&req.workspace_id)?))
        }
        METHOD_GIT_PUSH => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            let out = mgr.git_push(&req.workspace_id)?;
            Ok(json!({ "output": out }))
        }
        METHOD_GIT_PUBLISH => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            let out = mgr.git_publish(&req.workspace_id)?;
            Ok(json!({ "output": out }))
        }
        METHOD_GIT_RENAME_BRANCH => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, next_branch: String }
            let req: Req = decode_params(params)?;
            mgr.git_rename_branch(&req.workspace_id, &req.next_branch)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_REMOVE_BRANCH => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, branch: String, #[serde(default)] force: bool }
            let req: Req = decode_params(params)?;
            mgr.git_remove_branch(&req.workspace_id, &req.branch, req.force)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_PR_MERGE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, pr_number: i64, #[serde(default)] method: String, #[serde(default)] delete_branch: bool }
            let req: Req = decode_params(params)?;
            let out = mgr.git_pr_merge(&req.workspace_id, req.pr_number, &req.method, req.delete_branch)?;
            Ok(json!({ "output": out }))
        }
        METHOD_GIT_PR_CLOSE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, pr_number: i64 }
            let req: Req = decode_params(params)?;
            let out = mgr.git_pr_close(&req.workspace_id, req.pr_number)?;
            Ok(json!({ "output": out }))
        }
        METHOD_GIT_WORKTREE_CREATE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, branch: String, worktree_path: String, #[serde(default)] create_branch: bool, #[serde(default)] from_ref: String }
            let req: Req = decode_params(params)?;
            mgr.git_worktree_create(&req.workspace_id, &req.branch, &req.worktree_path, req.create_branch, &req.from_ref)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_WORKTREE_REMOVE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, worktree_path: String, #[serde(default)] force: bool }
            let req: Req = decode_params(params)?;
            mgr.git_worktree_remove(&req.workspace_id, &req.worktree_path, req.force)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_GIT_AUTHOR_NAME => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String }
            let req: Req = decode_params(params)?;
            let name = mgr.git_author_name(&req.workspace_id)?;
            Ok(json!({ "name": name }))
        }
        _ => Err(DomainRpcError::method_not_found(method)),
    }
}

// ── File dispatcher ───────────────────────────────────────────────────────────

pub async fn file(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    mgr: &WorkspaceManager,
) -> Result<Value, DomainRpcError> {
    match method {
        METHOD_FILE_LIST => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, #[serde(default)] path: String, #[serde(default)] recursive: bool }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.file_list(&req.workspace_id, &req.path, req.recursive)?))
        }
        METHOD_FILE_STAT => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.file_stat(&req.workspace_id, &req.path)?))
        }
        METHOD_FILE_READ => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String }
            let req: Req = decode_params(params)?;
            let content = mgr.file_read(&req.workspace_id, &req.path)?;
            Ok(json!({ "content": content }))
        }
        METHOD_FILE_WRITE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String, content: String, #[serde(default)] mode: u32 }
            let req: Req = decode_params(params)?;
            let bytes = mgr.file_write(&req.workspace_id, &req.path, &req.content, req.mode)?;
            Ok(json!({ "bytesWritten": bytes }))
        }
        METHOD_FILE_DELETE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String, #[serde(default)] recursive: bool }
            let req: Req = decode_params(params)?;
            mgr.file_delete(&req.workspace_id, &req.path, req.recursive)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_FILE_MOVE => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, from_path: String, to_path: String }
            let req: Req = decode_params(params)?;
            mgr.file_move(&req.workspace_id, &req.from_path, &req.to_path)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_FILE_MKDIR => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String, #[serde(default)] parents: bool, #[serde(default)] mode: u32 }
            let req: Req = decode_params(params)?;
            mgr.file_mkdir(&req.workspace_id, &req.path, req.parents, req.mode)?;
            Ok(json!({ "ok": true }))
        }
        METHOD_FILE_DIFF => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { workspace_id: String, path: String }
            let req: Req = decode_params(params)?;
            Ok(json!(mgr.file_read_diff(&req.workspace_id, &req.path)?))
        }
        _ => Err(DomainRpcError::method_not_found(method)),
    }
}

// ── Terminal dispatcher ───────────────────────────────────────────────────────

pub async fn terminal(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    mgr: &WorkspaceManager,
    _sink: Sink,
) -> Result<Value, DomainRpcError> {
    match method {
        METHOD_TERMINAL_START => {
            let req: TerminalStartRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_start(&req)?))
        }
        METHOD_TERMINAL_SEND => {
            let req: TerminalSendRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_send(&req)?))
        }
        METHOD_TERMINAL_READ => {
            let req: TerminalReadRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_read(&req)?))
        }
        METHOD_TERMINAL_STOP => {
            let req: TerminalStopRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_stop(&req)?))
        }
        METHOD_TERMINAL_KILL_PROCESS => {
            let req: TerminalKillProcessRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_kill_process(&req)?))
        }
        METHOD_TERMINAL_LIST_SESSIONS => {
            let req: TerminalListSessionsRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_list_sessions(&req)))
        }
        METHOD_TERMINAL_LIST_PORTS => {
            Ok(json!(mgr.terminal_list_ports()))
        }
        METHOD_TERMINAL_RESIZE => {
            let req: TerminalResizeRequest = decode_params(params)?;
            Ok(json!(mgr.terminal_resize(&req)?))
        }
        METHOD_TERMINAL_SUBSCRIBE => {
            // Subscription via binary fast-path; return session confirmation.
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req { session_id: String }
            let req: Req = decode_params(params)?;
            Ok(json!({ "subscribed": true, "sessionId": req.session_id }))
        }
        METHOD_TERMINAL_UNSUBSCRIBE => {
            let req: TerminalUnsubscribeRequest = decode_params(params)?;
            Ok(json!(TerminalUnsubscribeResponse { ok: true }))
        }
        _ => Err(DomainRpcError::method_not_found(method)),
    }
}
