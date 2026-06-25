import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "yishan-install-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, { encoding: "utf8" });
  chmodSync(path, 0o755);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("install.sh", () => {
  it("extracts using the downloaded archive path", () => {
    const sandboxDir = createTempDir();
    const binDir = join(sandboxDir, "bin");
    const fakeBinDir = join(sandboxDir, "fake-bin");
    const logPath = join(sandboxDir, "tar-path.txt");

    mkdirSync(binDir, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });

    writeExecutable(
      join(fakeBinDir, "uname"),
      `#!/bin/sh
if [ "$1" = "-s" ]; then
  printf 'Darwin\n'
  exit 0
fi
if [ "$1" = "-m" ]; then
  printf 'arm64\n'
  exit 0
fi
printf 'unsupported uname args\n' >&2
exit 1
`,
    );

    writeExecutable(
      join(fakeBinDir, "curl"),
      `#!/bin/sh
set -eu
output=''
url=''
while [ $# -gt 0 ]; do
  case "$1" in
    -o)
      output="$2"
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [ -z "$output" ] || [ -z "$url" ]; then
  printf 'missing curl args\n' >&2
  exit 1
fi
case "$url" in
  *checksums.txt)
    : > "$output"
    ;;
  *)
    printf 'archive payload' > "$output"
    ;;
esac
`,
    );

    writeExecutable(
      join(fakeBinDir, "tar"),
      `#!/bin/sh
set -eu
archive=''
target_dir=''
while [ $# -gt 0 ]; do
  case "$1" in
    -xzf)
      archive="$2"
      shift 2
      ;;
    -C)
      target_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s' "$archive" > "${logPath}"
printf '#!/bin/sh\nexit 0\n' > "$target_dir/yishan"
chmod 755 "$target_dir/yishan"
`,
    );

    writeExecutable(
      join(fakeBinDir, "install"),
      `#!/bin/sh
set -eu
src=''
dest=''
while [ $# -gt 0 ]; do
  case "$1" in
    -m)
      shift 2
      ;;
    *)
      if [ -z "$src" ]; then
        src="$1"
      else
        dest="$1"
      fi
      shift
      ;;
  esac
done
cp "$src" "$dest"
chmod 755 "$dest"
`,
    );

    const result = spawnSync(
      "sh",
      [resolve(process.cwd(), "install.sh"), "--version", "0.17.0", "--force", "--bin-dir", binDir],
      {
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("No checksum entry found");
    expect(existsSync(join(binDir, "yishan"))).toBe(true);

    const tarArchivePath = readFileSync(logPath, "utf8");
    const archiveName = basename(tarArchivePath);

    expect(archiveName).toBe("yishan-cli_0.17.0_darwin_arm64.tar.gz");
    expect(tarArchivePath.split(archiveName)).toHaveLength(2);
  });
});
