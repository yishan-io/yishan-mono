use crate::workspace::types::FileEntry;
use std::collections::HashMap;

#[derive(Default)]
struct WorkspaceFileCache {
    directories: HashMap<String, Vec<FileEntry>>,
}

#[derive(Default)]
pub struct WorkspaceFileCacheStore {
    workspaces: HashMap<String, WorkspaceFileCache>,
}

impl WorkspaceFileCacheStore {
    pub fn get_directory(&self, root: &str, rel_path: &str) -> Option<Vec<FileEntry>> {
        self.workspaces
            .get(root)
            .and_then(|cache| cache.directories.get(rel_path))
            .cloned()
    }

    pub fn store_directory(&mut self, root: &str, rel_path: String, entries: Vec<FileEntry>) {
        self.workspaces
            .entry(root.to_string())
            .or_default()
            .directories
            .insert(rel_path, entries);
    }

    pub fn clear_workspace(&mut self, root: &str) {
        self.workspaces.remove(root);
    }

    pub fn invalidate_paths(&mut self, root: &str, paths: &[String]) {
        let Some(workspace) = self.workspaces.get_mut(root) else {
            return;
        };

        for path in paths {
            let normalized = normalize_cache_path(path);
            workspace.directories.remove(&normalized);

            let prefix = if normalized.is_empty() {
                String::new()
            } else {
                format!("{normalized}/")
            };
            if normalized.is_empty() {
                workspace.directories.clear();
                continue;
            }

            workspace
                .directories
                .retain(|key, _| key != &normalized && !key.starts_with(&prefix));

            let parent = parent_cache_path(&normalized);
            workspace.directories.remove(&parent);
        }

        if workspace.directories.is_empty() {
            self.workspaces.remove(root);
        }
    }
}

pub fn normalize_cache_path(path: &str) -> String {
    path.trim().trim_matches('/').replace('\\', "/")
}

pub fn parent_cache_path(path: &str) -> String {
    let normalized = normalize_cache_path(path);
    normalized
        .rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}
