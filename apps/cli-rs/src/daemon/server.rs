use crate::daemon::constants::*;
use crate::daemon::event_hub::EventHub;
use crate::daemon::pr_tracker::PrTracker;
use crate::daemon::rpc::{
    decode_params, DomainRpcError, RpcError, RpcNotification, RpcRequest, RpcResponse,
};
use crate::daemon::token_usage::TokenUsageCollector;
use crate::relay::{run_relay_client_loop, RelayStatus};
use crate::runtime::AppRuntime;
use crate::watcher::WorkspaceWatchers;
use crate::workspace::manager::WorkspaceManager;
use axum::extract::ws::{Message, WebSocket};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

/// Central daemon application — composition root (fixes A2).
/// Holds all subsystem references as `Arc<T>` so they can be injected individually.
#[derive(Clone)]
pub struct DaemonApp {
    pub runtime: AppRuntime,
    pub manager: Arc<WorkspaceManager>,
    pub events: Arc<EventHub>,
    pub node_id: Arc<String>,
    pub version: &'static str,
    pub pr_tracker: Arc<PrTracker>,
    pub token_usage: Arc<TokenUsageCollector>,
    pub watchers: Arc<WorkspaceWatchers>,
    pub relay_status: RelayStatus,
}

impl DaemonApp {
    pub fn new(runtime: AppRuntime, node_id: String) -> Self {
        let events = Arc::new(EventHub::new());
        let manager = Arc::new(WorkspaceManager::new());
        let pr_tracker = PrTracker::new(manager.clone(), events.clone());
        let token_usage = TokenUsageCollector::new();
        let watchers = Arc::new(WorkspaceWatchers::new(events.clone()));
        let relay_url = runtime.config().daemon.relay_url.clone();
        let relay_status = RelayStatus::new(!relay_url.is_empty(), relay_url);
        Self {
            runtime,
            manager,
            events,
            node_id: Arc::new(node_id),
            version: crate::buildinfo::VERSION,
            pr_tracker,
            token_usage,
            watchers,
            relay_status,
        }
    }

    /// Start all background services.  Called once after the axum server is bound.
    pub fn start_background_services(self: &Arc<Self>) {
        self.pr_tracker.start();
        self.token_usage.start_startup_scan();

        // Start relay client if URL is configured.
        let relay_url = self.runtime.config().daemon.relay_url.clone();
        if !relay_url.is_empty() {
            info!(url = relay_url, "starting relay client");
            let app = self.clone();
            let node_id = (*self.node_id).clone();
            let status = self.relay_status.clone();
            tokio::spawn(async move {
                run_relay_client_loop(app, node_id, relay_url, status).await;
            });
        }
    }
}

/// Handle a single upgraded WebSocket connection.
///
/// Architecture:
/// - One Tokio task per connection (the outer loop reads frames).
/// - JSON-RPC requests are dispatched into separate tasks (bounded by `MAX_IN_FLIGHT_RPC`).
/// - Binary frames are terminal I/O fast-path: handled synchronously in the read loop.
/// - Event-stream subscriptions write directly to the sink from their own task.
pub async fn handle_ws(socket: WebSocket, app: Arc<DaemonApp>) {
    let (sink, mut stream) = socket.split();
    // Wrap sink in an Arc<Mutex> so multiple tasks can write.
    let sink = Arc::new(tokio::sync::Mutex::new(sink));
    let semaphore = Arc::new(Semaphore::new(MAX_IN_FLIGHT_RPC));

    // CancellationToken for this connection — all child tasks are cancelled when
    // the connection closes. Fixes C2 (relay-context cancellation applied here too).
    let cancel = tokio_util::sync::CancellationToken::new();

    while let Some(msg_result) = stream.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                debug!(err = %e, "websocket read error");
                break;
            }
        };

        match msg {
            Message::Binary(data) => {
                handle_binary_frame(data, &app).await;
            }
            Message::Text(text) => {
                let data = Bytes::copy_from_slice(text.as_bytes());
                let app = app.clone();
                let sink = sink.clone();
                let sem = semaphore.clone();
                let cancel = cancel.clone();

                // Acquire a semaphore permit before spawning — blocks if at limit.
                let permit = match sem.acquire_owned().await {
                    Ok(p) => p,
                    Err(_) => break, // semaphore closed
                };

                tokio::spawn(async move {
                    let _permit = permit; // released when task completes

                    // Skip handling if the connection has been cancelled.
                    if cancel.is_cancelled() {
                        return;
                    }

                    let response = handle_rpc_frame(&data, &app, sink.clone()).await;
                    if let Some(resp) = response {
                        let json = serde_json::to_string(&resp)
                            .unwrap_or_else(|_| r#"{"jsonrpc":"2.0","error":{"code":-32603,"message":"internal error"}}"#.to_string());
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Text(json.into())).await {
                            debug!(err = %e, "websocket write error");
                        }
                    }
                });
            }
            Message::Close(_) => break,
            Message::Ping(data) => {
                let sink = sink.clone();
                tokio::spawn(async move {
                    let mut s = sink.lock().await;
                    let _ = s.send(Message::Pong(data)).await;
                });
            }
            _ => {}
        }
    }

    cancel.cancel();
    debug!("websocket connection closed");
}

