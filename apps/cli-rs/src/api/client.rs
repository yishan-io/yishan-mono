use anyhow::Context;
use reqwest::{Client as HttpClient, Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::{debug, warn};

const ACCESS_TOKEN_EARLY_REFRESH_SECS: i64 = 30;
const REFRESH_TOKEN_GUARD_SECS: i64 = 30;
const SERVICE_TOKEN_PREFIX: &str = "yst_";
const REQUEST_TIMEOUT_SECS: u64 = 15;

/// HTTP-level API error.
#[derive(Debug, Error)]
#[error("API {method} {path} → {status}: {body}")]
pub struct ApiError {
    pub method: String,
    pub path: String,
    pub status: u16,
    pub body: String,
}

/// Wraps a failed request error + the underlying refresh failure.
#[derive(Debug, Error)]
#[error("request unauthorized and token refresh failed: {refresh_error}")]
pub struct TokenRefreshError {
    pub request_error: Box<dyn std::error::Error + Send + Sync>,
    pub refresh_error: Box<dyn std::error::Error + Send + Sync>,
}

/// Mutable token state, guarded by a Mutex to prevent data races (fixes C1).
#[derive(Debug, Clone)]
pub struct TokenState {
    pub access_token: String,
    pub refresh_token: String,
    pub access_token_expires_at: String,
    pub refresh_token_expires_at: String,
}

/// Callback invoked whenever tokens are refreshed, so the caller can persist them.
pub type OnTokenRefresh = Arc<dyn Fn(TokenUpdate) -> anyhow::Result<()> + Send + Sync>;

/// Token update payload (mirrors Go's `api.TokenUpdate`).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUpdate {
    pub access_token: String,
    pub refresh_token: String,
    pub access_token_expires_at: String,
    pub refresh_token_expires_at: String,
}

/// Single shared HTTP client with connection pooling (fixes A5 / P3).
/// Token state is guarded by a `Mutex` to prevent refresh races (fixes C1).
#[derive(Clone)]
pub struct ApiClient {
    http: HttpClient,
    base_url: String,
    token_state: Arc<Mutex<TokenState>>,
    on_token_refresh: Option<OnTokenRefresh>,
}

impl ApiClient {
    pub fn new(
        base_url: impl Into<String>,
        access_token: impl Into<String>,
        refresh_token: impl Into<String>,
        access_token_expires_at: impl Into<String>,
        refresh_token_expires_at: impl Into<String>,
        on_token_refresh: Option<OnTokenRefresh>,
    ) -> Self {
        let http = HttpClient::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .use_rustls_tls()
            .build()
            .expect("build reqwest client");

        let base_url = base_url
            .into()
            .trim_end_matches('/')
            .to_string();

        Self {
            http,
            base_url,
            token_state: Arc::new(Mutex::new(TokenState {
                access_token: access_token.into().trim().to_string(),
                refresh_token: refresh_token.into().trim().to_string(),
                access_token_expires_at: access_token_expires_at.into().trim().to_string(),
                refresh_token_expires_at: refresh_token_expires_at.into().trim().to_string(),
            })),
            on_token_refresh,
        }
    }

    /// Raw request → bytes, with proactive + reactive token refresh.
    pub async fn do_raw<B: Serialize + Send>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> anyhow::Result<bytes::Bytes> {
        let state = self.token_state.lock().await;
        let is_service = state.access_token.starts_with(SERVICE_TOKEN_PREFIX);
        let is_refresh = is_refresh_path(path);
        drop(state);

        if !is_service && !is_refresh {
            let state = self.token_state.lock().await;
            if should_proactively_refresh(&state) {
                drop(state);
                debug!(%path, "proactively refreshing API access token");
                if let Err(e) = self.do_refresh().await {
                    warn!(err = %e, %path, "proactive token refresh failed");
                }
            }
        }

        let result = self.send_raw(&method, path, body).await;
        if let Err(ref e) = result {
            if let Some(api_err) = e.downcast_ref::<ApiError>() {
                if api_err.status == 401 && !is_refresh {
                    let state = self.token_state.lock().await;
                    if !state.refresh_token.is_empty() && !is_refresh_token_near_expiry(&state) {
                        drop(state);
                        self.do_refresh().await.map_err(|refresh_err| {
                            anyhow::anyhow!(
                                "request unauthorized and token refresh failed: {refresh_err}"
                            )
                        })?;
                        return self.send_raw(&method, path, body).await;
                    }
                }
            }
        }
        result
    }

