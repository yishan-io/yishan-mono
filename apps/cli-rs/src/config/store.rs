#![allow(dead_code)]

use super::types::{ApiConfig, AppConfig, DaemonConfig};
use super::{
    KEY_API_ACCESS_TOKEN_EXPIRES_AT, KEY_API_BASE_URL, KEY_API_REFRESH_TOKEN,
    KEY_API_REFRESH_TOKEN_EXPIRES_AT, KEY_API_TOKEN, KEY_CURRENT_ORG_ID,
};
use anyhow::{Context, Result};
use serde_yaml::Value;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

/// Holds the resolved config and its file path for later mutation.
#[derive(Debug, Clone)]
pub struct ConfigStore {
    pub config: AppConfig,
}

/// Load config from a YAML credential file.
/// Missing file is treated as empty config (fresh install).
pub fn load(
    config_path: &Path,
    log_level: &str,
    log_format: &str,
    api_base_url: &str,
    api_token: &str,
) -> Result<AppConfig> {
    let raw = if config_path.exists() {
        std::fs::read_to_string(config_path)
            .with_context(|| format!("read config file: {}", config_path.display()))?
    } else {
        String::new()
    };

    let map: HashMap<String, Value> = if raw.is_empty() {
        HashMap::new()
    } else {
        serde_yaml::from_str(&raw)
            .with_context(|| format!("parse config file: {}", config_path.display()))?
    };

    let get_str = |key: &str| -> String {
        map.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let get_bool = |key: &str, default: bool| -> bool {
        map.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
    };

    let get_u16 = |key: &str, default: u16| -> u16 {
        map.get(key)
            .and_then(|v| v.as_u64())
            .map(|v| v as u16)
            .unwrap_or(default)
    };

    // Flags/env override file values for token and base URL.
    let resolved_token = if !api_token.is_empty() {
        api_token.to_string()
    } else {
        get_str(KEY_API_TOKEN)
    };

    let resolved_base_url = if !api_base_url.is_empty() {
        api_base_url.to_string()
    } else {
        let from_file = get_str(KEY_API_BASE_URL);
        if from_file.is_empty() {
            "https://api.yishan.io".to_string()
        } else {
            from_file
        }
    };

    let resolved_log_level = if !log_level.is_empty() {
        log_level.to_string()
    } else {
        let from_file = get_str("log_level");
        if from_file.is_empty() {
            "info".to_string()
        } else {
            from_file
        }
    };

    let resolved_log_format = if !log_format.is_empty() {
        log_format.to_string()
    } else {
        let from_file = get_str("log_format");
        if from_file.is_empty() {
            "pretty".to_string()
        } else {
            from_file
        }
    };

    Ok(AppConfig {
        log_level: resolved_log_level,
        log_format: resolved_log_format,
        config_path: config_path.to_string_lossy().to_string(),
        current_org_id: get_str(KEY_CURRENT_ORG_ID),
        api: ApiConfig {
            base_url: resolved_base_url,
            token: resolved_token,
            refresh_token: get_str(KEY_API_REFRESH_TOKEN),
            access_token_expires_at: get_str(KEY_API_ACCESS_TOKEN_EXPIRES_AT),
            refresh_token_expires_at: get_str(KEY_API_REFRESH_TOKEN_EXPIRES_AT),
        },
        daemon: DaemonConfig {
            host: get_str("daemon_host"),
            port: get_u16("daemon_port", 0),
            relay_enabled: get_bool("daemon_relay_enabled", true),
            relay_url: {
                let u = get_str("daemon_relay_url");
                if u.is_empty() {
                    "https://relay.yishan.io".to_string()
                } else {
                    u
                }
            },
        },
    })
}

/// Atomically persist auth token fields to the YAML credential file.
/// Reads the existing file, merges changes, writes via temp+rename.
pub fn persist_auth_tokens(
    config_path: &Path,
    access_token: &str,
    refresh_token: &str,
    access_token_expires_at: &str,
    refresh_token_expires_at: &str,
    base_url: &str,
) -> Result<()> {
    let raw = if config_path.exists() {
        std::fs::read_to_string(config_path)
            .with_context(|| format!("read config for update: {}", config_path.display()))?
    } else {
        String::new()
    };

    let mut map: serde_yaml::Mapping = if raw.is_empty() {
        serde_yaml::Mapping::new()
    } else {
        serde_yaml::from_str(&raw)
            .with_context(|| format!("parse config for update: {}", config_path.display()))?
    };

    if !base_url.is_empty() {
        map.insert(
            Value::String(KEY_API_BASE_URL.to_string()),
            Value::String(base_url.to_string()),
        );
    }
    map.insert(
        Value::String(KEY_API_TOKEN.to_string()),
        Value::String(access_token.to_string()),
    );
    if !refresh_token.is_empty() {
        map.insert(
            Value::String(KEY_API_REFRESH_TOKEN.to_string()),
            Value::String(refresh_token.to_string()),
        );
    }
    if !access_token_expires_at.is_empty() {
        map.insert(
            Value::String(KEY_API_ACCESS_TOKEN_EXPIRES_AT.to_string()),
            Value::String(access_token_expires_at.to_string()),
        );
    }
    if !refresh_token_expires_at.is_empty() {
        map.insert(
            Value::String(KEY_API_REFRESH_TOKEN_EXPIRES_AT.to_string()),
            Value::String(refresh_token_expires_at.to_string()),
        );
    }

    write_yaml_atomic(config_path, &map)
}

/// Atomically persist the current org ID to the YAML credential file.
pub fn update_current_org(config_path: &Path, org_id: &str) -> Result<()> {
    let raw = if config_path.exists() {
        std::fs::read_to_string(config_path)
            .with_context(|| format!("read config for org update: {}", config_path.display()))?
    } else {
        String::new()
    };

    let mut map: serde_yaml::Mapping = if raw.is_empty() {
        serde_yaml::Mapping::new()
    } else {
        serde_yaml::from_str(&raw)
            .with_context(|| format!("parse config for org update: {}", config_path.display()))?
    };

    if org_id.is_empty() {
        map.remove(KEY_CURRENT_ORG_ID);
    } else {
        map.insert(
            Value::String(KEY_CURRENT_ORG_ID.to_string()),
            Value::String(org_id.to_string()),
        );
    }

    write_yaml_atomic(config_path, &map)
}

fn write_yaml_atomic(path: &Path, map: &serde_yaml::Mapping) -> Result<()> {
    let yaml = serde_yaml::to_string(map).context("serialize config to YAML")?;

    // Ensure parent directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create config directory: {}", parent.display()))?;
    }

    // Write to a temp file in the same directory, then rename.
    let dir = path.parent().unwrap_or(Path::new("."));
    let mut tmp = NamedTempFile::new_in(dir).context("create temp config file")?;
    tmp.write_all(yaml.as_bytes())
        .context("write temp config file")?;
    tmp.flush().context("flush temp config file")?;
    tmp.persist(path)
        .with_context(|| format!("atomic rename config to {}", path.display()))?;

    Ok(())
}