/// Handle a binary frame (terminal I/O fast-path).
/// Frame format: [1 byte opcode][session-id (null-terminated)][payload]
async fn handle_binary_frame(data: Bytes, app: &DaemonApp) {
    if data.len() < 3 {
        return;
    }
    let opcode = data[0];
    let rest = &data[1..];

    if opcode == BIN_OPCODE_TERMINAL_INPUT {
        let null_pos = rest.iter().position(|&b| b == 0);
        let Some(null_idx) = null_pos else { return };
        let session_id = match std::str::from_utf8(&rest[..null_idx]) {
            Ok(s) => s,
            Err(_) => return,
        };
        let input_data = &rest[null_idx + 1..];
        if input_data.is_empty() {
            return;
        }
        app.manager.terminal_send_raw(session_id, input_data).await;
    }
}

/// Handle a JSON-RPC text frame.
/// Returns `Some(RpcResponse)` if a response should be sent back.
async fn handle_rpc_frame(
    data: &[u8],
    app: &DaemonApp,
    sink: Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<WebSocket, Message>>>,
) -> Option<RpcResponse> {
    let req: RpcRequest = match serde_json::from_slice(data) {
        Ok(r) => r,
        Err(_) => {
            return Some(RpcResponse::error(
                None,
                RpcError { code: RPC_PARSE_ERROR, message: "parse error".into() },
            ));
        }
    };

    if req.jsonrpc != "2.0" {
        return Some(RpcResponse::error(
            req.id,
            RpcError { code: RPC_INVALID_REQUEST, message: "invalid request".into() },
        ));
    }

    let id = req.id.clone();
    let is_notification = id.is_none();

    let result = dispatch_rpc(req, app, sink).await;

    if is_notification {
        return None;
    }

    Some(match result {
        Ok(value) => RpcResponse::success(id, value),
        Err(rpc_err) => RpcResponse::error(id, rpc_err),
    })
}

