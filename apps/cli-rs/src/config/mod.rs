mod store;
mod types;

pub use store::{load, persist_auth_tokens, update_current_org, ConfigStore};
pub use types::{ApiConfig, AppConfig, DaemonConfig};

use anyhow::{Context, Result};
use regex::Regex;
use std::path::{Path, PathBuf};

pub const DIR_NAME: &str = ".yishan";

// Config file keys — kept as constants to avoid key-string drift.
pub const KEY_API_BASE_URL: &str = "api_base_url";
pub const KEY_API_TOKEN: &str = "api_token";
pub const KEY_API_REFRESH_TOKEN: &str = "api_refresh_token";
pub const KEY_API_ACCESS_TOKEN_EXPIRES_AT: &str = "api_access_token_expires_at";
pub const KEY_API_REFRESH_TOKEN_EXPIRES_AT: &str = "api_refresh_token_expires_at";
pub const KEY_CURRENT_ORG_ID: &str = "current_org_id";

/// Returns the `~/.yishan` directory path.
pub fn home_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().context("resolve user home directory")?;
    Ok(home.join(DIR_NAME))
}

/// Returns the default config file path for a profile.
pub fn default_config_path(profile: &str) -> Result<PathBuf> {
    let base = home_dir()?;
    Ok(base.join("profiles").join(profile).join("credential.yaml"))
}

/// Validates and normalises a profile name (letters, numbers, dash, underscore).
pub fn validate_profile(raw: &str) -> Result<String> {
    let trimmed = raw.trim().to_lowercase();
    if trimmed.is_empty() {
        return Ok("default".to_string());
    }
    let re = Regex::new(r"^[A-Za-z0-9_-]+$").unwrap();
    if !re.is_match(&trimmed) {
        anyhow::bail!("invalid profile {raw:?}: use letters, numbers, dash, or underscore");
    }
    Ok(trimmed)
}

/// Resolves the config file path from CLI flags / env / profile name.
pub fn resolve_config_path(
    explicit_path: Option<&Path>,
    profile: &str,
) -> Result<PathBuf> {
    if let Some(p) = explicit_path {
        return Ok(p.to_path_buf());
    }
    let validated = validate_profile(profile)?;
    default_config_path(&validated)
}
