package agentcmd

type copilotBuilder struct{}

func (b copilotBuilder) Binary() string { return "copilot" }

func (b copilotBuilder) Args(prompt, model string, interactive bool) []string {
	var args []string
	if prompt != "" {
		if interactive {
			args = append(args, "--prompt", prompt)
		} else {
			args = append(args, "run", "--prompt", prompt)
		}
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}

func (b copilotBuilder) ExtraEnv(_ bool) []string { return nil }

