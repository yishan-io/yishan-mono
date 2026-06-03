/// Self-update command — downloads, verifies, and replaces the current binary.
///
/// For Homebrew-managed installs the update is delegated to `brew upgrade`.
use crate::buildinfo::VERSION;
use crate::runtime::AppRuntime;
use clap::Args;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

const REPO: &str = "yishan-io/yishan-mono";
const PROJECT: &str = "yishan-cli";
const BINARY_NAME: &str = "yishan";
const RELEASE_TAG_PREFIX: &str = "cli-v";

#[derive(Args)]
pub struct SelfUpdateArgs {
    /// Target version (default: latest)
    pub version: Option<String>,

    /// Re-install even if already up to date
    #[arg(short, long)]
    pub force: bool,
}

pub async fn run(args: SelfUpdateArgs, _runtime: &AppRuntime) -> anyhow::Result<()> {
    let release = if let Some(v) = &args.version {
        println!("Target version: {v}");
        release_for_version(v)
    } else {
        println!("Checking for updates...");
        let r = latest_release().await?;
        println!("Latest version: {}", r.version);
        r
    };

    println!("Current version: {VERSION}");

    if !args.force && !is_newer(&release.version) {
        println!("Already up to date.");
        return Ok(());
    }

    release.apply(|msg| println!("{msg}")).await
}

// ── Release descriptor ────────────────────────────────────────────────────────

struct Release {
    version: String,
    archive_url: String,
    checksum_url: String,
}

fn release_for_version(version: &str) -> Release {
    let os_name = normalize_os(std::env::consts::OS);
    let arch = normalize_arch(std::env::consts::ARCH);
    let archive = format!("{PROJECT}_{version}_{os_name}_{arch}.tar.gz");
    let base = format!(
        "https://github.com/{REPO}/releases/download/{}",
        release_tag(version)
    );
    Release {
        version: version.to_string(),
        archive_url: format!("{base}/{archive}"),
        checksum_url: format!("{base}/checksums.txt"),
    }
}

async fn latest_release() -> anyhow::Result<Release> {
    // GitHub redirects /releases/latest → /releases/tag/<tag>.
    // We follow no redirects and extract the Location header.
    let url = format!("https://github.com/{REPO}/releases/latest");
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let resp = client.head(&url).send().await?;
    let location = resp
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            anyhow::anyhow!(
                "no redirect from GitHub releases/latest (status {})",
                resp.status()
            )
        })?;

    // Location: https://github.com/yishan-io/yishan-mono/releases/tag/cli-v0.12.0
    let tag = location
        .split("/tag/")
        .nth(1)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("unexpected release tag format: {location}"))?;
    let version = parse_release_version(tag)
        .ok_or_else(|| anyhow::anyhow!("unsupported release tag format: {tag}"))?;

    Ok(release_for_version(version))
}

fn release_tag(version: &str) -> String {
    format!("{RELEASE_TAG_PREFIX}{version}")
}

fn parse_release_version(tag: &str) -> Option<&str> {
    tag.strip_prefix(RELEASE_TAG_PREFIX)
        .or_else(|| tag.strip_prefix('v'))
}

fn is_newer(release_version: &str) -> bool {
    release_version != VERSION && VERSION != "dev"
}

impl Release {
    async fn apply(&self, progress: impl Fn(&str)) -> anyhow::Result<()> {
        // Resolve and canonicalise the running binary path.
        let exec_path = env::current_exe()?;
        let exec_path = fs::canonicalize(&exec_path)?;

        // Detect Homebrew-managed install.
        if is_homebrew_managed(&exec_path) {
            return apply_via_homebrew(&progress);
        }

        let tmp_dir = tempfile::tempdir()?;

        // Download archive.
        let archive_name = self
            .archive_url
            .split('/')
            .last()
            .unwrap_or("archive.tar.gz");
        progress(&format!("Downloading {archive_name}..."));
        let archive_path = tmp_dir.path().join("archive.tar.gz");
        download(&self.archive_url, &archive_path).await?;

        // Download checksums.
        progress("Verifying checksum...");
        let checksums_path = tmp_dir.path().join("checksums.txt");
        download(&self.checksum_url, &checksums_path).await?;

        // Verify checksum.
        verify_checksum(&archive_path, &checksums_path)?;

        // Extract binary.
        progress("Extracting...");
        let new_binary_path = tmp_dir.path().join(BINARY_NAME);
        extract_binary(&archive_path, &new_binary_path)?;

        // Replace current binary atomically.
        progress("Installing...");
        replace_binary(&exec_path, &new_binary_path)?;

        Ok(())
    }
}

