package agentcmd

type cursorBuilder struct{}

func (b cursorBuilder) Binary() string { return "cursor" }

func (b cursorBuilder) Args(prompt, model string, interactive bool) []string {
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
