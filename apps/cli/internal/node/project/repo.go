package project

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// repoSource is the provider and stable key inferred from a git remote URL.
// It mirrors api-service's inferRepoSource so local and remote rows agree.
type repoSource struct {
	Provider string
	Key      string
}

var scpRemotePattern = regexp.MustCompile(`^git@([^:]+):(.+)$`)

// inferRepoSource parses https/http/ssh/git URLs and scp-style git@host:path
// remotes into a provider and an owner/repo key.
func inferRepoSource(repoURL string) (repoSource, error) {
	trimmed := strings.TrimSpace(repoURL)
	if match := scpRemotePattern.FindStringSubmatch(trimmed); match != nil {
		return buildRepoSource(match[1], match[2], trimmed)
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return repoSource{}, fmt.Errorf("invalid git URL %q", trimmed)
	}
	switch parsed.Scheme {
	case "https", "http", "ssh", "git":
	default:
		return repoSource{}, fmt.Errorf("invalid git URL %q", trimmed)
	}
	return buildRepoSource(parsed.Host, parsed.Path, trimmed)
}

func buildRepoSource(host string, repoPath string, rawURL string) (repoSource, error) {
	segments := make([]string, 0)
	cleaned := strings.TrimPrefix(repoPath, "/")
	if len(cleaned) >= 4 && strings.EqualFold(cleaned[len(cleaned)-4:], ".git") {
		cleaned = cleaned[:len(cleaned)-4]
	}
	for _, segment := range strings.Split(cleaned, "/") {
		if segment != "" {
			segments = append(segments, segment)
		}
	}
	if len(segments) < 2 {
		return repoSource{}, fmt.Errorf("invalid git URL %q", rawURL)
	}
	owner := strings.ToLower(segments[len(segments)-2])
	repo := strings.ToLower(segments[len(segments)-1])
	return repoSource{Provider: providerFromHost(host), Key: owner + "/" + repo}, nil
}

func providerFromHost(host string) string {
	switch strings.ToLower(host) {
	case "github.com":
		return "github"
	case "gitlab.com":
		return "gitlab"
	case "bitbucket.org":
		return "bitbucket"
	default:
		return "generic"
	}
}

var taskPrefixPattern = regexp.MustCompile(`^[A-Z]{3,5}$`)

// reservedTaskPrefix is used by personal Local Task keys.
const reservedTaskPrefix = "PERS"

func validateTaskPrefix(prefix string) error {
	if !taskPrefixPattern.MatchString(prefix) {
		return fmt.Errorf("task prefix must be 3-5 uppercase ASCII letters")
	}
	if prefix == reservedTaskPrefix {
		return fmt.Errorf("task prefix %s is reserved", reservedTaskPrefix)
	}
	return nil
}
