use crate::daemon::rpc::DomainRpcError;
use crate::workspace::types::*;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::sync::{Arc, Mutex, RwLock};
use uuid::Uuid;

/// A single PTY session.
struct PtySession {
    workspace_id: String,
    /// Writer end — send input to the PTY.
    writer: Box<dyn Write + Send>,
    /// Buffered output accumulated from the PTY reader task.
    output_buf: Arc<Mutex<String>>,
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
                // Each entry is "KEY=value"; split on the first '=' only.
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

        let output_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let closed = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // Spawn background reader task.
        let buf_clone = output_buf.clone();
        let closed_clone = closed.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(reader);
            let mut chunk = [0u8; 4096];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let s = String::from_utf8_lossy(&chunk[..n]).into_owned();
                        buf_clone.lock().unwrap().push_str(&s);
                    }
                }
            }
            closed_clone.store(true, std::sync::atomic::Ordering::Relaxed);
        });

        let session_id = Uuid::new_v4().to_string();
        let session = PtySession {
            workspace_id: req.workspace_id.clone(),
            writer,
            output_buf,
            closed,
            cols,
            rows,
        };

        self.sessions.write().unwrap()
            .insert(session_id.clone(), Arc::new(Mutex::new(session)));

        Ok(TerminalStartResponse { session_id })
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
            let data = std::mem::take(&mut *s.output_buf.lock().unwrap());
            let closed = s.closed.load(std::sync::atomic::Ordering::Relaxed);
            Ok(TerminalReadResponse { data, closed })
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
        // Sending a NUL byte (Ctrl-C signal via PTY) is the portable approach.
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
        // Port detection is async/best-effort; return empty for now.
        Vec::new()
    }

    pub fn resize(&self, req: &TerminalResizeRequest) -> Result<TerminalResizeResponse, DomainRpcError> {
        // portable-pty does not expose resize through the master easily; record sizes only.
        self.with_session(&req.session_id, |s| {
            s.cols = req.cols;
            s.rows = req.rows;
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
                crate::daemon::constants::RPC_SESSION_INACTIVE,
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
