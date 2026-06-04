use crate::buildinfo;
use crate::output::print_any;
use clap::Args;
use serde_json::json;

#[derive(Args)]
pub struct VersionArgs {
    /// Show full build info
    #[arg(long)]
    pub full: bool,
}

pub fn run(args: VersionArgs) -> anyhow::Result<()> {
    if args.full {
        print_any(json!({
            "version": buildinfo::VERSION,
            "gitCommit": buildinfo::GIT_COMMIT,
        }))
    } else {
        print_any(json!({ "version": buildinfo::VERSION }))
    }
}
