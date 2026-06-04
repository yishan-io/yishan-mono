use crate::daemon::rpc::DomainRpcError;
use crate::workspace::file_cache::{normalize_cache_path, WorkspaceFileCacheStore};
use crate::workspace::types::FileEntry;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Directories that stay collapsed by default in the file tree and are not watched
/// for deep changes unless the user explicitly drills into them.
pub const IGNORED_DIRS: &[&str] = &[
    ".git",
    "target",       // Rust build output
    "node_modules", // JS/TS dependencies
    ".next",        // Next.js build cache
    "dist",         // Generic build output
    "build",        // Generic build output
    ".turbo",       // Turborepo cache
    ".cache",       // Generic tool caches
];

/// Maximum file size the daemon will read into memory and transmit.
/// Matches the desktop's LARGE_FILE_OPEN_THRESHOLD_BYTES (2 MiB).
const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const HIDDEN_DIRS: &[&str] = &[".git"];

/// Provides sandboxed file operations within a workspace root.
/// Fixes A1: extracted from the Go god-handler into its own focused service.
pub struct FileService {
    cache: Mutex<WorkspaceFileCacheStore>,
}

impl FileService {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(WorkspaceFileCacheStore::default()),
        }
    }

    fn is_ignored_dir_name(name: &str) -> bool {
        IGNORED_DIRS.contains(&name)
    }

    fn is_hidden_dir_name(name: &str) -> bool {
        HIDDEN_DIRS.contains(&name)
    }

    /// Resolve `rel_path` relative to `root` and verify it stays within `root`.
    /// The root is assumed to be already canonicalized (as stored by WorkspaceManager).
    /// We canonicalize the *parent* to handle symlinks without requiring the final
    /// component (the file itself) to already exist — matching resolve_safe_write.
    ///
    /// `.my-context` is a blessed symlink that may point outside the workspace.
    /// Paths under it are allowed even when canonicalization escapes `root`.
    fn resolve_safe(&self, root: &str, rel_path: &str) -> Result<PathBuf, DomainRpcError> {
        let base = Path::new(root);
        let joined = if rel_path.is_empty() || rel_path == "." {
            return Ok(base.to_path_buf());
        } else {
            base.join(rel_path)
        };

        // Canonicalize the parent so we can check containment even for paths
        // that don't yet exist (or were just deleted).
        let parent = joined.parent().unwrap_or(base);
        let canon_parent = parent
            .canonicalize()
            .map_err(|_| DomainRpcError::not_found(format!("path not found: {rel_path}")))?;

        if canon_parent.starts_with(base) {
            // Fast path: inside the workspace root.
            return Ok(canon_parent.join(joined.file_name().unwrap_or_default()));
        }

        // Allow paths that live under the .my-context symlink target.
        let ctx_link = base.join(".my-context");
        if let Ok(ctx_target) = ctx_link.canonicalize() {
            if canon_parent.starts_with(&ctx_target) {
                return Ok(canon_parent.join(joined.file_name().unwrap_or_default()));
            }
        }

        Err(DomainRpcError::new(
            crate::daemon::constants::RPC_PATH_RESTRICTED,
            format!("path escapes workspace root: {rel_path}"),
        ))
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

        if canon_parent.starts_with(base) {
            return Ok(canon_parent.join(joined.file_name().unwrap_or_default()));
        }

        // Allow writes under the .my-context symlink target.
        let ctx_link = base.join(".my-context");
        if let Ok(ctx_target) = ctx_link.canonicalize() {
            if canon_parent.starts_with(&ctx_target) {
                return Ok(canon_parent.join(joined.file_name().unwrap_or_default()));
            }
        }

        Err(DomainRpcError::new(
            crate::daemon::constants::RPC_PATH_RESTRICTED,
            format!("path escapes workspace root: {rel_path}"),
        ))
    }

    pub fn list(
        &self,
        root: &str,
        rel_path: &str,
        recursive: bool,
    ) -> Result<Vec<FileEntry>, DomainRpcError> {
        let dir = self.resolve_safe(root, rel_path)?;
        if !dir.is_dir() {
            return Err(DomainRpcError::new(
                crate::daemon::constants::RPC_INVALID_PARAMS,
                format!("not a directory: {rel_path}"),
            ));
        }

        let cache_key = normalize_cache_path(rel_path);
        if recursive {
            let mut entries = Vec::new();
            self.collect_dir_recursive(root, &dir, &cache_key, &mut entries)?;
            return Ok(entries);
        }

        self.cached_directory_entries(&dir, root, &cache_key)
    }

    fn cached_directory_entries(
        &self,
        dir: &Path,
        root: &str,
        rel_path: &str,
    ) -> Result<Vec<FileEntry>, DomainRpcError> {
        if let Some(entries) = self.cache.lock().unwrap().get_directory(root, rel_path) {
            return Ok(entries);
        }

        let entries = self.read_directory_entries(dir, root)?;
        self.cache
            .lock()
            .unwrap()
            .store_directory(root, rel_path.to_string(), entries.clone());
        Ok(entries)
    }

    fn collect_dir_recursive(
        &self,
        root: &str,
        dir: &Path,
        rel_path: &str,
        out: &mut Vec<FileEntry>,
    ) -> Result<(), DomainRpcError> {
        let entries = self.cached_directory_entries(dir, root, rel_path)?;
        for entry in entries {
            let child_path = entry.path.clone();
            let should_recurse = entry.is_dir && !entry.is_ignored;
            out.push(entry);
            if should_recurse {
                self.collect_dir_recursive(
                    root,
                    &Path::new(root).join(&child_path),
                    &child_path,
                    out,
                )?;
            }
        }
        Ok(())
    }

    fn read_directory_entries(
        &self,
        dir: &Path,
        root: &str,
    ) -> Result<Vec<FileEntry>, DomainRpcError> {
        let read_dir = fs::read_dir(dir)
            .map_err(|e| DomainRpcError::server_error(format!("read dir: {e}")))?;
        let mut entries = Vec::new();
        for entry in read_dir.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if Self::is_hidden_dir_name(&name_str) {
                continue;
            }
            let full_path = entry.path();
            // Use fs::metadata (follows symlinks) rather than entry.metadata()
            // (which on macOS returns the symlink's own metadata, not the target's).
            // This ensures symlinked directories like .my-context appear as is_dir=true.
            // Skip entries where metadata fails (broken symlink, permission error, race).
            let meta = match fs::metadata(&full_path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let rel = full_path.strip_prefix(root).unwrap_or(&full_path);
            let is_ignored = meta.is_dir() && Self::is_ignored_dir_name(&name_str);
            let modified_at = meta
                .modified()
                .map(|t| {
                    let secs = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    chrono::DateTime::from_timestamp(secs as i64, 0)
                        .unwrap_or_default()
                        .to_rfc3339()
                })
                .unwrap_or_default();
            entries.push(FileEntry {
                name: name_str.into_owned(),
                path: rel.to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                is_ignored,
                size: if meta.is_file() { meta.len() } else { 0 },
                modified_at,
            });
        }
        Ok(entries)
    }

    pub fn stat(&self, root: &str, rel_path: &str) -> Result<FileEntry, DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        let meta = fs::metadata(&path)
            .map_err(|e| DomainRpcError::not_found(format!("stat {rel_path}: {e}")))?;
        let rel = path.strip_prefix(root).unwrap_or(&path);
        let modified_at = meta
            .modified()
            .map(|t| {
                let secs = t
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                chrono::DateTime::from_timestamp(secs as i64, 0)
                    .unwrap_or_default()
                    .to_rfc3339()
            })
            .unwrap_or_default();
        Ok(FileEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: rel.to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            is_ignored: meta.is_dir()
                && path
                    .file_name()
                    .map(|name| Self::is_ignored_dir_name(&name.to_string_lossy()))
                    .unwrap_or(false),
            size: if meta.is_file() { meta.len() } else { 0 },
            modified_at,
        })
    }

    pub fn read(&self, root: &str, rel_path: &str) -> Result<String, DomainRpcError> {
        let path = self.resolve_safe(root, rel_path)?;
        // Guard against transmitting huge files over the WebSocket.
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if size > MAX_READ_BYTES {
            return Err(DomainRpcError::new(
                crate::daemon::constants::RPC_INVALID_PARAMS,
                format!("file too large to open ({size} bytes): {rel_path}"),
            ));
        }
        fs::read_to_string(&path)
            .map_err(|e| DomainRpcError::server_error(format!("read {rel_path}: {e}")))
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
            let mut f = opts
                .open(&path)
                .map_err(|e| DomainRpcError::server_error(format!("write {rel_path}: {e}")))?;
            f.write_all(content.as_bytes())
                .map_err(|e| DomainRpcError::server_error(format!("write {rel_path}: {e}")))?;
        }
        #[cfg(not(unix))]
        {
            fs::write(&path, content.as_bytes())
                .map_err(|e| DomainRpcError::server_error(format!("write {rel_path}: {e}")))?;
        }
        self.invalidate_paths(root, &[rel_path.to_string()]);
        Ok(content.len())
    }

    pub fn delete(
        &self,
        root: &str,
        rel_path: &str,
        recursive: bool,
    ) -> Result<(), DomainRpcError> {
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
        .map_err(|e| DomainRpcError::server_error(format!("delete {rel_path}: {e}")))?;
        self.invalidate_paths(root, &[rel_path.to_string()]);
        Ok(())
    }

    pub fn move_path(&self, root: &str, from: &str, to: &str) -> Result<(), DomainRpcError> {
        let from_path = self.resolve_safe(root, from)?;
        let to_path = self.resolve_safe_write(root, to)?;
        fs::rename(&from_path, &to_path)
            .map_err(|e| DomainRpcError::server_error(format!("move {from} -> {to}: {e}")))?;
        self.invalidate_paths(root, &[from.to_string(), to.to_string()]);
        Ok(())
    }

    pub fn mkdir(
        &self,
        root: &str,
        rel_path: &str,
        parents: bool,
        _mode: u32,
    ) -> Result<(), DomainRpcError> {
        let path = self.resolve_safe_write(root, rel_path)?;
        let result = if parents {
            fs::create_dir_all(&path)
        } else {
            fs::create_dir(&path)
        };
        result.map_err(|e| DomainRpcError::server_error(format!("mkdir {rel_path}: {e}")))?;
        self.invalidate_paths(root, &[rel_path.to_string()]);
        Ok(())
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
        Ok(crate::workspace::types::GitDiffContent {
            old_content,
            new_content,
        })
    }

    pub fn invalidate_paths(&self, root: &str, paths: &[String]) {
        self.cache.lock().unwrap().invalidate_paths(root, paths);
    }

    pub fn clear_workspace_cache(&self, root: &str) {
        self.cache.lock().unwrap().clear_workspace(root);
    }
}

