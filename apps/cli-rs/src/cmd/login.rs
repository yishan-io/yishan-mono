use crate::config::persist_auth_tokens;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use anyhow::Context;
use clap::Args;
use serde_json::json;
use std::path::Path;

#[derive(Args)]
pub struct LoginArgs {
    /// OAuth provider (google | github)
    #[arg(long, default_value = "google")]
    pub provider: String,

    /// Service token for non-interactive login (created via 'yishan auth create-service-token')
    #[arg(long)]
    pub token: Option<String>,
}

pub async fn run(args: LoginArgs, runtime: &AppRuntime) -> anyhow::Result<()> {
    if let Some(service_token) = args.token {
        return login_with_service_token(&service_token, runtime).await;
    }

    if args.provider != "google" && args.provider != "github" {
        anyhow::bail!(
            "unsupported provider {:?} (allowed: google, github)",
            args.provider
        );
    }

    let cfg = runtime.config();
    let result = crate::login::run_browser_flow(&cfg.api.base_url, &args.provider)
        .await
        .context("OAuth browser login flow failed")?;

    runtime
        .persist_tokens(
            &result.access_token,
            &result.refresh_token,
            &result.access_token_expires_at,
            &result.refresh_token_expires_at,
        )
        .context("persist API tokens")?;

    if let Err(e) = register_local_node(runtime).await {
        eprintln!("Warning: local node registration failed: {e}");
    }

    print_any(json!({ "status": "ok", "message": "login successful" }))
}

async fn login_with_service_token(token: &str, runtime: &AppRuntime) -> anyhow::Result<()> {
    let cfg = runtime.config();
    let path = Path::new(&cfg.config_path).to_path_buf();

    persist_auth_tokens(&path, token, "", "", "", &cfg.api.base_url)
        .context("persist service token")?;

    // Update in-memory state.
    runtime.persist_tokens(token, "", "", "")?;

    // Verify the token works.
    let client = runtime.api_client();
    let me = client
        .whoami()
        .await
        .context("service token verification failed")?;
    eprintln!("Authenticated as {} ({})", me.user.email, me.user.name);

    if let Err(e) = register_local_node(runtime).await {
        eprintln!("Warning: local node registration failed: {e}");
    }

    print_any(json!({ "status": "ok", "message": "login successful (service token)" }))
}

async fn register_local_node(runtime: &AppRuntime) -> anyhow::Result<()> {
    let cfg = runtime.config();
    if cfg.api.base_url.is_empty() || cfg.api.token.is_empty() {
        anyhow::bail!("API not configured; skipping node registration");
    }

    // Load daemon ID from state file.
    let daemon_id = crate::daemon::ensure_daemon_id(&cfg.config_path)
        .context("ensure daemon ID for node registration")?;

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "local-daemon".to_string());

    let client = runtime.api_client();
    client
        .register_node(
            &daemon_id,
            &hostname,
            Some("managed"),
            None,
            Some(std::collections::HashMap::from([
                ("os".to_string(), serde_json::json!(std::env::consts::OS)),
                (
                    "version".to_string(),
                    serde_json::json!(crate::buildinfo::VERSION),
                ),
            ])),
            "private",
            Some(false),
        )
        .await
        .with_context(|| format!("register node {daemon_id:?}"))?;

    tracing::debug!(node_id = %daemon_id, hostname = %hostname, "registered local node after login");
    Ok(())
}
