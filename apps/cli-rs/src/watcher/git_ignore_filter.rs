use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct CachedGitIgnore {
    root: PathBuf,
    cache: HashMap<String, bool>,
}

impl CachedGitIgnore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            cache: HashMap::new(),
        }
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }

    pub fn is_ignored(&mut self, path: &Path) -> bool {
        let Ok(rel) = path.strip_prefix(&self.root) else {
            return false;
        };
        let rel = rel.to_string_lossy().replace('\\', "/");
        if rel.is_empty() {
            return false;
        }

        if self.cached_ignored_ancestor(&rel) {
            self.cache.insert(rel, true);
            return true;
        }

        if let Some(ignored) = self.cache.get(&rel) {
            return *ignored;
        }

        let ignored = Command::new("git")
            .args(["check-ignore", "-q", "--no-index", "--", &rel])
            .current_dir(&self.root)
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        self.cache.insert(rel, ignored);
        ignored
    }

    fn cached_ignored_ancestor(&self, rel: &str) -> bool {
        let mut ancestor = Path::new(rel).parent();
        while let Some(path) = ancestor {
            let key = path.to_string_lossy();
            if !key.is_empty() && self.cache.get(key.as_ref()) == Some(&true) {
                return true;
            }
            ancestor = path.parent();
        }
        false
    }
}
