package agentcmd

import (
	"fmt"
)

type Command struct {
	Binary string
	Args   []string
}

type runCommandBuilder interface {
	Binary() string
	Args(prompt, model string, interactive bool) []string
}

var commandBuilders = map[string]runCommandBuilder{
	"":             opencodeBuilder{},
	"opencode":     opencodeBuilder{},
	"claude":       claudeBuilder{},
	"codex":        codexBuilder{},
	"pi":           piBuilder{},
	"gemini":       geminiBuilder{},
	"copilot":      copilotBuilder{},
	"cursor":       cursorBuilder{},
	"cursor-agent": cursorBuilder{},
}

func BuildRunCommand(agentKind, prompt, model string, interactive bool) (Command, error) {
	builder, ok := commandBuilders[agentKind]
	if !ok {
		return Command{}, fmt.Errorf("unsupported agent kind: %s", agentKind)
	}

	binary := builder.Binary()
	if binary == "" {
		return Command{}, fmt.Errorf("unsupported agent kind: %s", agentKind)
	}

	return Command{Binary: binary, Args: builder.Args(prompt, model, interactive)}, nil
}
