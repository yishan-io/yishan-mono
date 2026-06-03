#![allow(dead_code)]

use crate::daemon::event_hub::FrontendEvent;
use crate::daemon::rpc::{RpcNotification, RpcRequest};
use crate::daemon::server::DaemonApp;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async_with_config, tungstenite::client::IntoClientRequest};
use tokio_tungstenite::tungstenite::{http::HeaderValue, Message};
use tracing::{debug, info, warn};

const RELAY_METHOD_PING: &str = "relay.ping";
const RELAY_METHOD_PONG: &str = "relay.pong";
const RELAY_METHOD_JOB_RUN: &str = "job.run";
const RELAY_METHOD_WORKSPACE_SNAPSHOT_CHANGED: &str = "workspace.snapshot.changed";

const RELAY_RECONNECT_INITIAL_DELAY: Duration = Duration::from_secs(2);
const RELAY_RECONNECT_MAX_DELAY: Duration = Duration::from_secs(30);
const RELAY_TOKEN_EARLY_REFRESH_SECS: i64 = 60;

/// Mutable relay connection state shared between healthz and the relay loop.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatusSnapshot {
    pub enabled: bool,
    pub url: String,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error_at: Option<String>,
}

#[derive(Clone)]
pub struct RelayStatus {
    inner: Arc<tokio::sync::RwLock<RelayStatusSnapshot>>,
}

impl RelayStatus {
    pub fn new(enabled: bool, url: String) -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(RelayStatusSnapshot {
                enabled,
                url,
                ..Default::default()
            })),
        }
    }

    pub async fn snapshot(&self) -> RelayStatusSnapshot {
        self.inner.read().await.clone()
    }

    async fn set_connected(&self) {
        let mut s = self.inner.write().await;
        s.connected = true;
        s.connected_at = Some(chrono::Utc::now().to_rfc3339());
        s.last_error = None;
        s.last_error_at = None;
    }

    async fn set_disconnected(&self, reason: &str) {
        let mut s = self.inner.write().await;
        s.connected = false;
        if !reason.is_empty() {
            s.last_error = Some(reason.to_string());
            s.last_error_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }
}

/// Long-running relay client loop — reconnects with exponential backoff + jitter.
/// Mirrors Go `runRelayClientLoop`.
pub async fn run_relay_client_loop(
    app: Arc<DaemonApp>,
    node_id: String,
    relay_url: String,
    status: RelayStatus,
) {
    let endpoint = match normalize_relay_ws_url(&relay_url) {
        Ok(e) => e,
        Err(e) => {
            warn!(err = %e, url = relay_url, "invalid relay url; relay client disabled");
            status.set_disconnected(&format!("invalid relay url: {e}")).await;
            return;
        }
    };

    let mut delay = RELAY_RECONNECT_INITIAL_DELAY;
    let mut cached_token: Option<(String, chrono::DateTime<chrono::Utc>)> = None;

    loop {
        // Check if API is configured.
        {
            let cfg = app.runtime.config();
            if cfg.api.token.is_empty() {
                warn!("relay client waiting for API credentials");
                status.set_disconnected("waiting for API credentials").await;
                sleep(delay).await;
                delay = next_relay_delay(delay);
                continue;
            }
        }

        // Refresh token if missing or near expiry.
        let token = {
            let needs_refresh = cached_token.as_ref().map_or(true, |(_, exp)| {
                let window = chrono::Duration::seconds(RELAY_TOKEN_EARLY_REFRESH_SECS);
                chrono::Utc::now() >= *exp - window
            });
            if needs_refresh {
                let _cfg = app.runtime.config();
                let api = app.runtime.api_client();
                match api.relay_token(&node_id).await {
                        Ok(resp) => {
                            let expiry = resp.expires_at
                                .trim()
                                .parse::<chrono::DateTime<chrono::Utc>>()
                                .ok()
                                .unwrap_or_else(|| chrono::Utc::now() + chrono::Duration::minutes(5));
                            cached_token = Some((resp.token.clone(), expiry));
                            resp.token
                        }
                    Err(e) => {
                        warn!(err = %e, "relay token mint failed");
                        status.set_disconnected(&format!("token mint failed: {e}")).await;
                        sleep(delay).await;
                        delay = next_relay_delay(delay);
                        continue;
                    }
                }
            } else {
                cached_token.as_ref().unwrap().0.clone()
            }
        };

        // Build versioned endpoint URL.
        let versioned_endpoint = append_version_param(&endpoint);

        // Dial.
        let mut req = match versioned_endpoint.as_str().into_client_request() {
            Ok(r) => r,
            Err(e) => {
                warn!(err = %e, "relay: build request failed");
                sleep(delay).await;
                delay = next_relay_delay(delay);
                continue;
            }
        };
        req.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );

        let ws_stream = match connect_async_with_config(req, None, false).await {
            Ok((stream, _)) => stream,
            Err(e) => {
                warn!(err = %e, url = versioned_endpoint, "relay websocket dial failed");
                status.set_disconnected(&format!("dial failed: {e}")).await;
                sleep(delay).await;
                delay = next_relay_delay(delay);
                continue;
            }
        };

        info!(url = versioned_endpoint, node_id = node_id, "relay websocket connected");
        delay = RELAY_RECONNECT_INITIAL_DELAY;
        cached_token = None; // always get fresh token on next connect
        status.set_connected().await;

        run_relay_session(ws_stream, &app, &node_id).await;
        status.set_disconnected("session ended").await;
    }
}

