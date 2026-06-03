use anyhow::Context;
#[cfg(unix)]
use libc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const STATE_FILE_NAME: &str = "daemon.state.json";
const LOG_FILE_NAME: &str = "daemon.log";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonState {
    pub running: bool,
    pub pid: u32,
    pub host: String,
    pub port: u16,
    pub started_at: String,
}

fn state_file_path(config_path: &str) -> PathBuf {
    if !config_path.is_empty() {
        let dir = Path::new(config_path).parent().unwrap_or(Path::new("."));
        dir.join(STATE_FILE_NAME)
    } else {
        crate::config::home_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(STATE_FILE_NAME)
    }
}

/// Load daemon state from disk. Returns `None` if file is missing or malformed.
pub fn load_state(config_path: &str) -> Option<DaemonState> {
    let path = state_file_path(config_path);
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str::<DaemonState>(&raw).ok()
}

/// Returns true if a process with the given PID is alive.
pub fn is_process_running(pid: u32) -> bool {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as libc::pid_t, 0) == 0
    }
    #[cfg(not(unix))]
    false
}

/// Remove the state file (called after daemon stops).
pub fn remove_state(config_path: &str) -> anyhow::Result<()> {
    let path = state_file_path(config_path);
    if path.exists() {
        std::fs::remove_file(&path)
            .with_context(|| format!("remove daemon state: {}", path.display()))?;
    }
    Ok(())
}

/// Persist daemon state to disk atomically.
pub fn save_state(config_path: &str, state: DaemonState) -> anyhow::Result<()> {
    let path = state_file_path(config_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create daemon state directory: {}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(&state).context("serialize daemon state")?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json)
        .with_context(|| format!("write daemon state: {}", tmp.display()))?;
    std::fs::rename(&tmp, &path)
        .with_context(|| format!("rename daemon state: {}", path.display()))?;
    Ok(())
}

/// Returns the path to the daemon log file.
pub fn log_file_path(config_path: &str) -> anyhow::Result<PathBuf> {
    let dir = if !config_path.is_empty() {
        Path::new(config_path)
            .parent()
            .unwrap_or(Path::new("."))
            .to_path_buf()
    } else {
        crate::config::home_dir().context("resolve yishan home for log path")?
    };
    Ok(dir.join(LOG_FILE_NAME))
}