    /// Send a request and decode the JSON response into `T`.
    pub async fn do_decode<B, T>(&self, method: Method, path: &str, body: Option<&B>) -> anyhow::Result<T>
    where
        B: Serialize + Send,
        T: DeserializeOwned,
    {
        let bytes = self.do_raw(method, path, body).await?;
        let bytes = if bytes.is_empty() { b"{}".as_ref().into() } else { bytes };
        serde_json::from_slice(&bytes)
            .with_context(|| format!("parse JSON response for {path}"))
    }

    async fn send_raw<B: Serialize + Send>(
        &self,
        method: &Method,
        path: &str,
        body: Option<&B>,
    ) -> anyhow::Result<bytes::Bytes> {
        let url = format!("{}{path}", self.base_url);
        let state = self.token_state.lock().await;
        let token = state.access_token.clone();
        drop(state);

        let mut req = self.http.request(method.clone(), &url);
        if !token.is_empty() {
            req = req.bearer_auth(&token);
        }
        if let Some(b) = body {
            req = req.json(b);
        }

        let resp = req.send().await.with_context(|| format!("send request {method} {path}"))?;
        let status = resp.status();
        let bytes = resp.bytes().await.with_context(|| format!("read response body {path}"))?;

        if !status.is_success() {
            let body_str = String::from_utf8_lossy(&bytes).to_string();
            return Err(ApiError {
                method: method.to_string(),
                path: path.to_string(),
                status: status.as_u16(),
                body: body_str,
            }
            .into());
        }

        Ok(bytes)
    }

    async fn do_refresh(&self) -> anyhow::Result<()> {
        let refresh_token = {
            let state = self.token_state.lock().await;
            state.refresh_token.clone()
        };

        let payload = serde_json::json!({ "refreshToken": refresh_token });
        let bytes = self
            .send_raw::<serde_json::Value>(&Method::POST, "/auth/refresh", Some(&payload))
            .await?;

        let update: TokenUpdate =
            serde_json::from_slice(&bytes).context("parse token refresh response")?;

        if update.access_token.trim().is_empty() || update.refresh_token.trim().is_empty() {
            anyhow::bail!("invalid token refresh response: empty tokens");
        }

        {
            let mut state = self.token_state.lock().await;
            state.access_token = update.access_token.trim().to_string();
            state.refresh_token = update.refresh_token.trim().to_string();
            state.access_token_expires_at = update.access_token_expires_at.trim().to_string();
            state.refresh_token_expires_at = update.refresh_token_expires_at.trim().to_string();
        }

        if let Some(cb) = &self.on_token_refresh {
            cb(update).context("persist refreshed tokens")?;
        }

        Ok(())
    }

    /// Returns a snapshot of the current token state (for daemon relay etc.)
    pub async fn token_state(&self) -> TokenState {
        self.token_state.lock().await.clone()
    }
}

fn is_refresh_path(path: &str) -> bool {
    path.trim() == "/auth/refresh"
}

fn parse_expiry(raw: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<chrono::DateTime<chrono::Utc>>().ok()
}

fn should_proactively_refresh(state: &TokenState) -> bool {
    if state.refresh_token.is_empty() {
        return false;
    }
    if is_refresh_token_near_expiry(state) {
        return false;
    }
    let Some(expiry) = parse_expiry(&state.access_token_expires_at) else {
        return false;
    };
    let now = chrono::Utc::now();
    now > expiry - chrono::Duration::seconds(ACCESS_TOKEN_EARLY_REFRESH_SECS)
}

fn is_refresh_token_near_expiry(state: &TokenState) -> bool {
    let Some(expiry) = parse_expiry(&state.refresh_token_expires_at) else {
        return false;
    };
    chrono::Utc::now() > expiry - chrono::Duration::seconds(REFRESH_TOKEN_GUARD_SECS)
}