type WsStream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Handle a single relay WebSocket session until it disconnects.
async fn run_relay_session(ws: WsStream, app: &Arc<DaemonApp>, _node_id: &str) {
    let (mut sink, mut stream) = ws.split();

    while let Some(msg_result) = stream.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                debug!(err = %e, "relay read error");
                break;
            }
        };

        match msg {
            Message::Binary(data) => {
                // Binary terminal fast-path — send input to the right PTY session.
                if data.len() >= 2 && data[0] == crate::daemon::constants::BIN_OPCODE_TERMINAL_INPUT {
                    let rest = &data[1..];
                    if let Some(null_pos) = rest.iter().position(|&b| b == 0) {
                        if let Ok(session_id) = std::str::from_utf8(&rest[..null_pos]) {
                            app.manager.terminal_send_raw(session_id, &rest[null_pos + 1..]).await;
                        }
                    }
                }
            }
            Message::Text(text) => {
                let data = text.as_bytes();
                // Relay-protocol messages (ping, job.run, workspace.snapshot.changed).
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(data) {
                    let method = v["method"].as_str().unwrap_or("");
                    match method {
                        RELAY_METHOD_PING => {
                            let pong = serde_json::to_string(&RpcNotification::new(
                                RELAY_METHOD_PONG,
                                json!({}),
                            ))
                            .unwrap_or_default();
                            let _ = sink.send(Message::Text(pong.into())).await;
                            continue;
                        }
                        RELAY_METHOD_JOB_RUN => {
                            // Job dispatch — handled by scheduler (Phase 10).
                            debug!("relay: received job.run");
                            continue;
                        }
                        RELAY_METHOD_WORKSPACE_SNAPSHOT_CHANGED => {
                            app.events.publish(FrontendEvent::new(
                                "workspaceSnapshotChanged",
                                v["params"].clone(),
                            ));
                            continue;
                        }
                        _ => {}
                    }
                }

                // Fall through: treat as a JSON-RPC request from the relay.
                // Parse and dispatch via the same handler as local WS connections.
                let req: RpcRequest = match serde_json::from_slice(data) {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                // We don't have access to the WS sink type here, so we handle
                // system/daemon methods inline and skip workspace methods via relay.
                // Full relay dispatch would require refactoring handle_rpc_frame to
                // accept a trait object — deferred to Phase 10 integration.
                debug!(method = req.method, "relay: unhandled RPC method");
            }
            Message::Close(_) => break,
            Message::Ping(data) => {
                let _ = sink.send(Message::Pong(data)).await;
            }
            _ => {}
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn normalize_relay_ws_url(raw: &str) -> anyhow::Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        anyhow::bail!("empty relay url");
    }
    let mut parsed = url::Url::parse(trimmed)?;
    match parsed.scheme() {
        "http" => parsed.set_scheme("ws").ok(),
        "https" => parsed.set_scheme("wss").ok(),
        "ws" | "wss" => None,
        s => anyhow::bail!("unsupported relay url scheme: {s}"),
    };
    if parsed.path().is_empty() || parsed.path() == "/" {
        parsed.set_path("/ws");
    }
    Ok(parsed.to_string())
}

fn append_version_param(endpoint: &str) -> String {
    let version = crate::buildinfo::VERSION;
    if version.is_empty() {
        return endpoint.to_string();
    }
    let sep = if endpoint.contains('?') { "&" } else { "?" };
    format!("{endpoint}{sep}version={version}")
}

/// Exponential backoff with ±25% jitter.
fn next_relay_delay(current: Duration) -> Duration {
    let doubled = current * 2;
    let next = doubled.min(RELAY_RECONNECT_MAX_DELAY);
    let jitter_range = next.as_millis() as i64 / 2;
    let jitter_ms = rand::thread_rng().gen_range(-jitter_range / 2..=jitter_range / 2);
    let result_ms = next.as_millis() as i64 + jitter_ms;
    let result = Duration::from_millis(result_ms.max(0) as u64);
    result.max(RELAY_RECONNECT_INITIAL_DELAY)
}
