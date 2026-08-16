package setup

import (
	"regexp"
	"strings"
)

// Official-agent policy: which names are managed official agents and which
// agent/thinking values are valid. File I/O (agents_io.go) and frontmatter
// parsing (agents_frontmatter.go) do not own this policy.

// agentNamePattern is the slug allowed for new agent names: lowercase
// letters, digits, and dashes (also a safe file basename).
var agentNamePattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// allowedAgentThinkingLevels mirrors pi's ALLOWED_THINKING_LEVELS.
var allowedAgentThinkingLevels = []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"}

// isManagedPiAgentName reports whether name is one of the official managed
// agent names synced from @yishan-io/pi-subagents/agents.
func isManagedPiAgentName(name string) bool {
	for _, fileName := range managedPiAgentFileNames {
		if strings.TrimSuffix(fileName, ".md") == name {
			return true
		}
	}
	return false
}
