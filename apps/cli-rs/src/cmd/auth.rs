use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};
use serde_json::json;

#[derive(Args)]
pub struct AuthArgs {
    #[command(subcommand)]
    pub command: AuthCommands,
}

#[derive(Subcommand)]
pub enum AuthCommands {
    /// Refresh the current access token
    Refresh(RefreshArgs),
    /// Revoke a refresh token
    Revoke(RevokeArgs),
    /// List service tokens
    ListServiceTokens,
    /// Create a service token
    CreateServiceToken(CreateServiceTokenArgs),
    /// Revoke a service token
    RevokeServiceToken(RevokeServiceTokenArgs),
}

#[derive(Args)]
pub struct RefreshArgs {
    /// Refresh token (defaults to stored token)
    #[arg(long)]
    pub refresh_token: Option<String>,
}

#[derive(Args)]
pub struct RevokeArgs {
    /// Refresh token
    #[arg(long)]
    pub refresh_token: String,
}

#[derive(Args)]
pub struct CreateServiceTokenArgs {
    /// Token name
    #[arg(long)]
    pub name: String,

    /// Expiry in days (omit for no expiry)
    #[arg(long)]
    pub expires_in_days: Option<u32>,
}

#[derive(Args)]
pub struct RevokeServiceTokenArgs {
    /// Service token ID
    #[arg(long)]
    pub token_id: String,
}

pub async fn run(args: AuthArgs, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();
    match args.command {
        AuthCommands::Refresh(args) => {
            let cfg = runtime.config();
            let refresh_token = args
                .refresh_token
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(cfg.api.refresh_token.as_str());
            if refresh_token.is_empty() {
                anyhow::bail!("no refresh token available; please log in again");
            }
            let resp = client.refresh_token(refresh_token).await?;
            runtime.persist_tokens(
                &resp.access_token,
                &resp.refresh_token,
                &resp.access_token_expires_at,
                &resp.refresh_token_expires_at,
            )?;
            print_any(json!({ "status": "ok", "expiresAt": resp.access_token_expires_at }))
        }
        AuthCommands::Revoke(args) => {
            let resp = client.revoke_token(&args.refresh_token).await?;
            print_any(resp)
        }
        AuthCommands::ListServiceTokens => {
            let resp = client.list_service_tokens().await?;
            print_any(resp)
        }
        AuthCommands::CreateServiceToken(a) => {
            let resp = client
                .create_service_token(&a.name, a.expires_in_days)
                .await?;
            print_any(resp)
        }
        AuthCommands::RevokeServiceToken(a) => {
            let resp = client.revoke_service_token(&a.token_id).await?;
            print_any(resp)
        }
    }
}
