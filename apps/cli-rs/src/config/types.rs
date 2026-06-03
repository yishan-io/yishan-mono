use serde::{Deserialize, Serialize};

/// API credential and endpoint configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApiConfig {
    pub base_url: String,
    pub token: String,
    pub refresh_token: String,
    pub access_token_expires_at: String,
    pub refresh_token_expires_at: String,
}

/// Daemon connection configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DaemonConfig {
    pub host: String,
    pub port: u16,
    pub relay_enabled: bool,
    pub relay_url: String,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 0,
            relay_enabled: true,
            relay_url: "https://relay.yishan.io".to_string(),
        }
    }
}

/// Full resolved application configuration.
#[derive(Debug, Clone, Default)]
pub struct AppConfig {
    pub log_level: String,
    pub log_format: String,
    pub config_path: String,
    pub current_org_id: String,
    pub api: ApiConfig,
    pub daemon: DaemonConfig,
}

impl AppConfig {
    pub fn is_service_token(&self) -> bool {
        self.api.token.starts_with("yst_")
    }
}
