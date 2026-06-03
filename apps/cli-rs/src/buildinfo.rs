/// Build-time version injected by build.rs or Cargo.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Short commit SHA, populated by build.rs via the `GIT_COMMIT` env var.
/// Falls back to "unknown" when not set (e.g. local dev builds).
pub const GIT_COMMIT: &str = env!("YISHAN_GIT_COMMIT", "unknown");

/// Returns the full version string including optional git SHA.
#[allow(dead_code)]
pub fn version_string() -> String {
    if GIT_COMMIT == "unknown" {
        VERSION.to_string()
    } else {
        format!("{} ({})", VERSION, &GIT_COMMIT[..GIT_COMMIT.len().min(8)])
    }
}