// ── helpers ───────────────────────────────────────────────────────────────────

async fn download(url: &str, dest: &Path) -> anyhow::Result<()> {
    let resp = reqwest::get(url).await?;
    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} from {url}", resp.status());
    }
    let bytes = resp.bytes().await?;
    fs::write(dest, &bytes)?;
    Ok(())
}

fn verify_checksum(archive_path: &Path, checksums_path: &Path) -> anyhow::Result<()> {
    let checksums = fs::read_to_string(checksums_path)?;
    let os_name = normalize_os(std::env::consts::OS);
    let arch = normalize_arch(std::env::consts::ARCH);
    let suffix = format!("{os_name}_{arch}");

    let expected_hash = checksums
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let name = parts.next()?;
            if name.contains(&suffix) {
                Some(hash.to_string())
            } else {
                None
            }
        })
        .next()
        .ok_or_else(|| {
            anyhow::anyhow!("no checksum found for {os_name}/{arch} in checksums.txt")
        })?;

    let mut f = fs::File::open(archive_path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 65536];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual_hash = hex::encode(hasher.finalize());

    if actual_hash != expected_hash {
        anyhow::bail!("checksum mismatch: expected {expected_hash}, got {actual_hash}");
    }
    Ok(())
}

fn extract_binary(archive_path: &Path, dest: &Path) -> anyhow::Result<()> {
    let f = fs::File::open(archive_path)?;
    let gz = flate2::read::GzDecoder::new(f);
    let mut archive = tar::Archive::new(gz);
    let exe_name = format!("{BINARY_NAME}.exe");

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if name == BINARY_NAME || name == exe_name {
            let mut out = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(dest)?;
            io::copy(&mut entry, &mut out)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(dest, fs::Permissions::from_mode(0o755))?;
            }
            return Ok(());
        }
    }
    anyhow::bail!("binary {BINARY_NAME:?} not found in archive")
}

fn replace_binary(old_path: &Path, new_path: &Path) -> anyhow::Result<()> {
    let dir = old_path.parent().unwrap_or(Path::new("."));

    // Check write permission.
    let test_file = dir.join(".yishan-update-test");
    fs::File::create(&test_file).map_err(|_| {
        anyhow::anyhow!(
            "no write permission to {} (try running with sudo)",
            dir.display()
        )
    })?;
    let _ = fs::remove_file(&test_file);

    // Backup current binary.
    let backup_path = PathBuf::from(format!("{}.bak", old_path.display()));
    fs::rename(old_path, &backup_path)
        .map_err(|e| anyhow::anyhow!("backing up current binary: {e}"))?;

    // Copy new binary into place.
    if let Err(e) = fs::copy(new_path, old_path) {
        // Restore backup on failure.
        let _ = fs::rename(&backup_path, old_path);
        anyhow::bail!("installing new binary: {e}");
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(old_path, fs::Permissions::from_mode(0o755))
            .map_err(|e| anyhow::anyhow!("setting permissions: {e}"))?;
    }

    let _ = fs::remove_file(&backup_path);
    Ok(())
}

fn is_homebrew_managed(exec_path: &Path) -> bool {
    exec_path.to_string_lossy().contains("/Cellar/")
}

fn apply_via_homebrew(progress: &impl Fn(&str)) -> anyhow::Result<()> {
    let brew = which::which("brew")
        .map_err(|_| anyhow::anyhow!("binary is Homebrew-managed but brew not found in PATH"))?;

    progress("Updating Homebrew tap...");
    // Ignore tap errors — may already be tapped.
    let _ = std::process::Command::new(&brew)
        .args(["tap", "yishan-io/tap"])
        .status();

    progress("Upgrading via Homebrew...");
    let status = std::process::Command::new(&brew)
        .args(["upgrade", BINARY_NAME])
        .status()?;
    if !status.success() {
        // brew upgrade exits non-zero if already up to date — try reinstall.
        let status = std::process::Command::new(&brew)
            .args(["reinstall", BINARY_NAME])
            .status()?;
        if !status.success() {
            anyhow::bail!("brew upgrade/reinstall failed");
        }
    }
    Ok(())
}

fn normalize_os(os: &str) -> &'static str {
    match os {
        "macos" => "darwin",
        other => Box::leak(other.to_string().into_boxed_str()),
    }
}

fn normalize_arch(arch: &str) -> &'static str {
    match arch {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => Box::leak(other.to_string().into_boxed_str()),
    }
}
