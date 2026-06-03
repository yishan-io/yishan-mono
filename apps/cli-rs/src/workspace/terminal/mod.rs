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

/// Capacity for per-session output broadcast channel.
/// Slow subscribers drop frames rather than blocking the PTY reader.
const OUTPUT_CHANNEL_CAP: usize = 256;

type WsSink = Arc<tokio::sync::Mutex<futures_util::stream::SplitSink<axum::extract::ws::WebSocket, Message>>>;

/// A single PTY session.
struct PtySession {
    workspace_id: String,
    /// Writer end — send input to the PTY.
    writer: Box<dyn Write + Send>,
    /// PTY master — kept alive and used for resize.
    master: Box<dyn MasterPty + Send>,
    /// Buffered output accumulated from the PTY reader task (for terminal.read pull).
    output_buf: Arc<Mutex<String>>,
    /// Broadcast channel for live output push to subscribed WebSocket clients.
    output_tx: broadcast::Sender<Vec<u8>>,
    closed: Arc<std::sync::atomic::AtomicBool>,
    cols: u16,
    rows: u16,
}

/// PTY session manager.
pub struct TerminalManager {
    sessions: RwLock<HashMap<String, Arc<Mutex<PtySession>>>>,
    active_workspace: Mutex<Option<String>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            active_workspace: Mutex::new(None),
        }
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
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| DomainRpcError::server_error(format!("open pty: {e}")))?;

        let shell = req.command.as_deref().unwrap_or_else(|| {
            std::env::var("SHELL").ok().as_deref().unwrap_or("/bin/sh").to_owned().leak()
        });
        let mut cmd = CommandBuilder::new(shell);
        cmd.cwd(workspace_path);
        if let Some(args) = &req.args {
            for arg in args {
                cmd.arg(arg);
            }
        }
        if let Some(env) = &req.env {
            for entry in env {
                if let Some((k, v)) = entry.split_once('=') {
                    cmd.env(k, v);
                }
            }
        }

        let _child = pair.slave.spawn_command(cmd)
            .map_err(|e| DomainRpcError::server_error(format!("spawn pty command: {e}")))?;

        let writer = pair.master.take_writer()
            .map_err(|e| DomainRpcError::server_error(format!("pty writer: {e}")))?;
        let reader = pair.master.try_clone_reader()
            .map_err(|e| DomainRpcError::server_error(format!("pty reader: {e}")))?;
        let master = pair.master;

        let output_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let closed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (output_tx, _) = broadcast::channel::<Vec<u8>>(OUTPUT_CHANNEL_CAP);

        // Spawn background reader — accumulates to buf AND broadcasts raw bytes.
        let buf_clone = output_buf.clone();
        let closed_clone = closed.clone();
        let tx_clone = output_tx.clone();
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
                        // Broadcast to any subscribed WebSocket sinks.
                        // Ignore send errors — no active subscribers is fine.
                        let _ = tx_clone.send(bytes);
                    }
                }
            }
            closed_clone.store(true, std::sync::atomic::Ordering::Relaxed);
        });

        let session_id = Uuid::new_v4().to_string();
        let session = PtySession {
            workspace_id: req.workspace_id.clone(),
            writer,
            master,
            output_buf,
            output_tx,
            closed,
            cols,
            rows,
        };

        self.sessions.write().unwrap()
            .insert(session_id.clone(), Arc::new(Mutex::new(session)));

        Ok(TerminalStartResponse { session_id })
    }

    /// Attach a WebSocket sink to receive live PTY output as binary frames.
    /// Spawns a task that relays broadcast chunks to the sink until the session closes.
    pub fn subscribe_output(&self, session_id: &str, sink: WsSink) -> Result<(), DomainRpcError> {
        // Clone the Arc so we can drop the read guard before locking the session.
        let session_arc = {
            let sessions = self.sessions.read().unwrap();
            sessions.get(session_id).ok_or_else(|| {
                DomainRpcError::new(RPC_SESSION_INACTIVE, format!("terminal session not found: {session_id}"))
            })?.clone()
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
            s.writer.write_all(req.data.as_bytes()).map_err(|e| {
                DomainRpcError::server_error(format!("write to pty: {e}"))
            })?;
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
        Ok(TerminalStopResponse { ok: true })
    }

    pub fn kill_process(
        &self,
        req: &TerminalKillProcessRequest,
    ) -> Result<TerminalKillProcessResponse, DomainRpcError> {
        self.with_session(&req.session_id, |s| {
            s.writer.write_all(b"\x03").map_err(|e| {
                DomainRpcError::server_error(format!("kill process: {e}"))
            })?;
            Ok(TerminalKillProcessResponse { ok: true })
        })
    }

    pub fn list_sessions(
        &self,
        req: &TerminalListSessionsRequest,
    ) -> Vec<TerminalSessionSummary> {
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
                    running: !sess.closed.load(std::sync::atomic::Ordering::Relaxed),
                    cols: sess.cols,
                    rows: sess.rows,
                }
            })
            .collect()
    }

    pub fn list_detected_ports(&self) -> Vec<TerminalDetectedPort> {
        Vec::new()
    }

    pub fn resize(&self, req: &TerminalResizeRequest) -> Result<TerminalResizeResponse, DomainRpcError> {
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
        Vec::new()
    }

    fn with_session<F, T>(&self, session_id: &str, f: F) -> Result<T, DomainRpcError>
    where
        F: FnOnce(&mut PtySession) -> Result<T, DomainRpcError>,
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
    fn default() -> Self { Self::new() }
}
