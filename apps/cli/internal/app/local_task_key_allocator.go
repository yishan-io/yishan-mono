package app

import (
	"context"
	"fmt"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/cloud/session"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
)

// cloudKeyAllocator adapts authenticated cloud allocation endpoints to the
// Local Task application's narrow key-reservation port.
type cloudKeyAllocator struct{ session *session.Session }

func newCloudKeyAllocator(sessionValue *session.Session) *cloudKeyAllocator {
	return &cloudKeyAllocator{session: sessionValue}
}

func (allocator *cloudKeyAllocator) AllocateTaskKey(ctx context.Context, request nodelocaltask.KeyAllocationRequest) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if allocator.session == nil || !allocator.session.APIConfigured() {
		return "", fmt.Errorf("cloud API is not configured")
	}
	return allocator.allocate(ctx, request)
}

func (allocator *cloudKeyAllocator) allocate(ctx context.Context, request nodelocaltask.KeyAllocationRequest) (string, error) {
	client := allocator.session.APIClient()
	if request.ProjectID == nil || (request.ProjectKind != nil && *request.ProjectKind == domain.ProjectKindFolder) {
		response, err := client.AllocatePersonalLocalTaskKeyContext(ctx, request.TaskID)
		return response.Key, err
	}
	organizationID, err := allocator.resolveProjectOrganization(ctx, client, request)
	if err != nil {
		return "", err
	}
	if organizationID == "" {
		response, err := client.AllocatePersonalLocalTaskKeyContext(ctx, request.TaskID)
		return response.Key, err
	}
	response, err := client.AllocateProjectLocalTaskKeyContext(ctx, organizationID, *request.ProjectID, request.TaskID)
	return response.Key, err
}

func (allocator *cloudKeyAllocator) resolveProjectOrganization(ctx context.Context, client *cloud.Client, request nodelocaltask.KeyAllocationRequest) (string, error) {
	if request.OrganizationID != nil {
		return *request.OrganizationID, nil
	}
	organizations, err := client.ListOrganizationsContext(ctx)
	if err != nil {
		return "", fmt.Errorf("list organizations for legacy project Local Task: %w", err)
	}
	for _, organization := range organizations.Organizations {
		projects, err := client.ListProjectsContext(ctx, organization.ID)
		if err != nil {
			return "", fmt.Errorf("list projects for organization %q: %w", organization.ID, err)
		}
		for _, project := range projects.Projects {
			if project.ID == *request.ProjectID {
				return organization.ID, nil
			}
		}
	}
	return "", nil
}
