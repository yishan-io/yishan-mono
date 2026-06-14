package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/config"
)

func EnsureOpenCodeCommands() error {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}

	configHome := filepath.Join(yishanHome, "opencode-config-home")
	commandsDir := filepath.Join(configHome, "commands")

	if err := os.MkdirAll(commandsDir, 0o755); err != nil {
		return fmt.Errorf("create opencode commands dir: %w", err)
	}

	for name, content := range openCodeCommands {
		cmdPath := filepath.Join(commandsDir, name+".md")
		if err := os.WriteFile(cmdPath, []byte(content), 0o644); err != nil {
			return fmt.Errorf("write command file %s: %w", name, err)
		}
	}

	return nil
}

func RemoveOpenCodeCommands() error {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}

	commandsDir := filepath.Join(yishanHome, "opencode-config-home", "commands")

	for name := range openCodeCommands {
		cmdPath := filepath.Join(commandsDir, name+".md")
		os.Remove(cmdPath)
	}

	return nil
}

var openCodeCommands = map[string]string{
	"ys-start": `Read ~/.config/opencode/skills/ys-start/SKILL.md and follow its workflow to start a new task.
Ask me for: title, ticket URL/ID (optional), and acceptance criteria.
Create the task folder under .my-context/tasks/active/<id>-<slug>/ with task.md, register it in state.json, then suggest the next step (/ys-research).`,
	"ys-research": `Read ~/.config/opencode/skills/ys-research/SKILL.md and follow its workflow to research the current task.
Read .my-context/tasks/state.json to find the active task, then read its task.md.
Search project memory with: yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>"
Explore the codebase and read any relevant .my-context/ docs.
Append findings to notes.md under a new date heading. When done, suggest /ys-plan.`,
	"ys-plan": `Read ~/.config/opencode/skills/ys-plan/SKILL.md and follow its workflow to plan the current task.
Read the task's task.md and notes.md, then draft plan.md with approach and ordered concrete steps.
Every step must reference specific files and be verifiable. Cover all acceptance criteria.
Write plan.md and suggest /ys-build.`,
	"ys-build": `Read ~/.config/opencode/skills/ys-build/SKILL.md and follow its workflow to build the planned task.
Read plan.md and execute each step in order. Write code, add unit tests.
Run tests after each step — fix failures before proceeding.
When all steps are done, run the full test suite, then suggest /ys-verify.`,
	"ys-verify": `Read ~/.config/opencode/skills/ys-verify/SKILL.md and follow its workflow to verify the task.
Run through all checks: acceptance criteria, code review, lint, typecheck, full test suite.
Write a verification checklist at the bottom of notes.md.
If all checks pass, suggest /ys-done. Fix any issues before proceeding.`,
	"ys-done": `Read ~/.config/opencode/skills/ys-done/SKILL.md and follow its workflow to finalize the task.
Collect all PR URLs, write outcome.md with PRs, what was done, what changed, and future notes.
Update architecture docs in .my-context/architecture/ if anything structural changed.
Move the task folder from active/ to completed/, update state.json, and update MEMORY.md.`,
	"ys-memory": `Read ~/.config/opencode/skills/ys-memory/SKILL.md.
If I ask to search: run yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>".
If I ask to update: edit .my-context/MEMORY.md following the template and rules in the skill.`,
	"ys-workspace": `Read ~/.config/opencode/skills/ys-workspace/SKILL.md and follow its workflow.
Use the yishan CLI to manage workspaces — list, create (with --task-run-agent-kind opencode), or close.
Environment variables YISHAN_PROJECT_ID, YISHAN_WORKSPACE_ID, YISHAN_ORG_ID are already set.
Use --output json for machine parsing. Always pass --project-id from the environment.`,
}
