package agentcmd

import (
	"fmt"

	"yishan/apps/cli/internal/agentkind"
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
	"":                     opencodeBuilder{},
	agentkind.OpenCode:     opencodeBuilder{},
	agentkind.Claude:       claudeBuilder{},
	agentkind.Codex:        codexBuilder{},
	agentkind.Pi:           piBuilder{},
	agentkind.Gemini:       geminiBuilder{},
	agentkind.Copilot:      copilotBuilder{},
	agentkind.Cursor:       cursorBuilder{},
	"cursor-agent":         cursorBuilder{},
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
