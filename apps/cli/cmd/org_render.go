package cmd

import "yishan/apps/cli/cmd/output"
import "yishan/apps/cli/internal/adapter/cloud"

func toOrgListRenderData(response cloud.ListOrganizationsResponse, includeAll bool) (output.RenderData, error) {
	rows := make([]map[string]any, 0, len(response.Organizations))
	for _, organization := range response.Organizations {
		rows = append(rows, organizationSummaryRow(organization, includeAll))
	}

	columns := []string{"id", "name", "memberCount"}
	if includeAll {
		columns = []string{"id", "name", "memberCount", "createdAt", "updatedAt"}
	}

	return output.RenderData{
		Title:   "organizations",
		Columns: columns,
		Rows:    rows,
	}, nil
}

func toOrgCurrentRenderData(organization cloud.Organization) output.RenderData {
	return output.RenderData{
		Title:   "organization",
		Columns: []string{"id", "name", "memberCount", "createdAt", "updatedAt"},
		Rows:    []map[string]any{organizationSummaryRow(organization, true)},
	}
}

func toOrgMembersRenderData(organization cloud.Organization) output.RenderData {
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

// toOrgCurrentCombinedObject returns a single JSON-safe object combining the
// organization record and its member list. Used by orgCurrentCmd in JSON mode
// to avoid emitting two separate JSON documents to stdout.
func toOrgCurrentCombinedObject(organization cloud.Organization) map[string]any {
	members := make([]map[string]any, 0, len(organization.Members))
	for _, member := range organization.Members {
		members = append(members, map[string]any{
			"userId": member.UserID,
			"name":   member.Name,
			"email":  member.Email,
			"role":   member.Role,
		})
	}

	return map[string]any{
		"organization": organizationSummaryRow(organization, true),
		"members":      members,
	}
}

func organizationSummaryRow(organization cloud.Organization, includeAll bool) map[string]any {
	row := map[string]any{
		"id":          organization.ID,
		"name":        organization.Name,
		"memberCount": len(organization.Members),
	}
	if includeAll {
		row["createdAt"] = organization.CreatedAt
		row["updatedAt"] = organization.UpdatedAt
	}

	return row
}