impl Default for FileService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::FileService;
    use std::fs;

    #[test]
    fn recursive_root_list_keeps_ignored_dirs_collapsed() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let root = temp_dir.path();
        let canonical_root = root.canonicalize().expect("canonicalize root");
        fs::create_dir_all(root.join(".git/objects")).expect("create hidden dir");
        fs::create_dir_all(root.join("target/debug")).expect("create ignored dir");
        fs::create_dir_all(root.join("src")).expect("create src dir");
        fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").expect("write hidden child");
        fs::write(root.join("target/debug/app"), "bin").expect("write ignored child");
        fs::write(root.join("src/main.rs"), "fn main() {}\n").expect("write visible child");

        let service = FileService::new();
        let entries = service
            .list(canonical_root.to_str().expect("root path"), "", true)
            .expect("list files");

        let paths = entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert!(!paths.contains(&".git"));
        assert!(paths.contains(&"target"));
        assert!(paths.contains(&"src"));
        assert!(paths.contains(&"src/main.rs"));
        assert!(!paths.contains(&"target/debug"));

        let target_entry = entries
            .iter()
            .find(|entry| entry.path == "target")
            .expect("target entry");
        assert!(target_entry.is_dir);
        assert!(target_entry.is_ignored);
    }

    #[test]
    fn recursive_list_of_ignored_dir_loads_its_children() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let root = temp_dir.path();
        let canonical_root = root.canonicalize().expect("canonicalize root");
        fs::create_dir_all(root.join("target/debug")).expect("create ignored dir");
        fs::write(root.join("target/debug/app"), "bin").expect("write ignored child");

        let service = FileService::new();
        let entries = service
            .list(canonical_root.to_str().expect("root path"), "target", true)
            .expect("list ignored dir");

        let paths = entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert!(paths.contains(&"target/debug"));
        assert!(paths.contains(&"target/debug/app"));

        let debug_entry = entries
            .iter()
            .find(|entry| entry.path == "target/debug")
            .expect("debug entry");
        assert!(!debug_entry.is_ignored);
    }

    #[test]
    fn cached_directory_listing_refreshes_after_write() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let root = temp_dir.path();
        let canonical_root = root.canonicalize().expect("canonicalize root");
        fs::create_dir_all(root.join("src")).expect("create src dir");
        fs::write(root.join("src/main.rs"), "fn main() {}\n").expect("write file");

        let service = FileService::new();
        let initial = service
            .list(canonical_root.to_str().expect("root path"), "src", false)
            .expect("list src");
        let initial_entry = initial
            .iter()
            .find(|entry| entry.path == "src/main.rs")
            .expect("initial entry");
        assert_eq!(initial_entry.size, 13);

        service
            .write(
                canonical_root.to_str().expect("root path"),
                "src/main.rs",
                "fn main() { println!(\"hi\"); }\n",
                0,
            )
            .expect("write file");

        let refreshed = service
            .list(canonical_root.to_str().expect("root path"), "src", false)
            .expect("list src after write");
        let refreshed_entry = refreshed
            .iter()
            .find(|entry| entry.path == "src/main.rs")
            .expect("refreshed entry");
        assert!(refreshed_entry.size > initial_entry.size);
    }
}
