package agentcmd

type claudeBuilder struct{}

func (b claudeBuilder) Binary() string { return "claude" }

func (b claudeBuilder) Args(prompt, model string, interactive bool) []string {
	var args []string
	if prompt != "" {
		if interactive {
			args = append(args, prompt)
		} else {
			args = append(args, "-p", prompt)
		}
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if !interactive {
		args = append(args, "--no-session-persistence")
	}
	return args
}

func (b claudeBuilder) ExtraEnv(_ bool) []string { return nil }
