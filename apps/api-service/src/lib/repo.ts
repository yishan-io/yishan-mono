import { ProjectInvalidGitUrlError } from "@/errors";

export type InferredRepoSource = {
  sourceType: "git";
  repoProvider: string;
  repoKey: string;
};

export function isValidGitUrl(value: string): boolean {
  if (value.startsWith("git@") && value.includes(":")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "ssh:" ||
      parsed.protocol === "git:"
    );
  } catch {
    return false;
  }
}

function normalizeRepoPath(pathname: string): string[] {
  return pathname
    .replace(/^\//, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function inferProviderFromHost(host: string): string {
  const normalized = host.toLowerCase();
  if (normalized === "github.com") return "github";
  if (normalized === "gitlab.com") return "gitlab";
  if (normalized === "bitbucket.org") return "bitbucket";
  return "generic";
}

export function inferRepoSource(repoUrl: string): InferredRepoSource {
  const trimmed = repoUrl.trim();

  if (trimmed.startsWith("git@") && trimmed.includes(":")) {
    const match = trimmed.match(/^git@([^:]+):(.+)$/);
    if (!match) {
      throw new ProjectInvalidGitUrlError(trimmed);
    }

    const host = match[1] ?? "";
    const repoPath = match[2] ?? "";
    const segments = normalizeRepoPath(repoPath);
    if (segments.length < 2) {
      throw new ProjectInvalidGitUrlError(trimmed);
    }

    const owner = segments[segments.length - 2]!.toLowerCase();
    const repo = segments[segments.length - 1]!.toLowerCase();
    return {
      sourceType: "git",
      repoProvider: inferProviderFromHost(host),
      repoKey: `${owner}/${repo}`
    };
  }

  if (!isValidGitUrl(trimmed)) {
    throw new ProjectInvalidGitUrlError(trimmed);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProjectInvalidGitUrlError(trimmed);
  }

  const segments = normalizeRepoPath(parsed.pathname);
  if (segments.length < 2) {
    throw new ProjectInvalidGitUrlError(trimmed);
  }

  const owner = segments[segments.length - 2]!.toLowerCase();
  const repo = segments[segments.length - 1]!.toLowerCase();
  return {
    sourceType: "git",
    repoProvider: inferProviderFromHost(parsed.host),
    repoKey: `${owner}/${repo}`
  };
}
