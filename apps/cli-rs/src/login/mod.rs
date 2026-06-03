use anyhow::Context;
use axum::{extract::Query, response::Html, routing::get, Router};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// Result of a successful OAuth browser flow.
#[derive(Debug, Clone)]
pub struct FlowResult {
    pub access_token: String,
    pub access_token_expires_at: String,
    pub refresh_token: String,
    pub refresh_token_expires_at: String,
}

/// Run the OAuth browser flow. Opens a local callback server, launches the browser,
/// waits up to 2 minutes for the redirect, then returns the tokens.
pub async fn run_browser_flow(base_url: &str, provider: &str) -> anyhow::Result<FlowResult> {
    let state = generate_state(24);
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("bind OAuth callback listener")?;
    let addr = listener.local_addr().context("get listener address")?;
    let callback_url = format!("http://{addr}/callback");

    let login_url = build_login_url(base_url, provider, &callback_url, &state)
        .context("build OAuth login URL")?;

    eprintln!("Opening browser for {provider} login...");
    if let Err(e) = open::that(&login_url) {
        eprintln!("Could not open browser automatically. Open this URL manually:\n{login_url}");
        tracing::warn!(err = %e, "failed to open browser");
    }

    let (tx, rx) = oneshot::channel::<anyhow::Result<FlowResult>>();
    let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
    let expected_state = state.clone();

    let app = Router::new().route(
        "/callback",
        get({
            let tx = tx.clone();
            move |Query(params): Query<HashMap<String, String>>| {
                let tx = tx.clone();
                let expected = expected_state.clone();
                async move {
                    let result = handle_callback(params, &expected);
                    let html = match &result {
                        Ok(_) => build_redirect_html("success", ""),
                        Err(e) => build_redirect_html("error", &e.to_string()),
                    };
                    if let Some(sender) = tx.lock().await.take() {
                        let _ = sender.send(result);
                    }
                    Html(html)
                }
            }
        }),
    );

    // Spawn server with graceful shutdown on result.
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async { let _ = shutdown_rx.await; })
            .await
            .ok();
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(120), rx)
        .await
        .map_err(|_| anyhow::anyhow!("login timed out waiting for OAuth callback"))?
        .map_err(|_| anyhow::anyhow!("OAuth callback channel closed unexpectedly"))?;

    let _ = shutdown_tx.send(());
    result
}

fn handle_callback(
    params: HashMap<String, String>,
    expected_state: &str,
) -> anyhow::Result<FlowResult> {
    if let Some(err) = params.get("error") {
        anyhow::bail!("OAuth callback error: {err}");
    }

    let state = params.get("state").map(String::as_str).unwrap_or("");
    if state != expected_state {
        anyhow::bail!("OAuth state mismatch");
    }

    let access_token = params
        .get("accessToken")
        .cloned()
        .unwrap_or_default();
    let refresh_token = params
        .get("refreshToken")
        .cloned()
        .unwrap_or_default();

    if access_token.is_empty() || refresh_token.is_empty() {
        anyhow::bail!("missing auth token fields in OAuth callback");
    }

    Ok(FlowResult {
        access_token,
        access_token_expires_at: params
            .get("accessTokenExpiresAt")
            .cloned()
            .unwrap_or_default(),
        refresh_token,
        refresh_token_expires_at: params
            .get("refreshTokenExpiresAt")
            .cloned()
            .unwrap_or_default(),
    })
}

fn build_login_url(
    base_url: &str,
    provider: &str,
    redirect_uri: &str,
    state: &str,
) -> anyhow::Result<String> {
    let base = base_url.trim_end_matches('/');
    let encoded_redirect = urlencoding::encode(redirect_uri);
    let encoded_state = urlencoding::encode(state);
    Ok(format!(
        "{base}/auth/{provider}?mode=cli&redirect_uri={encoded_redirect}&state={encoded_state}"
    ))
}

fn generate_state(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(&buf)
}

fn build_redirect_html(status: &str, reason: &str) -> String {
    let deep_link = if reason.is_empty() {
        format!(
            "yishan://auth/callback?status={}",
            urlencoding::encode(status)
        )
    } else {
        format!(
            "yishan://auth/callback?status={}&reason={}",
            urlencoding::encode(status),
            urlencoding::encode(reason)
        )
    };
    let status_text = if status == "success" {
        "Login successful"
    } else {
        "Login failed"
    };
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{status_text}</title>
  </head>
  <body>
    <p>{status_text}. Returning to Yishan…</p>
    <p>If nothing happens, <a href="{deep_link}">open Yishan</a>.</p>
    <script>
      window.location.replace({deep_link_json});
      setTimeout(function () {{ window.close(); }}, 300);
    </script>
  </body>
</html>"#,
        status_text = status_text,
        deep_link = deep_link,
        deep_link_json = serde_json::to_string(&deep_link).unwrap_or_default(),
    )
}
