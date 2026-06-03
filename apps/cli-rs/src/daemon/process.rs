use crate::daemon::server::{handle_ws, DaemonApp};
use crate::daemon::state::{is_process_running, load_state, remove_state, save_state, DaemonState};
use crate::runtime::AppRuntime;
use anyhow::{bail, Context};
use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::env;
use std::net::{SocketAddr, TcpListener};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::signal;
use tracing::{debug, info, warn};

pub const DETACHED_ENV_KEY: &str = "YISHAN_DAEMON_DETACHED";

/// Configuration for `run()` (foreground daemon).
#[derive(Debug, Clone)]
pub struct RunConfig {
    pub host: String,
    pub port: u16,
    pub relay_enabled: bool,
    pub relay_url: String,
    #[allow(dead_code)]
    pub log_file_path: String,
}

impl Default for RunConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 0,
            relay_enabled: false,
            relay_url: String::new(),
            log_file_path: String::new(),
        }
    }
}

/// Configuration for `start_detached()`.
#[derive(Debug, Clone, Default)]
pub struct StartConfig {
    pub run: RunConfig,
    pub config_path: String,
    pub log_level: String,
    pub log_file: String,
}

/// Run the daemon in the foreground (called by `yishan daemon run`).
/// Mirrors Go `daemon.Run()`.
pub async fn run(cfg: RunConfig, runtime: AppRuntime) -> anyhow::Result<()> {
    let app_cfg = runtime.config();
    let _state_path = PathBuf::from(&app_cfg.config_path).join("daemon.state.json");

    // ── Phase 1: stale state guard ───────────────────────────────────────────
    if let Some(existing) = load_state(&app_cfg.config_path) {
        if is_process_running(existing.pid) {
            bail!(
                "daemon already running at {}:{} (pid {})",
                existing.host,
                existing.port,
                existing.pid
            );
        }
        if let Err(e) = remove_state(&app_cfg.config_path) {
            warn!(err = %e, "failed to remove stale daemon state file");
        }
    }

    // ── Phase 2: TCP listener ────────────────────────────────────────────────
    let addr_str = format!("{}:{}", cfg.host, cfg.port);
    let listener = TcpListener::bind(&addr_str)
        .with_context(|| format!("listen daemon server on {addr_str}"))?;
    let actual_addr: SocketAddr = listener.local_addr()?;

    // ── Phase 3: daemon ID + app ─────────────────────────────────────────────
    let daemon_id =
        crate::daemon::id::ensure_daemon_id(&app_cfg.config_path).context("ensure daemon id")?;

    let app = Arc::new(DaemonApp::new(runtime.clone(), daemon_id.clone()));

    // ── Phase 4: axum router ─────────────────────────────────────────────────
    let router = Router::new()
        .route("/ws", get(ws_handler))
        .route("/healthz", get(healthz_handler))
        .route("/agent-hook/ingest", post(agent_hook_handler))
        .with_state(app.clone());

    // ── Phase 5: persist state ───────────────────────────────────────────────
    let pid = process::id();
    save_state(
        &app_cfg.config_path,
        DaemonState {
            running: true,
            pid,
            host: cfg.host.clone(),
            port: actual_addr.port(),
            started_at: chrono::Utc::now().to_rfc3339(),
        },
    )
    .context("save daemon state")?;

    // Set hook ingress env var for any child processes (agent hooks).
    let ingress_url = format!("http://{actual_addr}/agent-hook/ingest");
    env::set_var("YISHAN_HOOK_INGRESS_URL", &ingress_url);

    // Clean up state on exit.
    let state_cleanup_path = app_cfg.config_path.clone();
    let cleanup = || {
        if let Err(e) = remove_state(&state_cleanup_path) {
            warn!(err = %e, "failed to remove daemon state file on shutdown");
        }
    };

    // ── Phase 6: serve + graceful shutdown ───────────────────────────────────
    let is_detached = env::var(DETACHED_ENV_KEY).as_deref() == Ok("1");
    if is_detached {
        debug!(address = %actual_addr, "daemon server started (detached)");
    } else {
        info!(address = %actual_addr, "daemon server started");
    }

    // Start background services now that the server address is known.
    app.start_background_services();

    let std_listener = listener;
    std_listener.set_nonblocking(true)?;
    let tokio_listener = tokio::net::TcpListener::from_std(std_listener)?;

    let serve = axum::serve(tokio_listener, router);
    let result = serve.with_graceful_shutdown(shutdown_signal()).await;

    cleanup();
    result.map_err(Into::into)
}

/// axum WS upgrade handler.
async fn ws_handler(ws: WebSocketUpgrade, State(app): State<Arc<DaemonApp>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, app))
}

/// Health check endpoint.
async fn healthz_handler(State(app): State<Arc<DaemonApp>>) -> impl IntoResponse {
    use axum::Json;
    use serde_json::json;
    Json(json!({
        "status": "running",
        "version": app.version,
        "daemonId": *app.node_id,
    }))
}

