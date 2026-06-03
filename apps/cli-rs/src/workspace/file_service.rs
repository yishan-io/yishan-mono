use crate::daemon::rpc::DomainRpcError;
use crate::workspace::types::FileEntry;
use std::fs;
use std::path::{Path, PathBuf};

/// Provides sandboxed file operations within a workspace root.
/// Fixes A1: extracted from the Go god-handler into its own focused service.
pub struct FileService;

impl FileService {
    pub fn new() -> Self { Self }

    /// Resolve `rel_path` relative to `root` and verify it stays within `root`.
    fn resolve_safe(&self, root: &str, rel_path: &str) -> Result<PathBuf, DomainRpcError> {
        let base = Path::new(root);
        let joined = if rel_path.is_empty() || rel_path == "." {
            base.to_path_buf()
        } else {
            base.join(rel_path)
        };
        let canonical = joined.canonicalize().map_err(|_| {
            DomainRpcError::not_found(format!("path not found: {rel_path}"))
        })?;
        if !canonical.starts_with(base) {
            return Err(DomainRpcError::new(
                crate::daemon::constants::RPC_PATH_RESTRICTED,
                format!("path escapes workspace root: {rel_path}"),
            ));
        }
        Ok(canonical)
    }

    /// Resolve `rel_path` for write operations (parent must exist and be inside root).
    fn resolve_safe_write(&self, root: &str, rel_path: &str) -> Result<PathBuf, DomainRpcError> {
        let base = Path::new(root);
        let joined = base.join(rel_path);
        // Only canonicalize parent to allow creating new files.
        let parent = joined.parent().unwrap_or(base);
        let canon_parent = parent.canonicalize().map_err(|_| {
            DomainRpcError::not_found(format!("parent directory not found for: {rel_path}"))
        })?;
        if !canon_parent.starts_with(base) {
            return Err(DomainRpcError::new(
                crate::daemon::constants::RPC_PATH_RESTRICTED,
                format!("path escapes workspace root: {rel_path}"),
            ));
        }
        Ok(canon_parent.join(joined.file_name().unwrap_or_default()))
    }

    pub fn list(
        &self,
        root: &str,
        rel_path: &str,
        recursive: bool,
    ) -> Result<Vec<FileEntry>, DomainRpcError> {
        let dir = self.resolve_safe(root, rel_path)?;
        let mut entries = Vec::new();
        self.list_dir(&dir, root, recursive, &mut entries)?;
        Ok(entries)
    }

    fn list_dir(
        &self,
        dir: &Path,
        root: &str,
        recursive: bool,
        out: &mut Vec<FileEntry>,
    ) -> Result<(), DomainRpcError> {
        let read_dir = fs::read_dir(dir).map_err(|e| {
            DomainRpcError::server_error(format!("read dir: {e}"))
        })?;
        for entry in read_dir.flatten() {
            let meta = entry.metadata().map_err(|e| {
                DomainRpcError::server_error(format!("stat: {e}"))
            })?;
            let full_path = entry.path();
            let rel = full_path.strip_prefix(root).unwrap_or(&full_path);
            let modified_at = meta.modified()
                .map(|t| {
                    let secs = t.duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    chrono::DateTime::from_timestamp(secs as i64, 0)
                        .unwrap_or_default()
                        .to_rfc3339()
                })
                .unwrap_or_default();
            out.push(FileEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: rel.to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size: if meta.is_file() { meta.len() } else { 0 },
                modified_at,
            });
            if recursive && meta.is_dir() {
                self.list_dir(&full_path, root, recursive, out)?;
            }
        }
        Ok(())
    }

    pub fn stat(&self, root: &str, rel_path: &str) -> Result<FileEntry, DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        let meta = fs::metadata(&path).map_err(|e| {
            DomainRpcError::not_found(format!("stat {rel_path}: {e}"))
        })?;
        let rel = path.strip_prefix(root).unwrap_or(&path);
        let modified_at = meta.modified()
            .map(|t| {
                let secs = t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                chrono::DateTime::from_timestamp(secs as i64, 0)
                    .unwrap_or_default()
                    .to_rfc3339()
            })
            .unwrap_or_default();
        Ok(FileEntry {
            name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
            path: rel.to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
            modified_at,
        })
    }

    pub fn read(&self, root: &str, rel_path: &str) -> Result<String, DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        fs::read_to_string(&path).map_err(|e| {
            DomainRpcError::server_error(format!("read {rel_path}: {e}"))
        })
    }

    pub fn write(
        &self,
        root: &str,
        rel_path: &str,
        content: &str,
        mode: u32,
    ) -> Result<usize, DomainRpcError> {
        let path = self.resolve_safe_write(root, rel_path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            let mut opts = fs::OpenOptions::new();
            opts.write(true).create(true).truncate(true);
            if mode != 0 {
                opts.mode(mode);
            }
            use std::io::Write;
            let mut f = opts.open(&path).map_err(|e| {
                DomainRpcError::server_error(format!("write {rel_path}: {e}"))
            })?;
            f.write_all(content.as_bytes()).map_err(|e| {
                DomainRpcError::server_error(format!("write {rel_path}: {e}"))
            })?;
        }
        #[cfg(not(unix))]
        {
            fs::write(&path, content.as_bytes()).map_err(|e| {
                DomainRpcError::server_error(format!("write {rel_path}: {e}"))
            })?;
        }
        Ok(content.len())
    }

    pub fn delete(&self, root: &str, rel_path: &str, recursive: bool) -> Result<(), DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        if path.is_dir() {
            if recursive {
                fs::remove_dir_all(&path)
            } else {
                fs::remove_dir(&path)
            }
        } else {
            fs::remove_file(&path)
        }
        .map_err(|e| DomainRpcError::server_error(format!("delete {rel_path}: {e}")))
    }

    pub fn move_path(&self, root: &str, from: &str, to: &str) -> Result<(), DomainRpcError> {
        let from_path = self.resolve_safe(root, from)?;
        let to_path = self.resolve_safe_write(root, to)?;
        fs::rename(&from_path, &to_path).map_err(|e| {
            DomainRpcError::server_error(format!("move {from} -> {to}: {e}"))
        })
    }

    pub fn mkdir(&self, root: &str, rel_path: &str, parents: bool, _mode: u32) -> Result<(), DomainRpcError> {
        let base = Path::new(root);
        let joined = base.join(rel_path);
        let result = if parents {
            fs::create_dir_all(&joined)
        } else {
            fs::create_dir(&joined)
        };
        result.map_err(|e| DomainRpcError::server_error(format!("mkdir {rel_path}: {e}")))
    }

    /// Return old + new content of a file relative to its last git-tracked state.
    pub fn read_diff(
        &self,
        root: &str,
        rel_path: &str,
    ) -> Result<crate::workspace::types::GitDiffContent, DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        let new_content = fs::read_to_string(&path).unwrap_or_default();
        // Run `git show HEAD:<rel_path>` for the old content.
        let old_content = std::process::Command::new("git")
            .args(["show", &format!("HEAD:{rel_path}")])
            .current_dir(root)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        Ok(crate::workspace::types::GitDiffContent { old_content, new_content })
    }
}

impl Default for FileService {
    fn default() -> Self { Self::new() }
}
