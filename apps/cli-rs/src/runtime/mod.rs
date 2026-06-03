use crate::api::{ApiClient, TokenUpdate};
use crate::config::{self, persist_auth_tokens, AppConfig};
use anyhow::{Context, Result};
use reqwest::Client as HttpClient;
use std::path::Path;
use std::sync::{Arc, RwLock};

/// Process-wide application state, held in an Arc for cheap cloning into async tasks.
/// Replaces the Go global `runtime.appCfg` singleton with an explicit, testable struct.
///
/// `http` is a single `reqwest::Client` whose connection pool is shared across every
/// `ApiClient` produced by `api_client()`.  `reqwest::Client` is already `Arc`-backed
/// internally, so `.clone()` is a cheap ref-count bump — no TLS setup per call (P3 fix).
#[derive(Clone)]
pub struct AppRuntime {
    inner: Arc<RwLock<AppConfig>>,
    /// Shared HTTP client — built once, cloned cheaply into each `ApiClient`.
    http: HttpClient,
}

impl AppRuntime {
    pub fn new(cfg: AppConfig) -> Self {
        Self {
            inner: Arc::new(RwLock::new(cfg)),
            http: ApiClient::build_http_client(),
        }
    }

    /// Returns a snapshot of the current config.
    pub fn config(&self) -> AppConfig {
        self.inner.read().unwrap().clone()
    }

    /// Returns true when API credentials are configured.
    #[allow(dead_code)]
    pub fn is_authenticated(&self) -> bool {
        let cfg = self.inner.read().unwrap();
        !cfg.api.base_url.is_empty() && !cfg.api.token.is_empty()
    }

    /// Build a shared `ApiClient` from the current config.
    /// The `on_token_refresh` callback persists new tokens to disk.
    pub fn api_client(&self) -> ApiClient {
        let cfg = self.config();
        let runtime = self.clone();
        let on_refresh = Arc::new(move |update: TokenUpdate| {
            runtime.persist_tokens(
                &update.access_token,
                &update.refresh_token,
                &update.access_token_expires_at,
                &update.refresh_token_expires_at,
            )
        });
        ApiClient::new(
            self.http.clone(),
            &cfg.api.base_url,
            &cfg.api.token,
            &cfg.api.refresh_token,
            &cfg.api.access_token_expires_at,
            &cfg.api.refresh_token_expires_at,
            Some(on_refresh),
        )
    }

    /// Atomically persist refreshed tokens to disk and update in-memory state.
    pub fn persist_tokens(
        &self,
        access_token: &str,
        refresh_token: &str,
        access_token_expires_at: &str,
        refresh_token_expires_at: &str,
    ) -> Result<()> {
        let mut cfg = self.inner.write().unwrap();

        // Reject stale updates (same logic as Go's shouldRejectStaleTokenUpdate).
        if should_reject_stale_token(
            &cfg.api.access_token_expires_at,
            access_token_expires_at,
            &cfg.api.refresh_token_expires_at,
            refresh_token_expires_at,
        ) {
            return Ok(());
        }

        let path = Path::new(&cfg.config_path);
        persist_auth_tokens(
            path,
            access_token,
            refresh_token,
            access_token_expires_at,
            refresh_token_expires_at,
            &cfg.api.base_url,
        )
        .context("persist auth tokens to config file")?;

        cfg.api.token = access_token.to_string();
        if !refresh_token.is_empty() {
            cfg.api.refresh_token = refresh_token.to_string();
        }
        if !access_token_expires_at.is_empty() {
            cfg.api.access_token_expires_at = access_token_expires_at.to_string();
        }
        if !refresh_token_expires_at.is_empty() {
            cfg.api.refresh_token_expires_at = refresh_token_expires_at.to_string();
        }
        Ok(())
    }

    /// Re-read auth tokens from the credential file on disk and update in-memory state.
    /// Called by the `app.reloadAuthConfig` RPC after `yishan login` writes new tokens.
    pub fn reload_auth_from_disk(&self) -> Result<()> {
        let config_path = {
            let cfg = self.inner.read().unwrap();
            cfg.config_path.clone()
        };
        let fresh = config::load(Path::new(&config_path), "", "", "", "")
            .context("reload auth config from disk")?;
        let mut cfg = self.inner.write().unwrap();
        cfg.api.token = fresh.api.token;
        cfg.api.refresh_token = fresh.api.refresh_token;
        cfg.api.access_token_expires_at = fresh.api.access_token_expires_at;
        cfg.api.refresh_token_expires_at = fresh.api.refresh_token_expires_at;
        Ok(())
    }

    /// Clear auth state in memory (used after logout).
    pub fn clear_auth(&self) {
        let mut cfg = self.inner.write().unwrap();
        cfg.api.token.clear();
        cfg.api.refresh_token.clear();
        cfg.api.access_token_expires_at.clear();
        cfg.api.refresh_token_expires_at.clear();
    }

    /// Update the current org ID in memory and on disk.
    pub fn set_current_org(&self, org_id: &str) -> Result<()> {
        let mut cfg = self.inner.write().unwrap();
        let path = Path::new(&cfg.config_path).to_path_buf();
        config::update_current_org(&path, org_id).context("update current org in config")?;
        cfg.current_org_id = org_id.to_string();
        Ok(())
    }
}

fn parse_expiry(raw: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<chrono::DateTime<chrono::Utc>>().ok()
}

fn should_reject_stale_token(
    current_access_exp: &str,
    incoming_access_exp: &str,
    current_refresh_exp: &str,
    incoming_refresh_exp: &str,
) -> bool {
    if let (Some(curr), Some(inc)) =
        (parse_expiry(current_refresh_exp), parse_expiry(incoming_refresh_exp))
    {
        if inc < curr {
            return true;
        }
    }
    if let (Some(curr), Some(inc)) =
        (parse_expiry(current_access_exp), parse_expiry(incoming_access_exp))
    {
        if inc < curr {
            return true;
        }
    }
    false
}
