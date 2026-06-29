package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/config"
)

func EnsureOpenCodeCommands() error {
	for name := range openCodeCommands {
		if err := EnsureOpenCodeCommand(name); err != nil {
			return err
		}
	}
	return nil
}

func EnsureOpenCodeCommand(name string) error {
	content, ok := openCodeCommands[name]
	if !ok {
		return nil
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}

	configHome := filepath.Join(yishanHome, "opencode-config-home")
	commandsDir := filepath.Join(configHome, "commands")

	if err := os.MkdirAll(commandsDir, 0o755); err != nil {
		return fmt.Errorf("create opencode commands dir: %w", err)
	}

	cmdPath := filepath.Join(commandsDir, name+".md")
	if err := os.WriteFile(cmdPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write command file %s: %w", name, err)
	}

	return nil
}

func RemoveOpenCodeCommands() error {
	for name := range openCodeCommands {
		if err := RemoveOpenCodeCommand(name); err != nil {
			return err
		}
	}
	return nil
}

func RemoveOpenCodeCommand(name string) error {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}

	commandsDir := filepath.Join(yishanHome, "opencode-config-home", "commands")
	cmdPath := filepath.Join(commandsDir, name+".md")
	_ = os.Remove(cmdPath)

	return nil
}

var openCodeCommands = map[string]string{
	"ys-start": `---
description: Start a new task — create a ticket folder in .my-context/tasks/
---

YISHAN_COMMAND: ys-start

Start a new task using the ys-start workflow.
If I did not provide task details, generate the title, goal, and acceptance criteria from my request by default.
Only ask follow-up questions if the request is too ambiguous to infer safely.
Create the task folder under .my-context/tasks/active/<id>-<slug>/ with task.md, register it in state.json, then suggest the next step (/ys-research).`,
	"ys-research": `---
description: Research a task — search project memory, explore codebase, record findings
---

YISHAN_COMMAND: ys-research

Research the current task using the ys-research workflow.
Read .my-context/tasks/state.json to find the active task, then read its task.md.
Search project memory with: yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>"
Explore the codebase and read any relevant .my-context/ docs.
Append findings to notes.md under a new date heading. When done, suggest /ys-plan.`,
	"ys-plan": `---
description: Plan a task — draft an execution plan with ordered steps
---

YISHAN_COMMAND: ys-plan

Plan the current task using the ys-plan workflow.
Read the task's task.md and notes.md, then draft plan.md with approach and ordered concrete steps.
Every step must reference specific files and be verifiable. Cover all acceptance criteria.
Write plan.md and suggest /ys-build.`,
	"ys-build": `---
description: Build a task — execute the plan, write code, add tests
---

YISHAN_COMMAND: ys-build

Build the current task using the ys-build workflow.
Read plan.md and execute each step in order. Write code, add unit tests.
Run tests after each step — fix failures before proceeding.
When all steps are done, run the full test suite, then suggest /ys-verify.`,
	"ys-verify": `---
description: Verify a task — review code, run lint and tests
---

YISHAN_COMMAND: ys-verify

Verify the current task using the ys-verify workflow.
Run through all checks: acceptance criteria, code review, lint, typecheck, full test suite.
Write a verification checklist at the bottom of notes.md.
If all checks pass, suggest /ys-done. Fix any issues before proceeding.`,
	"ys-done": `---
description: Finalize a task — update docs, move to completed/, update MEMORY.md
---

YISHAN_COMMAND: ys-done

Finalize the current task using the ys-done workflow.
Collect all PR URLs, write outcome.md with PRs, what was done, what changed, and future notes.
Update architecture docs in .my-context/architecture/ if anything structural changed.
Move the task folder from active/ to completed/, update state.json, and update MEMORY.md.`,
	"ys-memory": `---
description: Search or update project memory (.my-context/)
---

YISHAN_COMMAND: ys-memory

Handle project memory using the ys-memory workflow.
If I ask to search: run yishan memory search --output json --project-id $YISHAN_PROJECT_ID "<keywords>".
If I ask to update: edit .my-context/MEMORY.md following the template and rules in the skill.`,
	"ys-workspace": `---
description: Manage yishan workspaces — create, list, find, close
---

YISHAN_COMMAND: ys-workspace

Manage workspaces using the ys-workspace workflow.
Use the yishan CLI to manage workspaces — list, create (with --task-run-agent-kind opencode), or close.
Environment variables YISHAN_PROJECT_ID, YISHAN_WORKSPACE_ID, YISHAN_ORG_ID are already set.
Use --output json for machine parsing. Always pass --project-id from the environment.
Do not switch the current session into a newly created workspace; treat --task-run-prompt as launching a separate terminal session there.`,
}
