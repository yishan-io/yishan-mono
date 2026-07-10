package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/memory"
)

const (
	brainstormSkillName                 = "brainstorm"
	contextMemorySkillName              = "context-memory"
	contextTaskSkillName                = "context-task"
	dispatchingParallelAgentsSkillName  = "dispatching-parallel-agents"
	executingPlansSkillName             = "executing-plans"
	finishingTaskSkillName              = "finishing-task"
	receivingCodeReviewSkillName        = "receiving-code-review"
	requestingCodeReviewSkillName       = "requesting-code-review"
	startingTaskSkillName               = "starting-task"
	subagentDrivenDevelopmentSkillName  = "subagent-driven-development"
	systematicDebuggingSkillName        = "systematic-debugging"
	testDrivenDevelopmentSkillName      = "test-driven-development"
	writingPlansSkillName               = "writing-plans"

	// Exported for use by other packages and tests.
	BrainstormSkillName                = brainstormSkillName
	ContextMemorySkillName             = contextMemorySkillName
	ContextTaskSkillName               = contextTaskSkillName
	DispatchingParallelAgentsSkillName = dispatchingParallelAgentsSkillName
	ExecutingPlansSkillName            = executingPlansSkillName
	FinishingTaskSkillName             = finishingTaskSkillName
	ReceivingCodeReviewSkillName       = receivingCodeReviewSkillName
	RequestingCodeReviewSkillName      = requestingCodeReviewSkillName
	StartingTaskSkillName              = startingTaskSkillName
	SubagentDrivenDevelopmentSkillName = subagentDrivenDevelopmentSkillName
	SystematicDebuggingSkillName       = systematicDebuggingSkillName
	TestDrivenDevelopmentSkillName     = testDrivenDevelopmentSkillName
	WritingPlansSkillName              = writingPlansSkillName
)

type SkillInstallResult struct {
	SkillPath string
}

func EnsureOfficialSkills() ([]*SkillInstallResult, error) {
	results := make([]*SkillInstallResult, 0, len(OfficialSkillNames()))
	for _, name := range OfficialSkillNames() {
		result, err := AddSkill(name)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func RemoveOfficialSkills() error {
	for _, name := range OfficialSkillNames() {
		if err := RemoveSkill(name); err != nil {
			return err
		}
	}
	return nil
}

// EnsurePersonaSetup writes the initial PERSONA.md template to
// ~/.yishan/memory/PERSONA.md if the file does not already exist.
// This is called during `yishan setup` so new users get a starter file.
func EnsurePersonaSetup(disablePersona bool) error {
	if disablePersona {
		return nil
	}
	personaPath, err := memory.PersonaFilePath()
	if err != nil {
		return fmt.Errorf("resolve persona path: %w", err)
	}
	if _, err := os.Stat(personaPath); err == nil {
		return nil // already exists — don't overwrite user edits
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("check persona file: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(personaPath), 0o755); err != nil {
		return fmt.Errorf("create persona dir: %w", err)
	}
	content := memory.BuildEmptyPersonaMarkdown()
	if err := os.WriteFile(personaPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write persona template: %w", err)
	}
	return nil
}