/// Route a JSON-RPC method to the appropriate subsystem handler.
async fn dispatch_rpc(
    req: RpcRequest,
    app: &DaemonApp,
    sink: Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<WebSocket, Message>>>,
) -> Result<Value, RpcError> {
    let method = req.method.as_str();
    let params = req.params.as_deref();

    let result: Result<Value, DomainRpcError> = match method {
        // ── System ───────────────────────────────────────────────────────────
        METHOD_DAEMON_PING => Ok(json!({ "status": "ok" })),

        METHOD_FRONTEND_EVENTS_STREAM => {
            let mut rx = app.events.subscribe();
            let sink = sink.clone();
            tokio::spawn(async move {
                loop {
                    match rx.recv().await {
                        Ok(event) => {
                            let notif = RpcNotification::new(
                                METHOD_FRONTEND_EVENTS_STREAM,
                                json!({ "topic": event.topic, "payload": event.payload }),
                            );
                            let json = serde_json::to_string(&notif).unwrap_or_default();
                            let mut s = sink.lock().await;
                            if s.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            warn!(dropped = n, "event hub: subscriber lagged, some events dropped");
                            // Notify frontend to resync state.
                            let notif = RpcNotification::new(
                                "frontend.eventsDropped",
                                json!({ "dropped": n }),
                            );
                            let json = serde_json::to_string(&notif).unwrap_or_default();
                            let mut s = sink.lock().await;
                            if s.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
            Ok(json!({ "subscribed": true }))
        }

        METHOD_APP_GET_ACCESS_TOKEN => {
            let cfg = app.runtime.config();
            if cfg.api.token.is_empty() {
                return Err(DomainRpcError::server_error("not authenticated").into());
            }
            Ok(json!({
                "accessToken": cfg.api.token,
                "accessTokenExpiresAt": cfg.api.access_token_expires_at,
            }))
        }

        METHOD_APP_CHECK_AUTH_STATUS => {
            let cfg = app.runtime.config();
            let authenticated = !cfg.api.token.is_empty();
            Ok(json!({
                "authenticated": authenticated,
                "accessTokenExpiresAt": cfg.api.access_token_expires_at,
            }))
        }

        METHOD_APP_PERSIST_AUTH_TOKENS => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Req {
                access_token: String,
                refresh_token: String,
                access_token_expires_at: String,
                refresh_token_expires_at: String,
            }
            let req: Req = decode_params(params)?;
            let access_token = req.access_token.trim().to_string();
            if access_token.is_empty() {
                return Err(DomainRpcError::invalid_params("accessToken is required").into());
            }
            app.runtime
                .persist_tokens(
                    &access_token,
                    &req.refresh_token,
                    &req.access_token_expires_at,
                    &req.refresh_token_expires_at,
                )
                .map_err(|e| DomainRpcError::server_error(e.to_string()))?;
            Ok(json!({ "ok": true }))
        }

        METHOD_APP_LOGOUT => {
            app.runtime.clear_auth();
            Ok(json!({ "ok": true }))
        }

        METHOD_APP_RELOAD_AUTH_CONFIG => {
            app.runtime
                .reload_auth_from_disk()
                .map_err(|e| DomainRpcError::server_error(e.to_string()))?;
            Ok(json!({ "ok": true }))
        }

        METHOD_TOKEN_USAGE_DEBUG_STATE => Ok(json!({
            "enabled": true,
            "supportedAgents": crate::daemon::token_usage::SUPPORTED_AGENT_KINDS,
        })),

        METHOD_AGENT_LIST_DETECTION_STATUSES => {
            let statuses = tokio::task::spawn_blocking(|| {
                crate::daemon::cli_detector::detect_agent_clis(false)
            })
            .await
            .map_err(|_| DomainRpcError::server_error("cli detection task failed"))?;
            Ok(serde_json::to_value(statuses).unwrap_or(json!([])))
        }

        METHOD_CLI_TOOL_LIST_STATUSES => {
            let all = tokio::task::spawn_blocking(|| {
                crate::daemon::cli_detector::detect_all(false)
            })
            .await
            .map_err(|_| DomainRpcError::server_error("cli detection task failed"))?;
            Ok(serde_json::to_value(all).unwrap_or(json!([])))
        }

        METHOD_INTEGRATION_GITHUB_STATUS => {
            let status = tokio::task::spawn_blocking(|| {
                crate::daemon::cli_detector::detect_gh(false)
            })
            .await
            .map_err(|_| DomainRpcError::server_error("gh detection task failed"))?;
            Ok(serde_json::to_value(status).unwrap_or(json!({ "connected": false })))
        }

        // ── Workspace ────────────────────────────────────────────────────────
        m if is_workspace_method(m) => {
            dispatch_workspace(m, params, app).await
        }

        // ── Git ──────────────────────────────────────────────────────────────
        m if is_git_method(m) => {
            dispatch_git(m, params, app).await
        }

        // ── File ─────────────────────────────────────────────────────────────
        m if is_file_method(m) => {
            dispatch_file(m, params, app).await
        }

        // ── Terminal ─────────────────────────────────────────────────────────
        m if is_terminal_method(m) => {
            dispatch_terminal(m, params, app, sink).await
        }

        _ => Err(DomainRpcError::method_not_found(method)),
    };

    result.map_err(|e| e.into())
}

fn is_workspace_method(m: &str) -> bool {
    matches!(
        m,
        METHOD_WORKSPACE_OPEN
            | METHOD_WORKSPACE_LIST
            | METHOD_WORKSPACE_CREATE
            | METHOD_WORKSPACE_CLOSE
            | METHOD_WORKSPACE_SYNC_CONTEXT_LINK
            | METHOD_WORKSPACE_SET_ACTIVE
    )
}

fn is_git_method(m: &str) -> bool {
    matches!(
        m,
        METHOD_GIT_STATUS
            | METHOD_GIT_INSPECT
            | METHOD_GIT_LIST_CHANGES
            | METHOD_GIT_TRACK
            | METHOD_GIT_UNSTAGE
            | METHOD_GIT_REVERT
            | METHOD_GIT_COMMIT
            | METHOD_GIT_BRANCH_STATUS
            | METHOD_GIT_BRANCH_PR
            | METHOD_GIT_COMMITS_TO_TARGET
            | METHOD_GIT_BRANCH_DIFF_SUMMARY
            | METHOD_GIT_COMMIT_DIFF
            | METHOD_GIT_BRANCH_DIFF
            | METHOD_GIT_BRANCHES
            | METHOD_GIT_PUSH
            | METHOD_GIT_PUBLISH
            | METHOD_GIT_RENAME_BRANCH
            | METHOD_GIT_REMOVE_BRANCH
            | METHOD_GIT_PR_MERGE
            | METHOD_GIT_PR_CLOSE
            | METHOD_GIT_WORKTREE_CREATE
            | METHOD_GIT_WORKTREE_REMOVE
            | METHOD_GIT_AUTHOR_NAME
    )
}

fn is_file_method(m: &str) -> bool {
    matches!(
        m,
        METHOD_FILE_READ
            | METHOD_FILE_LIST
            | METHOD_FILE_STAT
            | METHOD_FILE_WRITE
            | METHOD_FILE_DELETE
            | METHOD_FILE_MOVE
            | METHOD_FILE_MKDIR
            | METHOD_FILE_DIFF
    )
}

fn is_terminal_method(m: &str) -> bool {
    matches!(
        m,
        METHOD_TERMINAL_START
            | METHOD_TERMINAL_SEND
            | METHOD_TERMINAL_READ
            | METHOD_TERMINAL_STOP
            | METHOD_TERMINAL_KILL_PROCESS
            | METHOD_TERMINAL_LIST_SESSIONS
            | METHOD_TERMINAL_LIST_PORTS
            | METHOD_TERMINAL_RESIZE
            | METHOD_TERMINAL_SUBSCRIBE
            | METHOD_TERMINAL_UNSUBSCRIBE
    )
}

// ── Sub-dispatchers ───────────────────────────────────────────────────────────

async fn dispatch_workspace(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    app: &DaemonApp,
) -> Result<Value, DomainRpcError> {
    use crate::daemon::constants::{METHOD_WORKSPACE_CLOSE, METHOD_WORKSPACE_CREATE, METHOD_WORKSPACE_OPEN};
    use std::path::Path;

    match method {
        // On open/create: call the sub-dispatcher first, then register with watchers/pr_tracker.
        METHOD_WORKSPACE_OPEN | METHOD_WORKSPACE_CREATE => {
            let result = crate::workspace::dispatch::workspace(method, params, &app.manager).await?;
            if let (Some(path), Some(_id)) = (result["path"].as_str(), result["id"].as_str()) {
                app.watchers.watch(Path::new(path));
                app.pr_tracker.ensure_tracked(path, true);
            }
            Ok(result)
        }

        // On close: look up path before removing, then unregister after.
        METHOD_WORKSPACE_CLOSE => {
            // Deserialize workspace_id from params to look up path before removal.
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct CloseReq { workspace_id: String }
            let close_req: Option<(String, String)> = crate::daemon::rpc::decode_params::<CloseReq>(params)
                .ok()
                .and_then(|r| {
                    app.manager.get(&r.workspace_id).ok().map(|ws| (r.workspace_id, ws.path))
                });

            let result = crate::workspace::dispatch::workspace(method, params, &app.manager).await?;

            if let Some((ws_id, ws_path)) = close_req {
                app.watchers.unwatch(Path::new(&ws_path));
                app.pr_tracker.stop_tracking(&ws_id);
            }
            Ok(result)
        }

        _ => crate::workspace::dispatch::workspace(method, params, &app.manager).await,
    }
}

async fn dispatch_git(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    app: &DaemonApp,
) -> Result<Value, DomainRpcError> {
    crate::workspace::dispatch::git(method, params, &app.manager).await
}

async fn dispatch_file(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    app: &DaemonApp,
) -> Result<Value, DomainRpcError> {
    crate::workspace::dispatch::file(method, params, &app.manager).await
}

async fn dispatch_terminal(
    method: &str,
    params: Option<&serde_json::value::RawValue>,
    app: &DaemonApp,
    sink: Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<WebSocket, Message>>>,
) -> Result<Value, DomainRpcError> {
    crate::workspace::dispatch::terminal(method, params, Arc::clone(&app.manager), sink).await
}
