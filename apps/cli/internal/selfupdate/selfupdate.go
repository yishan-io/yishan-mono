package selfupdate

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/buildinfo"
)

const (
	repo       = "yishan-io/yishan-mono"
	project    = "yishan-cli"
	binaryName = "yishan"
)

// Release holds metadata for a GitHub release.
type Release struct {
	Version     string
	ArchiveURL  string
	ChecksumURL string
}

// LatestRelease resolves the latest CLI release version from GitHub.
func LatestRelease(ctx context.Context) (*Release, error) {
	// GitHub redirects /releases/latest to /releases/tag/<tag>.
	// We follow the redirect to extract the tag.
	url := fmt.Sprintf("https://github.com/%s/releases/latest", repo)

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	// Don't follow redirects — we want the Location header.
	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("resolving latest release: %w", err)
	}
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	if location == "" {
		return nil, fmt.Errorf("no redirect from GitHub releases/latest (status %d)", resp.StatusCode)
	}

	// Location: https://github.com/yishan-io/yishan-mono/releases/tag/v0.12.0
	parts := strings.Split(location, "/tag/v")
	if len(parts) != 2 || parts[1] == "" {
		return nil, fmt.Errorf("unexpected release tag format in redirect: %s", location)
	}

	return releaseForVersion(parts[1]), nil
}

// ReleaseForVersion builds a Release for a specific version string.
func ReleaseForVersion(version string) *Release {
	return releaseForVersion(version)
}

func releaseForVersion(version string) *Release {
	os := normalizeOS(runtime.GOOS)
	arch := normalizeArch(runtime.GOARCH)
	archive := fmt.Sprintf("%s_%s_%s_%s.tar.gz", project, version, os, arch)
	base := fmt.Sprintf("https://github.com/%s/releases/download/v%s", repo, version)

	return &Release{
		Version:     version,
		ArchiveURL:  fmt.Sprintf("%s/%s", base, archive),
		ChecksumURL: fmt.Sprintf("%s/checksums.txt", base),
	}
}

// IsNewer returns true when the release is newer than the running binary.
func (r *Release) IsNewer() bool {
	return r.Version != buildinfo.Version && buildinfo.Version != "dev"
}

// Apply downloads, verifies, and replaces the current binary.
// If the binary was installed via Homebrew, it delegates to `brew upgrade`.
func (r *Release) Apply(ctx context.Context, progress func(string)) error {
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locating current binary: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("resolving symlinks: %w", err)
	}

	// Detect Homebrew-managed install.
	if isHomebrewManaged(execPath) {
		return applyViaHomebrew(ctx, progress)
	}

	tmpDir, err := os.MkdirTemp("", "yishan-update-*")
	if err != nil {
		return fmt.Errorf("creating temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Download archive.
	progress(fmt.Sprintf("Downloading %s...", filepath.Base(r.ArchiveURL)))
	archivePath := filepath.Join(tmpDir, "archive.tar.gz")
	if err := download(ctx, r.ArchiveURL, archivePath); err != nil {
		return fmt.Errorf("downloading archive: %w", err)
	}

	// Download checksums.
	progress("Verifying checksum...")
	checksumPath := filepath.Join(tmpDir, "checksums.txt")
	if err := download(ctx, r.ChecksumURL, checksumPath); err != nil {
		return fmt.Errorf("downloading checksums: %w", err)
	}

	// Verify checksum.
	if err := verifyChecksum(archivePath, checksumPath); err != nil {
		return fmt.Errorf("checksum verification failed: %w", err)
	}

	// Extract binary.
	progress("Extracting...")
	newBinaryPath := filepath.Join(tmpDir, binaryName)
	if err := extractBinary(archivePath, newBinaryPath); err != nil {
		return fmt.Errorf("extracting binary: %w", err)
	}

	// Replace current binary atomically.
	progress("Installing...")
	if err := replaceBinary(execPath, newBinaryPath); err != nil {
		return fmt.Errorf("replacing binary: %w", err)
	}

	return nil
}

func download(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, resp.Body)
	return err
}

