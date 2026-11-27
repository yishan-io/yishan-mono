package project

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/adapter/sqlite"
)

const (
	minTaskPrefixLength   = 3
	maxTaskPrefixLength   = 5
	prefixAlphabetSize    = 26
	collisionSuffixLength = 2
	fallbackTaskPrefix    = "PRJ"
)

var collisionCandidateCount = prefixAlphabetSize * prefixAlphabetSize

// legacyTaskPrefixCandidates mirrors api-service's deterministic candidates
// for projects created before task prefixes existed: the name's letters
// first, then a stable hash-ordered two-letter suffix series.
func legacyTaskPrefixCandidates(projectName string, projectID string) []string {
	initial := taskPrefixSeed(projectName)
	base := initial[:minTaskPrefixLength]
	offset := int(stableHash(projectID) % uint32(collisionCandidateCount))
	candidates := make([]string, 0, collisionCandidateCount+1)
	if initial != reservedTaskPrefix {
		candidates = append(candidates, initial)
	}
	for index := range collisionCandidateCount {
		normalized := (offset + index) % collisionCandidateCount
		candidate := base + string(rune('A'+normalized/prefixAlphabetSize)) + string(rune('A'+normalized%prefixAlphabetSize))
		if candidate != reservedTaskPrefix && candidate != initial {
			candidates = append(candidates, candidate)
		}
	}
	return candidates
}

func taskPrefixSeed(projectName string) string {
	letters := strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r
		}
		return -1
	}, strings.ToUpper(projectName))
	if len(letters) >= minTaskPrefixLength {
		return letters[:min(len(letters), maxTaskPrefixLength)]
	}
	return (letters + fallbackTaskPrefix)[:minTaskPrefixLength]
}

func stableHash(value string) uint32 {
	var hash uint32
	for _, character := range value {
		hash = hash*31 + uint32(character)
	}
	return hash
}

// ensureTaskPrefix assigns the first free legacy candidate to a project that
// has no prefix yet. Prefixes are unique per organization on this machine.
func (s *Service) ensureTaskPrefix(ctx context.Context, project sqlite.Project) (sqlite.Project, error) {
	if project.TaskPrefix != nil && strings.TrimSpace(*project.TaskPrefix) != "" {
		return project, nil
	}
	used, err := s.usedTaskPrefixes(ctx, project.OrganizationID)
	if err != nil {
		return sqlite.Project{}, err
	}
	for _, candidate := range legacyTaskPrefixCandidates(project.Name, project.ID) {
		if used[candidate] {
			continue
		}
		updated, err := s.store().Update(ctx, project.ID, sqlite.ProjectUpdate{TaskPrefix: &candidate})
		if errors.Is(err, sqlite.ErrProjectConflict) {
			continue
		}
		return updated, toRPCError(err, project.ID)
	}
	return sqlite.Project{}, fmt.Errorf("no free task prefix for project %q", project.ID)
}

func (s *Service) usedTaskPrefixes(ctx context.Context, organizationID string) (map[string]bool, error) {
	projects, err := s.store().ListByOrganization(ctx, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list organization task prefixes: %w", err)
	}
	used := make(map[string]bool, len(projects))
	for _, project := range projects {
		if project.TaskPrefix != nil {
			used[*project.TaskPrefix] = true
		}
	}
	return used, nil
}

// TaskPrefix returns a project's task prefix, assigning one to a legacy
// project first. It backs local task-key allocation.
func (s *Service) TaskPrefix(ctx context.Context, projectID string) (string, bool, error) {
	project, found, err := s.Project(ctx, projectID)
	if err != nil || !found {
		return "", found, err
	}
	project, err = s.ensureTaskPrefix(ctx, project)
	if err != nil {
		return "", true, err
	}
	return *project.TaskPrefix, true, nil
}
