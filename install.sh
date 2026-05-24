#!/bin/sh
# Yishan CLI installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --version 0.2.0
#   curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --daemon
set -eu

REPO="yishan-io/yishan-mono"
NAME="yishan-cli"
BINARY="yishan"
DEFAULT_BIN_DIR="/usr/local/bin"

# --- output helpers ---

bold=""
reset=""
red=""
green=""
yellow=""
if [ -t 1 ]; then
  bold="\033[1m"
  reset="\033[0m"
  red="\033[31m"
  green="\033[32m"
  yellow="\033[33m"
fi

info()  { printf "${bold}${green}info${reset}  %s\n" "$*"; }
warn()  { printf "${bold}${yellow}warn${reset}  %s\n" "$*" >&2; }
error() { printf "${bold}${red}error${reset} %s\n" "$*" >&2; exit 1; }

# --- detection ---

detect_os() {
  case "$(uname -s)" in
    Linux)  echo "linux"  ;;
    Darwin) echo "darwin" ;;
    *)      error "Unsupported OS: $(uname -s). Only Linux and macOS are supported." ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)    echo "amd64" ;;
    aarch64|arm64)   echo "arm64" ;;
    *)               error "Unsupported architecture: $(uname -m). Only amd64 and arm64 are supported." ;;
  esac
}

# --- download ---

fetch() {
  url="$1"
  output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$output" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    error "Either curl or wget is required to download files."
  fi
}

# --- checksum verification ---

verify_checksum() {
  archive="$1"
  checksums="$2"
  filename="$(basename "$archive")"

  expected="$(grep "$filename" "$checksums" | awk '{print $1}')"
  if [ -z "$expected" ]; then
    warn "No checksum entry found for $filename, skipping verification."
    return 0
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$archive" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
  else
    warn "sha256sum/shasum not found, skipping checksum verification."
    return 0
  fi

  if [ "$expected" != "$actual" ]; then
    error "Checksum mismatch for $filename.\n  Expected: $expected\n  Actual:   $actual"
  fi
  info "Checksum verified."
}

# --- latest version ---

resolve_latest_version() {
  tmpheaders="$(mktemp)"
  trap_cleanup="$tmpheaders"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSI -o "$tmpheaders" "https://github.com/${REPO}/releases/latest" 2>/dev/null || true
    location="$(grep -i '^location:' "$tmpheaders" | tr -d '\r')"
  elif command -v wget >/dev/null 2>&1; then
    location="$(wget --spider -S "https://github.com/${REPO}/releases/latest" 2>&1 | grep -i 'Location:' | tail -1 | tr -d '\r')"
  fi
  rm -f "$tmpheaders"

  if [ -n "${location:-}" ]; then
    # location header ends with /tag/cli-v0.1.0
    version="$(echo "$location" | sed 's|.*/cli-v||')"
    if [ -n "$version" ]; then
      echo "$version"
      return
    fi
  fi
  error "Could not determine latest version. Specify one with --version."
}

# --- daemon install ---

install_launchd() {
  bin_path="$1"
  plist_dir="$HOME/Library/LaunchAgents"
  plist="$plist_dir/io.yishan.daemon.plist"

  mkdir -p "$plist_dir"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.yishan.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin_path}</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/yishan-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/yishan-daemon.err.log</string>
</dict>
</plist>
EOF

  # Unload first in case it's already loaded (ignore errors).
  launchctl bootout "gui/$(id -u)/io.yishan.daemon" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  info "launchd service installed and started (io.yishan.daemon)."
  info "Logs: ~/Library/Logs/yishan-daemon.log"
}

install_systemd() {
  bin_path="$1"
  unit_dir="$HOME/.config/systemd/user"
  unit="$unit_dir/yishan-daemon.service"

  mkdir -p "$unit_dir"
  cat > "$unit" <<EOF
[Unit]
Description=Yishan daemon
After=network.target

[Service]
ExecStart=${bin_path} daemon run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now yishan-daemon.service
  info "systemd user service installed and started (yishan-daemon)."
  info "Logs: journalctl --user -u yishan-daemon -f"
}

# --- main ---

main() {
  version=""
  bin_dir="$DEFAULT_BIN_DIR"
  install_daemon=false
  force=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --version)    version="$2"; shift 2 ;;
      --bin-dir)    bin_dir="$2"; shift 2 ;;
      --daemon)     install_daemon=true; shift ;;
      --force|-f)   force=true; shift ;;
      --help|-h)
        printf "Usage: install.sh [OPTIONS]\n\n"
        printf "Options:\n"
        printf "  --version <ver>  Install a specific version (default: latest)\n"
        printf "  --bin-dir <dir>  Install directory (default: %s)\n" "$DEFAULT_BIN_DIR"
        printf "  --daemon         Also install as a launch daemon (launchd/systemd)\n"
        printf "  --force, -f      Skip confirmation prompt\n"
        printf "  --help, -h       Show this help\n"
        exit 0
        ;;
      *)  error "Unknown option: $1. Use --help for usage." ;;
    esac
  done

  os="$(detect_os)"
  arch="$(detect_arch)"

  if [ -z "$version" ]; then
    info "Resolving latest version..."
    version="$(resolve_latest_version)"
  fi

  info "Configuration:"
  info "  Version:  ${version}"
  info "  OS:       ${os}"
  info "  Arch:     ${arch}"
  info "  Bin dir:  ${bin_dir}"
  if [ "$install_daemon" = true ]; then
    info "  Daemon:   yes"
  fi
  printf "\n"

  # Confirmation
  if [ "$force" != true ] && [ -t 0 ]; then
    printf "Proceed with installation? [y/N] "
    read -r answer
    case "$answer" in
      [yY]|[yY][eE][sS]) ;;
      *) echo "Aborted."; exit 0 ;;
    esac
  fi

  # Build download URL
  archive="${NAME}_${version}_${os}_${arch}.tar.gz"
  base_url="https://github.com/${REPO}/releases/download/cli-v${version}"
  archive_url="${base_url}/${archive}"
  checksum_url="${base_url}/checksums.txt"

  # Download
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading ${archive}..."
  fetch "$archive_url" "$tmpdir/$archive"

  info "Downloading checksums..."
  fetch "$checksum_url" "$tmpdir/checksums.txt"

  verify_checksum "$tmpdir/$archive" "$tmpdir/checksums.txt"

  # Extract
  tar -xzf "$tmpdir/$archive" -C "$tmpdir"

  # Install
  mkdir -p "$bin_dir"
  if [ -w "$bin_dir" ]; then
    install -m 755 "$tmpdir/$BINARY" "$bin_dir/$BINARY"
  else
    warn "Elevated permissions required to install to $bin_dir"
    sudo install -m 755 "$tmpdir/$BINARY" "$bin_dir/$BINARY"
  fi

  info "Installed ${BINARY} to ${bin_dir}/${BINARY}"
  printf "\n"

  # Verify
  if command -v "$BINARY" >/dev/null 2>&1; then
    info "Version: $("$BINARY" version 2>/dev/null || echo 'unknown')"
  else
    warn "${bin_dir} is not in your PATH. Add it:"
    warn "  export PATH=\"${bin_dir}:\$PATH\""
  fi

  # Daemon setup
  if [ "$install_daemon" = true ]; then
    printf "\n"
    info "Setting up daemon..."
    bin_path="${bin_dir}/${BINARY}"
    case "$os" in
      darwin) install_launchd "$bin_path" ;;
      linux)  install_systemd "$bin_path" ;;
    esac
  fi
}

main "$@"
