use crate::cmd::resolve_org_id;
use crate::output::print_any;
use crate::runtime::AppRuntime;
use clap::{Args, Subcommand};
use dialoguer::Select;
use serde_json::json;

#[derive(Subcommand)]
pub enum OrgCommands {
    /// List organizations
    List(OrgListArgs),
    /// Create organization
    Create(OrgCreateArgs),
    /// Delete organization
    Delete(OrgDeleteArgs),
    /// Set current organization
    Use(OrgUseArgs),
    /// Show current organization
    Current,
    /// Clear current organization
    Clear,
    /// Organization member operations
    #[command(subcommand)]
    Member(OrgMemberCommands),
}

#[derive(Subcommand)]
pub enum OrgMemberCommands {
    /// Add a member
    Add(OrgMemberAddArgs),
    /// Remove a member
    Remove(OrgMemberRemoveArgs),
}

#[derive(Args)]
pub struct OrgListArgs {
    /// Show all fields
    #[arg(long, short = 'v')]
    pub verbose: bool,
}

#[derive(Args)]
pub struct OrgCreateArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long = "member-user-id")]
    pub member_user_ids: Vec<String>,
}

#[derive(Args)]
pub struct OrgDeleteArgs {
    #[arg(long)]
    pub org_id: Option<String>,
}

#[derive(Args)]
pub struct OrgUseArgs {
    /// Organization ID to activate
    #[arg(long)]
    pub org_id: Option<String>,
}

#[derive(Args)]
pub struct OrgMemberAddArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub user_id: String,
    #[arg(long, default_value = "member")]
    pub role: String,
}

#[derive(Args)]
pub struct OrgMemberRemoveArgs {
    #[arg(long)]
    pub org_id: Option<String>,
    #[arg(long)]
    pub user_id: String,
}

pub async fn run(cmd: OrgCommands, runtime: &AppRuntime) -> anyhow::Result<()> {
    let client = runtime.api_client();

    match cmd {
        OrgCommands::List(args) => {
            let resp = client.list_organizations().await?;
            if args.verbose {
                print_any(resp)
            } else {
                let rows: Vec<serde_json::Value> = resp
                    .organizations
                    .iter()
                    .map(|o| {
                        json!({
                            "id": o.id,
                            "name": o.name,
                            "members": o.members.len(),
                            "createdAt": o.created_at,
                        })
                    })
                    .collect();
                print_any(rows)
            }
        }

        OrgCommands::Create(args) => {
            let resp = client
                .create_organization(&args.name, args.member_user_ids)
                .await?;
            print_any(resp)
        }

        OrgCommands::Delete(args) => {
            let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
            let resp = client.delete_organization(&org_id).await?;
            print_any(resp)
        }

        OrgCommands::Use(args) => {
            let org_id = if let Some(id) = args.org_id.filter(|s| !s.is_empty()) {
                id
            } else {
                select_org_interactive(&client).await?
            };
            runtime.set_current_org(&org_id)?;
            print_any(json!({ "orgId": org_id, "status": "active" }))
        }

        OrgCommands::Current => {
            let cfg = runtime.config();
            if cfg.current_org_id.is_empty() {
                anyhow::bail!("no active org: run `yishan org use --org-id <org-id>`");
            }
            let resp = client.list_organizations().await?;
            let org = resp
                .organizations
                .into_iter()
                .find(|o| o.id == cfg.current_org_id)
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "current org {} not found in accessible organizations",
                        cfg.current_org_id
                    )
                })?;
            print_any(json!({
                "id": org.id,
                "name": org.name,
                "createdAt": org.created_at,
                "members": org.members,
            }))
        }

        OrgCommands::Clear => {
            runtime.set_current_org("")?;
            print_any(json!({ "status": "cleared" }))
        }

        OrgCommands::Member(sub) => match sub {
            OrgMemberCommands::Add(args) => {
                let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
                let resp = client
                    .add_organization_member(&org_id, &args.user_id, &args.role)
                    .await?;
                print_any(resp)
            }
            OrgMemberCommands::Remove(args) => {
                let org_id = resolve_org_id(args.org_id.as_deref(), runtime)?;
                let resp = client
                    .remove_organization_member(&org_id, &args.user_id)
                    .await?;
                print_any(resp)
            }
        },
    }
}

async fn select_org_interactive(client: &crate::api::ApiClient) -> anyhow::Result<String> {
    if !atty::is(atty::Stream::Stdin) {
        anyhow::bail!("org-id is required: use --org-id <org-id>");
    }
    let resp = client.list_organizations().await?;
    if resp.organizations.is_empty() {
        anyhow::bail!("no organizations available for your account");
    }
    let items: Vec<String> = resp
        .organizations
        .iter()
        .map(|o| format!("{} ({})", o.name, o.id))
        .collect();
    let idx = Select::new()
        .with_prompt("Select organization")
        .items(&items)
        .interact()?;
    Ok(resp.organizations[idx].id.clone())
}
