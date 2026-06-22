package agentcmd

type codexBuilder struct{}

func (b codexBuilder) Binary() string { return "codex" }

func (b codexBuilder) Args(prompt, model string, interactive bool) []string {
	var args []string
	if prompt != "" {
		if interactive {
			args = append(args, prompt)
		} else {
			args = append(args, "exec", prompt)
		}
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if !interactive {
		args = append(args, "--ephemeral")
	}
	return args
}

func (b codexBuilder) ExtraEnv(_ bool) []string { return nil }
