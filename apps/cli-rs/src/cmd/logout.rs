use crate::config::persist_auth_tokens;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use anyhow::Context;
use clap::Args;
use serde_json::json;
use std::path::Path;

#[derive(Args)]
pub struct LogoutArgs {
    /// Skip revoking the refresh token (just clear local credentials)
    #[arg(long)]
    pub local_only: bool,
}

pub async fn run(args: LogoutArgs, runtime: &AppRuntime) -> anyhow::Result<()> {
    let cfg = runtime.config();

    if !args.local_only && !cfg.api.refresh_token.is_empty() {
        let client = runtime.api_client();
        if let Err(e) = client.revoke_token(&cfg.api.refresh_token).await {
            eprintln!("Warning: could not revoke token on server: {e}");
        }
    }

    // Wipe credentials from disk.
    let path = Path::new(&cfg.config_path).to_path_buf();
    persist_auth_tokens(&path, "", "", "", "", "")
        .context("clear credentials from config file")?;

    runtime.clear_auth();

    print_any(json!({ "status": "ok", "message": "logged out" }))
}
