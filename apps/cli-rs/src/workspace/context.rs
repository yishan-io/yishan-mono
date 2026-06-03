use crate::daemon::rpc::DomainRpcError;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const CONTEXT_LINK_NAME: &str = ".my-context";

/// Per-path outcome used in the sync result.
#[derive(Debug, serde::Serialize)]
pub struct SyncContextLinkResult {
    pub updated: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: std::collections::HashMap<String, String>,
}

/// Params for workspace.syncContextLink.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncContextLinkRequest {
    pub repo_key: String,
    pub enabled: bool,
    pub worktree_paths: Vec<String>,
}

/// Returns `~/.yishan/contexts/<repo_key>`.
pub fn default_context_path(repo_key: &str) -> Result<PathBuf, DomainRpcError> {
    let home = dirs::home_dir()
        .ok_or_else(|| DomainRpcError::server_error("cannot determine home directory"))?;
    // Validate repo_key is a safe relative path (no `..`, no leading `/`).
    let key = repo_key.trim();
    if key.is_empty() || key.contains("..") || key.starts_with('/') {
        return Err(DomainRpcError::invalid_params(format!("invalid repoKey: {key}")));
    }
    Ok(home.join(".yishan").join("contexts").join(key))
}

/// Sync context links for a batch of worktree paths.
pub fn sync_context_links(req: &SyncContextLinkRequest) -> SyncContextLinkResult {
    let mut result = SyncContextLinkResult {
        updated: Vec::new(),
        skipped: Vec::new(),
        errors: std::collections::HashMap::new(),
    };

    let context_path = match default_context_path(&req.repo_key) {
        Ok(p) => p,
        Err(e) => {
            result.errors.insert("*".into(), e.to_string());
            return result;
        }
    };

    let mut seen = std::collections::HashSet::new();
    for raw in &req.worktree_paths {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            result.skipped.push(raw.clone());
            continue;
        }
        if !Path::new(&trimmed).is_absolute() {
            result.errors.insert(raw.clone(), "worktree path must be absolute".into());
            continue;
        }
        if !seen.insert(trimmed.clone()) {
            continue;
        }

        let op_result = if req.enabled {
            ensure_context_link(&context_path, &trimmed)
        } else {
            remove_context_link(&context_path, &trimmed)
        };

        match op_result {
            Ok(()) => result.updated.push(trimmed),
            Err(e) => { result.errors.insert(raw.clone(), e); }
        }
    }

    result
}

/// Create the shared context directory and place a `.my-context` symlink inside
/// the worktree. Idempotent — skips if the symlink is already correct.
fn ensure_context_link(context_path: &Path, worktree_path: &str) -> Result<(), String> {
    fs::create_dir_all(context_path)
        .map_err(|e| format!("ensure context dir: {e}"))?;

    ensure_git_exclude(worktree_path, CONTEXT_LINK_NAME);

    let link_path = Path::new(worktree_path).join(CONTEXT_LINK_NAME);

    match std::fs::symlink_metadata(&link_path) {
        Ok(meta) => {
            if !meta.file_type().is_symlink() {
                // User-created folder/file — leave alone.
                return Ok(());
            }
            let existing = std::fs::read_link(&link_path)
                .map_err(|e| format!("read context link: {e}"))?;
            if existing == context_path {
                // Already correct.
                return Ok(());
            }
            // Stale symlink — remove and recreate.
            fs::remove_file(&link_path)
                .map_err(|e| format!("remove stale context link: {e}"))?;
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("inspect context link: {e}")),
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(context_path, &link_path)
        .map_err(|e| format!("create context symlink: {e}"))?;
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(context_path, &link_path)
        .map_err(|e| format!("create context symlink (enable Developer Mode): {e}"))?;

    Ok(())
}

/// Remove `.my-context` only if it's a symlink pointing at `context_path`.
fn remove_context_link(context_path: &Path, worktree_path: &str) -> Result<(), String> {
    let link_path = Path::new(worktree_path).join(CONTEXT_LINK_NAME);

    match std::fs::symlink_metadata(&link_path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("inspect context link: {e}")),
        Ok(meta) => {
            if !meta.file_type().is_symlink() {
                return Ok(());
            }
        }
    }

    let existing = std::fs::read_link(&link_path)
        .map_err(|e| format!("read context link: {e}"))?;
    if existing != context_path {
        // Points elsewhere — leave alone.
        return Ok(());
    }

    fs::remove_file(&link_path)
        .map_err(|e| format!("remove context link: {e}"))?;
    Ok(())
}

/// Append `.my-context` to `.git/info/exclude` so it stays local.
fn ensure_git_exclude(worktree_path: &str, pattern: &str) {
    let git_entry = Path::new(worktree_path).join(".git");

    let common_dir: PathBuf = match std::fs::symlink_metadata(&git_entry) {
        Err(_) => return,
        Ok(meta) => {
            if meta.is_dir() {
                git_entry.clone()
            } else if meta.is_file() {
                // Worktree .git file: "gitdir: <path>"
                let content = match fs::read_to_string(&git_entry) {
                    Ok(s) => s,
                    Err(_) => return,
                };
                let line = content.trim();
                let Some(git_dir_str) = line.strip_prefix("gitdir: ") else { return; };
                let git_dir = if Path::new(git_dir_str.trim()).is_absolute() {
                    PathBuf::from(git_dir_str.trim())
                } else {
                    Path::new(worktree_path).join(git_dir_str.trim())
                };
                // common dir is two levels up from the worktree git dir
                match git_dir.parent().and_then(|p| p.parent()) {
                    Some(p) => p.to_path_buf(),
                    None => return,
                }
            } else {
                return;
            }
        }
    };

    append_exclude_pattern(&common_dir.join("info").join("exclude"), pattern);
}

fn append_exclude_pattern(exclude_path: &Path, pattern: &str) {
    let content = match fs::read(exclude_path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(_) => return,
    };

    let content_str = String::from_utf8_lossy(&content);
    for line in content_str.lines() {
        if line.trim() == pattern {
            return; // already present
        }
    }

    if let Some(parent) = exclude_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut f = match fs::OpenOptions::new()
        .write(true).create(true).append(true)
        .open(exclude_path)
    {
        Ok(f) => f,
        Err(_) => return,
    };

    let line = if !content.is_empty() && content.last() != Some(&b'\n') {
        format!("\n{pattern}\n")
    } else {
        format!("{pattern}\n")
    };
    let _ = f.write_all(line.as_bytes());
}
