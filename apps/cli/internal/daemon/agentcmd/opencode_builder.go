package agentcmd

import "os"

type opencodeBuilder struct{}

func (b opencodeBuilder) Binary() string { return "opencode" }

func (b opencodeBuilder) Args(prompt, model string, interactive bool) []string {
	var args []string
	if model != "" {
		args = append(args, "-m", model)
	}
	if prompt != "" {
		if interactive {
			args = append(args, "--prompt", prompt)
		} else {
			args = append(args, "run", prompt)
		}
	}
	return args
}

// ExtraEnv returns OPENCODE_DB pointed at a throwaway temp file when running
// non-interactively. This redirects the opencode subprocess's session writes
// away from the user's real DB, keeping summarization jobs out of session
// history. The daemon's own reader still opens the real DB directly.
func (b opencodeBuilder) ExtraEnv(interactive bool) []string {
	if interactive {
		return nil
	}
	f, err := os.CreateTemp("", "opencode-summarize-*.db")
	if err != nil {
		return nil
	}
	f.Close()
	return []string{"OPENCODE_DB=" + f.Name()}
}