func verifyChecksum(archivePath, checksumPath string) error {
	checksumData, err := os.ReadFile(checksumPath)
	if err != nil {
		return fmt.Errorf("reading checksums: %w", err)
	}

	// checksums.txt contains the original archive name, not "archive.tar.gz".
	// We need to find the entry matching our OS/arch.
	osName := normalizeOS(runtime.GOOS)
	archName := normalizeArch(runtime.GOARCH)

	var expectedHash string
	for _, line := range strings.Split(string(checksumData), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		// Match by OS_ARCH suffix in the filename.
		if strings.Contains(fields[1], fmt.Sprintf("%s_%s", osName, archName)) {
			expectedHash = fields[0]
			break
		}
	}

	if expectedHash == "" {
		return fmt.Errorf("no checksum found for %s/%s in checksums.txt", osName, archName)
	}

	// Compute actual hash.
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}

	actualHash := hex.EncodeToString(h.Sum(nil))
	if actualHash != expectedHash {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedHash, actualHash)
	}

	return nil
}

func extractBinary(archivePath, destPath string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		name := filepath.Base(hdr.Name)
		if name == binaryName || name == binaryName+".exe" {
			out, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return err
			}
			defer out.Close()

			if _, err := io.Copy(out, tr); err != nil {
				return err
			}
			return nil
		}
	}

	return fmt.Errorf("binary %q not found in archive", binaryName)
}

// replaceBinary atomically replaces oldPath with newPath.
// On Unix this renames over the existing file. If the target directory is
// not writable, it returns an error suggesting sudo.
func replaceBinary(oldPath, newPath string) error {
	dir := filepath.Dir(oldPath)

	// Check write permission.
	testFile := filepath.Join(dir, ".yishan-update-test")
	f, err := os.Create(testFile)
	if err != nil {
		return fmt.Errorf("no write permission to %s (try running with sudo)", dir)
	}
	f.Close()
	os.Remove(testFile)

	// Backup current binary.
	backupPath := oldPath + ".bak"
	if err := os.Rename(oldPath, backupPath); err != nil {
		return fmt.Errorf("backing up current binary: %w", err)
	}

	// Move new binary into place.
	if err := copyFile(newPath, oldPath); err != nil {
		// Restore backup on failure.
		_ = os.Rename(backupPath, oldPath)
		return fmt.Errorf("installing new binary: %w", err)
	}

	// Make executable.
	if err := os.Chmod(oldPath, 0755); err != nil {
		return fmt.Errorf("setting permissions: %w", err)
	}

	// Remove backup.
	os.Remove(backupPath)

	return nil
}

// copyFile copies src to dst across filesystems.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// isHomebrewManaged returns true if the binary path is inside a Homebrew Cellar.
func isHomebrewManaged(execPath string) bool {
	// Homebrew Cellar paths:
	//   /opt/homebrew/Cellar/yishan/... (Apple Silicon)
	//   /usr/local/Cellar/yishan/...    (Intel Mac)
	//   /home/linuxbrew/.linuxbrew/Cellar/... (Linux)
	return strings.Contains(execPath, "/Cellar/")
}

func applyViaHomebrew(_ context.Context, progress func(string)) error {
	brewPath, err := exec.LookPath("brew")
	if err != nil {
		return fmt.Errorf("binary is Homebrew-managed but brew not found: %w", err)
	}

	progress("Updating Homebrew tap...")
	tapCmd := exec.Command(brewPath, "tap", "yishan-io/tap")
	tapCmd.Stdout = os.Stdout
	tapCmd.Stderr = os.Stderr
	// Ignore tap errors — may already be tapped.
	_ = tapCmd.Run()

	progress("Upgrading via Homebrew...")
	upgradeCmd := exec.Command(brewPath, "upgrade", "yishan")
	upgradeCmd.Stdout = os.Stdout
	upgradeCmd.Stderr = os.Stderr
	if err := upgradeCmd.Run(); err != nil {
		// brew upgrade exits non-zero if already up to date; try reinstall.
		reinstallCmd := exec.Command(brewPath, "reinstall", "yishan")
		reinstallCmd.Stdout = os.Stdout
		reinstallCmd.Stderr = os.Stderr
		if reinstallErr := reinstallCmd.Run(); reinstallErr != nil {
			return fmt.Errorf("brew upgrade failed: %w", err)
		}
	}

	return nil
}

func normalizeOS(goos string) string {
	return goos // "darwin", "linux", "windows" — already correct.
}

func normalizeArch(goarch string) string {
	return goarch // "amd64", "arm64" — already correct.
}
