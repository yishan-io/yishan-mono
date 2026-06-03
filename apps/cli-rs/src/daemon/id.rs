use anyhow::Context;
use std::path::Path;
use uuid::Uuid;

const ID_FILE_NAME: &str = "daemon.id";

/// Ensure a stable daemon ID exists at `<config_dir>/daemon.id`.
/// Returns the existing ID or generates and persists a new one.
pub fn ensure_daemon_id(config_path: &str) -> anyhow::Result<String> {
    let id_path = if !config_path.is_empty() {
        let dir = Path::new(config_path).parent().unwrap_or(Path::new("."));
        dir.join(ID_FILE_NAME)
    } else {
        crate::config::home_dir()
            .context("resolve yishan home dir")?
            .join(ID_FILE_NAME)
    };

    if id_path.exists() {
        let raw = std::fs::read_to_string(&id_path)
            .with_context(|| format!("read daemon id file: {}", id_path.display()))?;
        let trimmed = raw.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    // Generate a new UUID v4 as a 32-char hex string (matches Go's hex.EncodeToString).
    let new_id = Uuid::new_v4().as_simple().to_string();

    if let Some(parent) = id_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create daemon id directory: {}", parent.display()))?;
    }

    let tmp_path = id_path.with_extension("id.tmp");
    std::fs::write(&tmp_path, &new_id)
        .with_context(|| format!("write daemon id file: {}", tmp_path.display()))?;
    std::fs::rename(&tmp_path, &id_path)
        .with_context(|| format!("rename daemon id file: {}", id_path.display()))?;

    Ok(new_id)
}
