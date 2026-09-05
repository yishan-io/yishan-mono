# @yishan-io/dsh-runtime

Yishan-owned DeepSeek Harness runtime bootstrap and composition.

## Sandbox Bash security boundary

The sandbox Bash executor resolves workspace and working-directory paths, then rejects paths
outside the canonical workspace. This prevents path traversal and symlink escapes. The resolved
workspace path is a trusted boundary: DSH/Node cannot atomically pin `cwd` if a malicious local
actor replaces a directory after validation. A native fd-pinned launcher is deferred; this package
does not protect against that local directory-replacement race.