/// Agent hook ingest endpoint — receives token-usage trigger events from agent CLIs.
async fn agent_hook_handler(
    State(app): State<Arc<DaemonApp>>,
    axum::Json(body): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    use axum::Json;
    use serde_json::json;
    let agent_kind = body["agentKind"].as_str().unwrap_or("");
    let source = body["source"].as_str().unwrap_or("hook");
    app.token_usage.trigger(agent_kind, source);
    Json(json!({ "ok": true }))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.ok();
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .unwrap()
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

/// Stop the running daemon by sending SIGTERM to its PID.
/// Mirrors Go `daemon.Stop()`.
pub fn stop(config_path: &str, timeout: Duration) -> anyhow::Result<DaemonState> {
    let state = match load_state(config_path) {
        Some(s) => s,
        None => bail!("daemon is not running"),
    };

    if !is_process_running(state.pid) {
        let _ = remove_state(config_path);
        bail!("daemon is not running");
    }

    // Send SIGTERM.
    #[cfg(unix)]
    unsafe {
        if libc::kill(state.pid as libc::pid_t, libc::SIGTERM) != 0 {
            bail!(
                "send SIGTERM to daemon process {}: {}",
                state.pid,
                std::io::Error::last_os_error()
            );
        }
    }

    #[cfg(not(unix))]
    bail!("stop is not supported on this platform");

    // Poll until dead.
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if !is_process_running(state.pid) {
            let _ = remove_state(config_path);
            return Ok(state);
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    bail!("timed out waiting for daemon process {} to stop", state.pid);
}

/// Start the daemon as a detached child process.
/// Mirrors Go `daemon.StartDetached()`.
pub fn start_detached(cfg: &StartConfig) -> anyhow::Result<u32> {
    let executable = env::current_exe().context("resolve current executable")?;

    let mut args: Vec<String> = vec![
        "daemon".into(),
        "run".into(),
        "--host".into(),
        cfg.run.host.clone(),
        "--port".into(),
        cfg.run.port.to_string(),
        format!("--relay-enabled={}", cfg.run.relay_enabled),
    ];
    if !cfg.run.relay_url.is_empty() {
        args.push("--relay-url".into());
        args.push(cfg.run.relay_url.clone());
    }
    if !cfg.config_path.is_empty() {
        args.push("--config".into());
        args.push(cfg.config_path.clone());
    }
    if !cfg.log_level.is_empty() {
        args.push("--log-level".into());
        args.push(cfg.log_level.clone());
    }
    if !cfg.log_file.is_empty() {
        args.push("--log-file".into());
        args.push(cfg.log_file.clone());
    }

    let mut envs: Vec<(String, String)> = env::vars().collect();
    envs.push((DETACHED_ENV_KEY.to_string(), "1".to_string()));

    let mut cmd = process::Command::new(&executable);
    cmd.args(&args);
    cmd.envs(envs);
    cmd.stdin(process::Stdio::null());
    cmd.stdout(process::Stdio::null());
    cmd.stderr(process::Stdio::null());

    // Detach from the parent process group so the daemon survives the CLI exit.
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd.spawn().context("start daemon process")?;
    let pid = child.id();
    // Release the handle — we don't wait for the child.
    std::mem::forget(child);

    Ok(pid)
}

/// Probe the daemon's /healthz endpoint.
/// Mirrors Go `daemon.ProbeHealth()`.
pub fn probe_health(state: &DaemonState, timeout: Duration) -> bool {
    if state.host.is_empty() || state.port == 0 {
        return false;
    }
    let url = format!("http://{}:{}/healthz", state.host, state.port);
    let client = reqwest::blocking::ClientBuilder::new()
        .timeout(timeout)
        .build()
        .unwrap_or_default();
    client
        .get(&url)
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Block until the daemon is ready or the timeout elapses.
/// Mirrors Go `daemon.WaitForReady()`.
pub fn wait_for_ready(config_path: &str, timeout: Duration) -> anyhow::Result<DaemonState> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Some(state) = load_state(config_path) {
            if is_process_running(state.pid) && probe_health(&state, Duration::from_millis(250)) {
                return Ok(state);
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    bail!("timed out waiting for daemon to become ready")
}

/// Stop + start + wait for ready.
/// Mirrors Go `daemon.Restart()`.
pub fn restart(
    cfg: &StartConfig,
    config_path: &str,
    stop_timeout: Duration,
    ready_timeout: Duration,
) -> anyhow::Result<DaemonState> {
    match stop(config_path, stop_timeout) {
        Ok(_) => {}
        Err(e) if e.to_string().contains("not running") => {}
        Err(e) => return Err(e),
    }
    start_detached(cfg).context("start detached daemon for restart")?;
    wait_for_ready(config_path, ready_timeout)
}
