package agentcmd

type piBuilder struct{}

func (b piBuilder) Binary() string { return "pi" }

func (b piBuilder) Args(prompt, model string, interactive bool) []string {
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
	return args
}
