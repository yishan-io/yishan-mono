package agentcmd

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
