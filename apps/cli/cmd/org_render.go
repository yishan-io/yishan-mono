package cmd

import "yishan/apps/cli/internal/output"
import "yishan/apps/cli/internal/api"

func toOrgListRenderData(response api.ListOrganizationsResponse) (output.RenderData, error) {
	rows := make([]map[string]any, 0, len(response.Organizations))
	for _, organization := range response.Organizations {
		rows = append(rows, organizationSummaryRow(organization))
	}

	return output.RenderData{
		Title:   "organizations",
		Columns: []string{"id", "name", "memberCount", "createdAt", "updatedAt"},
		Rows:    rows,
	}, nil
}

func toOrgCurrentRenderData(organization api.Organization) output.RenderData {
	return output.RenderData{
		Title:   "organization",
		Columns: []string{"id", "name", "memberCount", "createdAt", "updatedAt"},
		Rows:    []map[string]any{organizationSummaryRow(organization)},
	}
}

func toOrgMembersRenderData(organization api.Organization) output.RenderData {
	rows := make([]map[string]any, 0, len(organization.Members))
	for _, member := range organization.Members {
		rows = append(rows, map[string]any{
			"userId": member.UserID,
			"name":   member.Name,
			"email":  member.Email,
			"role":   member.Role,
		})
	}

	return output.RenderData{
		Title:   "members",
		Columns: []string{"userId", "name", "email", "role"},
		Rows:    rows,
	}
}

func organizationSummaryRow(organization api.Organization) map[string]any {
	return map[string]any{
		"id":          organization.ID,
		"name":        organization.Name,
		"memberCount": len(organization.Members),
		"createdAt":   organization.CreatedAt,
		"updatedAt":   organization.UpdatedAt,
	}
}
