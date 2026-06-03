use crate::daemon::constants::{BIN_OPCODE_TERMINAL_OUTPUT, RPC_SESSION_INACTIVE};
use crate::daemon::rpc::DomainRpcError;
use crate::workspace::types::*;
use axum::extract::ws::Message;
use futures_util::SinkExt;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::broadcast;
use uuid::Uuid;

#[cfg(unix)]
mod ports_unix;

#[cfg(unix)]
use ports_unix::{append_port_scan_tail, collect_detected_ports_for_sessions, SessionPortRef};

type PortsChangedListener = Arc<dyn Fn(Vec<TerminalDetectedPort>) + Send + Sync>;

/// Capacity for per-session output broadcast channel.
/// Slow subscribers drop frames rather than blocking the PTY reader.
const OUTPUT_CHANNEL_CAP: usize = 256;

type WsSink =
    Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>>>;

/// One daemon-managed terminal session backed by a PTY.
struct ManagedSession {
    workspace_id: String,
    root_pid: i32,
    /// Writer end — send input to the PTY.
    writer: Box<dyn Write + Send>,
    /// PTY master — kept alive and used for resize.
    master: Box<dyn MasterPty + Send>,
    /// Buffered output accumulated from the PTY reader task (for terminal.read pull).
    output_buf: Arc<Mutex<String>>,
    /// Broadcast channel for live output push to subscribed WebSocket clients.
    output_tx: broadcast::Sender<Vec<u8>>,
    closed: Arc<std::sync::atomic::AtomicBool>,
    port_scan_tail: String,
    cols: u16,
    rows: u16,
}

