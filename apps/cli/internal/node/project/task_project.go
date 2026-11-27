package project

import (
	"context"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
)

// ResolveTaskProject resolves a linked workspace's project to its display
// metadata from the local store. A project from another organization is not a
// match.
func (s *Service) ResolveTaskProject(ctx context.Context, organizationID string, projectID string) (domain.ProjectDisplay, bool, error) {
	project, found, err := s.Project(ctx, projectID)
	if err != nil || !found {
		return domain.ProjectDisplay{}, false, err
	}
	if organizationID != "" && project.OrganizationID != organizationID {
		return domain.ProjectDisplay{}, false, nil
	}
	return taskProjectDisplay(project), true, nil
}

// ResolveTaskProjects resolves Task Hub project display metadata for many
// projects at once.
func (s *Service) ResolveTaskProjects(ctx context.Context, projectIDsByOrganization map[string][]string) (map[string]domain.ProjectDisplay, error) {
	resolved := make(map[string]domain.ProjectDisplay)
	for organizationID, projectIDs := range projectIDsByOrganization {
		for _, projectID := range projectIDs {
			project, found, err := s.ResolveTaskProject(ctx, organizationID, projectID)
			if err != nil {
				return nil, err
			}
			if found {
				resolved[projectID] = project
			}
		}
	}
	return resolved, nil
}

func taskProjectDisplay(project sqlite.Project) domain.ProjectDisplay {
	return domain.ProjectDisplay{ID: project.ID, Name: project.Name, Icon: project.Icon, Color: project.Color}
}
