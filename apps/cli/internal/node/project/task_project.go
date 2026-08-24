package project

import (
	"context"

	"yishan/apps/cli/internal/adapter/cloud"
	domain "yishan/apps/cli/internal/localtask"

	"github.com/rs/zerolog/log"
)

// ResolveTaskProject resolves a linked workspace's project to its display metadata.
func (s *Service) ResolveTaskProject(ctx context.Context, organizationID string, projectID string) (domain.ProjectDisplay, bool, error) {
	if s.deps.Session == nil || !s.deps.Session.APIConfigured() {
		return domain.ProjectDisplay{}, false, nil
	}
	response, err := s.deps.Session.APIClient().ListProjects(organizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", organizationID).Msg("task project resolution failed")
		return domain.ProjectDisplay{}, false, nil
	}
	project, found := findTaskProject(response.Projects, projectID)
	return project, found, nil
}

func findTaskProject(projects []cloud.Project, projectID string) (domain.ProjectDisplay, bool) {
	for _, project := range projects {
		if project.ID == projectID {
			return domain.ProjectDisplay{ID: project.ID, Name: project.Name, Icon: project.Icon, Color: project.Color}, true
		}
	}
	return domain.ProjectDisplay{}, false
}