/// Terminal session manager.
pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, Arc<Mutex<ManagedSession>>>>>,
    active_workspace: Arc<Mutex<Option<String>>>,
    ports_changed_listener: Arc<Mutex<Option<PortsChangedListener>>>,
    last_ports_snapshot_key: Arc<Mutex<String>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            active_workspace: Arc::new(Mutex::new(None)),
            ports_changed_listener: Arc::new(Mutex::new(None)),
            last_ports_snapshot_key: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn set_ports_changed_listener(&self, listener: PortsChangedListener) {
        *self.ports_changed_listener.lock().unwrap() = Some(listener);
    }

    pub fn start(
        &self,
        workspace_path: &str,
        req: &TerminalStartRequest,
    ) -> Result<TerminalStartResponse, DomainRpcError> {
        let cols = req.cols.unwrap_or(220);
        let rows = req.rows.unwrap_or(50);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| DomainRpcError::server_error(format!("open pty: {e}")))?;

        let shell = req.command.as_deref().unwrap_or_else(|| {
            std::env::var("SHELL")
                .ok()
                .as_deref()
                .unwrap_or("/bin/sh")
                .to_owned()
                .leak()
        });
        let mut cmd = CommandBuilder::new(shell);
        cmd.cwd(workspace_path);
        if let Some(args) = &req.args {
            for arg in args {
                cmd.arg(arg);
            }
        }
        // Ensure the shell knows its terminal type and initial dimensions.
        // Without these, zsh/bash fall back to guessing (often wrong values).
        cmd.env(
            "TERM",
            std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".into()),
        );
        cmd.env("COLUMNS", cols.to_string());
        cmd.env("LINES", rows.to_string());

        if let Some(env) = &req.env {
            for entry in env {
                if let Some((k, v)) = entry.split_once('=') {
                    cmd.env(k, v);
                }
            }
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| DomainRpcError::server_error(format!("spawn pty command: {e}")))?;
        let root_pid = child.process_id().unwrap_or_default() as i32;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| DomainRpcError::server_error(format!("pty writer: {e}")))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| DomainRpcError::server_error(format!("pty reader: {e}")))?;
        let master = pair.master;

        let output_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let closed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (output_tx, _) = broadcast::channel::<Vec<u8>>(OUTPUT_CHANNEL_CAP);

        let session_id = Uuid::new_v4().to_string();
        let session = Arc::new(Mutex::new(ManagedSession {
            workspace_id: req.workspace_id.clone(),
            root_pid,
            writer,
            master,
            output_buf: output_buf.clone(),
            output_tx: output_tx.clone(),
            closed: closed.clone(),
            port_scan_tail: String::new(),
            cols,
            rows,
        }));

        self.sessions
            .write()
            .unwrap()
            .insert(session_id.clone(), Arc::clone(&session));

        // Spawn background reader — accumulates to buf AND broadcasts raw bytes.
        let buf_clone = output_buf.clone();
        let closed_clone = closed.clone();
        let tx_clone = output_tx.clone();
        let session_for_reader = Arc::clone(&session);
        let sessions_for_reader = Arc::clone(&self.sessions);
        let active_workspace_for_reader = Arc::clone(&self.active_workspace);
        let ports_listener_for_reader = Arc::clone(&self.ports_changed_listener);
        let snapshot_key_for_reader = Arc::clone(&self.last_ports_snapshot_key);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(reader);
            let mut chunk = [0u8; 4096];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let bytes = chunk[..n].to_vec();
                        let s = String::from_utf8_lossy(&bytes).into_owned();
                        buf_clone.lock().unwrap().push_str(&s);
                        let should_refresh_ports = {
                            let mut session = session_for_reader.lock().unwrap();
                            let (next_tail, mentioned_ports) =
                                update_port_scan_tail(&session.port_scan_tail, &s);
                            session.port_scan_tail = next_tail;
                            mentioned_ports
                        };
                        // Broadcast to any subscribed WebSocket sinks.
                        // Ignore send errors — no active subscribers is fine.
                        let _ = tx_clone.send(bytes);
                        if should_refresh_ports {
                            publish_ports_changed_if_needed(
                                &sessions_for_reader,
                                &active_workspace_for_reader,
                                &ports_listener_for_reader,
                                &snapshot_key_for_reader,
                            );
                        }
                    }
                }
            }
            closed_clone.store(true, std::sync::atomic::Ordering::Relaxed);
            publish_ports_changed_if_needed(
                &sessions_for_reader,
                &active_workspace_for_reader,
                &ports_listener_for_reader,
                &snapshot_key_for_reader,
            );
        });

        let closed_for_wait = closed;
        let sessions_for_wait = Arc::clone(&self.sessions);
        let active_workspace_for_wait = Arc::clone(&self.active_workspace);
        let ports_listener_for_wait = Arc::clone(&self.ports_changed_listener);
        let snapshot_key_for_wait = Arc::clone(&self.last_ports_snapshot_key);
        std::thread::spawn(move || {
            let _ = child.wait();
            closed_for_wait.store(true, std::sync::atomic::Ordering::Relaxed);
            publish_ports_changed_if_needed(
                &sessions_for_wait,
                &active_workspace_for_wait,
                &ports_listener_for_wait,
                &snapshot_key_for_wait,
            );
        });

        Ok(TerminalStartResponse { session_id })
    }

    /// Attach a WebSocket sink to receive live PTY output as binary frames.
    /// Spawns a task that relays broadcast chunks to the sink until the session closes.
    pub fn subscribe_output(&self, session_id: &str, sink: WsSink) -> Result<(), DomainRpcError> {
        // Clone the Arc so we can drop the read guard before locking the session.
        let session_arc = {
            let sessions = self.sessions.read().unwrap();
            sessions
                .get(session_id)
                .ok_or_else(|| {
                    DomainRpcError::new(
                        RPC_SESSION_INACTIVE,
                        format!("terminal session not found: {session_id}"),
                    )
                })?
                .clone()
        };
        let rx = session_arc.lock().unwrap().output_tx.subscribe();

        let sid = session_id.to_string();
        // Build the session-id prefix for binary frames: [0x02][session_id\0]
        let prefix = {
            let mut p = vec![BIN_OPCODE_TERMINAL_OUTPUT];
            p.extend_from_slice(sid.as_bytes());
            p.push(0u8); // null terminator
            p
        };

        tokio::spawn(async move {
            let mut rx = rx;
            loop {
                match rx.recv().await {
                    Ok(bytes) => {
                        let mut frame = prefix.clone();
                        frame.extend_from_slice(&bytes);
                        let mut s = sink.lock().await;
                        if s.send(Message::Binary(frame.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // Slow subscriber — skip dropped frames, continue.
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        Ok(())
    }

    pub fn send(&self, req: &TerminalSendRequest) -> Result<TerminalSendResponse, DomainRpcError> {
        self.with_session(&req.session_id, |s| {
            s.writer
                .write_all(req.data.as_bytes())
                .map_err(|e| DomainRpcError::server_error(format!("write to pty: {e}")))?;
            Ok(TerminalSendResponse { ok: true })
        })
    }

    pub fn send_raw(&self, session_id: &str, data: &[u8]) {
        let sessions = self.sessions.read().unwrap();
        if let Some(sess) = sessions.get(session_id) {
            let mut s = sess.lock().unwrap();
            let _ = s.writer.write_all(data);
        }
    }

    pub fn read(&self, req: &TerminalReadRequest) -> Result<TerminalReadResponse, DomainRpcError> {
        self.with_session(&req.session_id, |s| {
            let output = std::mem::take(&mut *s.output_buf.lock().unwrap());
            let running = !s.closed.load(std::sync::atomic::Ordering::Relaxed);
            Ok(TerminalReadResponse { output, running })
        })
    }

    pub fn stop(&self, req: &TerminalStopRequest) -> Result<TerminalStopResponse, DomainRpcError> {
        self.sessions.write().unwrap().remove(&req.session_id);
        self.publish_ports_changed_if_needed();
        Ok(TerminalStopResponse { ok: true })
    }

    pub fn kill_process(
        &self,
        req: &TerminalKillProcessRequest,
    ) -> Result<TerminalKillProcessResponse, DomainRpcError> {
        stop_process_by_pid(req.pid)?;
        self.publish_ports_changed_if_needed();
        Ok(TerminalKillProcessResponse { ok: true })
    }

    pub fn list_sessions(&self, req: &TerminalListSessionsRequest) -> Vec<TerminalSessionSummary> {
        let sessions = self.sessions.read().unwrap();
        sessions
            .iter()
            .filter(|(_, s)| {
                if let Some(ws) = &req.workspace_id {
                    s.lock().unwrap().workspace_id == *ws
                } else {
                    true
                }
            })
            .map(|(id, s)| {
                let sess = s.lock().unwrap();
                TerminalSessionSummary {
                    session_id: id.clone(),
                    workspace_id: sess.workspace_id.clone(),
                    pid: sess.root_pid,
                    running: !sess.closed.load(std::sync::atomic::Ordering::Relaxed),
                    cols: sess.cols,
                    rows: sess.rows,
                }
            })
            .collect()
    }

    pub fn list_detected_ports(&self) -> Vec<TerminalDetectedPort> {
        self.collect_detected_ports()
    }

    pub fn resize(
        &self,
        req: &TerminalResizeRequest,
    ) -> Result<TerminalResizeResponse, DomainRpcError> {
        self.with_session(&req.session_id, |s| {
            s.cols = req.cols;
            s.rows = req.rows;
            // Apply the new dimensions to the PTY so the shell sees the correct
            // TIOCGWINSZ values — without this, PROMPT_SP fires on every command
            // because the shell thinks cols=220 while xterm shows fewer.
            let _ = s.master.resize(PtySize {
                rows: req.rows,
                cols: req.cols,
                pixel_width: 0,
                pixel_height: 0,
            });
            Ok(TerminalResizeResponse { ok: true })
        })
    }

    pub fn set_active_workspace(
        &self,
        req: &SetActiveWorkspaceRequest,
    ) -> Result<SetActiveWorkspaceResponse, DomainRpcError> {
        *self.active_workspace.lock().unwrap() = Some(req.workspace_id.clone());
        self.publish_ports_changed_if_needed();
        Ok(SetActiveWorkspaceResponse { ok: true })
    }

    #[allow(dead_code)]
    pub fn stop_all_for_workspace(&self, workspace_id: &str) -> Vec<anyhow::Error> {
        let mut sessions = self.sessions.write().unwrap();
        let ids: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.lock().unwrap().workspace_id == workspace_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &ids {
            sessions.remove(id);
        }
        drop(sessions);
        self.publish_ports_changed_if_needed();
        Vec::new()
    }

    fn collect_detected_ports(&self) -> Vec<TerminalDetectedPort> {
        collect_detected_ports_for_manager(&self.sessions, &self.active_workspace)
    }

    fn publish_ports_changed_if_needed(&self) {
        publish_ports_changed_if_needed(
            &self.sessions,
            &self.active_workspace,
            &self.ports_changed_listener,
            &self.last_ports_snapshot_key,
        );
    }

    fn with_session<F, T>(&self, session_id: &str, f: F) -> Result<T, DomainRpcError>
    where
        F: FnOnce(&mut ManagedSession) -> Result<T, DomainRpcError>,
    {
        let sessions = self.sessions.read().unwrap();
        let session = sessions.get(session_id).ok_or_else(|| {
            DomainRpcError::new(
                RPC_SESSION_INACTIVE,
                format!("terminal session not found: {session_id}"),
            )
        })?;
        let mut sess = session.lock().unwrap();
        f(&mut sess)
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

fn collect_detected_ports_for_manager(
    sessions: &Arc<RwLock<HashMap<String, Arc<Mutex<ManagedSession>>>>>,
    active_workspace: &Arc<Mutex<Option<String>>>,
) -> Vec<TerminalDetectedPort> {
    #[cfg(unix)]
    {
        let workspace_scope = active_workspace.lock().unwrap().clone();
        let session_refs = sessions
            .read()
            .unwrap()
            .iter()
            .filter_map(|(session_id, session)| {
                let session = session.lock().unwrap();
                if session.closed.load(std::sync::atomic::Ordering::Relaxed) || session.root_pid <= 0 {
                    return None;
                }
                if workspace_scope.as_deref().is_some_and(|workspace_id| workspace_id != session.workspace_id) {
                    return None;
                }
                Some(SessionPortRef {
                    session_id: session_id.clone(),
                    workspace_id: session.workspace_id.clone(),
                    pid: session.root_pid,
                })
            })
            .collect::<Vec<_>>();
        return collect_detected_ports_for_sessions(&session_refs);
    }

    #[cfg(not(unix))]
    {
        let _ = (sessions, active_workspace);
        Vec::new()
    }
}

fn publish_ports_changed_if_needed(
    sessions: &Arc<RwLock<HashMap<String, Arc<Mutex<ManagedSession>>>>>,
    active_workspace: &Arc<Mutex<Option<String>>>,
    ports_changed_listener: &Arc<Mutex<Option<PortsChangedListener>>>,
    last_ports_snapshot_key: &Arc<Mutex<String>>,
) {
    let ports = collect_detected_ports_for_manager(sessions, active_workspace);
    let key = build_port_snapshot_key(&ports);

    {
        let mut last_key = last_ports_snapshot_key.lock().unwrap();
        if *last_key == key {
            return;
        }
        *last_key = key;
    }

    if let Some(listener) = ports_changed_listener.lock().unwrap().clone() {
        listener(ports);
    }
}

fn build_port_snapshot_key(ports: &[TerminalDetectedPort]) -> String {
    ports
        .iter()
        .map(|port| {
            format!(
                "{}|{}|{}|{}|{}|{}\n",
                port.session_id, port.workspace_id, port.pid, port.port, port.address, port.process_name
            )
        })
        .collect()
}

#[cfg(unix)]
fn update_port_scan_tail(previous_tail: &str, chunk: &str) -> (String, bool) {
    append_port_scan_tail(previous_tail, chunk)
}

#[cfg(not(unix))]
fn update_port_scan_tail(previous_tail: &str, chunk: &str) -> (String, bool) {
    let _ = (previous_tail, chunk);
    (String::new(), false)
}

#[cfg(unix)]
fn stop_process_by_pid(pid: i32) -> Result<(), DomainRpcError> {
    if pid <= 0 {
        return Ok(());
    }
    let result = unsafe { libc::kill(pid, libc::SIGKILL) };
    if result == 0 {
        return Ok(());
    }
    let err = std::io::Error::last_os_error();
    if err.raw_os_error() == Some(libc::ESRCH) {
        return Ok(());
    }
    Err(DomainRpcError::server_error(format!("kill process {pid}: {err}")))
}

#[cfg(not(unix))]
fn stop_process_by_pid(pid: i32) -> Result<(), DomainRpcError> {
    let _ = pid;
    Err(DomainRpcError::server_error(
        "terminal.killProcess is not implemented on this platform",
    ))
}
