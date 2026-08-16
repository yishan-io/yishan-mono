package workspace

import (
	gitexec "yishan/apps/cli/internal/git/exec"
)

func splitLines(s string) []string {
	var lines []string
	for _, line := range gitexec.SplitNonEmptyLines(s) {
		lines = append(lines, line)
	}
	return lines
}
